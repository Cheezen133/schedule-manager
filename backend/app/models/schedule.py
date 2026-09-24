"""
日程模型 — 核心业务表
"""
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base


class Schedule(Base):
    __tablename__ = "schedules"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    title = Column(String(200), nullable=False, comment="日程标题")
    description = Column(Text, nullable=True, comment="详细描述")

    # 时间
    start_time = Column(DateTime, nullable=False, comment="开始时间")
    end_time = Column(DateTime, nullable=False, comment="结束时间")
    is_all_day = Column(Boolean, default=False, comment="全天事件")

    # 标记
    is_important = Column(Boolean, default=False, comment="重要标记")

    # 状态：pending(待审核) / confirmed(已确认) / rejected(已驳回) / cancelled(已取消)
    status = Column(String(20), nullable=False, default="pending", index=True, comment="日程状态")

    # 可见性：public(全员可见) / admin_only(仅管理员可见)
    visibility = Column(String(20), nullable=False, default="public", comment="可见性: public/admin_only")

    # 任务完成
    completer_name = Column(String(50), nullable=True, comment="任务完成人姓名")
    is_completed = Column(Boolean, default=False, comment="是否已完成")
    completed_at = Column(DateTime, nullable=True, comment="完成时间")

    # 创建者（录入者）
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False, comment="录入者ID")
    created_by_actor = Column(Integer, ForeignKey("users.id"), nullable=True)

    # 审核者（阅读者）
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True, comment="审核者ID")
    reviewed_at = Column(DateTime, nullable=True, comment="审核时间")
    review_comment = Column(Text, nullable=True, comment="审核备注")
    # 由获批日程管理者代为修改后，必须由日程拥有者确认
    requires_owner_review = Column(Boolean, nullable=False, default=False, comment="是否等待日程拥有者审核")

    # 外部联系人
    external_contact_name = Column(String(100), nullable=True, comment="外部联系人姓名")
    external_contact_phone = Column(String(20), nullable=True, comment="外部联系人电话")
    external_contact_wechat = Column(String(50), nullable=True, comment="外部联系人微信号")

    # 分类
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True, comment="分类ID")

    # 日历颜色
    color = Column(String(7), default="#3788d8", comment="日历显示颜色")

    # 时间戳
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), comment="创建时间")
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        comment="最后修改时间",
    )

    # 关系
    creator = relationship("User", foreign_keys=[created_by], backref="created_schedules")
    actor = relationship("User", foreign_keys=[created_by_actor])
    reviewer = relationship("User", foreign_keys=[reviewed_by], backref="reviewed_schedules")
    category = relationship("Category", foreign_keys=[category_id], backref="schedules")

    def __repr__(self):
        return f"<Schedule(id={self.id}, title={self.title}, status={self.status})>"
