"""
客户沟通消息路由 — 文字 + 语音
"""
import os
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Response
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import get_current_user
from ..models.user import User
from ..models.schedule import Schedule
from ..models.message import Message
from ..services.schedule_permission_service import require_schedule_access

router = APIRouter(prefix="/api/v1", tags=["客户沟通"])

VOICE_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "voices")


def _ensure_voice_dir():
    os.makedirs(VOICE_DIR, exist_ok=True)


def _msg_to_dict(m: Message) -> dict:
    return {
        "id": m.id,
        "schedule_id": m.schedule_id,
        "sender_id": m.sender_id,
        "sender_name": m.sender.nickname if m.sender else None,
        "content": m.content,
        "msg_type": m.msg_type,
        "voice_url": m.voice_url,
        "voice_duration": m.voice_duration,
        "is_from_client": m.is_from_client,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


def _msg_to_dict_with_schedule(m: Message) -> dict:
    d = _msg_to_dict(m)
    d["schedule_title"] = m.schedule.title if m.schedule else None
    d["schedule_start"] = m.schedule.start_time.isoformat() if m.schedule and m.schedule.start_time else None
    return d


@router.get("/schedules/{schedule_id}/messages", summary="获取沟通记录")
async def get_messages(
    schedule_id: int,
    include_history: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取沟通记录。include_history=true 时同时拉取同客户的历史消息"""
    s = db.query(Schedule).filter(Schedule.id == schedule_id).first()
    require_schedule_access(db, s, current_user)

    if include_history and s.external_contact_phone:
        # 查所有同名客户电话的日程
        related = (
            db.query(Schedule.id)
            .filter(
                Schedule.external_contact_phone == s.external_contact_phone,
                Schedule.external_contact_phone.isnot(None),
                Schedule.external_contact_phone != "",
                Schedule.created_by == s.created_by,
            )
            .all()
        )
        schedule_ids = [r[0] for r in related]
        msgs = (
            db.query(Message)
            .filter(Message.schedule_id.in_(schedule_ids))
            .order_by(Message.created_at.asc())
            .all()
        )
        return {"code": 0, "message": "ok", "data": [_msg_to_dict_with_schedule(m) for m in msgs]}

    msgs = (
        db.query(Message)
        .filter(Message.schedule_id == schedule_id)
        .order_by(Message.created_at.asc())
        .all()
    )
    return {"code": 0, "message": "ok", "data": [_msg_to_dict(m) for m in msgs]}


@router.post("/schedules/{schedule_id}/messages/text", summary="发送文字消息")
async def send_text(
    schedule_id: int,
    content: str = Form(...),
    is_from_client: int = Form(0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """发送文字消息"""
    s = db.query(Schedule).filter(Schedule.id == schedule_id).first()
    require_schedule_access(db, s, current_user)

    if not content.strip():
        raise HTTPException(400, detail="消息内容不能为空")

    msg = Message(
        schedule_id=schedule_id,
        sender_id=current_user.id,
        content=content.strip(),
        msg_type="text",
        is_from_client=is_from_client,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return {"code": 0, "message": "发送成功", "data": _msg_to_dict(msg)}


@router.post("/schedules/{schedule_id}/messages/voice", summary="发送语音消息")
async def send_voice(
    schedule_id: int,
    voice: UploadFile = File(...),
    duration: int = Form(0),
    is_from_client: int = Form(0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """上传语音消息"""
    _ensure_voice_dir()

    s = db.query(Schedule).filter(Schedule.id == schedule_id).first()
    require_schedule_access(db, s, current_user)

    # 限制 5MB
    contents = await voice.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(400, detail="语音文件不能超过 5MB")

    ext = os.path.splitext(voice.filename or ".webm")[1] or ".webm"
    stored = f"voice_{uuid.uuid4().hex}{ext}"
    path = os.path.join(VOICE_DIR, stored)
    with open(path, "wb") as f:
        f.write(contents)

    msg = Message(
        schedule_id=schedule_id,
        sender_id=current_user.id,
        msg_type="voice",
        voice_url=f"/api/v1/messages/voice/{stored}",
        voice_duration=duration,
        is_from_client=is_from_client,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return {"code": 0, "message": "语音发送成功", "data": _msg_to_dict(msg)}


@router.get("/messages/voice/{filename}", summary="播放语音")
async def play_voice(
    filename: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """播放语音文件"""
    filename = os.path.basename(filename)
    msg = db.query(Message).filter(
        Message.voice_url == f"/api/v1/messages/voice/{filename}"
    ).first()
    if not msg:
        raise HTTPException(404, detail="语音文件不存在")
    require_schedule_access(db, msg.schedule, current_user)
    path = os.path.join(VOICE_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(404, detail="语音文件不存在")
    content_type = "audio/webm" if filename.endswith(".webm") else "audio/wav"
    with open(path, "rb") as f:
        return Response(content=f.read(), media_type=content_type)


@router.delete("/messages/{msg_id}", summary="删除消息")
async def delete_message(
    msg_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除单条消息"""
    msg = db.query(Message).filter(Message.id == msg_id).first()
    if not msg:
        raise HTTPException(404, detail="消息不存在")
    require_schedule_access(db, msg.schedule, current_user)
    if current_user.role != "admin" and msg.sender_id != current_user.id:
        raise HTTPException(403, detail="只能删除自己发送的消息")

    # 删除语音文件
    if msg.voice_url:
        voice_path = os.path.join(
            os.path.dirname(__file__), "..", "..", msg.voice_url.lstrip("/")
        )
        if os.path.exists(voice_path):
            os.remove(voice_path)

    db.delete(msg)
    db.commit()
    return {"code": 0, "message": "已删除", "data": None}
