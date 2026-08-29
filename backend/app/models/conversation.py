"""
会话模型 — 一对一会话
"""
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from ..database import Base


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    user1_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True, comment="参与者1")
    user2_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True, comment="参与者2")
    remark_by_user1 = Column(String(50), nullable=True, comment="user1给user2的备注名")
    remark_by_user2 = Column(String(50), nullable=True, comment="user2给user1的备注名")
    last_read_by_user1 = Column(DateTime, nullable=True, comment="user1最后阅读时间")
    last_read_by_user2 = Column(DateTime, nullable=True, comment="user2最后阅读时间")
    is_accepted = Column(Integer, default=0, comment="是否已互为好友(1=是,0=否)")
    is_group = Column(Boolean, nullable=False, default=False)
    group_name = Column(String(50), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    user1 = relationship("User", foreign_keys=[user1_id])
    user2 = relationship("User", foreign_keys=[user2_id])
    creator = relationship("User", foreign_keys=[created_by])

    def __repr__(self):
        return f"<Conversation(id={self.id}, u1={self.user1_id}, u2={self.user2_id})>"


class ConversationMember(Base):
    __tablename__ = "conversation_members"

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    role = Column(String(12), nullable=False, default="member", index=True)
    joined_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_read_at = Column(DateTime, nullable=True)

    __table_args__ = (UniqueConstraint("conversation_id", "user_id", name="uq_conversation_member"),)

    conversation = relationship("Conversation", backref="members")
    user = relationship("User")
