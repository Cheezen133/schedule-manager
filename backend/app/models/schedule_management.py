from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from ..database import Base


class ScheduleManagementPermission(Base):
    __tablename__ = "schedule_management_permissions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    requester_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    status = Column(String(12), nullable=False, default="pending", index=True)
    requested_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    resolved_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True, index=True)

    owner = relationship("User", foreign_keys=[owner_id])
    requester = relationship("User", foreign_keys=[requester_id])

    __table_args__ = (UniqueConstraint("owner_id", "requester_id", name="uq_schedule_management_pair"),)


class ScheduleViewer(Base):
    __tablename__ = "schedule_viewers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    schedule_id = Column(Integer, ForeignKey("schedules.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    user = relationship("User")
    __table_args__ = (UniqueConstraint("schedule_id", "user_id", name="uq_schedule_viewer"),)
