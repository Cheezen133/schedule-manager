"""
日程分类模型
"""
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    name = Column(String(50), nullable=False, comment="分类名称")
    description = Column(String(200), nullable=True, comment="分类描述")
    color = Column(String(7), default="#3788d8", comment="分类颜色")
    icon = Column(String(10), default="📋", comment="分类图标")
    is_active = Column(Boolean, default=True, comment="是否启用")
    sort_order = Column(Integer, default=0, comment="排序顺序")
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False, comment="分类拥有者ID")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), comment="创建时间")
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        comment="最后修改时间",
    )

    # 关系
    creator = relationship("User", foreign_keys=[created_by], backref="created_categories")

    def __repr__(self):
        return f"<Category(id={self.id}, name={self.name})>"
