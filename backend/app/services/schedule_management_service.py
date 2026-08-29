from datetime import datetime, timezone
from sqlalchemy import or_
from sqlalchemy.orm import Session
from ..models.friend_request import FriendRequest
from ..models.schedule_management import ScheduleManagementPermission, ScheduleViewer

def now(): return datetime.now(timezone.utc)
def is_friend(db: Session, left: int, right: int) -> bool:
    return db.query(FriendRequest).filter(FriendRequest.status == "accepted", or_((FriendRequest.sender_id == left) & (FriendRequest.receiver_id == right), (FriendRequest.sender_id == right) & (FriendRequest.receiver_id == left))).first() is not None
def active_permission(db: Session, requester_id: int, owner_id: int):
    p = db.query(ScheduleManagementPermission).filter_by(requester_id=requester_id, owner_id=owner_id, status="approved").first()
    if p and p.expires_at and p.expires_at.replace(tzinfo=p.expires_at.tzinfo or timezone.utc) <= now(): p.status = "expired"; db.commit(); return None
    return p
def is_effective_manager(db: Session, user_id: int, owner_id: int) -> bool: return user_id == owner_id or active_permission(db, user_id, owner_id) is not None
def can_view_schedule(db: Session, schedule, user_id: int) -> bool:
    # The owner and the manager who created this record always see its details.
    if user_id in (schedule.created_by, schedule.created_by_actor):
        return True
    if not is_effective_manager(db, user_id, schedule.created_by):
        return False
    if schedule.visibility == "managers":
        return True
    if schedule.visibility == "selected":
        return db.query(ScheduleViewer).filter_by(schedule_id=schedule.id, user_id=user_id).first() is not None
    return False
def valid_viewers(db: Session, owner_id: int, viewer_ids: list[int]) -> list[int]:
    invalid = [i for i in set(viewer_ids) if i != owner_id and not is_effective_manager(db, i, owner_id)]
    if invalid: raise ValueError("观看者必须是当前有效的日程管理者")
    return list(set(viewer_ids))
