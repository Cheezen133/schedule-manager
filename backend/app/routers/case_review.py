import csv
import io
import json
import os
import re
import uuid
from datetime import date, datetime, timezone
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_user
from ..models.case_review import (
    ReviewAnnotation, ReviewCase, ReviewCaseFile, ReviewConclusion, ReviewDailyReport,
    ReviewDailyReportFile, ReviewLog, ReviewProject, ReviewProjectMember,
)
from ..models.user import User
from ..utils.datetime_utils import BEIJING, to_beijing_iso

router = APIRouter(prefix="/api/v1/case-review", tags=["CaseReview"])
# 病历、语音和汇报附件默认存 backend/uploads/case_review；环境变量可指向别处（测试环境指向临时目录）
UPLOAD_DIR = os.getenv("CASE_REVIEW_UPLOAD_DIR") or os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "case_review")
DECISIONS = {"include": "纳入", "exclude": "不纳入", "pending": "待定"}
STATUS_BY_DECISION = {"include": "included", "exclude": "excluded", "pending": "pending"}
STATUS_LABELS = {"unassigned": "未指派", "waiting": "待审阅", "pending": "待定", "included": "已纳入", "excluded": "未纳入"}
ANNOTATION_KINDS = {"point", "rect"}
AUDIO_EXTENSIONS = {".webm", ".m4a", ".mp4", ".ogg", ".oga", ".wav", ".aac", ".mp3"}
AUDIO_EXTENSION_BY_TYPE = {"audio/webm": ".webm", "audio/mp4": ".m4a", "audio/ogg": ".ogg", "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/aac": ".aac", "audio/mpeg": ".mp3"}

# 功能权限与身份。创建者和系统管理员永远拥有全部权限；其他成员可以有多个身份，
# 默认权限取这些身份的并集，创建者（或有管理权限的人）还可以逐项调整
PERMISSIONS = {"upload": "上传病历", "annotate": "批注", "conclude": "下结论", "report": "写汇报", "export": "导出", "manage": "管理成员和权限"}
ROLES = {
    "manager": ("管理员", ("upload", "annotate", "conclude", "report", "export", "manage")),
    "reviewer": ("审阅人", ("annotate", "conclude", "report", "export")),
    "recorder": ("录入员", ("upload", "annotate", "report")),
    "viewer": ("只读", ()),
}
DEFAULT_ROLES = ["recorder"]


class ProjectIn(BaseModel):
    name: str
    description: str | None = None
    is_public: bool | None = None  # 演示项目；不传表示不改

class MemberIn(BaseModel):
    user_id: int
    roles: list[str] | None = None

class MemberUpdate(BaseModel):
    roles: list[str]
    permissions: list[str] | None = None  # 不传表示按身份默认

class CaseIn(BaseModel):
    code: str
    title: str | None = None
    note: str | None = None
    reviewer_id: int | None = None

class AnnotationIn(BaseModel):
    page: int
    kind: str = "point"
    x: float
    y: float
    width: float = 0
    height: float = 0
    content: str

class AnnotationUpdate(BaseModel):
    content: str

class ConclusionIn(BaseModel):
    decision: str
    diagnosis: str | None = None
    comment: str | None = None

class DailyReportUpdate(BaseModel):
    report_date: date
    content: str | None = None


# ----- 成员资格：项目成员和系统管理员才能看，演示项目所有登录用户都能看；看不到时一律按不存在处理（404），不暴露资源是否存在。
# 演示项目的非成员没有任何权限，写操作都由后面的权限校验挡住 -----

def is_admin(user):
    return user.role == "admin"

def member_of(project_id, user_id, db):
    return db.query(ReviewProjectMember).filter_by(project_id=project_id, user_id=user_id).first()

def is_member(project, user, db):
    return is_admin(user) or member_of(project.id, user.id, db) is not None

def require_view(project, user, db, message):
    if not (project.is_public or is_member(project, user, db)):
        raise HTTPException(404, message)

def visible_project(project_id, user, db):
    project = db.get(ReviewProject, project_id)
    if not project:
        raise HTTPException(404, "项目不存在")
    require_view(project, user, db, "项目不存在")
    return project

def visible_case(case_id, user, db):
    item = db.get(ReviewCase, case_id)
    if not item:
        raise HTTPException(404, "病历不存在")
    project = db.get(ReviewProject, item.project_id)
    require_view(project, user, db, "病历不存在")
    return item, project

def visible_case_file(file_id, user, db):
    item = db.get(ReviewCaseFile, file_id)
    if not item:
        raise HTTPException(404, "文件不存在")
    case = db.get(ReviewCase, item.case_id)
    project = db.get(ReviewProject, case.project_id)
    require_view(project, user, db, "文件不存在")
    return item, case, project

def visible_report(report_id, user, db):
    item = db.get(ReviewDailyReport, report_id)
    if not item:
        raise HTTPException(404, "汇报不存在")
    project = db.get(ReviewProject, item.project_id)
    require_view(project, user, db, "汇报不存在")
    return item, project


# ----- 身份与权限 -----

def split_keys(value):
    return [item for item in (value or "").split(",") if item]

def ordered(keys):
    """按 PERMISSIONS／ROLES 的定义顺序排列，界面显示稳定"""
    return [key for key in list(PERMISSIONS) + list(ROLES) if key in keys]

def role_defaults(roles):
    result = set()
    for role in roles:
        result.update(ROLES.get(role, ("", ()))[1])
    return result

def member_permissions(project, member):
    """成员实际拥有的权限：创建者全部；显式设过的按设置；否则按身份默认（老数据没有身份，按录入员）"""
    if member.user_id == project.created_by:
        return set(PERMISSIONS)
    if member.permissions is not None:
        return set(split_keys(member.permissions)) & set(PERMISSIONS)
    return role_defaults(split_keys(member.roles) or DEFAULT_ROLES)

def permissions_of(project, user, db):
    if is_admin(user) or project.created_by == user.id:
        return set(PERMISSIONS)
    member = member_of(project.id, user.id, db)
    return member_permissions(project, member) if member else set()

def require(project, user, db, permission, message):
    perms = permissions_of(project, user, db)
    if permission not in perms:
        raise HTTPException(403, message)
    return perms

def can_delete_project(project, user):
    return is_admin(user) or project.created_by == user.id

def can_edit_case(item, user, perms):
    return "manage" in perms or (item.created_by == user.id and "upload" in perms)

def check_reviewer(project, reviewer_id, db):
    if reviewer_id is None:
        return
    member = member_of(project.id, reviewer_id, db)
    if not member:
        raise HTTPException(400, "审阅人必须是项目成员")
    if "conclude" not in member_permissions(project, member):
        raise HTTPException(400, "审阅人需要有「下结论」权限")

def check_roles(roles):
    roles = [role for role in dict.fromkeys(roles)]
    if not roles:
        raise HTTPException(400, "至少选择一个身份")
    unknown = [role for role in roles if role not in ROLES]
    if unknown:
        raise HTTPException(400, f"未知身份：{'、'.join(unknown)}")
    return roles


# ----- 通用工具 -----

def user_map(ids, db):
    ids = {item for item in ids if item}
    return {user.id: user for user in db.query(User).filter(User.id.in_(ids)).all()} if ids else {}

def user_brief(user_id, users):
    if not user_id:
        return None
    user = users.get(user_id)
    if not user:
        return {"id": user_id, "nickname": "已注销用户", "username": None}
    return {"id": user.id, "nickname": user.nickname or user.username, "username": user.username}

def natural_key(code):
    """编号按自然顺序排：2 排在 10 前面"""
    return [(0, int(part), "") if part.isdigit() else (1, 0, part) for part in re.split(r"(\d+)", code or "") if part]

def clean_text(value, limit=None):
    value = (value or "").strip()
    if limit and len(value) > limit:
        raise HTTPException(400, f"内容不能超过 {limit} 字")
    return value or None

def write_log(db, project_id, user, action, case_id=None, detail=None):
    db.add(ReviewLog(project_id=project_id, case_id=case_id, user_id=user.id, action=action,
                     detail=json.dumps(detail, ensure_ascii=False) if detail is not None else None))

def remove_file(path):
    if path and os.path.exists(path):
        os.remove(path)

async def save_upload(file: UploadFile, subdir: str, kind: str | None = None):
    """按 1MB 分块写盘，不设大小上限。kind='pdf' 检查文件头，挡住改了扩展名的非 PDF；kind='audio' 只收常见音频"""
    folder = os.path.join(UPLOAD_DIR, subdir)
    os.makedirs(folder, exist_ok=True)
    name = os.path.basename(file.filename or "file.bin")
    ext = os.path.splitext(name)[1].lower()
    base_type = (file.content_type or "").split(";")[0].strip().lower()
    if kind == "pdf" and ext != ".pdf":
        raise HTTPException(400, f"{name} 不是 PDF 文件")
    if kind == "audio":
        if ext not in AUDIO_EXTENSIONS:
            ext = AUDIO_EXTENSION_BY_TYPE.get(base_type, "")
        if ext not in AUDIO_EXTENSIONS:
            raise HTTPException(400, "只支持常见的录音格式")
    stored_name = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(folder, stored_name)
    size = 0
    try:
        with open(path, "wb") as handle:
            while chunk := await file.read(1024 * 1024):
                if size == 0 and kind == "pdf" and b"%PDF-" not in chunk[:1024]:
                    raise HTTPException(400, f"{name} 不是有效的 PDF 文件")
                size += len(chunk)
                handle.write(chunk)
        if size == 0:
            raise HTTPException(400, f"{name} 是空文件")
    except Exception:
        remove_file(path)
        raise
    content_type = "application/pdf" if kind == "pdf" else (base_type or "application/octet-stream")
    return {"name": name, "stored_name": stored_name, "file_path": path, "content_type": content_type, "file_size": size}

async def save_uploads(files, subdir, kind=None):
    """一次上传多份时，任何一份失败就把这次已写盘的全部删掉，不留半截"""
    saved = []
    try:
        for file in files:
            saved.append(await save_upload(file, subdir, kind))
    except Exception:
        for item in saved:
            remove_file(item["file_path"])
        raise
    return saved


# ----- 序列化 -----

def latest_by_case(conclusions):
    """每份病历取最新一份结论，病历状态由它决定"""
    latest = {}
    for item in conclusions:
        current = latest.get(item.case_id)
        if current is None or (item.updated_at, item.id) > (current.updated_at, current.id):
            latest[item.case_id] = item
    return latest

def case_status(item, conclusion):
    if conclusion:
        return STATUS_BY_DECISION[conclusion.decision]
    return "waiting" if item.reviewer_id else "unassigned"

def conclusion_dict(item, users):
    return {"id": item.id, "reviewer": user_brief(item.reviewer_id, users), "decision": item.decision,
            "decision_label": DECISIONS.get(item.decision, item.decision), "diagnosis": item.diagnosis,
            "comment": item.comment, "updated_at": to_beijing_iso(item.updated_at)}

def case_rows(cases, db):
    """一次查齐列表需要的附加信息：文件数、批注数、每份病历的最新结论"""
    ids = [item.id for item in cases]
    if not ids:
        return {}, {}, {}
    file_counts = dict(db.query(ReviewCaseFile.case_id, func.count(ReviewCaseFile.id)).filter(ReviewCaseFile.case_id.in_(ids)).group_by(ReviewCaseFile.case_id).all())
    note_counts = dict(db.query(ReviewCaseFile.case_id, func.count(ReviewAnnotation.id)).join(ReviewAnnotation, ReviewAnnotation.file_id == ReviewCaseFile.id).filter(ReviewCaseFile.case_id.in_(ids)).group_by(ReviewCaseFile.case_id).all())
    latest = latest_by_case(db.query(ReviewConclusion).filter(ReviewConclusion.case_id.in_(ids)).all())
    return file_counts, note_counts, latest

def case_dict(item, users, file_counts, note_counts, latest):
    conclusion = latest.get(item.id)
    status = case_status(item, conclusion)
    return {"id": item.id, "project_id": item.project_id, "code": item.code, "title": item.title, "note": item.note,
            "reviewer": user_brief(item.reviewer_id, users), "status": status, "status_label": STATUS_LABELS[status],
            "conclusion": conclusion_dict(conclusion, users) if conclusion else None,
            "file_count": file_counts.get(item.id, 0), "annotation_count": note_counts.get(item.id, 0),
            "created_by": user_brief(item.created_by, users), "created_at": to_beijing_iso(item.created_at),
            "updated_at": to_beijing_iso(item.updated_at)}

def case_file_dict(item, users, note_counts=None):
    return {"id": item.id, "case_id": item.case_id, "name": item.name, "file_size": item.file_size,
            "uploaded_by": user_brief(item.uploaded_by, users), "created_at": to_beijing_iso(item.created_at),
            "annotation_count": (note_counts or {}).get(item.id, 0)}

# member：当前用户是否项目成员。作者本人能改自己的批注、汇报，前提是仍是成员（被移出后在演示项目里只能看）
def annotation_dict(item, users, user, can_manage, member=True):
    return {"id": item.id, "file_id": item.file_id, "page": item.page, "kind": item.kind, "x": item.x, "y": item.y,
            "width": item.width, "height": item.height, "content": item.content, "author": user_brief(item.author_id, users),
            "has_audio": bool(item.audio_path), "audio_duration": item.audio_duration,
            "can_edit": can_manage or (member and item.author_id == user.id),
            "created_at": to_beijing_iso(item.created_at), "updated_at": to_beijing_iso(item.updated_at)}

def report_dict(item, files, users, user, can_manage, member=True):
    return {"id": item.id, "project_id": item.project_id, "report_date": item.report_date.isoformat(), "content": item.content,
            "author": user_brief(item.author_id, users), "can_edit": can_manage or (member and item.author_id == user.id),
            "files": [{"id": f.id, "name": f.name, "content_type": f.content_type, "file_size": f.file_size} for f in files],
            "created_at": to_beijing_iso(item.created_at), "updated_at": to_beijing_iso(item.updated_at)}

def member_dict(project, member, users):
    roles = split_keys(member.roles) or ([] if member.user_id == project.created_by else DEFAULT_ROLES)
    return {**user_brief(member.user_id, users), "is_creator": member.user_id == project.created_by,
            "roles": ordered(roles), "role_labels": [ROLES[role][0] for role in ordered(roles)],
            "permissions": ordered(member_permissions(project, member)), "custom_permissions": member.permissions is not None}


# ----- 项目与成员 -----

def waiting_cases(user, db):
    """指派给我、还没有任何人下过结论的病历"""
    concluded = db.query(ReviewConclusion.case_id)
    return db.query(ReviewCase).filter(ReviewCase.reviewer_id == user.id, ~ReviewCase.id.in_(concluded))

@router.get("/summary")
def summary(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return {"code": 0, "data": {"waiting_count": waiting_cases(current_user, db).count()}}

@router.get("/projects")
def list_projects(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """我参与的项目加上所有演示项目（系统管理员看全部）"""
    joined = {project_id for (project_id,) in db.query(ReviewProjectMember.project_id).filter_by(user_id=current_user.id)}
    query = db.query(ReviewProject)
    if not is_admin(current_user):
        query = query.filter(or_(ReviewProject.id.in_(joined), ReviewProject.is_public.is_(True)))
    projects = query.order_by(ReviewProject.updated_at.desc()).all()
    ids = [item.id for item in projects]
    member_counts = dict(db.query(ReviewProjectMember.project_id, func.count(ReviewProjectMember.id)).filter(ReviewProjectMember.project_id.in_(ids)).group_by(ReviewProjectMember.project_id).all()) if ids else {}
    case_counts = dict(db.query(ReviewCase.project_id, func.count(ReviewCase.id)).filter(ReviewCase.project_id.in_(ids)).group_by(ReviewCase.project_id).all()) if ids else {}
    waiting = dict(waiting_cases(current_user, db).with_entities(ReviewCase.project_id, func.count(ReviewCase.id)).group_by(ReviewCase.project_id).all())
    users = user_map([item.created_by for item in projects], db)
    return {"code": 0, "data": [{
        "id": item.id, "name": item.name, "description": item.description, "created_by": user_brief(item.created_by, users),
        "is_public": item.is_public, "is_member": is_admin(current_user) or item.id in joined,
        "member_count": member_counts.get(item.id, 0), "case_count": case_counts.get(item.id, 0),
        "waiting_count": waiting.get(item.id, 0), "updated_at": to_beijing_iso(item.updated_at),
    } for item in projects]}

@router.post("/projects")
def create_project(data: ProjectIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    name = clean_text(data.name, 100)
    if not name:
        raise HTTPException(400, "请填写项目名称")
    project = ReviewProject(name=name, description=clean_text(data.description, 2000), is_public=bool(data.is_public), created_by=current_user.id)
    db.add(project); db.flush()
    db.add(ReviewProjectMember(project_id=project.id, user_id=current_user.id))
    db.commit(); db.refresh(project)
    return {"code": 0, "data": {"id": project.id}}

@router.get("/projects/{project_id}")
def get_project(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = visible_project(project_id, current_user, db)
    members = db.query(ReviewProjectMember).filter_by(project_id=project.id).order_by(ReviewProjectMember.created_at, ReviewProjectMember.id).all()
    users = user_map([item.user_id for item in members] + [project.created_by], db)
    perms = permissions_of(project, current_user, db)
    return {"code": 0, "data": {
        "id": project.id, "name": project.name, "description": project.description,
        "created_by": user_brief(project.created_by, users),
        "is_public": project.is_public, "is_member": is_member(project, current_user, db),
        "my_permissions": ordered(perms), "can_manage": "manage" in perms, "can_delete": can_delete_project(project, current_user),
        "can_set_public": can_delete_project(project, current_user),
        "members": [member_dict(project, item, users) for item in members],
        "role_options": [{"key": key, "label": label, "permissions": list(defaults)} for key, (label, defaults) in ROLES.items()],
        "permission_options": [{"key": key, "label": label} for key, label in PERMISSIONS.items()],
        "created_at": to_beijing_iso(project.created_at),
    }}

@router.put("/projects/{project_id}")
def update_project(project_id: int, data: ProjectIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = visible_project(project_id, current_user, db)
    require(project, current_user, db, "manage", "你没有管理这个项目的权限")
    name = clean_text(data.name, 100)
    if not name:
        raise HTTPException(400, "请填写项目名称")
    project.name = name
    project.description = clean_text(data.description, 2000)
    # 设为演示项目会让所有登录用户看到其中全部病历和 PDF，所以只交给创建者或系统管理员
    if data.is_public is not None and data.is_public != project.is_public:
        if not can_delete_project(project, current_user):
            raise HTTPException(403, "只有项目创建者或系统管理员能设置演示项目")
        project.is_public = data.is_public
    db.commit()
    return {"code": 0}

@router.delete("/projects/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = visible_project(project_id, current_user, db)
    if not can_delete_project(project, current_user):
        raise HTTPException(403, "只有项目创建者可以删除项目")
    case_ids = [row[0] for row in db.query(ReviewCase.id).filter_by(project_id=project.id).all()]
    for case_id in case_ids:
        delete_case_rows(case_id, db)
    for (report_id,) in db.query(ReviewDailyReport.id).filter_by(project_id=project.id).all():
        delete_report_rows(report_id, db)
    db.query(ReviewProjectMember).filter_by(project_id=project.id).delete()
    write_log(db, project.id, current_user, "delete_project", detail={"name": project.name, "cases": len(case_ids)})
    db.delete(project); db.commit()
    return {"code": 0}

def unassign_if_cannot_conclude(project, member, db):
    """成员失去「下结论」权限后，其负责的病历改回未指派，已给的结论保留"""
    if "conclude" not in member_permissions(project, member):
        db.query(ReviewCase).filter_by(project_id=project.id, reviewer_id=member.user_id).update({ReviewCase.reviewer_id: None})

@router.post("/projects/{project_id}/members")
def add_member(project_id: int, data: MemberIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = visible_project(project_id, current_user, db)
    require(project, current_user, db, "manage", "你没有管理成员的权限")
    user = db.get(User, data.user_id)
    if not user or not user.is_active:
        raise HTTPException(404, "用户不存在")
    roles = check_roles(data.roles) if data.roles is not None else DEFAULT_ROLES
    if not member_of(project.id, user.id, db):
        db.add(ReviewProjectMember(project_id=project.id, user_id=user.id, roles=",".join(roles)))
        db.commit()
    return {"code": 0}

@router.put("/projects/{project_id}/members/{user_id}")
def update_member(project_id: int, user_id: int, data: MemberUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = visible_project(project_id, current_user, db)
    require(project, current_user, db, "manage", "你没有管理成员的权限")
    if user_id == project.created_by:
        raise HTTPException(400, "创建者拥有全部权限，不能修改")
    member = member_of(project.id, user_id, db)
    if not member:
        raise HTTPException(404, "成员不存在")
    member.roles = ",".join(check_roles(data.roles))
    if data.permissions is None:
        member.permissions = None
    else:
        unknown = [key for key in data.permissions if key not in PERMISSIONS]
        if unknown:
            raise HTTPException(400, f"未知权限：{'、'.join(unknown)}")
        member.permissions = ",".join(ordered(set(data.permissions)))
    db.flush()
    unassign_if_cannot_conclude(project, member, db)
    db.commit()
    return {"code": 0}

@router.delete("/projects/{project_id}/members/{user_id}")
def remove_member(project_id: int, user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = visible_project(project_id, current_user, db)
    require(project, current_user, db, "manage", "你没有管理成员的权限")
    if user_id == project.created_by:
        raise HTTPException(400, "不能移除项目创建者")
    db.query(ReviewProjectMember).filter_by(project_id=project.id, user_id=user_id).delete()
    # 被移除的人不再是审阅人：其负责的病历改回未指派，已给的结论保留
    db.query(ReviewCase).filter_by(project_id=project.id, reviewer_id=user_id).update({ReviewCase.reviewer_id: None})
    db.commit()
    return {"code": 0}


# ----- 病历与 PDF -----

def remove_annotation_audio(file_ids, db):
    for (path,) in db.query(ReviewAnnotation.audio_path).filter(ReviewAnnotation.file_id.in_(file_ids), ReviewAnnotation.audio_path.isnot(None)).all():
        remove_file(path)

def delete_case_rows(case_id, db):
    """删一份病历连同它的 PDF 文件、语音批注（磁盘上的也删）、批注和结论。
    子表先删、父表后删，逐条执行批量删除，保证 MySQL 外键约束下的顺序"""
    files = db.query(ReviewCaseFile).filter_by(case_id=case_id).all()
    file_ids = [item.id for item in files]
    if file_ids:
        remove_annotation_audio(file_ids, db)
        db.query(ReviewAnnotation).filter(ReviewAnnotation.file_id.in_(file_ids)).delete(synchronize_session=False)
    for item in files:
        remove_file(item.file_path)
    db.query(ReviewCaseFile).filter_by(case_id=case_id).delete(synchronize_session=False)
    db.query(ReviewConclusion).filter_by(case_id=case_id).delete(synchronize_session=False)
    db.query(ReviewCase).filter_by(id=case_id).delete(synchronize_session=False)

@router.get("/projects/{project_id}/cases")
def list_cases(project_id: int, status: str | None = None, q: str | None = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = visible_project(project_id, current_user, db)
    query = db.query(ReviewCase).filter_by(project_id=project.id)
    keyword = (q or "").strip()
    if keyword:
        query = query.filter(ReviewCase.code.contains(keyword) | ReviewCase.title.contains(keyword))
    cases = sorted(query.all(), key=lambda item: natural_key(item.code))
    file_counts, note_counts, latest = case_rows(cases, db)
    users = user_map([item.reviewer_id for item in cases] + [item.created_by for item in cases] + [c.reviewer_id for c in latest.values()], db)
    rows = [case_dict(item, users, file_counts, note_counts, latest) for item in cases]
    if status:
        rows = [row for row in rows if row["status"] == status]
    return {"code": 0, "data": rows}

@router.post("/projects/{project_id}/cases")
def create_case(project_id: int, data: CaseIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = visible_project(project_id, current_user, db)
    require(project, current_user, db, "upload", "你没有上传病历的权限")
    code = clean_text(data.code, 50)
    if not code:
        raise HTTPException(400, "请填写病历编号")
    if db.query(ReviewCase.id).filter_by(project_id=project.id, code=code).first():
        raise HTTPException(409, f"编号 {code} 已存在")
    check_reviewer(project, data.reviewer_id, db)
    item = ReviewCase(project_id=project.id, code=code, title=clean_text(data.title, 200), note=clean_text(data.note, 5000),
                      reviewer_id=data.reviewer_id, created_by=current_user.id)
    db.add(item); db.commit(); db.refresh(item)
    return {"code": 0, "data": {"id": item.id}}

@router.get("/cases/{case_id}")
def get_case(case_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item, project = visible_case(case_id, current_user, db)
    perms = permissions_of(project, current_user, db)
    files = db.query(ReviewCaseFile).filter_by(case_id=item.id).order_by(ReviewCaseFile.created_at, ReviewCaseFile.id).all()
    file_note_counts = dict(db.query(ReviewAnnotation.file_id, func.count(ReviewAnnotation.id)).filter(ReviewAnnotation.file_id.in_([f.id for f in files])).group_by(ReviewAnnotation.file_id).all()) if files else {}
    conclusions = db.query(ReviewConclusion).filter_by(case_id=item.id).order_by(ReviewConclusion.updated_at.desc(), ReviewConclusion.id.desc()).all()
    file_counts, note_counts, latest = case_rows([item], db)
    users = user_map([item.reviewer_id, item.created_by] + [f.uploaded_by for f in files] + [c.reviewer_id for c in conclusions], db)
    data = case_dict(item, users, file_counts, note_counts, latest)
    data.update({
        "project": {"id": project.id, "name": project.name},
        "files": [case_file_dict(f, users, file_note_counts) for f in files],
        "conclusions": [conclusion_dict(c, users) for c in conclusions],
        "my_permissions": ordered(perms),
        "can_edit": can_edit_case(item, current_user, perms),
        "can_conclude": "conclude" in perms,
        "can_annotate": "annotate" in perms,
        "can_upload": "upload" in perms,
        "can_manage_project": "manage" in perms,
    })
    return {"code": 0, "data": data}

@router.put("/cases/{case_id}")
def update_case(case_id: int, data: CaseIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item, project = visible_case(case_id, current_user, db)
    if not can_edit_case(item, current_user, permissions_of(project, current_user, db)):
        raise HTTPException(403, "只有病历创建者或有管理权限的人可以修改")
    code = clean_text(data.code, 50)
    if not code:
        raise HTTPException(400, "请填写病历编号")
    if code != item.code and db.query(ReviewCase.id).filter_by(project_id=project.id, code=code).first():
        raise HTTPException(409, f"编号 {code} 已存在")
    check_reviewer(project, data.reviewer_id, db)
    item.code, item.title, item.note, item.reviewer_id = code, clean_text(data.title, 200), clean_text(data.note, 5000), data.reviewer_id
    db.commit()
    return {"code": 0}

@router.delete("/cases/{case_id}")
def delete_case(case_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item, project = visible_case(case_id, current_user, db)
    if not can_edit_case(item, current_user, permissions_of(project, current_user, db)):
        raise HTTPException(403, "只有病历创建者或有管理权限的人可以删除")
    write_log(db, project.id, current_user, "delete_case", case_id=item.id, detail={"code": item.code})
    delete_case_rows(item.id, db); db.commit()
    return {"code": 0}

@router.post("/cases/{case_id}/files")
async def upload_case_files(case_id: int, files: list[UploadFile] = File(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item, project = visible_case(case_id, current_user, db)
    require(project, current_user, db, "upload", "你没有上传病历的权限")
    saved = await save_uploads(files, "cases", kind="pdf")
    for info in saved:
        db.add(ReviewCaseFile(case_id=item.id, uploaded_by=current_user.id, **info))
    write_log(db, project.id, current_user, "upload_file", case_id=item.id, detail=[info["name"] for info in saved])
    db.commit()
    return {"code": 0, "data": {"count": len(saved)}}

@router.delete("/files/{file_id}")
def delete_case_file(file_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item, case, project = visible_case_file(file_id, current_user, db)
    if not ("manage" in permissions_of(project, current_user, db) or (item.uploaded_by == current_user.id and is_member(project, current_user, db))):
        raise HTTPException(403, "只有上传者或有管理权限的人可以删除文件")
    remove_annotation_audio([item.id], db)
    db.query(ReviewAnnotation).filter_by(file_id=item.id).delete()
    write_log(db, project.id, current_user, "delete_file", case_id=case.id, detail={"name": item.name})
    remove_file(item.file_path)
    db.delete(item); db.commit()
    return {"code": 0}

@router.get("/files/{file_id}/content")
def case_file_content(file_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item, case, project = visible_case_file(file_id, current_user, db)
    if not os.path.exists(item.file_path):
        raise HTTPException(404, "文件已丢失")
    write_log(db, project.id, current_user, "view_file", case_id=case.id, detail={"file_id": item.id, "name": item.name})
    db.commit()
    return FileResponse(item.file_path, filename=item.name, media_type="application/pdf")


# ----- 批注（文字或语音）-----

def check_geometry(page, kind, x, y, width, height):
    """位置按页面比例存，必须落在页面内（留一点浮点误差）；返回整理后的宽高"""
    if kind not in ANNOTATION_KINDS or page < 1:
        raise HTTPException(400, "批注位置无效")
    width, height = (0.0, 0.0) if kind == "point" else (width, height)
    if not (0 <= x <= 1 and 0 <= y <= 1 and width >= 0 and height >= 0 and x + width <= 1.0001 and y + height <= 1.0001):
        raise HTTPException(400, "批注位置无效")
    if kind == "rect" and (width <= 0 or height <= 0):
        raise HTTPException(400, "框选区域太小")
    return width, height

@router.get("/files/{file_id}/annotations")
def list_annotations(file_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item, _, project = visible_case_file(file_id, current_user, db)
    can_manage = "manage" in permissions_of(project, current_user, db)
    member = is_member(project, current_user, db)
    notes = db.query(ReviewAnnotation).filter_by(file_id=item.id).order_by(ReviewAnnotation.page, ReviewAnnotation.y, ReviewAnnotation.id).all()
    users = user_map([note.author_id for note in notes], db)
    return {"code": 0, "data": [annotation_dict(note, users, current_user, can_manage, member) for note in notes]}

@router.post("/files/{file_id}/annotations")
def create_annotation(file_id: int, data: AnnotationIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item, _, project = visible_case_file(file_id, current_user, db)
    perms = require(project, current_user, db, "annotate", "你没有批注权限")
    content = clean_text(data.content, 2000)
    if not content:
        raise HTTPException(400, "请填写批注内容")
    width, height = check_geometry(data.page, data.kind, data.x, data.y, data.width, data.height)
    note = ReviewAnnotation(file_id=item.id, page=data.page, kind=data.kind, x=data.x, y=data.y, width=width, height=height,
                            content=content, author_id=current_user.id)
    db.add(note); db.commit(); db.refresh(note)
    return {"code": 0, "data": annotation_dict(note, user_map([current_user.id], db), current_user, "manage" in perms)}

@router.post("/files/{file_id}/annotations/voice")
async def create_voice_annotation(file_id: int, page: int = Form(...), kind: str = Form("point"), x: float = Form(...), y: float = Form(...),
                                  width: float = Form(0), height: float = Form(0), content: str | None = Form(None), duration: int | None = Form(None),
                                  audio: UploadFile = File(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item, _, project = visible_case_file(file_id, current_user, db)
    perms = require(project, current_user, db, "annotate", "你没有批注权限")
    width, height = check_geometry(page, kind, x, y, width, height)
    text = clean_text(content, 2000)
    info = await save_upload(audio, "audio", kind="audio")
    note = ReviewAnnotation(file_id=item.id, page=page, kind=kind, x=x, y=y, width=width, height=height, content=text or "",
                            audio_name=info["name"], audio_path=info["file_path"], audio_type=info["content_type"],
                            audio_duration=max(0, min(duration or 0, 3600)) or None, author_id=current_user.id)
    db.add(note); db.commit(); db.refresh(note)
    return {"code": 0, "data": annotation_dict(note, user_map([current_user.id], db), current_user, "manage" in perms)}

@router.get("/annotations/{annotation_id}/audio")
def annotation_audio(annotation_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    note = db.get(ReviewAnnotation, annotation_id)
    if not note or not note.audio_path:
        raise HTTPException(404, "语音不存在")
    visible_case_file(note.file_id, current_user, db)
    if not os.path.exists(note.audio_path):
        raise HTTPException(404, "语音文件已丢失")
    return FileResponse(note.audio_path, filename=note.audio_name or "voice", media_type=note.audio_type or "application/octet-stream")

def own_annotation(annotation_id, user, db):
    note = db.get(ReviewAnnotation, annotation_id)
    if not note:
        raise HTTPException(404, "批注不存在")
    _, _, project = visible_case_file(note.file_id, user, db)
    if not ((note.author_id == user.id and is_member(project, user, db)) or "manage" in permissions_of(project, user, db)):
        raise HTTPException(403, "只能修改自己的批注")
    return note

@router.put("/annotations/{annotation_id}")
def update_annotation(annotation_id: int, data: AnnotationUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    note = own_annotation(annotation_id, current_user, db)
    content = clean_text(data.content, 2000)
    if not content and not note.audio_path:
        raise HTTPException(400, "请填写批注内容")
    note.content = content or ""; db.commit()
    return {"code": 0}

@router.delete("/annotations/{annotation_id}")
def delete_annotation(annotation_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    note = own_annotation(annotation_id, current_user, db)
    remove_file(note.audio_path)
    db.delete(note); db.commit()
    return {"code": 0}


# ----- 结论：有「下结论」权限的人都能提交；「指派」只决定出现在谁的待审阅里。改动都记日志 -----

@router.put("/cases/{case_id}/conclusion")
def save_conclusion(case_id: int, data: ConclusionIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item, project = visible_case(case_id, current_user, db)
    require(project, current_user, db, "conclude", "你没有下结论的权限")
    if data.decision not in DECISIONS:
        raise HTTPException(400, "请选择是否纳入")
    diagnosis, comment = clean_text(data.diagnosis, 2000), clean_text(data.comment, 5000)
    conclusion = db.query(ReviewConclusion).filter_by(case_id=item.id, reviewer_id=current_user.id).first()
    if conclusion:
        conclusion.decision, conclusion.diagnosis, conclusion.comment = data.decision, diagnosis, comment
        conclusion.updated_at = datetime.now(timezone.utc)  # 内容没变时 onupdate 不触发，显式刷新，保证「最新一份」准确
    else:
        db.add(ReviewConclusion(case_id=item.id, reviewer_id=current_user.id, decision=data.decision, diagnosis=diagnosis, comment=comment))
    write_log(db, project.id, current_user, "save_conclusion", case_id=item.id,
              detail={"decision": data.decision, "diagnosis": diagnosis, "comment": comment})
    db.commit()
    return {"code": 0}


# ----- 每日汇报 -----

def delete_report_rows(report_id, db):
    """删一条汇报连同附件（磁盘上的也删），先删附件行再删汇报行"""
    for item in db.query(ReviewDailyReportFile).filter_by(report_id=report_id).all():
        remove_file(item.file_path)
    db.query(ReviewDailyReportFile).filter_by(report_id=report_id).delete(synchronize_session=False)
    db.query(ReviewDailyReport).filter_by(id=report_id).delete(synchronize_session=False)

def own_report(report_id, user, db):
    item, project = visible_report(report_id, user, db)
    if not ((item.author_id == user.id and is_member(project, user, db)) or "manage" in permissions_of(project, user, db)):
        raise HTTPException(403, "只能修改自己的汇报")
    return item

def parse_report_date(value):
    if not value:
        return datetime.now(BEIJING).date()
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(400, "日期格式不正确")

@router.get("/projects/{project_id}/daily-reports")
def list_daily_reports(project_id: int, offset: int = Query(0, ge=0), limit: int = Query(30, ge=1, le=100), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = visible_project(project_id, current_user, db)
    can_manage = "manage" in permissions_of(project, current_user, db)
    query = db.query(ReviewDailyReport).filter_by(project_id=project.id)
    total = query.count()
    reports = query.order_by(ReviewDailyReport.report_date.desc(), ReviewDailyReport.created_at.desc(), ReviewDailyReport.id.desc()).offset(offset).limit(limit).all()
    files = db.query(ReviewDailyReportFile).filter(ReviewDailyReportFile.report_id.in_([r.id for r in reports])).order_by(ReviewDailyReportFile.id).all() if reports else []
    by_report = {}
    for item in files:
        by_report.setdefault(item.report_id, []).append(item)
    users = user_map([r.author_id for r in reports], db)
    member = is_member(project, current_user, db)
    return {"code": 0, "data": {"total": total, "items": [report_dict(r, by_report.get(r.id, []), users, current_user, can_manage, member) for r in reports]}}

@router.post("/projects/{project_id}/daily-reports")
async def create_daily_report(project_id: int, report_date: str | None = Form(None), content: str | None = Form(None), files: list[UploadFile] | None = File(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = visible_project(project_id, current_user, db)
    require(project, current_user, db, "report", "你没有写汇报的权限")
    text = clean_text(content, 10000)
    uploads = [item for item in (files or []) if item.filename]
    if not text and not uploads:
        raise HTTPException(400, "请填写内容或添加图片、文件")
    day = parse_report_date(report_date)
    saved = await save_uploads(uploads, "reports")
    report = ReviewDailyReport(project_id=project.id, author_id=current_user.id, report_date=day, content=text)
    db.add(report); db.flush()
    for info in saved:
        db.add(ReviewDailyReportFile(report_id=report.id, **info))
    db.commit()
    return {"code": 0, "data": {"id": report.id}}

@router.put("/daily-reports/{report_id}")
def update_daily_report(report_id: int, data: DailyReportUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    report = own_report(report_id, current_user, db)
    text = clean_text(data.content, 10000)
    if not text and not db.query(ReviewDailyReportFile.id).filter_by(report_id=report.id).first():
        raise HTTPException(400, "请填写内容或保留至少一个附件")
    report.report_date, report.content = data.report_date, text
    db.commit()
    return {"code": 0}

@router.post("/daily-reports/{report_id}/files")
async def add_daily_report_files(report_id: int, files: list[UploadFile] = File(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    report = own_report(report_id, current_user, db)
    saved = await save_uploads([item for item in files if item.filename], "reports")
    for info in saved:
        db.add(ReviewDailyReportFile(report_id=report.id, **info))
    db.commit()
    return {"code": 0, "data": {"count": len(saved)}}

@router.delete("/daily-reports/{report_id}")
def delete_daily_report(report_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    report = own_report(report_id, current_user, db)
    delete_report_rows(report.id, db); db.commit()
    return {"code": 0}

def visible_report_file(file_id, user, db):
    item = db.get(ReviewDailyReportFile, file_id)
    if not item:
        raise HTTPException(404, "文件不存在")
    report, _ = visible_report(item.report_id, user, db)
    return item, report

@router.delete("/daily-report-files/{file_id}")
def delete_daily_report_file(file_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item, report = visible_report_file(file_id, current_user, db)
    own_report(report.id, current_user, db)
    remove_file(item.file_path)
    db.delete(item); db.commit()
    return {"code": 0}

@router.get("/daily-report-files/{file_id}/content")
def daily_report_file_content(file_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item, _ = visible_report_file(file_id, current_user, db)
    if not os.path.exists(item.file_path):
        raise HTTPException(404, "文件已丢失")
    return FileResponse(item.file_path, filename=item.name, media_type=item.content_type or "application/octet-stream")


# ----- 导出：CSV 带 BOM，Excel 直接打开不乱码 -----

@router.get("/projects/{project_id}/export")
def export_cases(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = visible_project(project_id, current_user, db)
    require(project, current_user, db, "export", "你没有导出权限")
    cases = sorted(db.query(ReviewCase).filter_by(project_id=project.id).all(), key=lambda item: natural_key(item.code))
    file_counts, note_counts, latest = case_rows(cases, db)
    users = user_map([item.reviewer_id for item in cases] + [c.reviewer_id for c in latest.values()], db)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["编号", "标题", "指派审阅人", "状态", "结论", "病因诊断", "审阅意见", "结论人", "结论时间", "PDF 数", "批注数"])
    for item in cases:
        row = case_dict(item, users, file_counts, note_counts, latest)
        conclusion = row["conclusion"] or {}
        reviewed_at = (conclusion.get("updated_at") or "")[:16].replace("T", " ")
        writer.writerow([item.code, item.title or "", (row["reviewer"] or {}).get("nickname", ""), row["status_label"],
                         conclusion.get("decision_label", ""), conclusion.get("diagnosis") or "", conclusion.get("comment") or "",
                         (conclusion.get("reviewer") or {}).get("nickname", ""), reviewed_at, row["file_count"], row["annotation_count"]])
    write_log(db, project.id, current_user, "export", detail={"cases": len(cases)})
    db.commit()
    filename = f"病历审阅_{project.name}_{datetime.now(BEIJING).strftime('%Y%m%d')}.csv"
    return Response(content="﻿" + buffer.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f"attachment; filename=\"case-review.csv\"; filename*=UTF-8''{quote(filename)}"})
