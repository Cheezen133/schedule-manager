"""
会话标签模型 — 用户给自己的好友会话、群聊打的私人标签（一个会话可打多个标签，只有本人可见）
"""
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from ..database import Base


class ConversationTag(Base):
    __tablename__ = "conversation_tags"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    # 用户被删除时连同其标签一起删除，避免外键挡住删除用户
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True, comment="标签所有者")
    name = Column(String(20), nullable=False, comment="标签名称")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_user_conversation_tag"),
    )

    def __repr__(self):
        return f"<ConversationTag(id={self.id}, user={self.user_id}, name={self.name})>"


class ConversationTagLink(Base):
    """标签与会话的对应关系：一行表示「某个标签打在了某个会话上」"""
    __tablename__ = "conversation_tag_links"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tag_id = Column(Integer, ForeignKey("conversation_tags.id", ondelete="CASCADE"), nullable=False, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("tag_id", "conversation_id", name="uq_conversation_tag_link"),
    )

    def __repr__(self):
        return f"<ConversationTagLink(tag={self.tag_id}, conv={self.conversation_id})>"
