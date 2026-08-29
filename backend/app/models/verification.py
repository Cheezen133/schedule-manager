"""
验证码和审计日志模型
"""
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey
from ..database import Base


class VerificationCode(Base):
    __tablename__ = "verification_codes"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    phone = Column(String(20), nullable=False, index=True, comment="目标手机号")
    code = Column(String(6), nullable=False, comment="6位验证码")
    expires_at = Column(DateTime, nullable=False, comment="过期时间")
    used = Column(Boolean, default=False, comment="是否已使用")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), comment="创建时间")

    def __repr__(self):
        return f"<VerificationCode(id={self.id}, phone={self.phone})>"


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    schedule_id = Column(Integer, ForeignKey("schedules.id"), nullable=False, comment="关联日程ID")
    action = Column(
        String(30),
        nullable=False,
        comment="操作类型: created/confirmed/rejected/edited/cancelled",
    )
    performed_by = Column(Integer, ForeignKey("users.id"), nullable=False, comment="操作者ID")
    detail = Column(Text, nullable=True, comment="操作详情")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), comment="操作时间")

    def __repr__(self):
        return f"<AuditLog(id={self.id}, action={self.action})>"
