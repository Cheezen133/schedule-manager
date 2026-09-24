"""Back up and reset the configured application database.

Run from ``backend`` only when all application data should be removed:
``python -m scripts.reset_database --confirm-reset``.
"""
from __future__ import annotations

import argparse
import os
import subprocess
from datetime import datetime
from pathlib import Path

from sqlalchemy import inspect, text
from sqlalchemy.engine import make_url

from app.config import DATABASE_URL
from app.database import Base, engine
import app.models  # noqa: F401 - register all model tables before recreating them


def backup_database() -> Path:
    """Create a SQL dump without printing the database password."""
    url = make_url(DATABASE_URL)
    backup_dir = Path(__file__).resolve().parents[2] / "database_backups"
    backup_dir.mkdir(exist_ok=True)
    backup_file = backup_dir / f"{url.database}_{datetime.now():%Y%m%d_%H%M%S}.sql"
    environment = os.environ.copy()
    environment["MYSQL_PWD"] = url.password or ""
    command = [
        "mysqldump",
        "--single-transaction",
        "--routines",
        "--events",
        "-h", url.host or "localhost",
        "-P", str(url.port or 3306),
        "-u", url.username or "root",
        url.database,
    ]
    with backup_file.open("wb") as output:
        result = subprocess.run(command, stdout=output, stderr=subprocess.PIPE, env=environment, check=False)
    if result.returncode:
        backup_file.unlink(missing_ok=True)
        error = result.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"数据库备份失败，未执行清空：{error}")
    return backup_file


def reset_database():
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    preparer = engine.dialect.identifier_preparer
    with engine.begin() as connection:
        if engine.dialect.name == "mysql":
            connection.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
        try:
            for table in tables:
                connection.execute(text(f"DROP TABLE {preparer.quote(table)}"))
        finally:
            if engine.dialect.name == "mysql":
                connection.execute(text("SET FOREIGN_KEY_CHECKS = 1"))
    Base.metadata.create_all(bind=engine)


def main():
    parser = argparse.ArgumentParser(description="备份并清空当前应用数据库")
    parser.add_argument("--confirm-reset", action="store_true", help="确认删除当前数据库的全部应用数据")
    args = parser.parse_args()
    url = make_url(DATABASE_URL)
    if not args.confirm_reset:
        print(f"当前目标数据库：{url.database}（{url.host or 'localhost'}）")
        print("此操作会删除其中所有表和数据。确认后请使用 --confirm-reset。")
        return
    if engine.dialect.name != "mysql":
        raise RuntimeError("重置脚本仅允许操作 MySQL 数据库")
    backup_file = backup_database()
    print(f"备份完成：{backup_file}")
    reset_database()
    print("数据库已清空并重建为当前版本；请重新注册第一个管理员账号。")


if __name__ == "__main__":
    main()
