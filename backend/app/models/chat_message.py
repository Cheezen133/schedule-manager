"""
聊天消息模型 — 支持文字/图片/视频/文件
"""
from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=True, comment="文字内容（media时的可选说明）")
    msg_type = Column(String(10), nullable=False, default="text", comment="text / image / video / file")
    file_url = Column(String(500), nullable=True, comment="媒体文件相对路径")
    file_name = Column(String(200), nullable=True, comment="原始文件名")
    file_size = Column(Integer, nullable=True, comment="文件大小(字节)")
    is_recalled = Column(Boolean, nullable=False, default=False, index=True)
    recalled_at = Column(DateTime, nullable=True)
    recalled_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    conversation = relationship("Conversation", backref="messages")
    # 撤回操作者同样关联 users，必须明确发送者使用的外键，
    # 否则 SQLAlchemy 无法判断 sender 应连接到 sender_id 还是 recalled_by_id。
    sender = relationship("User", foreign_keys=[sender_id])
    recalled_by = relationship("User", foreign_keys=[recalled_by_id])

    def __repr__(self):
        return f"<ChatMessage(id={self.id}, type={self.msg_type}, sender={self.sender_id})>"
