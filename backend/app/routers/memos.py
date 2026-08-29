import os
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import distinct, func, or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_user
from ..models.chat_message import ChatMessage
from ..models.conversation import Conversation, ConversationMember
from ..models.favorite import FavoriteMessage
from ..models.memo import MemoCase, MemoFile, MemoFolder, GroupAnnouncement, GroupTodo, Patient, PatientGroup, PatientGroupMember, PatientTimelineEntry
from ..models.shared_file import SharedFile
from ..models.user import User

router = APIRouter(prefix="/api/v1/memos", tags=["Memos"])
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "memos")
MAX_FILE_SIZE = 50 * 1024 * 1024

class FolderIn(BaseModel):
    name: str
    parent_id: int | None = None

class FileUpdate(BaseModel):
    name: str | None = None
    folder_id: int | None = None
    tags: str | None = None

class PatientIn(BaseModel):
    name: str
    gender: str | None = None
    birth_date: datetime | None = None
    phone: str | None = None
    allergies: str | None = None
    medical_history: str | None = None
    notes: str | None = None
    group_ids: list[int] = []

class PatientGroupIn(BaseModel):
    name: str
    sort_order: int = 0

class TimelineIn(BaseModel):
    record_type: str
    occurred_at: datetime
    title: str
    content: str | None = None

def owned(model, item_id, user, db):
    item = db.get(model, item_id)
    if not item or getattr(item, "owner_id", None) != user.id:
        raise HTTPException(404, "Not found")
    return item

def group_ids(user, db):
    return [row[0] for row in db.query(ConversationMember.conversation_id).filter(ConversationMember.user_id == user.id).all()]

def group_name_map(ids, db):
    return {item.id: item.group_name or "未命名群聊" for item in db.query(Conversation).filter(Conversation.id.in_(ids)).all()} if ids else {}

def file_dict(item, sender_name=None):
    return {"id": item.id, "name": item.name, "folder_id": item.folder_id, "tags": item.tags, "file_size": item.file_size, "content_type": item.content_type, "created_at": item.created_at.isoformat() if item.created_at else None, "sender_name": sender_name, "download_url": f"/api/v1/memos/files/{item.id}/download"}

def chat_download_url(file_url):
    if not file_url or "/media/" not in file_url:
        return None
    return file_url.replace("/media/", "/download/")

def patient_owned(patient_id, user, db, include_archived=True):
    query = db.query(Patient).filter(Patient.id == patient_id, Patient.owner_id == user.id)
    if not include_archived: query = query.filter(Patient.is_archived == False)
    item = query.first()
    if not item: raise HTTPException(404, "Patient not found")
    return item

def patient_groups(patient_id, db):
    return [{"id": item.id, "name": item.name, "sort_order": item.sort_order} for item in db.query(PatientGroup).join(PatientGroupMember, PatientGroupMember.group_id == PatientGroup.id).filter(PatientGroupMember.patient_id == patient_id).order_by(PatientGroup.sort_order, PatientGroup.name).all()]

def patient_dict(item, db):
    return {"id": item.id, "name": item.name, "gender": item.gender, "birth_date": item.birth_date.isoformat() if item.birth_date else None, "phone": item.phone, "allergies": item.allergies, "medical_history": item.medical_history, "notes": item.notes, "is_archived": item.is_archived, "created_at": item.created_at.isoformat() if item.created_at else None, "updated_at": item.updated_at.isoformat() if item.updated_at else None, "groups": patient_groups(item.id, db)}

def set_patient_groups(patient, group_ids, user, db):
    ids = sorted(set(group_ids or []))
    if len(ids) > 1:
        raise HTTPException(400, "A patient can belong to only one group")
    if ids:
        valid = db.query(PatientGroup).filter(PatientGroup.owner_id == user.id, PatientGroup.id.in_(ids)).count()
        if valid != len(ids): raise HTTPException(400, "Invalid patient group")
    db.query(PatientGroupMember).filter(PatientGroupMember.patient_id == patient.id).delete()
    for group_id in ids: db.add(PatientGroupMember(patient_id=patient.id, group_id=group_id))

@router.get("/patients/groups")
def list_patient_groups(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    data = db.query(PatientGroup).filter(PatientGroup.owner_id == current_user.id).order_by(PatientGroup.sort_order, PatientGroup.name).all()
    return {"code": 0, "data": [{"id": item.id, "name": item.name, "sort_order": item.sort_order} for item in data]}

@router.post("/patients/groups")
def create_patient_group(data: PatientGroupIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    name = data.name.strip()
    if not name: raise HTTPException(400, "Group name is required")
    item = PatientGroup(owner_id=current_user.id, name=name, sort_order=data.sort_order)
    db.add(item); db.commit(); db.refresh(item)
    return {"code": 0, "data": {"id": item.id, "name": item.name, "sort_order": item.sort_order}}

@router.put("/patients/groups/{group_id}")
def update_patient_group(group_id: int, data: PatientGroupIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(PatientGroup).filter(PatientGroup.id == group_id, PatientGroup.owner_id == current_user.id).first()
    if not item: raise HTTPException(404, "Group not found")
    item.name, item.sort_order = data.name.strip(), data.sort_order
    db.commit(); return {"code": 0}

@router.delete("/patients/groups/{group_id}")
def delete_patient_group(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(PatientGroup).filter(PatientGroup.id == group_id, PatientGroup.owner_id == current_user.id).first()
    if not item: raise HTTPException(404, "Group not found")
    db.delete(item); db.commit(); return {"code": 0}

@router.get("/patients")
def list_patients(q: str | None = None, group_ids: str | None = None, archived: bool = False, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = db.query(Patient).filter(Patient.owner_id == current_user.id, Patient.is_archived == archived)
    if q: query = query.filter(or_(Patient.name.contains(q), Patient.phone.contains(q), Patient.notes.contains(q)))
    requested_ids = [int(value) for value in (group_ids or "").split(",") if value.isdigit()]
    if requested_ids:
        query = query.join(PatientGroupMember).filter(PatientGroupMember.group_id.in_(requested_ids)).group_by(Patient.id).having(func.count(distinct(PatientGroupMember.group_id)) >= len(requested_ids))
    data = query.order_by(Patient.updated_at.desc()).all()
    return {"code": 0, "data": [patient_dict(item, db) for item in data]}

@router.post("/patients")
def create_patient(data: PatientIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not data.name.strip(): raise HTTPException(400, "Patient name is required")
    item = Patient(owner_id=current_user.id, **data.model_dump(exclude={"group_ids"}))
    db.add(item); db.flush(); set_patient_groups(item, data.group_ids, current_user, db); db.commit(); db.refresh(item)
    return {"code": 0, "data": patient_dict(item, db)}

@router.get("/patients/{patient_id}")
def get_patient(patient_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return {"code": 0, "data": patient_dict(patient_owned(patient_id, current_user, db), db)}

@router.put("/patients/{patient_id}")
def update_patient(patient_id: int, data: PatientIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = patient_owned(patient_id, current_user, db)
    for key, value in data.model_dump(exclude={"group_ids"}).items(): setattr(item, key, value)
    set_patient_groups(item, data.group_ids, current_user, db); db.commit(); return {"code": 0}

@router.post("/patients/{patient_id}/archive")
def archive_patient(patient_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = patient_owned(patient_id, current_user, db); item.is_archived = True; db.commit(); return {"code": 0}

@router.post("/patients/{patient_id}/restore")
def restore_patient(patient_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = patient_owned(patient_id, current_user, db); item.is_archived = False; db.commit(); return {"code": 0}

@router.delete("/patients/{patient_id}")
def purge_patient(patient_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = patient_owned(patient_id, current_user, db)
    if not item.is_archived: raise HTTPException(400, "Archive patient before permanent deletion")
    db.delete(item); db.commit(); return {"code": 0}

@router.get("/patients/{patient_id}/timeline")
def list_timeline(patient_id: int, q: str | None = None, record_type: str | None = None, date_from: datetime | None = None, date_to: datetime | None = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    patient_owned(patient_id, current_user, db)
    query = db.query(PatientTimelineEntry).filter(PatientTimelineEntry.patient_id == patient_id)
    if q: query = query.filter(or_(PatientTimelineEntry.title.contains(q), PatientTimelineEntry.content.contains(q)))
    if record_type: query = query.filter(PatientTimelineEntry.record_type == record_type)
    if date_from: query = query.filter(PatientTimelineEntry.occurred_at >= date_from)
    if date_to: query = query.filter(PatientTimelineEntry.occurred_at <= date_to)
    return {"code": 0, "data": [{"id": item.id, "record_type": item.record_type, "occurred_at": item.occurred_at.isoformat(), "title": item.title, "content": item.content, "updated_at": item.updated_at.isoformat() if item.updated_at else None} for item in query.order_by(PatientTimelineEntry.occurred_at.desc()).all()]}

@router.post("/patients/{patient_id}/timeline")
def create_timeline(patient_id: int, data: TimelineIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    patient_owned(patient_id, current_user, db, include_archived=False)
    if data.record_type not in {"visit", "diagnosis", "treatment", "examination", "followup", "condition"}: raise HTTPException(400, "Invalid record type")
    item = PatientTimelineEntry(patient_id=patient_id, **data.model_dump()); db.add(item); db.commit(); db.refresh(item)
    return {"code": 0, "data": {"id": item.id}}

@router.put("/patients/{patient_id}/timeline/{entry_id}")
def update_timeline(patient_id: int, entry_id: int, data: TimelineIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    patient_owned(patient_id, current_user, db, include_archived=False)
    item = db.query(PatientTimelineEntry).filter(PatientTimelineEntry.id == entry_id, PatientTimelineEntry.patient_id == patient_id).first()
    if not item: raise HTTPException(404, "Timeline entry not found")
    for key, value in data.model_dump().items(): setattr(item, key, value)
    db.commit(); return {"code": 0}

@router.delete("/patients/{patient_id}/timeline/{entry_id}")
def delete_timeline(patient_id: int, entry_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    patient_owned(patient_id, current_user, db, include_archived=False)
    item = db.query(PatientTimelineEntry).filter(PatientTimelineEntry.id == entry_id, PatientTimelineEntry.patient_id == patient_id).first()
    if not item: raise HTTPException(404, "Timeline entry not found")
    db.delete(item); db.commit(); return {"code": 0}

@router.get("/folders")
def list_folders(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return {"code": 0, "data": [{"id": item.id, "name": item.name, "parent_id": item.parent_id} for item in db.query(MemoFolder).filter_by(owner_id=current_user.id).order_by(MemoFolder.name).all()]}

@router.post("/folders")
def add_folder(data: FolderIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if data.parent_id is not None:
        owned(MemoFolder, data.parent_id, current_user, db)
    item = MemoFolder(owner_id=current_user.id, name=data.name.strip(), parent_id=data.parent_id)
    db.add(item); db.commit(); db.refresh(item)
    return {"code": 0, "data": {"id": item.id}}

@router.put("/folders/{folder_id}")
def update_folder(folder_id: int, data: FolderIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = owned(MemoFolder, folder_id, current_user, db)
    if data.parent_id == folder_id: raise HTTPException(400, "Folder cannot be its own parent")
    if data.parent_id is not None: owned(MemoFolder, data.parent_id, current_user, db)
    item.name, item.parent_id = data.name.strip(), data.parent_id
    db.commit(); return {"code": 0}

@router.delete("/folders/{folder_id}")
def delete_folder(folder_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = owned(MemoFolder, folder_id, current_user, db)
    if db.query(MemoFolder).filter_by(parent_id=item.id).first() or db.query(MemoFile).filter_by(folder_id=item.id).first():
        raise HTTPException(400, "Folder is not empty")
    db.delete(item); db.commit(); return {"code": 0}

@router.get("/files")
def list_files(folder_id: int | None = None, q: str | None = None, tag: str | None = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = db.query(MemoFile).filter_by(owner_id=current_user.id)
    if folder_id is not None: query = query.filter(MemoFile.folder_id == folder_id)
    if q: query = query.filter(MemoFile.name.contains(q))
    if tag: query = query.filter(MemoFile.tags.contains(tag))
    return {"code": 0, "data": [file_dict(item, current_user.nickname) for item in query.order_by(MemoFile.created_at.desc()).all()]}

@router.post("/files")
async def upload_file(file: UploadFile = File(...), folder_id: int | None = Form(None), tags: str | None = Form(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if folder_id is not None: owned(MemoFolder, folder_id, current_user, db)
    content = await file.read()
    if len(content) > MAX_FILE_SIZE: raise HTTPException(400, "文件不能超过 50MB")
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    name = os.path.basename(file.filename or "file.bin")
    stored_name = f"{uuid.uuid4().hex}{os.path.splitext(name)[1]}"
    path = os.path.join(UPLOAD_DIR, stored_name)
    with open(path, "wb") as handle: handle.write(content)
    item = MemoFile(owner_id=current_user.id, folder_id=folder_id, name=name, stored_name=stored_name, file_path=path, content_type=file.content_type or "application/octet-stream", file_size=len(content), tags=tags)
    db.add(item); db.commit(); db.refresh(item)
    return {"code": 0, "data": file_dict(item, current_user.nickname)}

@router.put("/files/{file_id}")
def update_file(file_id: int, data: FileUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = owned(MemoFile, file_id, current_user, db)
    if data.folder_id is not None: owned(MemoFolder, data.folder_id, current_user, db)
    if data.name is not None: item.name = data.name.strip()
    if "folder_id" in data.model_fields_set: item.folder_id = data.folder_id
    if "tags" in data.model_fields_set: item.tags = data.tags
    db.commit(); return {"code": 0}

@router.delete("/files/{file_id}")
def delete_file(file_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = owned(MemoFile, file_id, current_user, db)
    if os.path.exists(item.file_path): os.remove(item.file_path)
    db.delete(item); db.commit(); return {"code": 0}

@router.get("/files/{file_id}/download")
def download_file(file_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = owned(MemoFile, file_id, current_user, db)
    if not os.path.exists(item.file_path): raise HTTPException(404, "File missing")
    return FileResponse(item.file_path, filename=item.name, media_type=item.content_type)

@router.get("/favorites")
def favorites(q: str | None = None, msg_type: str | None = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = db.query(FavoriteMessage, ChatMessage, Conversation).join(ChatMessage, FavoriteMessage.chat_message_id == ChatMessage.id).join(Conversation, ChatMessage.conversation_id == Conversation.id).filter(FavoriteMessage.user_id == current_user.id)
    if q: query = query.filter(or_(ChatMessage.content.contains(q), ChatMessage.file_name.contains(q)))
    if msg_type: query = query.filter(ChatMessage.msg_type == msg_type)
    result = []
    for favorite, message, conversation in query.order_by(FavoriteMessage.created_at.desc()).all():
        result.append({"id": favorite.id, "message_id": message.id, "content": message.content, "file_name": message.file_name, "file_url": message.file_url, "download_url": chat_download_url(message.file_url), "sender_name": message.sender.nickname if message.sender else None, "msg_type": message.msg_type, "conversation_id": conversation.id, "conversation_name": conversation.group_name or "聊天", "created_at": favorite.created_at.isoformat() if favorite.created_at else None})
    return {"code": 0, "data": result}

@router.get("/shared-files")
def shared_files(q: str | None = None, conversation_id: int | None = None, tag: str | None = None, file_type: str | None = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    ids = group_ids(current_user, db)
    query = db.query(SharedFile, Conversation).join(Conversation, SharedFile.conversation_id == Conversation.id).filter(or_((Conversation.is_group == True) & Conversation.id.in_(ids), (Conversation.is_group == False) & or_(Conversation.user1_id == current_user.id, Conversation.user2_id == current_user.id)))
    if q: query = query.filter(SharedFile.file_name.contains(q))
    if conversation_id: query = query.filter(SharedFile.conversation_id == conversation_id)
    if tag: query = query.filter(SharedFile.tag.contains(tag))
    if file_type: query = query.filter(SharedFile.msg_type == file_type)
    return {"code": 0, "data": [{"id": item.id, "file_name": item.file_name, "file_size": item.file_size, "tag": item.tag, "msg_type": item.msg_type, "file_url": item.file_url, "download_url": chat_download_url(item.file_url), "sender_name": item.uploader.nickname if item.uploader else None, "conversation_id": conversation.id, "conversation_name": conversation.group_name or "聊天", "created_at": item.created_at.isoformat() if item.created_at else None} for item, conversation in query.order_by(SharedFile.created_at.desc()).all()]}

@router.get("/team/{kind}")
def team_items(kind: str, group_id: int | None = None, q: str | None = None, date_from: datetime | None = None, date_to: datetime | None = None, completed: bool | None = Query(None), file_type: str | None = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    ids = group_ids(current_user, db)
    if group_id is not None:
        if group_id not in ids: raise HTTPException(403, "Group members only")
        ids = [group_id]
    names = group_name_map(ids, db)
    if kind == "announcements":
        query = db.query(GroupAnnouncement).filter(GroupAnnouncement.conversation_id.in_(ids))
        if q: query = query.filter(or_(GroupAnnouncement.title.contains(q), GroupAnnouncement.content.contains(q)))
        if date_from: query = query.filter(GroupAnnouncement.updated_at >= date_from)
        if date_to: query = query.filter(GroupAnnouncement.updated_at <= date_to)
        data = [{"id": x.id, "group_id": x.conversation_id, "group_name": names.get(x.conversation_id), "title": x.title, "content": x.content, "source_message_id": x.source_message_id, "creator_name": (db.get(User, x.creator_id).nickname if db.get(User, x.creator_id) else None), "updated_at": x.updated_at.isoformat() if x.updated_at else None} for x in query.order_by(GroupAnnouncement.updated_at.desc()).all()]
    elif kind == "todos":
        query = db.query(GroupTodo).filter(GroupTodo.conversation_id.in_(ids))
        if q: query = query.filter(GroupTodo.title.contains(q))
        if completed is not None: query = query.filter(GroupTodo.is_completed == completed)
        if date_from: query = query.filter(GroupTodo.updated_at >= date_from)
        if date_to: query = query.filter(GroupTodo.updated_at <= date_to)
        data = [{"id": x.id, "group_id": x.conversation_id, "group_name": names.get(x.conversation_id), "title": x.title, "source_message_id": x.source_message_id, "creator_name": (db.get(User, x.creator_id).nickname if db.get(User, x.creator_id) else None), "is_completed": x.is_completed, "updated_at": x.updated_at.isoformat() if x.updated_at else None} for x in query.order_by(GroupTodo.updated_at.desc()).all()]
    elif kind == "shared-files":
        query = db.query(SharedFile).filter(SharedFile.conversation_id.in_(ids))
        if q: query = query.filter(SharedFile.file_name.contains(q))
        if file_type: query = query.filter(SharedFile.msg_type == file_type)
        if date_from: query = query.filter(SharedFile.created_at >= date_from)
        if date_to: query = query.filter(SharedFile.created_at <= date_to)
        data = [{"id": x.id, "group_id": x.conversation_id, "group_name": names.get(x.conversation_id), "file_name": x.file_name, "file_url": x.file_url, "download_url": chat_download_url(x.file_url), "sender_name": x.uploader.nickname if x.uploader else None, "msg_type": x.msg_type, "tag": x.tag, "created_at": x.created_at.isoformat() if x.created_at else None} for x in query.order_by(SharedFile.created_at.desc()).all()]
    else: raise HTTPException(404, "Unknown team section")
    return {"code": 0, "data": data}
