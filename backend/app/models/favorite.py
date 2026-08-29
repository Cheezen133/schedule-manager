"""
收藏模型 — 用户收藏聊天消息
"""
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from ..database import Base


class FavoriteMessage(Base):
    __tablename__ = "favorite_messages"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    chat_message_id = Column(Integer, ForeignKey("chat_messages.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("user_id", "chat_message_id", name="uq_user_msg_fav"),
    )

    user = relationship("User")
    message = relationship("ChatMessage")

    def __repr__(self):
        return f"<FavoriteMessage(id={self.id}, user={self.user_id}, msg={self.chat_message_id})>"
