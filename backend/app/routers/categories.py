"""
分类管理路由（管理员专属）
"""
from fastapi import APIRouter, Depends, HTTPException, status
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
from ..dependencies import get_current_user, require_role
from ..models.user import User

router = APIRouter(prefix="/api/v1", tags=["分类管理"])


@router.get("/categories", summary="获取分类列表")
async def list_categories(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """所有人可查看分类列表"""
    cats = get_categories(db, include_inactive)
    return {
        "code": 0,
        "message": "ok",
        "data": [_category_to_response(c) for c in cats],
    }


@router.post("/categories", summary="创建分类（管理员）")
async def create_new_category(
    data: CategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """管理员创建新分类"""
    cat = create_category(db, data, current_user.id)
    return {
        "code": 0,
        "message": "分类创建成功",
        "data": _category_to_response(cat),
    }


@router.put("/categories/{cat_id}", summary="编辑分类（管理员）")
async def edit_category(
    cat_id: int,
    data: CategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """管理员编辑分类"""
    cat = get_category_by_id(db, cat_id)
    if not cat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="分类不存在")
    cat = update_category(db, cat, data)
    return {
        "code": 0,
        "message": "分类已更新",
        "data": _category_to_response(cat),
    }


@router.delete("/categories/{cat_id}", summary="删除分类（管理员）")
async def remove_category(
    cat_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """管理员删除分类（仅当无日程关联时）"""
    cat = get_category_by_id(db, cat_id)
    if not cat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="分类不存在")
    try:
        delete_category(db, cat)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return {"code": 0, "message": "分类已删除", "data": None}
