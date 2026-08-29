"""
仪表盘路由 — 数据统计
"""
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_

from ..database import get_db
from ..dependencies import get_current_user
from ..models.user import User
from ..models.schedule import Schedule

router = APIRouter(prefix="/api/v1", tags=["仪表盘"])


@router.get("/dashboard/stats", summary="获取仪表盘统计数据")
async def dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    返回仪表盘所需的所有统计数据：
    - 总览数据（本月日程数、待审核数、完成率等）
    - 按状态分布
    - 按分类分布
    - 最近活动
    """
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # 非管理员只看自己的
    base_filter = []
    if current_user.role != "admin":
        base_filter.append(Schedule.created_by == current_user.id)

    def _apply_filter(query):
        for f in base_filter:
            query = query.filter(f)
        return query

    # ---- 总览统计 ----
    all_q = _apply_filter(db.query(Schedule))
    total_all = all_q.count()

    total_month = _apply_filter(
        db.query(Schedule).filter(Schedule.start_time >= month_start)
    ).count()

    total_pending = _apply_filter(
        db.query(Schedule).filter(Schedule.status == "pending")
    ).count()

    total_confirmed = _apply_filter(
        db.query(Schedule).filter(Schedule.status == "confirmed")
    ).count()

    total_rejected = _apply_filter(
        db.query(Schedule).filter(Schedule.status == "rejected")
    ).count()

    total_important = _apply_filter(
        db.query(Schedule).filter(Schedule.is_important == True)
    ).count()

    total_completed = _apply_filter(
        db.query(Schedule).filter(Schedule.is_completed == True)
    ).count()

    completion_rate = round(total_completed / total_confirmed * 100, 1) if total_confirmed > 0 else 0

    # ---- 按状态分布 ----
    status_distribution = {
        "pending": total_pending,
        "confirmed": total_confirmed,
        "rejected": total_rejected,
    }

    # ---- 按分类分布（Top 10） ----
    from ..models.category import Category
    cat_rows = (
        db.query(Category.name, Category.color, func.count(Schedule.id).label("cnt"))
        .join(Schedule, Schedule.category_id == Category.id, isouter=True)
        .filter(*base_filter)
        .group_by(Category.id)
        .order_by(func.count(Schedule.id).desc())
        .limit(10)
        .all()
    )
    category_distribution = [
        {"name": r[0] or "未分类", "color": r[1] or "#9ca3af", "count": r[2]}
        for r in cat_rows
    ]

    # ---- 最近 7 天趋势 ----
    trend_data = []
    for i in range(6, -1, -1):
        day_start = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        day_count = _apply_filter(
            db.query(Schedule).filter(
                and_(Schedule.created_at >= day_start, Schedule.created_at < day_end)
            )
        ).count()
        trend_data.append({
            "date": day_start.strftime("%m-%d"),
            "count": day_count,
        })

    # ---- 最近创建的日程 ----
    recent_q = _apply_filter(db.query(Schedule))
    recent_schedules = (
        recent_q
        .order_by(Schedule.created_at.desc())
        .limit(5)
        .all()
    )
    from ..services.schedule_service import _schedule_to_response
    recent_items = [_schedule_to_response(s) for s in recent_schedules]

    return {
        "code": 0,
        "message": "ok",
        "data": {
            "overview": {
                "total_all": total_all,
                "total_month": total_month,
                "total_pending": total_pending,
                "total_confirmed": total_confirmed,
                "total_rejected": total_rejected,
                "total_important": total_important,
                "total_completed": total_completed,
                "completion_rate": completion_rate,
            },
            "status_distribution": status_distribution,
            "category_distribution": category_distribution,
            "trend_7days": trend_data,
            "recent_schedules": recent_items,
        },
    }
