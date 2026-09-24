"""
附件上传/下载路由
"""
import os
import uuid
import shutil
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import get_current_user
from ..models.user import User
from ..models.attachment import Attachment
from ..models.schedule import Schedule
from sqlalchemy import and_
from ..services.schedule_permission_service import require_schedule_access
from ..services.schedule_management_service import can_view_schedule
from ..utils.datetime_utils import to_beijing_iso

router = APIRouter(prefix="/api/v1", tags=["附件管理"])

# 上传文件存储目录
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads")
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".txt"}


def _ensure_upload_dir():
    os.makedirs(UPLOAD_DIR, exist_ok=True)


def _attachment_to_response(att: Attachment) -> dict:
    return {
        "id": att.id,
        "schedule_id": att.schedule_id,
        "schedule_title": att.schedule.title if att.schedule else None,
        "filename": att.filename,
        "file_size": att.file_size,
        "content_type": att.content_type,
        "description": att.description,
        "uploaded_by": att.uploaded_by,
        "uploader_name": att.uploader.nickname if att.uploader else None,
        "created_at": to_beijing_iso(att.created_at),
        "download_url": f"/api/v1/attachments/{att.id}/download",
    }


@router.post("/schedules/{schedule_id}/attachments", summary="上传附件")
async def upload_attachment(
    schedule_id: int,
    file: UploadFile = File(...),
    description: str = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """为日程上传附件（支持图片、PDF、Office 文档）"""
    _ensure_upload_dir()

    # 检查日程存在
    schedule = db.query(Schedule).filter(Schedule.id == schedule_id).first()
    require_schedule_access(db, schedule, current_user)

    # 检查文件扩展名
    ext = os.path.splitext(file.filename or "unknown")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的文件类型: {ext}，支持: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    # 限制文件大小（最大 20MB）
    MAX_SIZE = 20 * 1024 * 1024
    contents = await file.read()
    if len(contents) > MAX_SIZE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="文件大小不能超过 20MB")

    # 生成唯一文件名
    stored_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(UPLOAD_DIR, stored_name)

    # 保存文件
    with open(file_path, "wb") as f:
        f.write(contents)

    # 创建数据库记录
    attachment = Attachment(
        schedule_id=schedule_id,
        filename=file.filename or "unknown",
        stored_name=stored_name,
        file_path=file_path,
        file_size=len(contents),
        content_type=file.content_type or "application/octet-stream",
        description=description,
        uploaded_by=current_user.id,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)

    return {
        "code": 0,
        "message": "附件上传成功",
        "data": _attachment_to_response(attachment),
    }


@router.get("/schedules/{schedule_id}/attachments", summary="获取日程附件列表")
async def list_attachments(
    schedule_id: int,
    include_history: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取日程附件。include_history=true 时同时拉取同客户的历史附件"""
    schedule = db.query(Schedule).filter(Schedule.id == schedule_id).first()
    require_schedule_access(db, schedule, current_user)

    if include_history and schedule.external_contact_phone:
        related = (
            db.query(Schedule.id)
            .filter(
                Schedule.external_contact_phone == schedule.external_contact_phone,
                Schedule.external_contact_phone.isnot(None),
                Schedule.external_contact_phone != "",
                Schedule.created_by == schedule.created_by,
            )
            .all()
        )
        schedule_ids = [r[0] for r in related]
        attachments = (
            db.query(Attachment)
            .filter(Attachment.schedule_id.in_(schedule_ids))
            .order_by(Attachment.created_at.desc())
            .all()
        )
        attachments = [item for item in attachments if can_view_schedule(db, item.schedule, current_user.id)]
    else:
        attachments = (
            db.query(Attachment)
            .filter(Attachment.schedule_id == schedule_id)
            .order_by(Attachment.created_at.desc())
            .all()
        )

    return {
        "code": 0,
        "message": "ok",
        "data": [_attachment_to_response(a) for a in attachments],
    }


@router.get("/attachments/{attachment_id}/download", summary="下载/查看附件")
async def download_attachment(
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """下载附件文件（图片可直接在浏览器中预览）"""
    attachment = db.query(Attachment).filter(Attachment.id == attachment_id).first()
    if not attachment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="附件不存在")
    require_schedule_access(db, attachment.schedule, current_user)

    if not os.path.exists(attachment.file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文件已丢失")

    return FileResponse(
        path=attachment.file_path,
        filename=attachment.filename,
        media_type=attachment.content_type,
    )


@router.delete("/attachments/{attachment_id}", summary="删除附件")
async def delete_attachment(
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除附件（仅上传者和管理员）"""
    attachment = db.query(Attachment).filter(Attachment.id == attachment_id).first()
    if not attachment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="附件不存在")
    require_schedule_access(db, attachment.schedule, current_user)

    # 权限：上传者或管理员
    if current_user.role != "admin" and attachment.uploaded_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能删除自己上传的附件")

    # 删除物理文件
    if os.path.exists(attachment.file_path):
        os.remove(attachment.file_path)

    db.delete(attachment)
    db.commit()

    return {"code": 0, "message": "附件已删除", "data": None}
