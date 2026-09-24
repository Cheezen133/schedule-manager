"""
聊天路由 — 独立交流平台
"""
import os
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_
from pydantic import BaseModel, Field

from ..database import get_db
from ..dependencies import get_current_user
from ..models.user import User
from ..models.conversation import Conversation, ConversationMember
from ..models.chat_message import ChatMessage
from ..models.shared_file import SharedFile
from ..models.memo import GroupAnnouncement, GroupTodo
from ..models.favorite import FavoriteMessage
from ..models.notification import Notification
from ..services.notification_service import create_notification
from ..utils.datetime_utils import to_beijing_iso

router = APIRouter(prefix="/api/v1/chat", tags=["聊天"])


class ConvCreateRequest(BaseModel):
    user_id: int

class TextMessageRequest(BaseModel):
    content: str = Field(..., min_length=1)

class RemarkRequest(BaseModel):
    remark: str = Field(..., max_length=50)


class GroupCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    user_ids: list[int] = Field(..., min_length=1)


class GroupAnnouncementRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    content: str | None = Field(None, max_length=5000)
    source_message_id: int | None = None


class GroupTodoRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    source_message_id: int | None = None


class GroupRenameRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)


class GroupMemberRoleRequest(BaseModel):
    role: str = Field(..., pattern="^(admin|member)$")


class GroupMembersAddRequest(BaseModel):
    user_ids: list[int] = Field(..., min_length=1, max_length=99)


class SharedFileUpdateRequest(BaseModel):
    tag: str | None = Field(None, max_length=50)
    note: str | None = Field(None, max_length=500)

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "chat")
MAX_SIZE = 50 * 1024 * 1024  # 50MB


def _guess_msg_type(mime: str) -> str:
    if mime.startswith("image/"): return "image"
    if mime.startswith("video/"): return "video"
    return "file"


def _ensure_upload_dir():
    os.makedirs(UPLOAD_DIR, exist_ok=True)


def _require_conversation_member(db: Session, conv_id: int, current_user: User) -> Conversation:
    conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="会话不存在")
    if not _is_conversation_member(db, conv, current_user.id):
        raise HTTPException(status_code=403, detail="无权访问该会话")
    return conv


def _is_conversation_member(db: Session, conv: Conversation, user_id: int) -> bool:
    if conv.is_group:
        return db.query(ConversationMember).filter(
            ConversationMember.conversation_id == conv.id,
            ConversationMember.user_id == user_id,
        ).first() is not None
    return conv.is_accepted == 1 and user_id in (conv.user1_id, conv.user2_id)


def _group_member_ids(db: Session, conv_id: int) -> list[int]:
    return [row[0] for row in db.query(ConversationMember.user_id).filter(
        ConversationMember.conversation_id == conv_id
    ).all()]


def _group_membership(db: Session, conv_id: int, user_id: int) -> ConversationMember | None:
    return db.query(ConversationMember).filter(
        ConversationMember.conversation_id == conv_id,
        ConversationMember.user_id == user_id,
    ).first()


def _require_group_manager(db: Session, conv_id: int, current_user: User) -> tuple[Conversation, ConversationMember]:
    conv = _require_group_member(db, conv_id, current_user)
    membership = _group_membership(db, conv.id, current_user.id)
    if not membership or membership.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="仅群主或群管理员可以执行此操作")
    return conv, membership


def _require_group_owner(db: Session, conv_id: int, current_user: User) -> tuple[Conversation, ConversationMember]:
    conv, membership = _require_group_manager(db, conv_id, current_user)
    if membership.role != "owner":
        raise HTTPException(status_code=403, detail="仅群主可以执行此操作")
    return conv, membership


def _partner_info(conv: Conversation, current_user_id: int) -> dict:
    """获取对方用户信息（含备注名）"""
    if conv.is_group:
        return {
            "id": conv.id,
            "nickname": conv.group_name or "群聊",
            "username": "",
            "phone": None,
            "remark": None,
            "display_name": conv.group_name or "群聊",
            "is_group": True,
        }
    if conv.user1_id == current_user_id:
        partner = conv.user2
        remark = conv.remark_by_user1
    else:
        partner = conv.user1
        remark = conv.remark_by_user2
    return {
        "id": partner.id,
        "nickname": partner.nickname,
        "username": partner.username,
        "phone": partner.phone,
        "remark": remark,
        "display_name": remark or partner.nickname,
        "is_group": False,
    }


def _msg_to_dict(m: ChatMessage) -> dict:
    if m.is_recalled:
        recalled_by = m.recalled_by
        return {
            "id": m.id,
            "conversation_id": m.conversation_id,
            "sender_id": m.sender_id,
            "sender_name": m.sender.nickname if m.sender else None,
            "msg_type": "recalled",
            "content": None,
            "file_url": None,
            "file_name": None,
            "file_size": None,
            "is_recalled": True,
            "recalled_at": to_beijing_iso(m.recalled_at),
            "recalled_by_id": m.recalled_by_id,
            "recalled_by_name": recalled_by.nickname if recalled_by else None,
            "created_at": to_beijing_iso(m.created_at),
        }
    return {
        "id": m.id,
        "conversation_id": m.conversation_id,
        "sender_id": m.sender_id,
        "sender_name": m.sender.nickname if m.sender else None,
        "content": m.content,
        "msg_type": m.msg_type,
        "file_url": m.file_url,
        "file_name": m.file_name,
        "file_size": m.file_size,
        "is_recalled": False,
        "recalled_at": None,
        "recalled_by_id": None,
        "recalled_by_name": None,
        "created_at": to_beijing_iso(m.created_at),
    }


def _shared_file_to_dict(item: SharedFile) -> dict:
    is_text = item.msg_type == "text"
    return {
        "id": item.id,
        "file_url": None if is_text else item.file_url,
        "file_name": item.file_name,
        "file_size": item.file_size,
        "msg_type": item.msg_type,
        "tag": item.tag,
        "note": item.note,
        "content": item.content or (item.source_msg.content if is_text and item.source_msg else None),
        "source_message_id": item.source_msg_id,
        "conversation_id": item.conversation_id,
        "uploader_name": item.uploader.nickname if item.uploader else None,
        "created_at": to_beijing_iso(item.created_at),
    }


def _notify_partner(db: Session, conv: Conversation, sender_id: int, preview: str):
    """给对方创建聊天通知"""
    from ..models.notification import Notification
    partner_ids = (
        [user_id for user_id in _group_member_ids(db, conv.id) if user_id != sender_id]
        if conv.is_group else [conv.user2_id if conv.user1_id == sender_id else conv.user1_id]
    )
    sender = db.query(User).filter(User.id == sender_id).first()
    sender_name = sender.nickname if sender else "用户"
    for partner_id in partner_ids:
        db.add(Notification(
            user_id=partner_id,
            title=f"💬 {sender_name} {preview}" if preview else f"💬 {sender_name} 发来消息",
            content=preview or "发来消息",
            type="chat_message",
            related_schedule_id=None,
            related_url=f"/chat/{conv.id}",
        ))
    db.commit()


# ==================== 会话 ====================

@router.get("/conversations", summary="我的对话列表")
async def list_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取当前用户的所有已接受对话，按最后活跃时间倒序"""
    group_ids = [row[0] for row in db.query(ConversationMember.conversation_id).filter(
        ConversationMember.user_id == current_user.id
    ).all()]
    convs = (
        db.query(Conversation)
        .filter(
            or_(
                (Conversation.is_group == True) & Conversation.id.in_(group_ids),
                (Conversation.is_group == False) & or_(
                    Conversation.user1_id == current_user.id,
                    Conversation.user2_id == current_user.id,
                ),
            ),
            Conversation.is_accepted == 1,
        )
        .order_by(Conversation.updated_at.desc())
        .all()
    )

    result = []
    for c in convs:
        partner = _partner_info(c, current_user.id)
        last_msg = (
            db.query(ChatMessage)
            .filter(ChatMessage.conversation_id == c.id)
            .order_by(ChatMessage.created_at.desc())
            .first()
        )
        # 未读判断：对方最后消息时间 > 我最后阅读时间
        if c.is_group:
            membership = db.query(ConversationMember).filter(
                ConversationMember.conversation_id == c.id,
                ConversationMember.user_id == current_user.id,
            ).first()
            last_read = membership.last_read_at if membership else None
        else:
            last_read = c.last_read_by_user1 if c.user1_id == current_user.id else c.last_read_by_user2
        has_unread = last_msg is not None and last_msg.sender_id != current_user.id and (
            last_read is None or last_msg.created_at > last_read
        )
        # 我最后消息是否已被对方阅读
        my_last = (
            db.query(ChatMessage)
            .filter(ChatMessage.conversation_id == c.id, ChatMessage.sender_id == current_user.id)
            .order_by(ChatMessage.created_at.desc())
            .first()
        )
        other_last_read = None if c.is_group else (c.last_read_by_user2 if c.user1_id == current_user.id else c.last_read_by_user1)
        my_last_read = my_last is not None and other_last_read is not None and my_last.created_at <= other_last_read
        result.append({
            "id": c.id,
            "partner": partner,
            "last_message": _msg_to_dict(last_msg) if last_msg else None,
            "updated_at": to_beijing_iso(c.updated_at),
            "has_unread": has_unread,
            "my_last_read": my_last_read,
        })

    return {"code": 0, "message": "ok", "data": result}


@router.post("/conversations", summary="发送好友请求")
async def create_conversation(
    body: ConvCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_id = body.user_id
    """向另一用户发送好友请求（不再直接创建对话）"""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="不能与自己对话")

    target = db.query(User).filter(User.id == user_id).first()
    if not target or not target.is_active:
        raise HTTPException(status_code=404, detail="用户不存在")

    from ..models.friend_request import FriendRequest

    # 删除好友后保留私聊历史，重新添加时复用原会话。
    u1 = min(current_user.id, user_id)
    u2 = max(current_user.id, user_id)
    existing_conv = db.query(Conversation).filter(
        Conversation.user1_id == u1,
        Conversation.user2_id == u2,
        Conversation.is_group == False,
    ).order_by(Conversation.id.asc()).first()
    relations = db.query(FriendRequest).filter(or_(
        (FriendRequest.sender_id == current_user.id) & (FriendRequest.receiver_id == user_id),
        (FriendRequest.sender_id == user_id) & (FriendRequest.receiver_id == current_user.id),
    )).order_by(FriendRequest.id.asc()).all()
    accepted_relation = next((item for item in relations if item.status == "accepted"), None)
    if accepted_relation:
        conv = existing_conv or Conversation(user1_id=u1, user2_id=u2, is_accepted=1, is_group=False)
        conv.is_accepted = 1
        if existing_conv is None:
            db.add(conv)
        db.commit()
        db.refresh(conv)
        return {"code": 0, "message": "已是好友", "data": {"id": conv.id, "partner": _partner_info(conv, current_user.id)}}

    # 检查是否已有待处理请求
    existing_req = next((item for item in relations if item.sender_id == current_user.id and item.status == "pending"), None)
    if existing_req:
        return {"code": 0, "message": "已发送好友请求，等待对方同意", "data": None}

    # 如果对方也向我发过请求，直接接受
    reverse_req = next((item for item in relations if item.sender_id == user_id and item.status == "pending"), None)
    if reverse_req:
        reverse_req.status = "accepted"
        conv = existing_conv or Conversation(user1_id=u1, user2_id=u2, is_accepted=1, is_group=False)
        conv.is_accepted = 1
        if existing_conv is None:
            db.add(conv)
        db.commit()
        db.refresh(conv)
        return {"code": 0, "message": "已互为好友", "data": {"id": conv.id, "partner": _partner_info(conv, current_user.id)}}

    # 拒绝或删除后的记录直接复用，避免重复好友记录。
    req = relations[0] if relations else FriendRequest()
    for duplicate in relations[1:]:
        db.delete(duplicate)
    if relations[1:]:
        db.flush()
    req.sender_id = current_user.id
    req.receiver_id = user_id
    req.status = "pending"
    if not relations:
        db.add(req)
    db.commit()

    # 通知接收者
    from ..models.notification import Notification
    notif = Notification(
        user_id=user_id,
        title=f"👥 {current_user.nickname} 请求添加你为好友",
        content="点击查看好友请求",
        type="friend_request",
        related_url="/chat",
    )
    db.add(notif)
    db.commit()

    return {"code": 0, "message": "好友请求已发送", "data": None}


@router.post("/groups", summary="创建群聊")
async def create_group(
    body: GroupCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    member_ids = list(dict.fromkeys([current_user.id, *body.user_ids]))
    if len(member_ids) < 2:
        raise HTTPException(status_code=400, detail="群聊至少需要两名成员")
    if len(member_ids) > 100:
        raise HTTPException(status_code=400, detail="群成员不能超过 100 人")

    from ..models.friend_request import FriendRequest
    for user_id in member_ids:
        if user_id == current_user.id:
            continue
        target = db.query(User).filter(User.id == user_id, User.is_active == True).first()
        if not target:
            raise HTTPException(status_code=404, detail="群成员不存在或已停用")
        are_friends = db.query(FriendRequest).filter(
            FriendRequest.status == "accepted",
            or_(
                (FriendRequest.sender_id == current_user.id) & (FriendRequest.receiver_id == user_id),
                (FriendRequest.sender_id == user_id) & (FriendRequest.receiver_id == current_user.id),
            ),
        ).first()
        if not are_friends:
            raise HTTPException(status_code=400, detail="只能邀请已添加的好友")

    conv = Conversation(
        user1_id=current_user.id,
        user2_id=next(user_id for user_id in member_ids if user_id != current_user.id),
        is_accepted=1,
        is_group=True,
        group_name=body.name.strip(),
        created_by=current_user.id,
    )
    db.add(conv)
    db.flush()
    for user_id in member_ids:
        db.add(ConversationMember(conversation_id=conv.id, user_id=user_id, role="owner" if user_id == current_user.id else "member"))
    db.commit()
    db.refresh(conv)
    return {"code": 0, "message": "群聊创建成功", "data": {"id": conv.id, "partner": _partner_info(conv, current_user.id)}}


@router.get("/conversations/{conv_id}/members", summary="获取群成员")
async def get_conversation_members(
    conv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conv = _require_conversation_member(db, conv_id, current_user)
    if not conv.is_group:
        return {"code": 0, "message": "ok", "data": [_partner_info(conv, current_user.id)]}
    members = db.query(ConversationMember).filter(ConversationMember.conversation_id == conv.id).all()
    member_ids = [member.user_id for member in members]
    from ..models.friend_request import FriendRequest
    relations = db.query(FriendRequest).filter(
        or_(
            (FriendRequest.sender_id == current_user.id) & FriendRequest.receiver_id.in_(member_ids),
            (FriendRequest.receiver_id == current_user.id) & FriendRequest.sender_id.in_(member_ids),
        )
    ).all()
    relation_by_user = {}
    for relation in relations:
        other_id = relation.receiver_id if relation.sender_id == current_user.id else relation.sender_id
        relation_by_user[other_id] = relation
    direct_conversations = db.query(Conversation).filter(
        Conversation.is_group == False,
        Conversation.is_accepted == 1,
        or_(
            (Conversation.user1_id == current_user.id) & Conversation.user2_id.in_(member_ids),
            (Conversation.user2_id == current_user.id) & Conversation.user1_id.in_(member_ids),
        ),
    ).all()
    direct_by_user = {
        conversation.user2_id if conversation.user1_id == current_user.id else conversation.user1_id: conversation.id
        for conversation in direct_conversations
    }

    def member_dict(member):
        relation = relation_by_user.get(member.user_id)
        if member.user_id == current_user.id:
            friendship_status = "self"
        elif relation and relation.status == "accepted":
            friendship_status = "friend"
        elif relation and relation.status == "pending":
            friendship_status = "pending_outgoing" if relation.sender_id == current_user.id else "pending_incoming"
        else:
            friendship_status = "none"
        return {
            "id": member.user.id,
            "nickname": member.user.nickname,
            "username": member.user.username,
            "role": member.role or "member",
            "friendship_status": friendship_status,
            "direct_conversation_id": direct_by_user.get(member.user_id),
        }
    return {"code": 0, "message": "ok", "data": [
        member_dict(member) for member in members if member.user
    ]}


@router.post("/conversations/{conv_id}/members", summary="邀请好友加入群聊")
async def add_group_members(
    conv_id: int,
    body: GroupMembersAddRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conv, _ = _require_group_manager(db, conv_id, current_user)
    user_ids = list(dict.fromkeys(body.user_ids))
    existing_ids = set(_group_member_ids(db, conv.id))

    if current_user.id in user_ids or any(user_id in existing_ids for user_id in user_ids):
        raise HTTPException(status_code=400, detail="邀请名单中包含现有群成员")
    if len(existing_ids) + len(user_ids) > 100:
        raise HTTPException(status_code=400, detail="群成员不能超过 100 人")

    targets = db.query(User).filter(User.id.in_(user_ids), User.is_active == True).all()
    if len(targets) != len(user_ids):
        raise HTTPException(status_code=404, detail="邀请成员不存在或已停用")

    from ..models.friend_request import FriendRequest
    friend_rows = db.query(FriendRequest).filter(
        FriendRequest.status == "accepted",
        or_(
            (FriendRequest.sender_id == current_user.id) & FriendRequest.receiver_id.in_(user_ids),
            (FriendRequest.receiver_id == current_user.id) & FriendRequest.sender_id.in_(user_ids),
        ),
    ).all()
    friend_ids = {
        row.receiver_id if row.sender_id == current_user.id else row.sender_id
        for row in friend_rows
    }
    if friend_ids != set(user_ids):
        raise HTTPException(status_code=400, detail="只能邀请你已添加的好友")

    for user_id in user_ids:
        db.add(ConversationMember(conversation_id=conv.id, user_id=user_id, role="member"))
        db.add(Notification(
            user_id=user_id,
            title=f"👥 {current_user.nickname} 邀请你加入群聊",
            content=f"你已加入群聊：{conv.group_name or '群聊'}",
            type="group_invite",
            related_url=f"/chat/{conv.id}",
        ))
    db.commit()
    return {"code": 0, "message": "成员已加入群聊", "data": {"user_ids": user_ids}}


def _require_group_member(db: Session, conv_id: int, current_user: User) -> Conversation:
    conv = _require_conversation_member(db, conv_id, current_user)
    if not conv.is_group:
        raise HTTPException(status_code=400, detail="Group chat only")
    return conv


def _check_source_message(db: Session, conv_id: int, message_id: int | None):
    if message_id is None:
        return None
    message = db.query(ChatMessage).filter(ChatMessage.id == message_id, ChatMessage.conversation_id == conv_id).first()
    if not message:
        raise HTTPException(status_code=400, detail="Source message does not belong to this group")
    return message


@router.put("/conversations/{conv_id}/group-name")
async def rename_group(conv_id: int, body: GroupRenameRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    conv, _ = _require_group_manager(db, conv_id, current_user)
    conv.group_name = body.name.strip()
    db.commit()
    db.refresh(conv)
    return {"code": 0, "data": {"id": conv.id, "group_name": conv.group_name}}


@router.put("/conversations/{conv_id}/members/{user_id}/role")
async def set_group_member_role(conv_id: int, user_id: int, body: GroupMemberRoleRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    conv, _ = _require_group_owner(db, conv_id, current_user)
    target = _group_membership(db, conv.id, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Group member not found")
    if target.role == "owner":
        raise HTTPException(status_code=400, detail="The group owner role cannot be changed")
    target.role = body.role
    db.commit()
    return {"code": 0, "data": {"user_id": user_id, "role": target.role}}


@router.delete("/conversations/{conv_id}/members/{user_id}")
async def remove_group_member(conv_id: int, user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    conv, membership = _require_group_manager(db, conv_id, current_user)
    target = _group_membership(db, conv.id, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Group member not found")
    if target.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="不能将自己移出群聊")
    if target.role == "owner":
        raise HTTPException(status_code=403, detail="群主不能被移出群聊")
    if membership.role == "admin" and target.role != "member":
        raise HTTPException(status_code=403, detail="群管理员只能移出普通成员")
    db.delete(target)
    db.commit()
    return {"code": 0, "data": {"user_id": user_id}}


@router.delete("/conversations/{conv_id}")
async def dissolve_group(conv_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    conv, _ = _require_group_owner(db, conv_id, current_user)
    file_urls = [row[0] for row in db.query(ChatMessage.file_url).filter(ChatMessage.conversation_id == conv.id, ChatMessage.file_url.isnot(None)).all()]
    file_urls.extend(row[0] for row in db.query(SharedFile.file_url).filter(SharedFile.conversation_id == conv.id).all())
    from ..models.notification import Notification
    db.query(Notification).filter(Notification.related_url == f"/chat/{conv.id}").delete(synchronize_session=False)
    db.query(GroupAnnouncement).filter(GroupAnnouncement.conversation_id == conv.id).delete(synchronize_session=False)
    db.query(GroupTodo).filter(GroupTodo.conversation_id == conv.id).delete(synchronize_session=False)
    db.query(SharedFile).filter(SharedFile.conversation_id == conv.id).delete(synchronize_session=False)
    message_ids = [row[0] for row in db.query(ChatMessage.id).filter(ChatMessage.conversation_id == conv.id).all()]
    if message_ids:
        db.query(FavoriteMessage).filter(FavoriteMessage.chat_message_id.in_(message_ids)).delete(synchronize_session=False)
    db.query(ChatMessage).filter(ChatMessage.conversation_id == conv.id).delete(synchronize_session=False)
    db.query(ConversationMember).filter(ConversationMember.conversation_id == conv.id).delete(synchronize_session=False)
    db.delete(conv)
    db.commit()
    for file_url in set(file_urls):
        path = os.path.join(UPLOAD_DIR, os.path.basename(file_url or ""))
        if os.path.exists(path):
            try:
                os.remove(path)
            except OSError:
                pass
    return {"code": 0}


def _announcement_dict(item: GroupAnnouncement, db: Session):
    creator = db.query(User).filter(User.id == item.creator_id).first()
    return {"id": item.id, "conversation_id": item.conversation_id, "title": item.title, "content": item.content, "source_message_id": item.source_message_id, "creator_id": item.creator_id, "creator_name": creator.nickname if creator else None, "created_at": to_beijing_iso(item.created_at), "updated_at": to_beijing_iso(item.updated_at)}


def _todo_dict(item: GroupTodo, db: Session):
    creator = db.query(User).filter(User.id == item.creator_id).first()
    return {"id": item.id, "conversation_id": item.conversation_id, "title": item.title, "source_message_id": item.source_message_id, "creator_id": item.creator_id, "creator_name": creator.nickname if creator else None, "is_completed": item.is_completed, "completed_at": to_beijing_iso(item.completed_at), "created_at": to_beijing_iso(item.created_at), "updated_at": to_beijing_iso(item.updated_at)}


@router.get("/conversations/{conv_id}/announcements")
async def list_group_announcements(conv_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_group_member(db, conv_id, current_user)
    items = db.query(GroupAnnouncement).filter(GroupAnnouncement.conversation_id == conv_id).order_by(GroupAnnouncement.updated_at.desc()).all()
    return {"code": 0, "data": [_announcement_dict(item, db) for item in items]}


@router.post("/conversations/{conv_id}/announcements")
async def create_group_announcement(conv_id: int, body: GroupAnnouncementRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    conv, _ = _require_group_manager(db, conv_id, current_user)
    _check_source_message(db, conv.id, body.source_message_id)
    item = GroupAnnouncement(conversation_id=conv.id, creator_id=current_user.id, title=body.title.strip(), content=(body.content or "").strip() or None, source_message_id=body.source_message_id)
    db.add(item); db.commit(); db.refresh(item)
    for member_id in _group_member_ids(db, conv.id):
        if member_id != current_user.id:
            create_notification(db, member_id, "群公告", f"{current_user.nickname} 发布了群公告：{item.title}", "group_announcement", related_url=f"/chat/{conv.id}")
    return {"code": 0, "data": _announcement_dict(item, db)}


@router.put("/announcements/{announcement_id}")
async def update_group_announcement(announcement_id: int, body: GroupAnnouncementRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(GroupAnnouncement).filter(GroupAnnouncement.id == announcement_id).first()
    if not item: raise HTTPException(status_code=404, detail="Announcement not found")
    _require_group_manager(db, item.conversation_id, current_user)
    _check_source_message(db, item.conversation_id, body.source_message_id)
    item.title, item.content, item.source_message_id = body.title.strip(), (body.content or "").strip() or None, body.source_message_id
    db.commit(); db.refresh(item)
    return {"code": 0, "data": _announcement_dict(item, db)}


@router.delete("/announcements/{announcement_id}")
async def delete_group_announcement(announcement_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(GroupAnnouncement).filter(GroupAnnouncement.id == announcement_id).first()
    if not item: raise HTTPException(status_code=404, detail="Announcement not found")
    _require_group_manager(db, item.conversation_id, current_user)
    db.delete(item); db.commit(); return {"code": 0}


@router.get("/conversations/{conv_id}/todos")
async def list_group_todos(conv_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_group_member(db, conv_id, current_user)
    items = db.query(GroupTodo).filter(
        GroupTodo.conversation_id == conv_id,
        GroupTodo.is_completed == False,
    ).order_by(GroupTodo.updated_at.desc()).all()
    return {"code": 0, "data": [_todo_dict(item, db) for item in items]}


@router.post("/conversations/{conv_id}/todos")
async def create_group_todo(conv_id: int, body: GroupTodoRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    conv, _ = _require_group_manager(db, conv_id, current_user)
    _check_source_message(db, conv.id, body.source_message_id)
    item = GroupTodo(conversation_id=conv.id, creator_id=current_user.id, title=body.title.strip(), source_message_id=body.source_message_id)
    db.add(item); db.commit(); db.refresh(item)
    for member_id in _group_member_ids(db, conv.id):
        if member_id != current_user.id:
            create_notification(db, member_id, "群待办", f"{current_user.nickname} 创建了群待办：{item.title}", "group_todo", related_url=f"/chat/{conv.id}")
    return {"code": 0, "data": _todo_dict(item, db)}


@router.put("/todos/{todo_id}")
async def update_group_todo(todo_id: int, body: GroupTodoRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(GroupTodo).filter(GroupTodo.id == todo_id).first()
    if not item: raise HTTPException(status_code=404, detail="Todo not found")
    _require_group_manager(db, item.conversation_id, current_user)
    _check_source_message(db, item.conversation_id, body.source_message_id)
    item.title, item.source_message_id = body.title.strip(), body.source_message_id
    db.commit(); db.refresh(item)
    return {"code": 0, "data": _todo_dict(item, db)}


@router.put("/todos/{todo_id}/toggle")
async def toggle_group_todo(todo_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(GroupTodo).filter(GroupTodo.id == todo_id).first()
    if not item: raise HTTPException(status_code=404, detail="Todo not found")
    _require_group_member(db, item.conversation_id, current_user)
    item.is_completed = not item.is_completed
    item.completed_at = datetime.now(timezone.utc) if item.is_completed else None
    db.commit(); db.refresh(item)
    return {"code": 0, "data": _todo_dict(item, db)}


@router.delete("/todos/{todo_id}")
async def delete_group_todo(todo_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(GroupTodo).filter(GroupTodo.id == todo_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Todo not found")
    _require_group_manager(db, item.conversation_id, current_user)
    db.delete(item)
    db.commit()
    return {"code": 0}


@router.put("/conversations/{conv_id}/remark", summary="设置备注名")
async def set_remark(
    conv_id: int,
    body: RemarkRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    remark = body.remark
    """为对方设置备注名"""
    conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="会话不存在")
    if not _is_conversation_member(db, conv, current_user.id):
        raise HTTPException(status_code=403, detail="无权操作")

    remark_val = remark.strip() or None
    if current_user.id == conv.user1_id:
        conv.remark_by_user1 = remark_val
    else:
        conv.remark_by_user2 = remark_val

    db.commit()
    return {"code": 0, "message": "备注名已更新", "data": None}


# ==================== 已读 ====================

@router.put("/conversations/{conv_id}/read", summary="标记已读")
async def mark_read(
    conv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """标记当前用户已阅读此会话所有消息"""
    conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="会话不存在")
    if not _is_conversation_member(db, conv, current_user.id):
        raise HTTPException(status_code=403, detail="无权操作")

    now = datetime.now(timezone.utc)
    if conv.is_group:
        db.query(ConversationMember).filter(
            ConversationMember.conversation_id == conv.id,
            ConversationMember.user_id == current_user.id,
        ).update({"last_read_at": now})
    elif conv.user1_id == current_user.id:
        conv.last_read_by_user1 = now
    else:
        conv.last_read_by_user2 = now
    db.commit()
    return {"code": 0, "message": "已标记已读", "data": None}


# ==================== 消息 ====================

@router.get("/conversations/{conv_id}/messages", summary="获取消息")
async def get_messages(
    conv_id: int,
    before_id: int | None = Query(None, description="游标：获取此ID之前的消息"),
    limit: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取对话消息（游标分页，倒序）"""
    conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="会话不存在")
    if not _is_conversation_member(db, conv, current_user.id):
        raise HTTPException(status_code=403, detail="无权访问")

    q = db.query(ChatMessage).filter(ChatMessage.conversation_id == conv_id)
    if before_id:
        q = q.filter(ChatMessage.id < before_id)
    msgs = q.order_by(ChatMessage.created_at.desc()).limit(limit).all()

    # 转为正序
    msgs.reverse()

    return {"code": 0, "message": "ok", "data": [_msg_to_dict(m) for m in msgs]}


@router.post("/conversations/{conv_id}/messages/text", summary="发送文字")
async def send_text(
    conv_id: int,
    body: TextMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """发送文字消息"""
    content = body.content
    conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="会话不存在")
    if not _is_conversation_member(db, conv, current_user.id):
        raise HTTPException(status_code=403, detail="无权操作")

    msg = ChatMessage(
        conversation_id=conv_id,
        sender_id=current_user.id,
        content=content.strip(),
        msg_type="text",
    )
    conv.updated_at = datetime.now(timezone.utc)
    db.add(msg)
    db.commit()
    db.refresh(msg)

    # 通知对方
    _notify_partner(db, conv, current_user.id, f"发来消息：{content.strip()[:50]}")

    return {"code": 0, "message": "发送成功", "data": _msg_to_dict(msg)}


@router.post("/conversations/{conv_id}/messages/media", summary="发送图片/视频/文件")
async def send_media(
    conv_id: int,
    file: UploadFile = File(...),
    content: str = Form(""),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """发送图片、视频或任意文件"""
    conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="会话不存在")
    if not _is_conversation_member(db, conv, current_user.id):
        raise HTTPException(status_code=403, detail="无权操作")

    # 大小校验
    contents = await file.read()
    if len(contents) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="文件不能超过 50MB")

    _ensure_upload_dir()
    original_name = file.filename or "file.bin"
    ext = os.path.splitext(original_name)[1] or ".bin"
    stored = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(UPLOAD_DIR, stored)
    with open(path, "wb") as f:
        f.write(contents)

    mime = file.content_type or "application/octet-stream"
    msg_type = _guess_msg_type(mime)
    preview = {"image": "图片", "video": "视频", "file": "文件"}.get(msg_type, "文件")

    msg = ChatMessage(
        conversation_id=conv_id,
        sender_id=current_user.id,
        content=content.strip() or None,
        msg_type=msg_type,
        file_url=f"/api/v1/chat/messages/media/{stored}",
        file_name=original_name,
        file_size=len(contents),
    )
    conv.updated_at = datetime.now(timezone.utc)
    db.add(msg)
    db.commit()
    db.refresh(msg)

    _notify_partner(db, conv, current_user.id, f"发来{preview}")

    return {"code": 0, "message": "发送成功", "data": _msg_to_dict(msg)}


@router.get("/messages/media/{filename}", summary="查看媒体文件")
async def serve_media(
    filename: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """查看媒体文件"""
    filename = os.path.basename(filename)
    file_url = f"/api/v1/chat/messages/media/{filename}"
    msg = db.query(ChatMessage).filter(ChatMessage.file_url == file_url).first()
    shared = None if msg else db.query(SharedFile).filter(SharedFile.file_url == file_url).first()
    resource = msg or shared
    if not resource:
        raise HTTPException(status_code=404, detail="文件不存在")
    _require_conversation_member(db, resource.conversation_id, current_user)
    path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="文件不存在")

    ext = os.path.splitext(filename)[1].lower()
    content_type = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
        ".gif": "image/gif", ".webp": "image/webp",
        ".mp4": "video/mp4", ".webm": "video/webm",
    }.get(ext, "application/octet-stream")

    return FileResponse(path, media_type=content_type)


@router.delete("/messages/{msg_id}", summary="删除消息")
async def delete_message(
    msg_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除自己发送的消息"""
    msg = db.query(ChatMessage).filter(ChatMessage.id == msg_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="消息不存在")
    _require_conversation_member(db, msg.conversation_id, current_user)
    if msg.sender_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="只能删除自己的消息")

    shared_references = db.query(SharedFile).filter(SharedFile.source_msg_id == msg.id).all()
    for shared in shared_references:
        if shared.msg_type == "text" and not shared.content:
            shared.content = msg.content
        shared.source_msg_id = None
    has_shared_file = bool(msg.file_url and db.query(SharedFile.id).filter(
        SharedFile.file_url == msg.file_url
    ).first())
    db.query(FavoriteMessage).filter(FavoriteMessage.chat_message_id == msg.id).delete(
        synchronize_session=False
    )
    # 先解除共享文件到来源消息的外键，再删除来源消息，避免数据库按错误顺序执行。
    db.flush()

    # 仍被共享文件引用的媒体必须保留。
    if msg.file_url and not has_shared_file:
        fname = msg.file_url.rsplit("/", 1)[-1]
        fpath = os.path.join(UPLOAD_DIR, fname)
        if os.path.exists(fpath):
            os.remove(fpath)

    db.delete(msg)
    db.commit()
    return {"code": 0, "message": "已删除", "data": None}


@router.post("/messages/{msg_id}/recall", summary="撤回消息")
async def recall_message(
    msg_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    msg = db.query(ChatMessage).filter(ChatMessage.id == msg_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="消息不存在")
    conv = _require_conversation_member(db, msg.conversation_id, current_user)
    if msg.is_recalled:
        raise HTTPException(status_code=400, detail="该消息已撤回")

    created_at = msg.created_at
    if created_at and created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    if not created_at or datetime.now(timezone.utc) - created_at > timedelta(minutes=2):
        raise HTTPException(status_code=400, detail="消息发送超过两分钟，无法撤回")

    if msg.sender_id != current_user.id:
        if not conv.is_group:
            raise HTTPException(status_code=403, detail="私聊仅可撤回自己发送的消息")
        membership = _group_membership(db, conv.id, current_user.id)
        if not membership or membership.role not in ("owner", "admin"):
            raise HTTPException(status_code=403, detail="仅群主或群管理员可以撤回其他成员消息")

    original_file_url = msg.file_url
    has_shared_copy = bool(original_file_url and db.query(SharedFile.id).filter(SharedFile.file_url == original_file_url).first())
    db.query(FavoriteMessage).filter(FavoriteMessage.chat_message_id == msg.id).delete(synchronize_session=False)
    msg.is_recalled = True
    msg.recalled_at = datetime.now(timezone.utc)
    msg.recalled_by_id = current_user.id
    msg.content = None
    msg.msg_type = "recalled"
    msg.file_url = None
    msg.file_name = None
    msg.file_size = None
    conv.updated_at = msg.recalled_at
    db.commit()
    db.refresh(msg)

    if original_file_url and not has_shared_copy:
        path = os.path.join(UPLOAD_DIR, os.path.basename(original_file_url))
        if os.path.exists(path):
            try:
                os.remove(path)
            except OSError:
                pass
    return {"code": 0, "message": "消息已撤回", "data": _msg_to_dict(msg)}


# ==================== 收藏 ====================

@router.post("/favorites/{msg_id}", summary="收藏消息")
async def add_favorite(
    msg_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """收藏一条聊天消息"""
    from ..models.favorite import FavoriteMessage
    msg = db.query(ChatMessage).filter(ChatMessage.id == msg_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="消息不存在")
    _require_conversation_member(db, msg.conversation_id, current_user)

    existing = db.query(FavoriteMessage).filter(
        FavoriteMessage.user_id == current_user.id,
        FavoriteMessage.chat_message_id == msg_id,
    ).first()
    if existing:
        return {"code": 0, "message": "已收藏", "data": None}

    fav = FavoriteMessage(user_id=current_user.id, chat_message_id=msg_id)
    db.add(fav)
    db.commit()
    return {"code": 0, "message": "已收藏", "data": None}


@router.delete("/favorites/{msg_id}", summary="取消收藏")
async def remove_favorite(
    msg_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """取消收藏"""
    from ..models.favorite import FavoriteMessage
    db.query(FavoriteMessage).filter(
        FavoriteMessage.user_id == current_user.id,
        FavoriteMessage.chat_message_id == msg_id,
    ).delete()
    db.commit()
    return {"code": 0, "message": "已取消收藏", "data": None}


@router.get("/favorites", summary="我的收藏")
async def list_favorites(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取收藏列表（按收藏时间倒序）"""
    from ..models.favorite import FavoriteMessage
    favs = (
        db.query(FavoriteMessage)
        .filter(FavoriteMessage.user_id == current_user.id)
        .order_by(FavoriteMessage.created_at.desc())
        .all()
    )
    result = []
    for fav in favs:
        msg = db.query(ChatMessage).filter(ChatMessage.id == fav.chat_message_id).first()
        if msg:
            item = _msg_to_dict(msg)
            item["fav_id"] = fav.id
            item["fav_time"] = to_beijing_iso(fav.created_at)
            # 附上会话伙伴信息
            conv = db.query(Conversation).filter(Conversation.id == msg.conversation_id).first()
            if conv and _is_conversation_member(db, conv, current_user.id):
                item["partner"] = _partner_info(conv, current_user.id)
                result.append(item)
    return {"code": 0, "message": "ok", "data": result}


@router.get("/messages/download/{filename}", summary="下载文件")
async def download_file(
    filename: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """下载文件（触发浏览器保存对话框）"""
    filename = os.path.basename(filename)
    file_url = f"/api/v1/chat/messages/media/{filename}"
    msg = db.query(ChatMessage).filter(ChatMessage.file_url == file_url).first()
    shared = None if msg else db.query(SharedFile).filter(SharedFile.file_url == file_url).first()
    resource = msg or shared
    if not resource:
        raise HTTPException(status_code=404, detail="文件不存在")
    _require_conversation_member(db, resource.conversation_id, current_user)
    path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="文件不存在")
    return FileResponse(path, filename=filename, media_type="application/octet-stream")


# ==================== 好友请求 ====================

@router.get("/friend-requests", summary="好友请求列表")
async def list_friend_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取收到和发出的好友请求"""
    from ..models.friend_request import FriendRequest
    received = db.query(FriendRequest).filter(
        FriendRequest.receiver_id == current_user.id, FriendRequest.status == "pending"
    ).all()
    sent = db.query(FriendRequest).filter(
        FriendRequest.sender_id == current_user.id, FriendRequest.status == "pending"
    ).all()
    return {
        "code": 0, "message": "ok",
        "data": {
            "received": [{"id": r.id, "sender_id": r.sender_id, "sender_name": r.sender.nickname, "created_at": to_beijing_iso(r.created_at)} for r in received],
            "sent": [{"id": r.id, "receiver_id": r.receiver_id, "receiver_name": r.receiver.nickname, "created_at": to_beijing_iso(r.created_at)} for r in sent],
        },
    }


@router.put("/friend-requests/{req_id}/accept", summary="接受好友请求")
async def accept_friend_request(
    req_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from ..models.friend_request import FriendRequest
    req = db.query(FriendRequest).filter(FriendRequest.id == req_id, FriendRequest.receiver_id == current_user.id).first()
    if not req or req.status != "pending":
        raise HTTPException(status_code=404, detail="请求不存在")
    req.status = "accepted"
    u1 = min(req.sender_id, req.receiver_id)
    u2 = max(req.sender_id, req.receiver_id)
    conv = db.query(Conversation).filter(
        Conversation.user1_id == u1,
        Conversation.user2_id == u2,
        Conversation.is_group == False,
    ).order_by(Conversation.id.asc()).first()
    if conv is None:
        conv = Conversation(user1_id=u1, user2_id=u2, is_accepted=1, is_group=False)
        db.add(conv)
    else:
        conv.is_accepted = 1
    db.commit()
    db.refresh(conv)

    # 通知发送者：已接受
    from ..models.notification import Notification
    notif = Notification(
        user_id=req.sender_id,
        title=f"✅ {current_user.nickname} 已接受你的好友请求",
        content="现在可以开始聊天了",
        type="system",
        related_url="/chat",
    )
    db.add(notif)
    db.commit()

    return {"code": 0, "message": "已接受好友请求", "data": {"id": conv.id, "partner": _partner_info(conv, current_user.id)}}


@router.put("/friend-requests/{req_id}/reject", summary="拒绝好友请求")
async def reject_friend_request(
    req_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from ..models.friend_request import FriendRequest
    req = db.query(FriendRequest).filter(FriendRequest.id == req_id, FriendRequest.receiver_id == current_user.id).first()
    if not req:
        raise HTTPException(status_code=404, detail="请求不存在")
    req.status = "rejected"
    db.commit()

    from ..models.notification import Notification
    notif = Notification(
        user_id=req.sender_id,
        title=f"❌ {current_user.nickname} 拒绝了你的好友请求",
        content="对方拒绝了你的好友请求",
        type="system",
        related_url="/chat",
    )
    db.add(notif)
    db.commit()

    return {"code": 0, "message": "已拒绝", "data": None}


@router.delete("/friends/{user_id}", summary="删除好友")
async def delete_friend(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from ..models.friend_request import FriendRequest
    from ..models.schedule import Schedule
    from ..models.schedule_management import ScheduleManagementPermission, ScheduleViewer

    relations = db.query(FriendRequest).filter(
        FriendRequest.status == "accepted",
        or_(
            (FriendRequest.sender_id == current_user.id) & (FriendRequest.receiver_id == user_id),
            (FriendRequest.sender_id == user_id) & (FriendRequest.receiver_id == current_user.id),
        ),
    ).all()
    if not relations:
        raise HTTPException(status_code=404, detail="好友关系不存在")

    for relation in relations:
        relation.status = "removed"
    db.query(Conversation).filter(
        Conversation.is_group == False,
        Conversation.user1_id == min(current_user.id, user_id),
        Conversation.user2_id == max(current_user.id, user_id),
    ).update({"is_accepted": 0}, synchronize_session=False)

    permissions = db.query(ScheduleManagementPermission).filter(or_(
        (ScheduleManagementPermission.owner_id == current_user.id) & (ScheduleManagementPermission.requester_id == user_id),
        (ScheduleManagementPermission.owner_id == user_id) & (ScheduleManagementPermission.requester_id == current_user.id),
    )).all()
    for permission in permissions:
        permission.status = "revoked"
        permission.expires_at = None

    my_schedule_ids = db.query(Schedule.id).filter(Schedule.created_by == current_user.id)
    friend_schedule_ids = db.query(Schedule.id).filter(Schedule.created_by == user_id)
    db.query(ScheduleViewer).filter(or_(
        (ScheduleViewer.user_id == user_id) & ScheduleViewer.schedule_id.in_(my_schedule_ids),
        (ScheduleViewer.user_id == current_user.id) & ScheduleViewer.schedule_id.in_(friend_schedule_ids),
    )).delete(synchronize_session=False)
    db.commit()
    return {"code": 0, "message": "好友已删除，原聊天记录将在重新添加后恢复", "data": None}


# ==================== 共享文件 ====================

@router.get("/conversations/{conv_id}/files", summary="对话共享文件列表")
async def list_shared_files(
    conv_id: int,
    tag: str | None = Query(None, description="按标签筛选"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conv = _require_conversation_member(db, conv_id, current_user)
    q = db.query(SharedFile).filter(SharedFile.conversation_id == conv_id)
    if tag:
        q = q.filter(SharedFile.tag == tag)
    files = q.order_by(SharedFile.created_at.desc()).all()
    return {
        "code": 0, "message": "ok",
        "data": [_shared_file_to_dict(f) for f in files],
    }


@router.post("/conversations/{conv_id}/files", summary="添加共享文件")
async def add_shared_file(
    conv_id: int,
    file: UploadFile = File(None),
    msg_id: int = Form(None),
    tag: str = Form(None),
    note: str = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from ..models.shared_file import SharedFile
    conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
    if not conv: raise HTTPException(status_code=404, detail="会话不存在")
    if not _is_conversation_member(db, conv, current_user.id):
        raise HTTPException(status_code=403, detail="无权操作")

    if msg_id:
        # 从聊天消息添加到共享文件
        msg = db.query(ChatMessage).filter(ChatMessage.id == msg_id).first()
        if not msg:
            raise HTTPException(status_code=400, detail="消息不存在")
        if msg.conversation_id != conv_id:
            raise HTTPException(status_code=400, detail="消息不属于当前会话")
        existing = db.query(SharedFile).filter(SharedFile.conversation_id == conv_id, SharedFile.source_msg_id == msg_id).first()
        if existing: return {"code": 0, "message": "已添加", "data": None}
        sf = SharedFile(
            conversation_id=conv_id,
            uploader_id=current_user.id,
            file_url=msg.file_url or f"message://{msg.id}",
            file_name=msg.file_name or (msg.content or "文字消息")[:80],
            file_size=msg.file_size,
            msg_type=msg.msg_type,
            content=msg.content if msg.msg_type == "text" else None,
            source_msg_id=msg_id,
            tag=tag,
            note=note,
        )
        db.add(sf)
        db.commit()
        return {"code": 0, "message": "已添加到共享文件", "data": None}
    elif file:
        _ensure_upload_dir()
        original_name = file.filename or "file.bin"
        ext = os.path.splitext(original_name)[1] or ".bin"
        stored = f"{uuid.uuid4().hex}{ext}"
        path = os.path.join(UPLOAD_DIR, stored)
        total_size = 0
        try:
            with open(path, "wb") as target:
                while chunk := await file.read(1024 * 1024):
                    total_size += len(chunk)
                    if total_size > MAX_SIZE:
                        raise HTTPException(status_code=400, detail="文件不能超过 50MB")
                    target.write(chunk)
        except Exception:
            if os.path.exists(path):
                os.remove(path)
            raise
        mime = file.content_type or "application/octet-stream"
        sf = SharedFile(conversation_id=conv_id, uploader_id=current_user.id,
                        file_url=f"/api/v1/chat/messages/media/{stored}",
                        file_name=original_name, file_size=total_size, msg_type=_guess_msg_type(mime), tag=tag, note=note)
        db.add(sf)
        db.commit()
        return {"code": 0, "message": "文件已上传", "data": None}
    raise HTTPException(status_code=400, detail="请提供文件或消息ID")


@router.delete("/files/{file_id}", summary="删除共享文件")
async def delete_shared_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sf = db.query(SharedFile).filter(SharedFile.id == file_id).first()
    if not sf: raise HTTPException(status_code=404, detail="文件不存在")
    _require_conversation_member(db, sf.conversation_id, current_user)
    if not sf.conversation.is_group and current_user.role != "admin" and sf.uploader_id != current_user.id:
        raise HTTPException(status_code=403, detail="只能删除自己上传的共享文件")
    if not sf.source_msg_id and sf.file_url:
        path = os.path.join(UPLOAD_DIR, os.path.basename(sf.file_url))
        if os.path.exists(path): os.remove(path)
    db.delete(sf)
    db.commit()
    return {"code": 0, "message": "已删除", "data": None}


@router.put("/files/{file_id}", summary="修改共享文件标签和备注")
async def update_shared_file(file_id: int, body: SharedFileUpdateRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sf = db.query(SharedFile).filter(SharedFile.id == file_id).first()
    if not sf: raise HTTPException(status_code=404, detail="文件不存在")
    _require_conversation_member(db, sf.conversation_id, current_user)
    if not sf.conversation.is_group and current_user.role != "admin" and sf.uploader_id != current_user.id:
        raise HTTPException(status_code=403, detail="只能修改自己上传的共享文件")
    sf.tag = (body.tag or "").strip() or None
    sf.note = (body.note or "").strip() or None
    db.commit(); db.refresh(sf)
    return {"code": 0, "data": {"id": sf.id, "tag": sf.tag, "note": sf.note}}


# ==================== 搜索 ====================

@router.get("/search", summary="搜索聊天记录和文件")
async def search_chat(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """搜索所有已接受对话中的消息和共享文件"""
    keyword = f"%{q.strip()}%"
    results = {"messages": [], "files": []}

    # 私聊按双方字段判断，群聊必须按成员表判断。
    direct_ids = [c[0] for c in db.query(Conversation.id).filter(
        Conversation.is_group == False,
        or_(Conversation.user1_id == current_user.id, Conversation.user2_id == current_user.id),
        Conversation.is_accepted == 1,
    ).all()]
    group_ids = [row[0] for row in db.query(ConversationMember.conversation_id).join(
        Conversation, Conversation.id == ConversationMember.conversation_id
    ).filter(
        ConversationMember.user_id == current_user.id,
        Conversation.is_group == True,
        Conversation.is_accepted == 1,
    ).all()]
    my_conv_ids = list(set(direct_ids + group_ids))

    if my_conv_ids:
        # 搜索消息
        from ..models.shared_file import SharedFile
        msgs = db.query(ChatMessage).filter(
            ChatMessage.conversation_id.in_(my_conv_ids),
            or_(ChatMessage.content.ilike(keyword), ChatMessage.file_name.ilike(keyword)),
        ).order_by(ChatMessage.created_at.desc()).limit(50).all()
        for m in msgs:
            conv = db.query(Conversation).filter(Conversation.id == m.conversation_id).first()
            results["messages"].append({**_msg_to_dict(m), "partner": _partner_info(conv, current_user.id) if conv else None})

        # 搜索共享文件
        sfs = db.query(SharedFile).filter(
            SharedFile.conversation_id.in_(my_conv_ids),
            or_(SharedFile.file_name.ilike(keyword), SharedFile.content.ilike(keyword)),
        ).order_by(SharedFile.created_at.desc()).limit(30).all()
        for sf in sfs:
            item = _shared_file_to_dict(sf)
            item["conv_id"] = item.pop("conversation_id")
            conv = db.query(Conversation).filter(Conversation.id == sf.conversation_id).first()
            item["partner"] = _partner_info(conv, current_user.id) if conv else None
            results["files"].append(item)

    return {"code": 0, "message": "ok", "data": results}


# ==================== 联系人 ====================

@router.get("/contacts", summary="可聊天的用户列表")
async def list_contacts(
    friends_only: bool = Query(False),
    q: str | None = Query(None, max_length=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """群聊返回好友；添加好友必须搜索后才返回匹配用户。"""
    query = db.query(User).filter(
        User.is_active == True,
        User.id != current_user.id,
        User.username.isnot(None),
        User.username != "",
    )
    from ..models.friend_request import FriendRequest
    keyword = (q or "").strip()
    if friends_only:
        requests = db.query(FriendRequest).filter(
            FriendRequest.status == "accepted",
            or_(FriendRequest.sender_id == current_user.id, FriendRequest.receiver_id == current_user.id),
        ).all()
        friend_ids = [
            request.receiver_id if request.sender_id == current_user.id else request.sender_id
            for request in requests
        ]
        query = query.filter(User.id.in_(friend_ids))
        if keyword:
            pattern = f"%{keyword}%"
            query = query.filter(or_(User.nickname.ilike(pattern), User.username.ilike(pattern)))
        users = query.order_by(User.nickname).all()
    elif not keyword:
        users = []
    else:
        blocked_requests = db.query(FriendRequest).filter(
            FriendRequest.status.in_(("accepted", "pending")),
            or_(FriendRequest.sender_id == current_user.id, FriendRequest.receiver_id == current_user.id),
        ).all()
        blocked_ids = {
            item.receiver_id if item.sender_id == current_user.id else item.sender_id
            for item in blocked_requests
        }
        pattern = f"%{keyword}%"
        query = query.filter(or_(User.nickname.ilike(pattern), User.username.ilike(pattern)))
        if blocked_ids:
            query = query.filter(~User.id.in_(blocked_ids))
        users = query.order_by(User.nickname).limit(20).all()
    return {
        "code": 0,
        "message": "ok",
        "data": [
            {"id": u.id, "nickname": u.nickname, "username": u.username, "phone": u.phone}
            for u in users
        ],
    }
