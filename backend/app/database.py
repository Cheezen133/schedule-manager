"""
数据库引擎和会话工厂
"""
from datetime import datetime
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base
from .config import DATABASE_URL

connect_args = {}
engine_kwargs = {}

if DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False
else:
    # MySQL/PostgreSQL: 连接池健康检查，防止断连
    engine_kwargs["pool_pre_ping"] = True
    engine_kwargs["pool_recycle"] = 3600

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    echo=False,
    **engine_kwargs,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """
    FastAPI 依赖：每次请求获取一个数据库会话，请求结束后自动关闭
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """
    初始化数据库：创建所有表
    """
    Base.metadata.create_all(bind=engine)

    # create_all 不会为既有表新增字段；保留一个小型兼容迁移，
    # 使已部署数据库也能使用“代改后由拥有者审核”的流程。
    inspector = inspect(engine)
    if "schedules" in inspector.get_table_names():
        column_names = {column["name"] for column in inspector.get_columns("schedules")}
        if "requires_owner_review" not in column_names:
            with engine.begin() as connection:
                connection.execute(text(
                    "ALTER TABLE schedules ADD COLUMN requires_owner_review BOOLEAN NOT NULL DEFAULT FALSE"
                ))
        if "created_by_actor" not in column_names:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE schedules ADD COLUMN created_by_actor INTEGER"))
        # Old public/admin-only/hidden values were part of the retired schedule-code model.
        # Map them to the safest new rule and keep existing records private.
        with engine.begin() as connection:
            connection.execute(text("UPDATE schedules SET visibility = 'private' WHERE visibility IS NULL OR visibility IN ('public', 'admin_only', 'hidden')"))

    # 日程码已废弃：迁移先保留一份数据库内备份，再删除旧表。
    # 使用固定表名，避免任何动态 SQL 标识符注入。
    tables = set(inspect(engine).get_table_names())
    with engine.begin() as connection:
        for source, backup in (("schedule_code_accesses", "legacy_schedule_code_accesses_backup"), ("schedule_codes", "legacy_schedule_codes_backup")):
            if source in tables:
                if backup not in tables:
                    connection.execute(text(f"CREATE TABLE {backup} AS SELECT * FROM {source}"))
                connection.execute(text(f"DROP TABLE {source}"))

    if "conversations" in inspector.get_table_names():
        column_names = {column["name"] for column in inspector.get_columns("conversations")}
        migrations = {
            "is_group": "ALTER TABLE conversations ADD COLUMN is_group BOOLEAN NOT NULL DEFAULT FALSE",
            "group_name": "ALTER TABLE conversations ADD COLUMN group_name VARCHAR(50)",
            "created_by": "ALTER TABLE conversations ADD COLUMN created_by INTEGER",
        }
        with engine.begin() as connection:
            for column_name, statement in migrations.items():
                if column_name not in column_names:
                    connection.execute(text(statement))

    # 群成员角色：建群者为群主，旧群其余成员为普通成员；缺失建群者时以 user1 兜底。
    if "conversation_members" in inspector.get_table_names():
        member_columns = {column["name"] for column in inspector.get_columns("conversation_members")}
        with engine.begin() as connection:
            if "role" not in member_columns:
                connection.execute(text("ALTER TABLE conversation_members ADD COLUMN role VARCHAR(12) NOT NULL DEFAULT 'member'"))
            connection.execute(text("UPDATE conversation_members SET role = 'member' WHERE role IS NULL OR role NOT IN ('owner', 'admin', 'member')"))
            connection.execute(text("UPDATE conversation_members SET role = 'owner' WHERE user_id = COALESCE((SELECT created_by FROM conversations WHERE conversations.id = conversation_members.conversation_id), (SELECT user1_id FROM conversations WHERE conversations.id = conversation_members.conversation_id)) AND EXISTS (SELECT 1 FROM conversations WHERE conversations.id = conversation_members.conversation_id AND conversations.is_group = TRUE)"))

    # 消息撤回字段：保留原记录用于双方显示撤回占位，但不再返回原始内容。
    if "chat_messages" in inspector.get_table_names():
        message_columns = {column["name"] for column in inspector.get_columns("chat_messages")}
        recall_migrations = {
            "is_recalled": "ALTER TABLE chat_messages ADD COLUMN is_recalled BOOLEAN NOT NULL DEFAULT FALSE",
            "recalled_at": "ALTER TABLE chat_messages ADD COLUMN recalled_at DATETIME",
            "recalled_by_id": "ALTER TABLE chat_messages ADD COLUMN recalled_by_id INTEGER",
        }
        with engine.begin() as connection:
            for column_name, statement in recall_migrations.items():
                if column_name not in message_columns:
                    connection.execute(text(statement))

    for table_name in ("group_announcements", "group_todos"):
        if table_name in inspector.get_table_names():
            column_names = {column["name"] for column in inspector.get_columns(table_name)}
            if "source_message_id" not in column_names:
                with engine.begin() as connection:
                    connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN source_message_id INTEGER"))

    # 将旧版的通用病例备忘迁移为可追溯的病人档案与时间轴记录；只在尚无新病人档案时执行。
    if "notifications" in inspector.get_table_names():
        column_names = {column["name"] for column in inspector.get_columns("notifications")}
        if "related_url" not in column_names:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE notifications ADD COLUMN related_url VARCHAR(300)"))

    if "memo_cases" in tables and "patients" in tables and "patient_timeline_entries" in tables:
        from .models.memo import MemoCase, Patient, PatientTimelineEntry
        session = SessionLocal()
        try:
            if session.query(Patient).count() == 0:
                for legacy in session.query(MemoCase).all():
                    patient = Patient(owner_id=legacy.owner_id, name=legacy.title, notes=legacy.content, created_at=legacy.created_at, updated_at=legacy.updated_at)
                    session.add(patient)
                    session.flush()
                    session.add(PatientTimelineEntry(patient_id=patient.id, record_type="condition", occurred_at=legacy.updated_at or legacy.created_at or datetime.utcnow(), title="历史病例备忘", content=legacy.content, created_at=legacy.created_at, updated_at=legacy.updated_at))
                session.commit()
        finally:
            session.close()
