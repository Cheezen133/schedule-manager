"""
日程服务：业务逻辑层
"""
import json
import os
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import and_
from ..models.schedule import Schedule
from ..models.verification import AuditLog
from ..models.user import User
from ..models.schedule_management import ScheduleViewer
from ..schemas.schedule import ScheduleCreate, ScheduleUpdate
from ..utils.datetime_utils import to_beijing_iso, to_utc_naive


EDIT_SNAPSHOT_ACTION = "manager_edit_snapshot"
SNAPSHOT_FIELDS = (
    "title", "description", "start_time", "end_time", "is_all_day",
    "is_important", "status", "reviewed_by", "reviewed_at",
    "review_comment", "requires_owner_review", "category_id", "visibility",
    "completer_name", "is_completed", "completed_at", "external_contact_name",
    "external_contact_phone", "external_contact_wechat", "color",
)
SNAPSHOT_DATETIME_FIELDS = {"start_time", "end_time", "reviewed_at", "completed_at"}


def create_manager_edit_snapshot(db: Session, schedule: Schedule, actor_id: int) -> None:
    """Persist one pre-edit snapshot for an existing confirmed schedule."""
    if schedule.status != "confirmed":
        return
    existing = db.query(AuditLog).filter(
        AuditLog.schedule_id == schedule.id,
        AuditLog.action == EDIT_SNAPSHOT_ACTION,
    ).first()
    if existing:
        return
    values = {}
    for field in SNAPSHOT_FIELDS:
        value = getattr(schedule, field)
        values[field] = value.isoformat() if isinstance(value, datetime) else value
    values["viewer_ids"] = [
        row[0] for row in db.query(ScheduleViewer.user_id).filter(
            ScheduleViewer.schedule_id == schedule.id
        ).all()
    ]
    db.add(AuditLog(
        schedule_id=schedule.id,
        action=EDIT_SNAPSHOT_ACTION,
        performed_by=actor_id,
        detail=json.dumps(values, ensure_ascii=False),
    ))


def _pending_manager_edit_snapshot(db: Session, schedule_id: int) -> AuditLog | None:
    return db.query(AuditLog).filter(
        AuditLog.schedule_id == schedule_id,
        AuditLog.action == EDIT_SNAPSHOT_ACTION,
    ).order_by(AuditLog.id.desc()).first()


def _resolve_manager_edit_snapshot(db: Session, schedule: Schedule, approved: bool) -> bool:
    snapshot = _pending_manager_edit_snapshot(db, schedule.id)
    if not snapshot:
        return False
    if approved:
        snapshot.action = "manager_edit_approved"
        return True

    values = json.loads(snapshot.detail or "{}")
    for field in SNAPSHOT_FIELDS:
        if field not in values:
            continue
        value = values[field]
        if field in SNAPSHOT_DATETIME_FIELDS and value is not None:
            value = datetime.fromisoformat(value)
        setattr(schedule, field, value)
    db.query(ScheduleViewer).filter(ScheduleViewer.schedule_id == schedule.id).delete(
        synchronize_session=False
    )
    for user_id in values.get("viewer_ids", []):
        db.add(ScheduleViewer(schedule_id=schedule.id, user_id=user_id))
    snapshot.action = "manager_edit_rejected"
    return True


def create_schedule(db: Session, data: ScheduleCreate, user_id: int, skip_review: bool = False) -> Schedule:
    """
    创建日程（录入者操作）
    skip_review=True 时直接设为 confirmed（仅用于明确无需审核的内部流程）
    """
    # 如果指定了分类，使用分类的颜色
    event_color = data.color or "#3788d8"
    if data.category_id:
        from ..models.category import Category
        cat = db.query(Category).filter(Category.id == data.category_id).first()
        if cat and data.color == "#3788d8":
            event_color = cat.color

    schedule = Schedule(
        title=data.title,
        description=data.description,
        start_time=to_utc_naive(data.start_time),
        end_time=to_utc_naive(data.end_time),
        is_all_day=data.is_all_day,
        is_important=data.is_important,
        status="confirmed" if skip_review else "pending",
        created_by=user_id,
        category_id=data.category_id,
        visibility=data.visibility or "private",
        completer_name=data.completer_name,
        is_completed=False,
        external_contact_name=data.external_contact_name,
        external_contact_phone=data.external_contact_phone,
        external_contact_wechat=data.external_contact_wechat,
        color=event_color,
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)

    # 记录审计日志
    _log_action(db, schedule.id, "created", user_id, f"创建日程: {schedule.title}")

    # 通知：通知所有管理员和阅读者
    from ..services.notification_service import notify_admins_and_readers
    creator = db.query(User).filter(User.id == user_id).first()
    creator_name = creator.nickname if creator else "未知"
    notify_admins_and_readers(
        db,
        title="📅 新日程待审核",
        content=f"「{schedule.title}」由 {creator_name} 提交，等待审核",
        type="schedule_created",
        related_schedule_id=schedule.id,
        exclude_user_id=user_id,
    )

    return schedule


def get_schedules(
    db: Session,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    status: str | None = None,
    created_by: int | None = None,
    user_role: str = "writer",
    user_id: int | None = None,
) -> list[Schedule]:
    """
    查询日程列表 — 每个用户只看自己创建的（admin 看全部）
    """
    query = db.query(Schedule)

    if user_role == "admin":
        pass
    elif user_id:
        query = query.filter(Schedule.created_by == user_id)
    else:
        query = query.filter(Schedule.created_by == -1)

    if start_date:
        query = query.filter(Schedule.end_time >= start_date)
    if end_date:
        query = query.filter(Schedule.start_time <= end_date)
    if status:
        query = query.filter(Schedule.status == status)
    if created_by:
        query = query.filter(Schedule.created_by == created_by)

    return query.order_by(
        Schedule.is_important.desc(),
        Schedule.start_time.asc(),
    ).all()


def get_schedule_by_id(db: Session, schedule_id: int) -> Schedule | None:
    """获取单个日程"""
    return db.query(Schedule).filter(Schedule.id == schedule_id).first()


def update_schedule(
    db: Session,
    schedule: Schedule,
    data: ScheduleUpdate,
    edited_by_owner: bool = False,
    edited_by_user_id: int | None = None,
) -> Schedule:
    """
    更新日程
    edited_by_owner=True 时，修改后重置为 pending（仅创建者自己编辑时触发审核）
    日程状态是否需要重新审核由调用方的权限流程决定
    """
    update_data = data.model_dump(exclude_unset=True)

    for field in ("start_time", "end_time"):
        if field in update_data:
            if update_data[field] is None:
                raise ValueError(f"{field} cannot be empty")
            update_data[field] = to_utc_naive(update_data[field])

    for field, value in update_data.items():
        setattr(schedule, field, value)

    # 代为修改任何状态的日程都必须由日程拥有者确认。
    if not edited_by_owner:
        schedule.status = "pending"
        schedule.requires_owner_review = True
        schedule.reviewed_by = None
        schedule.reviewed_at = None
        schedule.review_comment = None
    # 创建者自己编辑已确认的日程，仍走原有的 reader/admin 审核流程。
    elif schedule.status == "confirmed":
        schedule.status = "pending"
        schedule.requires_owner_review = False
        schedule.reviewed_by = None
        schedule.reviewed_at = None
        schedule.review_comment = None

    schedule.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(schedule)

    _log_action(db, schedule.id, "edited", edited_by_user_id or schedule.created_by, "编辑日程")

    return schedule


def delete_schedule(db: Session, schedule: Schedule):
    """删除日程（同时清理关联数据）"""
    from ..models.verification import AuditLog
    from ..models.message import Message
    from ..models.attachment import Attachment
    from ..models.notification import Notification
    from ..models.chat_message import ChatMessage

    # MySQL 强制外键约束，需先清理关联数据
    db.query(AuditLog).filter(AuditLog.schedule_id == schedule.id).delete()
    db.query(Message).filter(Message.schedule_id == schedule.id).delete()
    db.query(Notification).filter(Notification.related_schedule_id == schedule.id).update(
        {"related_schedule_id": None}
    )
    # 附件：删除文件
    attachments = db.query(Attachment).filter(Attachment.schedule_id == schedule.id).all()
    for att in attachments:
        if os.path.exists(att.file_path):
            os.remove(att.file_path)
    db.query(Attachment).filter(Attachment.schedule_id == schedule.id).delete()

    db.delete(schedule)
    db.commit()


def approve_schedule(db: Session, schedule: Schedule, reviewer_id: int, comment: str | None = None) -> Schedule:
    """
    审核通过：将日程状态改为 confirmed
    """
    _resolve_manager_edit_snapshot(db, schedule, approved=True)
    schedule.status = "confirmed"
    schedule.requires_owner_review = False
    schedule.reviewed_by = reviewer_id
    schedule.reviewed_at = datetime.now(timezone.utc)
    schedule.review_comment = comment
    schedule.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(schedule)

    _log_action(db, schedule.id, "confirmed", reviewer_id, f"审核通过: {comment or '无备注'}")

    # 通知：通知录入者
    from ..services.notification_service import create_notification
    reviewer = db.query(User).filter(User.id == reviewer_id).first()
    reviewer_name = reviewer.nickname if reviewer else "审核者"
    recipient_id = schedule.created_by_actor or schedule.created_by
    if recipient_id != reviewer_id:
        try:
            create_notification(
                db,
                user_id=recipient_id,
                title="✅ 日程已通过审核",
                content=f"日程「{schedule.title}」已被 {reviewer_name} 确认",
                type="schedule_approved",
                related_schedule_id=schedule.id,
            )
        except Exception:
            db.rollback()

    return schedule


def reject_schedule(db: Session, schedule: Schedule, reviewer_id: int, comment: str | None = None) -> Schedule:
    """
    驳回日程：将日程状态改为 rejected
    """
    proposed_title = schedule.title
    restored = _resolve_manager_edit_snapshot(db, schedule, approved=False)
    if not restored:
        schedule.status = "rejected"
        schedule.requires_owner_review = False
        schedule.reviewed_by = reviewer_id
        schedule.reviewed_at = datetime.now(timezone.utc)
        schedule.review_comment = comment
    schedule.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(schedule)

    _log_action(
        db,
        schedule.id,
        "edit_rejected" if restored else "rejected",
        reviewer_id,
        f"驳回修改并恢复原日程: {comment or '无备注'}" if restored else f"驳回: {comment or '无备注'}",
    )

    # 通知：通知录入者
    from ..services.notification_service import create_notification
    reviewer = db.query(User).filter(User.id == reviewer_id).first()
    reviewer_name = reviewer.nickname if reviewer else "审核者"
    recipient_id = schedule.created_by_actor or schedule.created_by
    if recipient_id != reviewer_id:
        try:
            create_notification(
                db,
                user_id=recipient_id,
                title="❌ 日程未获确认",
                content=f"日程「{proposed_title}」未获 {reviewer_name} 确认，理由：{comment or '无'}",
                type="schedule_rejected",
                related_schedule_id=schedule.id,
            )
        except Exception:
            db.rollback()

    return schedule


def get_pending_schedules(db: Session, user_id: int, user_role: str = "reader") -> list[Schedule]:
    """获取当前用户有权审核的待审核日程。"""
    q = db.query(Schedule).filter(Schedule.status == "pending")
    if user_role == "admin":
        q = q.filter(
            (Schedule.requires_owner_review == False) |
            ((Schedule.requires_owner_review == True) & (Schedule.created_by == user_id))
        )
    elif user_role == "reader":
        q = q.filter(
            ((Schedule.requires_owner_review == False) & (Schedule.visibility == "public")) |
            ((Schedule.requires_owner_review == True) & (Schedule.created_by == user_id))
        )
    else:
        q = q.filter(
            Schedule.requires_owner_review == True,
            Schedule.created_by == user_id,
        )
    return q.order_by(Schedule.is_important.desc(), Schedule.start_time.asc()).all()


def get_external_contacts(db: Session, user_id: int | None = None, user_role: str = "writer") -> list[dict]:
    """
    从已确认的日程中提取外部联系人（去重返回）
    每个用户只看自己创建的联系人
    """
    q = db.query(Schedule).filter(
        and_(
            Schedule.status == "confirmed",
            Schedule.external_contact_phone.isnot(None),
            Schedule.external_contact_phone != "",
        )
    )
    if user_role != "admin":
        q = q.filter(Schedule.created_by == user_id)
    schedules = q.all()

    seen = set()
    contacts = []
    for s in schedules:
        phone = s.external_contact_phone.strip()
        if phone and phone not in seen:
            seen.add(phone)
            contacts.append({
                "name": s.external_contact_name or "未知",
                "phone": phone,
                "schedule_id": s.id,
                "schedule_title": s.title,
            })

    return contacts


def _dt_to_iso(dt) -> str | None:
    """将数据库 UTC 时间统一输出为带 +08:00 标识的北京时间。"""
    return to_beijing_iso(dt)


def _schedule_to_response(schedule: Schedule) -> dict:
    """将 ORM 对象转为响应字典"""
    return {
        "id": schedule.id,
        "title": schedule.title,
        "description": schedule.description,
        "start_time": _dt_to_iso(schedule.start_time),
        "end_time": _dt_to_iso(schedule.end_time),
        "is_all_day": schedule.is_all_day,
        "is_important": schedule.is_important,
        "status": schedule.status,
        "created_by": schedule.created_by,
        "creator_name": schedule.creator.nickname if schedule.creator else None,
        "reviewed_by": schedule.reviewed_by,
        "reviewer_name": schedule.reviewer.nickname if schedule.reviewer else None,
        "reviewed_at": _dt_to_iso(schedule.reviewed_at),
        "review_comment": schedule.review_comment,
        "requires_owner_review": schedule.requires_owner_review,
        "category_id": schedule.category_id,
        "category_name": schedule.category.name if schedule.category else None,
        "category_color": schedule.category.color if schedule.category else None,
        "visibility": schedule.visibility,
        "completer_name": schedule.completer_name,
        "is_completed": schedule.is_completed,
        "completed_at": _dt_to_iso(schedule.completed_at),
        "external_contact_name": schedule.external_contact_name,
        "external_contact_phone": schedule.external_contact_phone,
        "external_contact_wechat": schedule.external_contact_wechat,
        "color": schedule.color,
        "created_at": _dt_to_iso(schedule.created_at),
        "updated_at": _dt_to_iso(schedule.updated_at),
    }


def toggle_complete(db: Session, schedule: Schedule, actor_id: int | None = None) -> Schedule:
    """切换日程的完成状态"""
    schedule.is_completed = not schedule.is_completed
    schedule.completed_at = datetime.now(timezone.utc) if schedule.is_completed else None
    schedule.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(schedule)
    action = "completed" if schedule.is_completed else "uncompleted"
    _log_action(db, schedule.id, action, actor_id or schedule.created_by, f"标记为{'已完成' if schedule.is_completed else '未完成'}")
    return schedule


def update_completer(db: Session, schedule: Schedule, completer_name: str | None, actor_id: int | None = None) -> Schedule:
    """更新任务完成人（管理员操作）"""
    schedule.completer_name = completer_name
    schedule.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(schedule)
    _log_action(db, schedule.id, "update_completer", actor_id or schedule.created_by, f"完成人更新为: {completer_name or '无'}")
    return schedule


def _log_action(db: Session, schedule_id: int, action: str, user_id: int, detail: str = ""):
    """记录操作审计日志"""
    log = AuditLog(
        schedule_id=schedule_id,
        action=action,
        performed_by=user_id,
        detail=detail,
    )
    db.add(log)
    db.commit()
