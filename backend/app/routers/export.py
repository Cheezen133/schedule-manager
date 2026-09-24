"""
iCal 导出路由
"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.ical_service import generate_ical
from ..models.schedule import Schedule
from ..services.schedule_management_service import can_view_schedule, is_effective_manager
from ..dependencies import get_current_user
from ..models.user import User
from ..utils.datetime_utils import BEIJING, parse_client_datetime

router = APIRouter(prefix="/api/v1", tags=["导出"])


@router.get("/schedules/export/ical", summary="导出 iCal 文件")
async def export_ical(
    start_date: str | None = Query(None, description="开始日期 (YYYY-MM-DD)"),
    end_date: str | None = Query(None, description="结束日期 (YYYY-MM-DD)"),
    owner_id: int | None = Query(None, description="日程拥有者ID；默认当前用户"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    导出已确认的日程为 .ics 文件（iCal 格式）
    可导入 Apple 日历、Google 日历、Outlook 等
    """
    start_dt = None
    end_dt = None
    if start_date:
        try:
            start_dt = parse_client_datetime(start_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="start_date 格式错误，请使用 YYYY-MM-DD 格式")
    if end_date:
        try:
            end_dt = parse_client_datetime(end_date, end_of_day=True)
        except ValueError:
            raise HTTPException(status_code=400, detail="end_date 格式错误，请使用 YYYY-MM-DD 格式")

    target_owner_id = owner_id or current_user.id
    if target_owner_id != current_user.id and not is_effective_manager(
        db, current_user.id, target_owner_id
    ):
        raise HTTPException(status_code=403, detail="没有该好友日程的有效管理权限，无法导出")

    # 导出范围与当前日历对象一致，并继续逐条应用事件级观看权限。
    query = db.query(Schedule).filter(
        Schedule.status == "confirmed",
        Schedule.created_by == target_owner_id,
    )
    if start_dt:
        query = query.filter(Schedule.end_time >= start_dt)
    if end_dt:
        query = query.filter(Schedule.start_time <= end_dt)
    schedules = [
        schedule for schedule in query.order_by(Schedule.start_time.asc()).all()
        if can_view_schedule(db, schedule, current_user.id)
    ]

    if not schedules:
        return Response(
            content="BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//日程管理系统//CN\nEND:VCALENDAR",
            media_type="text/calendar",
            headers={
                "Content-Disposition": "attachment; filename=schedules.ics"
            },
        )

    ical_data = generate_ical(schedules)

    return Response(
        content=ical_data,
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": f"attachment; filename=schedules_{datetime.now(BEIJING).strftime('%Y%m%d')}.ics"
        },
    )
