"""日程及其关联资源的访问权限判断。"""
from sqlalchemy.orm import Session

from ..models.schedule import Schedule
from ..models.user import User
from .schedule_management_service import can_view_schedule


def can_access_schedule(db: Session, schedule: Schedule, current_user: User) -> bool:
    """管理员、日程拥有者及拥有日程码授权的用户可访问关联资源。"""
    return can_view_schedule(db, schedule, current_user.id)


def require_schedule_access(db: Session, schedule: Schedule | None, current_user: User):
    """对不存在或无权访问的日程统一返回 404，避免枚举资源。"""
    from fastapi import HTTPException

    if schedule is None or not can_access_schedule(db, schedule, current_user):
        raise HTTPException(status_code=404, detail="日程不存在或无权访问")
    return schedule
