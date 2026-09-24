"""
全局搜索路由 — 搜索日程
"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from ..database import get_db
from ..dependencies import get_current_user
from ..models.user import User
from ..models.schedule import Schedule
from ..services.schedule_service import _schedule_to_response
from ..services.schedule_management_service import can_view_schedule

router = APIRouter(prefix="/api/v1", tags=["搜索"])


@router.get("/search", summary="全局搜索日程")
async def search_schedules(
    q: str = Query(..., min_length=1, max_length=200, description="搜索关键词"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页条数"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    按关键词搜索日程：标题、描述、外部联系人姓名、外部联系人电话
    支持分页
    """
    keyword = f"%{q.strip()}%"

    query = db.query(Schedule).filter(
        or_(
            Schedule.title.ilike(keyword),
            Schedule.description.ilike(keyword),
            Schedule.external_contact_name.ilike(keyword),
            Schedule.external_contact_phone.ilike(keyword),
        )
    )

    candidates = query.order_by(Schedule.is_important.desc(), Schedule.start_time.desc()).all()
    visible = [item for item in candidates if can_view_schedule(db, item, current_user.id)]
    total = len(visible)
    schedules = visible[(page - 1) * page_size: page * page_size]

    return {
        "code": 0,
        "message": "ok",
        "data": {
            "total": total,
            "page": page,
            "page_size": page_size,
            "items": [_schedule_to_response(s) for s in schedules],
        },
    }
