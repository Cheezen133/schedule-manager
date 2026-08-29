"""
通知服务：创建、查询、标记已读
"""
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import and_
from ..models.notification import Notification
from ..models.user import User


def create_notification(
    db: Session,
    user_id: int,
    title: str,
    content: str = "",
    type: str = "system",
    related_schedule_id: int | None = None,
    related_url: str | None = None,
) -> Notification:
    """创建一条通知"""
    notif = Notification(
        user_id=user_id,
        title=title,
        content=content,
        type=type,
        related_schedule_id=related_schedule_id,
        related_url=related_url,
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return notif


def notify_admins_and_readers(
    db: Session,
    title: str,
    content: str,
    type: str = "schedule_created",
    related_schedule_id: int | None = None,
    exclude_user_id: int | None = None,
):
    """通知所有管理员和阅读者（用于新日程提交等）"""
    users = db.query(User).filter(
        User.is_active == True,
        User.role.in_(["admin", "reader"]),
    ).all()

    for user in users:
        if exclude_user_id and user.id == exclude_user_id:
            continue
        create_notification(db, user.id, title, content, type, related_schedule_id)


def get_notifications(
    db: Session,
    user_id: int,
    limit: int = 50,
    offset: int = 0,
    unread_only: bool = False,
) -> list[Notification]:
    """获取用户的通知列表（按时间倒序）"""
    q = db.query(Notification).filter(Notification.user_id == user_id)
    if unread_only:
        q = q.filter(Notification.is_read == False)
    return q.order_by(Notification.created_at.desc()).offset(offset).limit(limit).all()


def get_unread_count(db: Session, user_id: int) -> int:
    """获取未读通知数量"""
    return (
        db.query(Notification)
        .filter(and_(Notification.user_id == user_id, Notification.is_read == False))
        .count()
    )


def mark_as_read(db: Session, notification_id: int, user_id: int) -> Notification | None:
    """标记单条通知为已读"""
    notif = (
        db.query(Notification)
        .filter(and_(Notification.id == notification_id, Notification.user_id == user_id))
        .first()
    )
    if notif:
        notif.is_read = True
        db.commit()
        db.refresh(notif)
    return notif


def mark_all_as_read(db: Session, user_id: int) -> int:
    """标记全部通知为已读，返回更新条数"""
    count = (
        db.query(Notification)
        .filter(and_(Notification.user_id == user_id, Notification.is_read == False))
        .update({"is_read": True})
    )
    db.commit()
    return count


def delete_notification(db: Session, notification_id: int, user_id: int) -> bool:
    """删除单条通知"""
    notif = (
        db.query(Notification)
        .filter(and_(Notification.id == notification_id, Notification.user_id == user_id))
        .first()
    )
    if notif:
        db.delete(notif)
        db.commit()
        return True
    return False


def delete_old_notifications(db: Session, user_id: int, days: int = 30) -> int:
    """删除 N 天前的已读通知"""
    cutoff = datetime.now(timezone.utc).replace(day=datetime.now(timezone.utc).day - days)
    count = (
        db.query(Notification)
        .filter(
            and_(
                Notification.user_id == user_id,
                Notification.is_read == True,
                Notification.created_at < cutoff,
            )
        )
        .delete()
    )
    db.commit()
    return count


def _notif_to_dict(n: Notification) -> dict:
    """通知转字典"""
    return {
        "id": n.id,
        "user_id": n.user_id,
        "title": n.title,
        "content": n.content,
        "type": n.type,
        "related_schedule_id": n.related_schedule_id,
        "related_url": n.related_url,
        "is_read": n.is_read,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }
