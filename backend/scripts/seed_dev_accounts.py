"""本地开发测试账号：一键建出一组固定的测试账号，只对本地 SQLite 开发库生效。

用法（在 backend 目录下运行）：
    python -m scripts.seed_dev_accounts            # 建出缺少的测试账号
    python -m scripts.seed_dev_accounts --dry-run  # 试运行：只检查、不写入任何东西，先看看会做什么

它会做的四件事：
1. 安全闸：只允许连接 SQLite（本地开发库）。连的是 MySQL 等其他数据库（例如服务器上的
   生产库、沙盒库）时直接拒绝退出——本脚本随仓库公开，绝不能把测试账号建进线上。
2. 空库先建表：SQLite 库里缺表时按模型定义补建（只建缺的表，不改已有的表和数据）。
   这样全新克隆只要建好 .env、跑这一条命令就能用。
3. 共用密码：所有测试账号共用一个密码，保存在本机 .env 的 DEV_SEED_PASSWORD（.env 不入库）。
   .env 里还没有时，自动随机生成一个，连同账号清单注释一起追加写入。脚本全程不在屏幕上打印密码。
4. 建账号：清单里缺少的账号就新建并设好角色；已经存在的账号原样跳过，不改密码、不改角色，
   因此可以放心反复运行。
"""
import argparse
import os
import secrets
import string
import sys

from dotenv import find_dotenv
from sqlalchemy import inspect
from sqlalchemy.engine import make_url

from app.config import DATABASE_URL  # 只读取配置（导入时会自动读取 .env），不会连接数据库

# 测试账号清单：（登录用户名, 显示昵称, 系统角色）
# 系统角色：admin 管理员 / reader 审核员（批准、驳回日程）/ writer 录入员（录入日程）
# 病历审阅里的身份（管理者、审阅人、录入员、查看者）是在每个审阅项目里单独分配的，不在这里设置
DEV_ACCOUNTS = [
    ("localadmin", "本地管理员", "admin"),
    ("reader1", "测试审核员", "reader"),
    ("writer1", "测试录入员甲", "writer"),
    ("writer2", "测试录入员乙", "writer"),
]

# .env 里保存共用密码的变量名
PASSWORD_KEY = "DEV_SEED_PASSWORD"


def ensure_sqlite():
    """安全闸：当前数据库不是 SQLite 就拒绝运行。

    只打印数据库类型（如 mysql），不打印完整连接串——服务器上的连接串里含数据库密码。
    """
    backend_name = make_url(DATABASE_URL).get_backend_name()
    if backend_name != "sqlite":
        print(f"[ERROR] 当前连接的是 {backend_name} 数据库，本脚本只允许在本地 SQLite 开发库上运行。")
        print("        测试账号随仓库公开，不能建进服务器上的生产库或沙盒库。")
        sys.exit(1)


# 安全闸必须在导入数据库层之前执行：app.database 一被导入就会按连接串创建数据库引擎，
# 所以先在这里拦下非 SQLite 的情况，让生产库、沙盒库连引擎都不会被创建
ensure_sqlite()

from app.database import Base, SessionLocal, engine  # noqa: E402 - 故意放在安全闸之后
from app.models.user import User  # noqa: E402
from app.services.auth_service import register_user, validate_password_strength  # noqa: E402
import app.models  # noqa: E402,F401 - 注册全部模型，补建表时才能建全


def sqlite_file_exists():
    """判断 SQLite 库文件是否已经存在。

    试运行时要先问这一句：SQLite 一旦连接，就会在磁盘上创建一个空库文件，
    而试运行承诺不写入任何东西，所以库文件不存在时试运行不能去连接它。
    """
    path = make_url(DATABASE_URL).database
    # 内存库（:memory:）或没写路径时不存在"文件"一说，视为已存在、可以连接
    if not path or path == ":memory:":
        return True
    # 相对路径（如 ./schedule_manager.db）按当前所在目录解析，与 SQLAlchemy 的做法一致
    return os.path.exists(path)


def ensure_tables(dry_run):
    """找出库里缺少的表；正式运行时把它们补建出来。返回缺少的表名列表。

    create_all 只会创建不存在的表，已有的表和其中的数据完全不动。
    """
    existing = set(inspect(engine).get_table_names())
    missing = [table.name for table in Base.metadata.sorted_tables if table.name not in existing]
    if missing and not dry_run:
        Base.metadata.create_all(bind=engine)
    return missing


def generate_password():
    """随机生成一个符合系统密码规则的密码（8-16 位，必须同时含字母和数字）。

    组成：固定前缀 Dev + 8 位随机字母数字 + 1 位随机数字，共 12 位，保证字母、数字都有。
    """
    alphabet = string.ascii_letters + string.digits
    return "Dev" + "".join(secrets.choice(alphabet) for _ in range(8)) + secrets.choice(string.digits)


def load_or_create_password(dry_run):
    """取出测试账号的共用密码；.env 里没有就生成一个并追加写入 .env。

    返回 (密码, 给人看的说明文字)。说明文字里不含密码本身。
    """
    password = os.getenv(PASSWORD_KEY)
    if password:
        # .env 里已有密码：先按系统规则校验，避免建出用规则外密码的账号
        error = validate_password_strength(password)
        if error:
            print(f"[ERROR] .env 里的 {PASSWORD_KEY} 不符合系统密码规则：{error}")
            sys.exit(1)
        return password, f"沿用 .env 中已有的 {PASSWORD_KEY}"

    # .env 里没有密码：找到 .env 文件的位置（从本脚本所在目录逐级往上找，与后端读取 .env 的方式一致）
    env_path = find_dotenv()
    if not env_path:
        print("[ERROR] 没找到 .env 文件，无法保存测试密码；请先按 AGENTS.md「本地运行」一节建好 .env。")
        sys.exit(1)

    password = generate_password()
    if dry_run:
        return password, f"将随机生成新密码，追加写入 {env_path} 的 {PASSWORD_KEY}（试运行，未写入）"

    # 追加写入 .env：原文件末尾没有换行时先补一个，避免和最后一行粘在一起
    with open(env_path, "r", encoding="utf-8") as f:
        content = f.read()
    with open(env_path, "a", encoding="utf-8") as f:
        if content and not content.endswith("\n"):
            f.write("\n")
        # 顺带写一份账号清单作为注释：打开 .env 就能看到有哪些测试账号、共用的是哪个密码
        f.write("\n# 本地测试账号（scripts/seed_dev_accounts.py 生成；仅本机使用，.env 不入库）\n")
        for username, nickname, role in DEV_ACCOUNTS:
            f.write(f"#   {username:<12} {nickname:<8} {role}\n")
        f.write("# 以上账号共用下面这个密码\n")
        f.write(f"{PASSWORD_KEY}={password}\n")
    return password, f"已随机生成新密码，写入 {env_path} 的 {PASSWORD_KEY}"


def seed_accounts(password, dry_run, can_query):
    """按清单逐个检查账号：缺的新建并设好角色，已存在的原样跳过。

    can_query 为 False 表示库文件或 users 表还不存在（只会出现在试运行里），
    这时无法查询，直接把所有账号报告为"将新建"。
    返回每个账号的 (用户名, 昵称, 角色, 处理结果) 列表，用于最后打印。
    """
    rows = []
    if not can_query:
        return [(username, nickname, role, "将新建") for username, nickname, role in DEV_ACCOUNTS]

    db = SessionLocal()
    try:
        for username, nickname, role in DEV_ACCOUNTS:
            user = db.query(User).filter(User.username == username).first()
            if user:
                # 已存在：一律不改，只在角色和清单不一致时提醒一句
                result = "已存在，跳过"
                if user.role != role:
                    result += f"（当前角色为 {user.role}，与清单中的 {role} 不同，未修改）"
            elif dry_run:
                result = "将新建"
            else:
                # 复用系统自己的注册逻辑（密码加密方式与正常注册完全一致），注册后再把角色设成清单里的
                user = register_user(db, username, password, nickname)
                if user is None:
                    result = "已存在，跳过"
                else:
                    if user.role != role:
                        user.role = role
                        db.commit()
                    result = "已新建"
            rows.append((username, nickname, role, result))
    finally:
        db.close()
    return rows


def main():
    parser = argparse.ArgumentParser(description="建本地开发测试账号（只对本地 SQLite 库生效）")
    parser.add_argument("--dry-run", action="store_true", help="试运行：只检查、不写入，先看看会建哪些表和账号")
    args = parser.parse_args()
    dry_run = args.dry_run

    # 第 1 步（安全闸）已在文件开头、导入数据库层之前完成

    # 第 2 步：检查并补建缺少的表
    if dry_run and not sqlite_file_exists():
        # 试运行且库文件还不存在：不能连接（会创建文件），所有表都算缺少
        missing_tables = [table.name for table in Base.metadata.sorted_tables]
        can_query = False
    else:
        missing_tables = ensure_tables(dry_run)
        # 试运行时缺 users 表就没法查账号；正式运行时表已补建，可以查
        can_query = not (dry_run and "users" in missing_tables)

    # 第 3 步：取出（或生成）共用密码
    password, password_note = load_or_create_password(dry_run)

    # 第 4 步：按清单建账号
    rows = seed_accounts(password, dry_run, can_query)

    # 打印结果（不含密码）
    if dry_run:
        print("[试运行] 以下只是检查结果，没有写入任何内容。")
    print(f"数据库：本地 SQLite（{make_url(DATABASE_URL).database}）")
    if missing_tables:
        action = "将补建" if dry_run else "已补建"
        print(f"建表：{action} {len(missing_tables)} 张缺少的表")
    else:
        print("建表：表结构齐全，无需补建")
    print(f"密码：{password_note}（脚本不打印密码，需要时到 .env 查看）")
    print("账号：")
    for username, nickname, role, result in rows:
        print(f"  {username:<12} {nickname:<8} {role:<7} {result}")


if __name__ == "__main__":
    main()
