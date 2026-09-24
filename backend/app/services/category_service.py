"""个人日程分类服务。"""
from sqlalchemy.orm import Session
from ..utils.datetime_utils import to_beijing_iso
from ..models.category import Category
from ..schemas.category import CategoryCreate, CategoryUpdate


def create_category(db: Session, data: CategoryCreate, user_id: int) -> Category:
    """为指定日程拥有者创建个人分类。"""
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


def get_categories(db: Session, owner_id: int, include_inactive: bool = False) -> list[Category]:
    """获取指定日程拥有者的个人分类列表。"""
    q = db.query(Category).filter(Category.created_by == owner_id)
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
    """删除分类；原有日程保留并转为未分类。"""
    from ..models.schedule import Schedule
    db.query(Schedule).filter(Schedule.category_id == cat.id).update(
        {"category_id": None}, synchronize_session=False
    )
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
        "owner_id": cat.created_by,
        "created_at": to_beijing_iso(cat.created_at),
        "updated_at": to_beijing_iso(cat.updated_at),
    }
