"""
用户管理路由 — 管理员管理用户
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from pydantic import BaseModel, Field

from ..database import get_db
from ..dependencies import get_current_user, require_role
from ..models.user import User
from ..models.schedule import Schedule
from ..models.chat_message import ChatMessage
from ..models.notification import Notification
from ..models.verification import AuditLog
from ..models.message import Message
from ..models.attachment import Attachment
from ..models.conversation import Conversation
from ..schemas.auth import UserInfo

router = APIRouter(prefix="/api/v1", tags=["用户管理"])


class UpdateRoleRequest(BaseModel):
    role: str = Field(..., description="新角色: admin / reader / writer")


class UpdateNicknameRequest(BaseModel):
    nickname: str = Field(..., min_length=1, max_length=50, description="新显示名称")


def _user_to_dict(u: User) -> dict:
    return {
        "id": u.id,
        "phone": u.phone,
        "nickname": u.nickname,
        "role": u.role,
        "is_active": u.is_active,
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "updated_at": u.updated_at.isoformat() if u.updated_at else None,
    }


@router.get("/users", summary="获取用户列表")
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    role_filter: str | None = Query(None, alias="role"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """管理员获取用户列表"""
    q = db.query(User)
    if role_filter:
        q = q.filter(User.role == role_filter)

    total = q.count()
    users = q.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    return {
        "code": 0,
        "message": "ok",
        "data": {
            "total": total,
            "page": page,
            "page_size": page_size,
            "items": [_user_to_dict(u) for u in users],
        },
    }


@router.put("/users/{user_id}/role", summary="修改用户角色")
async def update_user_role(
    user_id: int,
    body: UpdateRoleRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """管理员修改用户角色"""
    if body.role not in ("admin", "reader", "writer"):
        raise HTTPException(status_code=400, detail="角色必须是 admin / reader / writer")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="不能修改自己的角色")

    user.role = body.role
    db.commit()
    db.refresh(user)

    return {"code": 0, "message": f"用户 {user.nickname} 角色已更新为 {body.role}", "data": _user_to_dict(user)}


@router.put("/users/{user_id}/toggle-active", summary="启用/禁用用户")
async def toggle_user_active(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """管理员切换用户启用状态"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="不能禁用自己")

    user.is_active = not user.is_active
    db.commit()
    db.refresh(user)

    status_text = "启用" if user.is_active else "禁用"
    return {"code": 0, "message": f"用户 {user.nickname} 已{status_text}", "data": _user_to_dict(user)}


@router.put("/users/{user_id}/nickname", summary="修改用户昵称")
async def update_user_nickname(
    user_id: int,
    body: UpdateNicknameRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """管理员修改用户昵称"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    user.nickname = body.nickname
    db.commit()
    db.refresh(user)

    return {"code": 0, "message": f"昵称已更新为 {body.nickname}", "data": _user_to_dict(user)}


@router.post("/users/me/nickname", summary="当前用户修改自己的昵称")
async def update_my_nickname(
    body: UpdateNicknameRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """当前用户修改自己的昵称"""
    current_user.nickname = body.nickname
    db.commit()
    db.refresh(current_user)

    return {"code": 0, "message": f"昵称已更新为 {body.nickname}", "data": _user_to_dict(current_user)}


@router.delete("/users/me", summary="注销当前用户账号")
async def delete_my_account(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """当前用户注销自己的账号（级联删除所有数据）"""
    uid = current_user.id

    # 删除通知
    db.query(Notification).filter(Notification.user_id == uid).delete()
    db.query(Notification).filter(Notification.related_schedule_id.in_(
        db.query(Schedule.id).filter(Schedule.created_by == uid)
    )).update({"related_schedule_id": None})

    # 删除聊天消息
    db.query(ChatMessage).filter(ChatMessage.sender_id == uid).delete()
    # 删除对话
    db.query(Conversation).filter(
        (Conversation.user1_id == uid) | (Conversation.user2_id == uid)
    ).delete()

    # 删除旧聊天记录
    db.query(Message).filter(Message.sender_id == uid).delete()

    # 删除附件
    attachments = db.query(Attachment).filter(Attachment.uploaded_by == uid).all()
    for att in attachments:
        import os
        if os.path.exists(att.file_path):
            os.remove(att.file_path)
    db.query(Attachment).filter(Attachment.uploaded_by == uid).delete()

    # 删除审核日志
    db.query(AuditLog).filter(AuditLog.performed_by == uid).delete()

    # 删除日程
    schedules = db.query(Schedule).filter(Schedule.created_by == uid).all()
    for s in schedules:
        db.query(AuditLog).filter(AuditLog.schedule_id == s.id).delete()
        db.query(Message).filter(Message.schedule_id == s.id).delete()
        db.query(Notification).filter(Notification.related_schedule_id == s.id).update(
            {"related_schedule_id": None}
        )
        atts = db.query(Attachment).filter(Attachment.schedule_id == s.id).all()
        for a in atts:
            import os
            if os.path.exists(a.file_path):
                os.remove(a.file_path)
        db.query(Attachment).filter(Attachment.schedule_id == s.id).delete()
    db.query(Schedule).filter(Schedule.created_by == uid).delete()

    # 删除用户
    db.query(User).filter(User.id == uid).delete()
    db.commit()

    return {"code": 0, "message": "账号已注销", "data": None}
