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
from ..models.invite import InviteCode
from ..models.schedule import Schedule
from ..models.chat_message import ChatMessage
from ..models.notification import Notification
from ..models.verification import AuditLog
from ..models.message import Message
from ..models.attachment import Attachment
from ..models.conversation import Conversation
from ..schemas.auth import UserInfo
from ..utils.datetime_utils import to_beijing_iso

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
        "created_at": to_beijing_iso(u.created_at),
        "updated_at": to_beijing_iso(u.updated_at),
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


# ----- 注册邀请码：管理员生成发放，注册时核销 -----


class CreateInviteCodeRequest(BaseModel):
    max_uses: int = Field(1, ge=1, le=100, description="可用次数")
    note: str | None = Field(None, max_length=100, description="备注")


def _invite_to_dict(c: InviteCode) -> dict:
    return {
        "id": c.id,
        "code": c.code,
        "max_uses": c.max_uses,
        "used_count": c.used_count,
        "note": c.note,
        "disabled": c.disabled,
        "is_available": c.is_available,
        "created_at": to_beijing_iso(c.created_at),
    }


@router.get("/users/invite-codes", summary="邀请码列表")
async def list_invite_codes(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    codes = db.query(InviteCode).order_by(InviteCode.id.desc()).limit(100).all()
    return {"code": 0, "message": "ok", "data": [_invite_to_dict(c) for c in codes]}


@router.post("/users/invite-codes", summary="生成邀请码")
async def create_invite_code(
    body: CreateInviteCodeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    import secrets

    alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"  # 去掉易混淆的 0/O/1/I
    for _ in range(5):  # 极小概率撞码，重试几次
        code = "".join(secrets.choice(alphabet) for _ in range(8))
        if not db.query(InviteCode.id).filter(InviteCode.code == code).first():
            break
    invite = InviteCode(code=code, max_uses=body.max_uses, note=body.note, created_by=current_user.id)
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return {"code": 0, "message": "已生成邀请码", "data": _invite_to_dict(invite)}


@router.put("/users/invite-codes/{code_id}/toggle", summary="启用/停用邀请码")
async def toggle_invite_code(
    code_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    invite = db.query(InviteCode).filter(InviteCode.id == code_id).first()
    if not invite:
        raise HTTPException(status_code=404, detail="邀请码不存在")
    invite.disabled = not invite.disabled
    db.commit()
    return {"code": 0, "message": "已停用" if invite.disabled else "已启用", "data": _invite_to_dict(invite)}
