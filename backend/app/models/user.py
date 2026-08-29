"""
用户模型
"""
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from ..database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    username = Column(String(50), unique=True, nullable=True, index=True, comment="登录账号")
    password_hash = Column(String(128), nullable=True, comment="密码哈希")
    phone = Column(String(20), unique=True, nullable=True, index=True, comment="手机号")
    nickname = Column(String(50), nullable=False, comment="显示名称")
    role = Column(String(10), nullable=False, default="writer", comment="角色: admin / reader / writer")
    is_active = Column(Boolean, default=True, comment="账户是否启用")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), comment="注册时间")
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        comment="最后修改时间",
    )

    def __repr__(self):
        return f"<User(id={self.id}, username={self.username}, role={self.role})>"
