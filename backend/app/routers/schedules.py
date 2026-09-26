from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import get_current_user
from ..models.user import User
from ..models.schedule import Schedule
from ..models.category import Category
from ..models.schedule_management import ScheduleViewer
from ..schemas.schedule import ScheduleCreate, ScheduleUpdate, ReviewAction
from ..services.schedule_service import create_manager_edit_snapshot, get_schedule_by_id, delete_schedule, toggle_complete, get_external_contacts, _schedule_to_response, approve_schedule, reject_schedule
from ..services.schedule_management_service import is_effective_manager, can_view_schedule, valid_viewers
from ..services.notification_service import create_notification
from ..utils.datetime_utils import parse_client_datetime, to_beijing_iso, to_utc_naive

router = APIRouter(prefix="/api/v1", tags=["Schedules"])

def busy(schedule):
    return {"id": schedule.id, "title": "时间已被占用，你无权查看", "description": None, "start_time": to_beijing_iso(schedule.start_time), "end_time": to_beijing_iso(schedule.end_time), "is_all_day": schedule.is_all_day, "status": "busy", "visibility": "hidden", "color": "#9ca3af", "is_busy_placeholder": True, "can_view": False}

def response(db, schedule, user):
    if not can_view_schedule(db, schedule, user.id): return busy(schedule)
    data = _schedule_to_response(schedule)
    data["viewer_ids"] = [row.user_id for row in db.query(ScheduleViewer).filter_by(schedule_id=schedule.id).all()]
    return data

def set_viewers(db, schedule, viewer_ids):
    ids = valid_viewers(db, schedule.created_by, viewer_ids)
    db.query(ScheduleViewer).filter_by(schedule_id=schedule.id).delete()
    for user_id in ids:
        if user_id != schedule.created_by:
            db.add(ScheduleViewer(schedule_id=schedule.id, user_id=user_id))


def validate_owner_category(db: Session, category_id: int | None, owner_id: int):
    if category_id is None:
        return
    category = db.query(Category).filter(
        Category.id == category_id,
        Category.created_by == owner_id,
        Category.is_active == True,
    ).first()
    if not category:
        raise HTTPException(400, "分类不存在或不属于该日程拥有者")


def notify_owner_review(db, schedule, actor, action_label):
    """Notify the schedule owner without turning a committed schedule action into an error."""
    if schedule.created_by == actor.id:
        return
    try:
        create_notification(
            db,
            schedule.created_by,
            "日程等待你的审核",
            f"{actor.nickname} {action_label}日程「{schedule.title}」，请确认后才会显示为已确认。",
            "schedule_owner_review",
            related_schedule_id=schedule.id,
            related_url=f"/schedules/{schedule.id}",
        )
    except Exception:
        db.rollback()

@router.get("/schedules")
def list_schedules(start_date: str | None = Query(None), end_date: str | None = Query(None), status_filter: str | None = Query(None, alias="status"), created_by: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    owner_id = created_by if created_by is not None else current_user.id
    if owner_id != current_user.id and not is_effective_manager(db, current_user.id, owner_id):
        raise HTTPException(403, "Management permission is missing or expired")
    query = db.query(Schedule).filter(Schedule.created_by == owner_id)
    if start_date: query = query.filter(Schedule.end_time >= parse_client_datetime(start_date))
    if end_date: query = query.filter(Schedule.start_time <= parse_client_datetime(end_date, end_of_day=True))
    if status_filter: query = query.filter(Schedule.status == status_filter)
    return {"code": 0, "message": "ok", "data": [response(db, item, current_user) for item in query.order_by(Schedule.start_time).all()]}

@router.post("/schedules")
def create_new_schedule(data: ScheduleCreate, for_user: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    start_time = to_utc_naive(data.start_time)
    end_time = to_utc_naive(data.end_time)
    if end_time <= start_time: raise HTTPException(400, "End time must be after start time")
    owner_id = for_user or current_user.id
    if owner_id == current_user.id and current_user.role not in ("admin", "writer"):
        raise HTTPException(403, "Only administrators and writers can create their own schedules")
    if owner_id != current_user.id and not is_effective_manager(db, current_user.id, owner_id):
        raise HTTPException(403, "Management permission is missing or expired")
    visibility = data.visibility or "private"
    if visibility not in ("private", "managers", "selected"): raise HTTPException(400, "Invalid visibility")
    validate_owner_category(db, data.category_id, owner_id)
    needs_owner_review = owner_id != current_user.id
    schedule = Schedule(title=data.title, description=data.description, start_time=start_time, end_time=end_time, is_all_day=data.is_all_day, is_important=data.is_important, status="pending" if needs_owner_review else "confirmed", requires_owner_review=needs_owner_review, created_by=owner_id, created_by_actor=current_user.id, category_id=data.category_id, visibility=visibility, completer_name=data.completer_name, external_contact_name=data.external_contact_name, external_contact_phone=data.external_contact_phone, external_contact_wechat=data.external_contact_wechat, color=data.color or "#3788d8")
    db.add(schedule); db.flush()
    try: set_viewers(db, schedule, data.viewer_ids if visibility == "selected" else [])
    except ValueError as error: db.rollback(); raise HTTPException(400, str(error))
    db.commit(); db.refresh(schedule)
    if needs_owner_review:
        notify_owner_review(db, schedule, current_user, "代为创建了")
    return {"code": 0, "message": "Schedule created", "data": response(db, schedule, current_user)}

@router.get("/schedules/{schedule_id}")
def detail(schedule_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    schedule = get_schedule_by_id(db, schedule_id)
    if not schedule: raise HTTPException(404, "Schedule not found")
    if not schedule or not can_view_schedule(db, schedule, current_user.id): raise HTTPException(404, "Schedule not found")
    return {"code": 0, "data": response(db, schedule, current_user)}

@router.put("/schedules/{schedule_id}")
def edit(schedule_id: int, data: ScheduleUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    schedule = get_schedule_by_id(db, schedule_id)
    if not schedule or not can_view_schedule(db, schedule, current_user.id): raise HTTPException(403, "You cannot edit this schedule")
    if current_user.id == schedule.created_by and current_user.role not in ("admin", "writer"):
        raise HTTPException(403, "Only administrators and writers can edit their own schedules")
    values = data.model_dump(exclude_unset=True); viewer_ids = values.pop("viewer_ids", None)
    if current_user.id != schedule.created_by:
        create_manager_edit_snapshot(db, schedule, current_user.id)
    for field in ("start_time", "end_time"):
        if field in values:
            if values[field] is None:
                raise HTTPException(400, f"{field} cannot be empty")
            values[field] = to_utc_naive(values[field])
    resulting_start = values.get("start_time", schedule.start_time)
    resulting_end = values.get("end_time", schedule.end_time)
    if resulting_end <= resulting_start: raise HTTPException(400, "End time must be after start time")
    if "visibility" in values and values["visibility"] not in ("private", "managers", "selected"): raise HTTPException(400, "Invalid visibility")
    if "category_id" in values:
        validate_owner_category(db, values["category_id"], schedule.created_by)
    for key, value in values.items(): setattr(schedule, key, value)
    if viewer_ids is not None:
        try: set_viewers(db, schedule, viewer_ids if schedule.visibility == "selected" else [])
        except ValueError as error: db.rollback(); raise HTTPException(400, str(error))
    if current_user.id != schedule.created_by:
        schedule.status = "pending"
        schedule.requires_owner_review = True
        schedule.reviewed_by = None
        schedule.reviewed_at = None
        schedule.review_comment = None
    db.commit(); db.refresh(schedule)
    if current_user.id != schedule.created_by:
        notify_owner_review(db, schedule, current_user, "代为修改了")
    return {"code": 0, "data": response(db, schedule, current_user)}

@router.delete("/schedules/{schedule_id}")
def remove(schedule_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    schedule = get_schedule_by_id(db, schedule_id)
    if not schedule or not can_view_schedule(db, schedule, current_user.id): raise HTTPException(403, "Not allowed")
    delete_schedule(db, schedule); return {"code": 0, "message": "Schedule deleted", "data": None}

@router.post("/schedules/{schedule_id}/toggle-complete")
def complete(schedule_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    schedule = get_schedule_by_id(db, schedule_id)
    if not schedule or not can_view_schedule(db, schedule, current_user.id): raise HTTPException(403, "Not allowed")
    return {"code": 0, "data": _schedule_to_response(toggle_complete(db, schedule, current_user.id))}


@router.get("/review/pending")
def list_owner_review_pending(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Only the schedule owner reviews manager-created or manager-edited schedules."""
    items = db.query(Schedule).filter(
        Schedule.created_by == current_user.id,
        Schedule.status == "pending",
        Schedule.requires_owner_review == True,
    ).order_by(Schedule.is_important.desc(), Schedule.start_time.asc()).all()
    return {"code": 0, "data": [_schedule_to_response(item) for item in items]}


@router.post("/review/{schedule_id}/approve")
def approve_owner_review(schedule_id: int, action: ReviewAction, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    schedule = get_schedule_by_id(db, schedule_id)
    if not schedule or schedule.created_by != current_user.id or schedule.status != "pending" or not schedule.requires_owner_review:
        raise HTTPException(403, "Only the schedule owner can approve this pending schedule")
    approved = approve_schedule(db, schedule, current_user.id, action.comment)
    return {"code": 0, "message": "Schedule approved", "data": response(db, approved, current_user)}


@router.post("/review/{schedule_id}/reject")
def reject_owner_review(schedule_id: int, action: ReviewAction, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    schedule = get_schedule_by_id(db, schedule_id)
    if not schedule or schedule.created_by != current_user.id or schedule.status != "pending" or not schedule.requires_owner_review:
        raise HTTPException(403, "Only the schedule owner can reject this pending schedule")
    rejected = reject_schedule(db, schedule, current_user.id, action.comment)
    message = "Schedule changes rejected and original restored" if rejected.status == "confirmed" else "Schedule rejected"
    return {"code": 0, "message": message, "data": response(db, rejected, current_user)}

@router.get("/contacts")
def contacts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return {"code": 0, "data": get_external_contacts(db, user_id=current_user.id)}
