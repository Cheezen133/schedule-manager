"""
注册邀请码 — 管理员生成发放，注册时必须提供有效邀请码
"""
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Integer, String

from ..database import Base


class InviteCode(Base):
    __tablename__ = "invite_codes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(16), unique=True, nullable=False, index=True)
    max_uses = Column(Integer, nullable=False, default=1)  # 可用次数；用完即失效
    used_count = Column(Integer, nullable=False, default=0)
    note = Column(String(100), nullable=True)  # 备注：发给谁、干什么用
    disabled = Column(Boolean, nullable=False, default=False)  # 管理员手动停用
    created_by = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    @property
    def is_available(self):
        return not self.disabled and self.used_count < self.max_uses
