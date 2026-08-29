"""
iCal 导出路由
"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.ical_service import generate_ical
from ..services.schedule_service import get_schedules
from ..dependencies import get_current_user
from ..models.user import User

router = APIRouter(prefix="/api/v1", tags=["导出"])


@router.get("/schedules/export/ical", summary="导出 iCal 文件")
async def export_ical(
    start_date: str | None = Query(None, description="开始日期 (YYYY-MM-DD)"),
    end_date: str | None = Query(None, description="结束日期 (YYYY-MM-DD)"),
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
            start_dt = datetime.fromisoformat(start_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="start_date 格式错误，请使用 YYYY-MM-DD 格式")
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="end_date 格式错误，请使用 YYYY-MM-DD 格式")

    # 只导出已确认的日程
    schedules = get_schedules(db, start_dt, end_dt, status="confirmed", user_role=current_user.role, user_id=current_user.id)

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
            "Content-Disposition": f"attachment; filename=schedules_{datetime.now().strftime('%Y%m%d')}.ics"
        },
    )
