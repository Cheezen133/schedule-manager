"""
通知路由 — 站内通知 CRUD
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_user
from ..models.user import User
from ..services.notification_service import (
    get_notifications,
    get_unread_count,
    mark_as_read,
    mark_all_as_read,
    delete_notification,
    _notif_to_dict,
)

router = APIRouter(prefix="/api/v1", tags=["通知"])


@router.get("/notifications", summary="获取通知列表")
async def list_notifications(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    unread_only: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取当前用户的通知列表"""
    notifs = get_notifications(db, current_user.id, limit=limit, offset=offset, unread_only=unread_only)
    return {
        "code": 0,
        "message": "ok",
        "data": [_notif_to_dict(n) for n in notifs],
    }


@router.get("/notifications/unread-count", summary="获取未读通知数量")
async def unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取当前用户的未读通知数量"""
    count = get_unread_count(db, current_user.id)
    return {"code": 0, "message": "ok", "data": {"count": count}}


@router.put("/notifications/{notification_id}/read", summary="标记通知为已读")
async def read_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """标记单条通知为已读"""
    notif = mark_as_read(db, notification_id, current_user.id)
    if not notif:
        raise HTTPException(status_code=404, detail="通知不存在")
    return {"code": 0, "message": "已读", "data": _notif_to_dict(notif)}


@router.put("/notifications/read-all", summary="全部标记已读")
async def read_all_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """标记当前用户的所有通知为已读"""
    count = mark_all_as_read(db, current_user.id)
    return {"code": 0, "message": f"已标记 {count} 条通知为已读", "data": {"count": count}}


@router.delete("/notifications/{notification_id}", summary="删除通知")
async def remove_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除一条通知"""
    ok = delete_notification(db, notification_id, current_user.id)
    if not ok:
        raise HTTPException(status_code=404, detail="通知不存在")
    return {"code": 0, "message": "已删除", "data": None}
