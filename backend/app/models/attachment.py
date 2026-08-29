"""
日程附件模型 — 支持拍照上传文档资料
"""
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base


class Attachment(Base):
    __tablename__ = "attachments"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    schedule_id = Column(Integer, ForeignKey("schedules.id", ondelete="CASCADE"), nullable=False, index=True, comment="关联日程ID")
    filename = Column(String(255), nullable=False, comment="原始文件名")
    stored_name = Column(String(255), nullable=False, comment="存储文件名（UUID）")
    file_path = Column(String(500), nullable=False, comment="文件存储路径")
    file_size = Column(Integer, nullable=False, comment="文件大小（字节）")
    content_type = Column(String(100), nullable=False, comment="MIME 类型")
    description = Column(String(200), nullable=True, comment="附件描述")
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=False, comment="上传者ID")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), comment="上传时间")

    # 关系
    schedule = relationship("Schedule", foreign_keys=[schedule_id], backref="attachments")
    uploader = relationship("User", foreign_keys=[uploaded_by])

    def __repr__(self):
        return f"<Attachment(id={self.id}, filename={self.filename})>"
