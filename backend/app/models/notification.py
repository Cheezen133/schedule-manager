from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base

class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    content = Column(Text, nullable=True)
    type = Column(String(30), nullable=False, default="system")
    related_schedule_id = Column(Integer, ForeignKey("schedules.id"), nullable=True)
    related_url = Column(String(300), nullable=True)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    user = relationship("User", foreign_keys=[user_id], backref="notifications")
    schedule = relationship("Schedule", foreign_keys=[related_schedule_id])

    def __repr__(self):
        return f"<Notification(id={self.id}, type={self.type}, read={self.is_read})>"
