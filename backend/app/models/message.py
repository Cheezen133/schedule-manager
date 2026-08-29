"""
客户沟通消息模型 — 文字 + 语音记录
"""
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    schedule_id = Column(Integer, ForeignKey("schedules.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=True, comment="文字内容（type=text 时必填）")
    msg_type = Column(String(10), nullable=False, default="text", comment="消息类型: text / voice")
    voice_url = Column(String(500), nullable=True, comment="语音文件相对路径")
    voice_duration = Column(Integer, nullable=True, comment="语音时长（秒）")
    is_from_client = Column(Integer, default=0, comment="是否来自客户（0=我方, 1=客户）")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # 关系
    schedule = relationship("Schedule", foreign_keys=[schedule_id])
    sender = relationship("User", foreign_keys=[sender_id])

    def __repr__(self):
        return f"<Message(id={self.id}, type={self.msg_type})>"
