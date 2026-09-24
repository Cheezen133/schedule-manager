"""
数据库引擎和会话工厂
"""
from sqlalchemy import create_engine, inspect
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


def schema_differences() -> list[str]:
    """Return missing application tables/columns without changing the database."""
    inspector = inspect(engine)
    actual_tables = set(inspector.get_table_names())
    missing = []
    for table in Base.metadata.sorted_tables:
        if table.name not in actual_tables:
            missing.append(table.name)
            continue
        actual_columns = {column["name"] for column in inspector.get_columns(table.name)}
        missing.extend(
            f"{table.name}.{column.name}"
            for column in table.columns
            if column.name not in actual_columns
        )
    return missing


def init_db():
    """启动时完整检查数据库；结构变更必须由显式迁移脚本完成。"""
    missing = schema_differences()
    if missing:
        raise RuntimeError(
            "数据库迁移未完成: " + ", ".join(missing)
            + "；请先运行 python -m scripts.migrate_database"
        )
