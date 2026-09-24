"""Explicit, repeatable database migration command.

Run from backend: ``python -m scripts.migrate_database``.
It snapshots every table changed by this release before altering it.
"""
import argparse
from datetime import datetime
from sqlalchemy import inspect, text
from app.database import Base, engine, schema_differences
import app.models  # noqa: F401 - register all model metadata


def backup_table(connection, table_name: str, tables: set[str], stamp: str):
    if table_name not in tables:
        return
    backup = f"migration_backup_{table_name}_{stamp}"
    connection.execute(text(f"CREATE TABLE {backup} AS SELECT * FROM {table_name}"))
    print(f"backup created: {backup}")


def add_column(connection, table: str, columns: set[str], name: str, definition: str):
    if name not in columns:
        connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {definition}"))
        print(f"added: {table}.{name}")


def main():
    parser = argparse.ArgumentParser(description="检查或迁移日程管理系统数据库")
    parser.add_argument("--check", action="store_true", help="仅检查结构，不修改数据库")
    args = parser.parse_args()

    if args.check:
        missing = schema_differences()
        if missing:
            print("migration required: " + ", ".join(missing))
            raise SystemExit(1)
        print("database schema is up to date")
        return

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "schedules" not in tables:
        Base.metadata.create_all(bind=engine)
        tables = set(inspect(engine).get_table_names())
    with engine.begin() as connection:
        for table in ("schedules", "conversations", "conversation_members", "chat_messages", "shared_files", "group_announcements", "group_todos", "notifications"):
            backup_table(connection, table, tables, stamp)
        schedule_columns = {item["name"] for item in inspect(engine).get_columns("schedules")}
        add_column(connection, "schedules", schedule_columns, "requires_owner_review", "BOOLEAN NOT NULL DEFAULT FALSE")
        add_column(connection, "schedules", schedule_columns, "created_by_actor", "INTEGER")
        connection.execute(text("UPDATE schedules SET visibility = 'private' WHERE visibility IS NULL OR visibility IN ('public', 'admin_only', 'hidden')"))
        if "conversations" in tables:
            columns = {item["name"] for item in inspect(engine).get_columns("conversations")}
            add_column(connection, "conversations", columns, "is_group", "BOOLEAN NOT NULL DEFAULT FALSE")
            add_column(connection, "conversations", columns, "group_name", "VARCHAR(50)")
            add_column(connection, "conversations", columns, "created_by", "INTEGER")
        if "conversation_members" in tables:
            columns = {item["name"] for item in inspect(engine).get_columns("conversation_members")}
            add_column(connection, "conversation_members", columns, "role", "VARCHAR(12) NOT NULL DEFAULT 'member'")
            connection.execute(text("UPDATE conversation_members SET role = 'member' WHERE role IS NULL OR role NOT IN ('owner', 'admin', 'member')"))
            if "conversations" in tables:
                connection.execute(text(
                    "UPDATE conversation_members cm "
                    "JOIN conversations c ON c.id = cm.conversation_id "
                    "SET cm.role = 'owner' "
                    "WHERE c.is_group = TRUE AND cm.user_id = COALESCE(c.created_by, c.user1_id)"
                ))
        if "chat_messages" in tables:
            columns = {item["name"] for item in inspect(engine).get_columns("chat_messages")}
            add_column(connection, "chat_messages", columns, "is_recalled", "BOOLEAN NOT NULL DEFAULT FALSE")
            add_column(connection, "chat_messages", columns, "recalled_at", "DATETIME")
            add_column(connection, "chat_messages", columns, "recalled_by_id", "INTEGER")
        if "shared_files" in tables:
            columns = {item["name"] for item in inspect(engine).get_columns("shared_files")}
            add_column(connection, "shared_files", columns, "content", "TEXT")
            connection.execute(text(
                "UPDATE shared_files sf JOIN chat_messages cm ON cm.id = sf.source_msg_id "
                "SET sf.content = cm.content WHERE sf.msg_type = 'text' AND sf.content IS NULL"
            ))
        for table in ("group_announcements", "group_todos"):
            if table in tables:
                columns = {item["name"] for item in inspect(engine).get_columns(table)}
                add_column(connection, table, columns, "source_message_id", "INTEGER")
        if "notifications" in tables:
            columns = {item["name"] for item in inspect(engine).get_columns("notifications")}
            add_column(connection, "notifications", columns, "related_url", "VARCHAR(300)")
    Base.metadata.create_all(bind=engine)
    missing = schema_differences()
    if missing:
        raise RuntimeError("migration incomplete: " + ", ".join(missing))
    print("migration complete")


if __name__ == "__main__":
    main()
