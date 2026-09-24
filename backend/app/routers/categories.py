"""个人日程分类路由。"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.category import CategoryCreate, CategoryUpdate
from ..services.category_service import (
    create_category,
    get_categories,
    get_category_by_id,
    update_category,
    delete_category,
    _category_to_response,
)
from ..dependencies import get_current_user
from ..models.user import User
from ..services.schedule_management_service import is_effective_manager

router = APIRouter(prefix="/api/v1", tags=["分类管理"])


def require_category_owner_access(db: Session, current_user: User, owner_id: int) -> User:
    owner = db.query(User).filter(User.id == owner_id, User.is_active == True).first()
    if not owner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")
    if not is_effective_manager(db, current_user.id, owner_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="没有该用户的有效日程管理权限")
    return owner


@router.get("/categories", summary="获取分类列表")
async def list_categories(
    include_inactive: bool = False,
    owner_id: int | None = Query(None, description="日程拥有者ID，默认当前用户"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """本人或有效日程管理者查看个人分类。"""
    target_id = owner_id or current_user.id
    require_category_owner_access(db, current_user, target_id)
    cats = get_categories(db, target_id, include_inactive)
    return {
        "code": 0,
        "message": "ok",
        "data": [_category_to_response(c) for c in cats],
    }


@router.post("/categories", summary="创建个人分类")
async def create_new_category(
    data: CategoryCreate,
    owner_id: int | None = Query(None, description="分类拥有者ID，默认当前用户"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    target_id = owner_id or current_user.id
    require_category_owner_access(db, current_user, target_id)
    cat = create_category(db, data, target_id)
    return {
        "code": 0,
        "message": "分类创建成功",
        "data": _category_to_response(cat),
    }


@router.put("/categories/{cat_id}", summary="编辑个人分类")
async def edit_category(
    cat_id: int,
    data: CategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cat = get_category_by_id(db, cat_id)
    if not cat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="分类不存在")
    require_category_owner_access(db, current_user, cat.created_by)
    cat = update_category(db, cat, data)
    return {
        "code": 0,
        "message": "分类已更新",
        "data": _category_to_response(cat),
    }


@router.delete("/categories/{cat_id}", summary="删除个人分类")
async def remove_category(
    cat_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cat = get_category_by_id(db, cat_id)
    if not cat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="分类不存在")
    require_category_owner_access(db, current_user, cat.created_by)
    delete_category(db, cat)
    return {"code": 0, "message": "分类已删除，原有日程已转为未分类", "data": None}
