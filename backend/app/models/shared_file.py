"""
共享文件模型 — 对话级别的文件共享
"""
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base


class SharedFile(Base):
    __tablename__ = "shared_files"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    uploader_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    file_url = Column(String(500), nullable=False, comment="文件路径")
    file_name = Column(String(200), nullable=False, comment="文件名")
    file_size = Column(Integer, nullable=True, comment="文件大小(字节)")
    msg_type = Column(String(10), nullable=False, default="file", comment="image / video / file")
    tag = Column(String(50), nullable=True, comment="标签")
    note = Column(String(500), nullable=True, comment="备注")
    content = Column(Text, nullable=True, comment="共享文字消息正文")
    source_msg_id = Column(Integer, ForeignKey("chat_messages.id", ondelete="SET NULL"), nullable=True, comment="来源于聊天消息ID")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    conversation = relationship("Conversation", backref="shared_files")
    uploader = relationship("User")
    source_msg = relationship("ChatMessage", foreign_keys=[source_msg_id])

    def __repr__(self):
        return f"<SharedFile(id={self.id}, {self.file_name})>"
