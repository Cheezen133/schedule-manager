from datetime import datetime, timezone
from sqlalchemy import BigInteger, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from ..database import Base


# 病历审阅板块：病历和每日汇报都归属某个项目，只有项目成员和管理员能看。
# 指向用户的列不设外键：账号注销后审阅记录仍保留（界面显示为已注销用户），也不会挡住注销。
class ReviewProject(Base):
    __tablename__ = "review_projects"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    created_by = Column(Integer, nullable=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class ReviewProjectMember(Base):
    __tablename__ = "review_project_members"
    __table_args__ = (UniqueConstraint("project_id", "user_id", name="uq_review_project_member"),)
    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("review_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


# 一份病历：同一项目内编号唯一；reviewer_id 是被指派的审阅人（必须是项目成员）
class ReviewCase(Base):
    __tablename__ = "review_cases"
    __table_args__ = (UniqueConstraint("project_id", "code", name="uq_review_case_code"),)
    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("review_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    code = Column(String(50), nullable=False)
    title = Column(String(200), nullable=True)
    note = Column(Text, nullable=True)
    reviewer_id = Column(Integer, nullable=True, index=True)
    created_by = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class ReviewCaseFile(Base):
    __tablename__ = "review_case_files"
    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(Integer, ForeignKey("review_cases.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    stored_name = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    content_type = Column(String(100), nullable=True)
    file_size = Column(BigInteger, nullable=False, default=0)
    uploaded_by = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


# 批注不写进 PDF：位置按页面宽高的比例存（0–1），点注的宽高为 0
class ReviewAnnotation(Base):
    __tablename__ = "review_annotations"
    id = Column(Integer, primary_key=True, autoincrement=True)
    file_id = Column(Integer, ForeignKey("review_case_files.id", ondelete="CASCADE"), nullable=False, index=True)
    page = Column(Integer, nullable=False)
    kind = Column(String(10), nullable=False, default="point")
    x = Column(Float, nullable=False)
    y = Column(Float, nullable=False)
    width = Column(Float, nullable=False, default=0)
    height = Column(Float, nullable=False, default=0)
    content = Column(Text, nullable=False)
    author_id = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


# 结论按「病历 × 审阅人」各存一份；decision 取 include / exclude / pending
class ReviewConclusion(Base):
    __tablename__ = "review_conclusions"
    __table_args__ = (UniqueConstraint("case_id", "reviewer_id", name="uq_review_conclusion"),)
    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(Integer, ForeignKey("review_cases.id", ondelete="CASCADE"), nullable=False, index=True)
    reviewer_id = Column(Integer, nullable=False, index=True)
    decision = Column(String(10), nullable=False)
    diagnosis = Column(Text, nullable=True)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class ReviewDailyReport(Base):
    __tablename__ = "review_daily_reports"
    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("review_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id = Column(Integer, nullable=False)
    report_date = Column(Date, nullable=False, index=True)
    content = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class ReviewDailyReportFile(Base):
    __tablename__ = "review_daily_report_files"
    id = Column(Integer, primary_key=True, autoincrement=True)
    report_id = Column(Integer, ForeignKey("review_daily_reports.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    stored_name = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    content_type = Column(String(100), nullable=True)
    file_size = Column(BigInteger, nullable=False, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


# 操作日志：查看或下载 PDF、保存结论、删除病历或文件。不设外键，删掉项目后日志仍保留
class ReviewLog(Base):
    __tablename__ = "review_logs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Integer, nullable=False, index=True)
    case_id = Column(Integer, nullable=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    action = Column(String(30), nullable=False)
    detail = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
