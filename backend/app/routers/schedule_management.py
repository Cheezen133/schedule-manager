from datetime import timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import get_current_user
from ..models.user import User
from ..models.friend_request import FriendRequest
from ..models.schedule_management import ScheduleManagementPermission
from ..services.schedule_management_service import active_permission, is_friend, now
from ..services.notification_service import create_notification
from ..utils.datetime_utils import to_beijing_iso

router = APIRouter(prefix="/api/v1/schedule-management", tags=["Schedule management"])


def _as_utc(value):
    """SQLite may return naive datetimes although the model writes UTC values."""
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def payload(p):
    expires_at = _as_utc(p.expires_at)
    remaining = max(0, int((expires_at - now()).total_seconds())) if p.status == "approved" and expires_at else None
    return {"id": p.id, "owner_id": p.owner_id, "requester_id": p.requester_id, "owner_name": p.owner.nickname if p.owner else None, "requester_name": p.requester.nickname if p.requester else None, "status": "expired" if remaining == 0 and p.status == "approved" else p.status, "requested_at": to_beijing_iso(p.requested_at), "expires_at": to_beijing_iso(p.expires_at), "remaining_seconds": remaining}


def notify_safely(db: Session, *args, **kwargs):
    """A notification must not turn a committed permission action into a failed API response."""
    try:
        create_notification(db, *args, **kwargs)
    except Exception:
        # The permission change was committed before this optional side effect.
        # Reset the failed notification transaction so the request can still return its real status.
        db.rollback()

@router.post("/requests/{owner_id}")
def request_permission(owner_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if owner_id == current_user.id: raise HTTPException(400, "Cannot request yourself")
    if not is_friend(db, current_user.id, owner_id): raise HTTPException(403, "Friends only")
    p = db.query(ScheduleManagementPermission).filter_by(owner_id=owner_id, requester_id=current_user.id).first()
    if p is None: p = ScheduleManagementPermission(owner_id=owner_id, requester_id=current_user.id); db.add(p)
    else: p.status, p.requested_at, p.resolved_at, p.expires_at = "pending", now(), None, None
    db.commit(); db.refresh(p)
    notify_safely(db, owner_id, "日程管理申请", f"{current_user.nickname} 请求管理你的日程，获批后有效 7 天。", "management_request", related_url="/profile/dashboard")
    return {"code": 0, "data": payload(p)}

@router.get("/requests/incoming")
def incoming(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return {"code": 0, "data": [payload(p) for p in db.query(ScheduleManagementPermission).filter_by(owner_id=current_user.id).order_by(ScheduleManagementPermission.requested_at.desc()).all()]}

@router.get("/requests/outgoing")
def outgoing(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return {"code": 0, "data": [payload(p) for p in db.query(ScheduleManagementPermission).filter_by(requester_id=current_user.id).order_by(ScheduleManagementPermission.requested_at.desc()).all()]}

@router.get("/overview")
def overview(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Both directions are read from one query and one response so the dashboard
    # always reflects the same permission record for the owner and requester.
    items = db.query(ScheduleManagementPermission).filter(
        or_(
            ScheduleManagementPermission.owner_id == current_user.id,
            ScheduleManagementPermission.requester_id == current_user.id,
        )
    ).order_by(ScheduleManagementPermission.requested_at.desc()).all()
    changed = False
    current_time = now()
    for item in items:
        expires_at = _as_utc(item.expires_at)
        if item.status == "approved" and expires_at and expires_at <= current_time:
            item.status = "expired"
            changed = True
    if changed:
        db.commit()

    outgoing_items = [item for item in items if item.requester_id == current_user.id]
    incoming_items = [item for item in items if item.owner_id == current_user.id]
    outgoing = [payload(item) for item in outgoing_items]
    incoming = [payload(item) for item in incoming_items]
    return {"code": 0, "data": {
        "can_manage": [item for item in outgoing if item["status"] == "approved"],
        "managed_by": [item for item in incoming if item["status"] == "approved"],
        "incoming_pending": [item for item in incoming if item["status"] == "pending"],
        "outgoing_pending": [item for item in outgoing if item["status"] == "pending"],
    }}

@router.get("/owners/{owner_id}/managers")
def owner_managers(owner_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if owner_id != current_user.id and not active_permission(db, current_user.id, owner_id):
        raise HTTPException(403, "Management permission is missing or expired")
    permissions = db.query(ScheduleManagementPermission).filter_by(owner_id=owner_id, status="approved").all()
    result = []
    for permission in permissions:
        if active_permission(db, permission.requester_id, owner_id):
            result.append({"id": permission.requester_id, "nickname": permission.requester.nickname if permission.requester else None, "username": permission.requester.username if permission.requester else None, "remaining_seconds": payload(permission)["remaining_seconds"]})
    return {"code": 0, "data": result}

@router.post("/requests/{permission_id}/{action}")
def resolve(permission_id: int, action: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    p = db.get(ScheduleManagementPermission, permission_id)
    if not p: raise HTTPException(404, "Not found")
    if action in ("approve", "reject"):
        if p.owner_id != current_user.id: raise HTTPException(403, "Forbidden")
        p.status = "approved" if action == "approve" else "rejected"; p.resolved_at = now(); p.expires_at = now() + timedelta(days=7) if action == "approve" else None
    elif action == "revoke":
        if current_user.id not in (p.owner_id, p.requester_id): raise HTTPException(403, "Forbidden")
        p.status = "revoked"; p.expires_at = None
    else: raise HTTPException(404, "Unknown action")
    db.commit(); db.refresh(p)
    if action == "approve":
        notify_safely(db, p.requester_id, "日程管理申请已通过", f"{current_user.nickname} 已同意你的申请；权限将在 7 天后到期。", "management_approved", related_url="/profile/dashboard")
    elif action == "reject":
        notify_safely(db, p.requester_id, "日程管理申请被拒绝", f"{current_user.nickname} 拒绝了你的日程管理申请。", "management_rejected", related_url="/profile/dashboard")
    elif action == "revoke":
        other_id = p.owner_id if current_user.id == p.requester_id else p.requester_id
        notify_safely(db, other_id, "日程管理权限已取消", f"{current_user.nickname} 已取消相关日程管理权限。", "management_revoked", related_url="/profile/dashboard")
    return {"code": 0, "data": payload(p)}

@router.get("/friends")
def friends(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rels = db.query(FriendRequest).filter(FriendRequest.status == "accepted", or_(FriendRequest.sender_id == current_user.id, FriendRequest.receiver_id == current_user.id)).all(); result=[]
    for rel in rels:
        friend = rel.receiver if rel.sender_id == current_user.id else rel.sender
        p = db.query(ScheduleManagementPermission).filter_by(owner_id=friend.id, requester_id=current_user.id).first()
        result.append({"id": friend.id, "nickname": friend.nickname, "username": friend.username, "management": payload(p) if p else None})
    return {"code": 0, "data": result}
