"""
分类服务：管理员管理分类规则
"""
from sqlalchemy.orm import Session
from ..models.category import Category
from ..schemas.category import CategoryCreate, CategoryUpdate


def create_category(db: Session, data: CategoryCreate, user_id: int) -> Category:
    """创建分类"""
    cat = Category(
        name=data.name,
        description=data.description,
        color=data.color or "#3788d8",
        icon=data.icon or "📋",
        sort_order=data.sort_order,
        created_by=user_id,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


def get_categories(db: Session, include_inactive: bool = False) -> list[Category]:
    """获取分类列表"""
    q = db.query(Category)
    if not include_inactive:
        q = q.filter(Category.is_active == True)
    return q.order_by(Category.sort_order.asc(), Category.id.asc()).all()


def get_category_by_id(db: Session, cat_id: int) -> Category | None:
    return db.query(Category).filter(Category.id == cat_id).first()


def update_category(db: Session, cat: Category, data: CategoryUpdate) -> Category:
    """更新分类"""
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(cat, field, value)
    db.commit()
    db.refresh(cat)
    return cat


def delete_category(db: Session, cat: Category):
    """删除分类（仅当没有日程关联时）"""
    from ..models.schedule import Schedule
    count = db.query(Schedule).filter(Schedule.category_id == cat.id).count()
    if count > 0:
        raise ValueError(f"该分类下有 {count} 个日程，无法删除")
    db.delete(cat)
    db.commit()


def _category_to_response(cat: Category) -> dict:
    return {
        "id": cat.id,
        "name": cat.name,
        "description": cat.description,
        "color": cat.color,
        "icon": cat.icon,
        "is_active": cat.is_active,
        "sort_order": cat.sort_order,
        "created_by": cat.created_by,
        "created_at": cat.created_at.isoformat() if cat.created_at else None,
        "updated_at": cat.updated_at.isoformat() if cat.updated_at else None,
    }
