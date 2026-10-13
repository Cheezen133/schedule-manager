"""
命令行工具：调整用户角色（admin 管理员 / reader 审核员 / writer 录入员）
用法（在 backend 目录下运行）：
    python scripts/promote_user.py --username localadmin --role admin   # 按登录用户名查找（推荐）
    python scripts/promote_user.py --phone 13812345678 --role reader    # 按手机号查找（注册时填了手机号才能用）
    python scripts/promote_user.py --list                               # 列出所有用户
"""
import sys
import os
import argparse

# 添加项目路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database import SessionLocal
from app.models.user import User


def promote_user(role: str, username: str | None = None, phone: str | None = None):
    """把指定用户调整为指定角色：按用户名查找（同时给了手机号时以用户名为准），或按手机号查找"""
    if role not in ("admin", "reader", "writer"):
        print(f"[ERROR] 无效的角色: {role}，只能是 admin、reader 或 writer")
        sys.exit(1)

    # 现在注册时手机号是选填的，按用户名查找才能覆盖所有账号
    label = f"用户名为 {username}" if username else f"手机号为 {phone}"
    db = SessionLocal()
    try:
        query = db.query(User)
        user = query.filter(User.username == username).first() if username else query.filter(User.phone == phone).first()
        if user is None:
            print(f"[ERROR] 未找到{label} 的用户")
            sys.exit(1)

        old_role = user.role
        user.role = role
        db.commit()

        role_name = {"admin": "管理员", "reader": "阅读者", "writer": "录入者"}.get(role, role)
        print(f"[OK] 用户 {user.nickname}（{user.username or user.phone}）的角色已从 {old_role} 变更为 {role_name}")
    except Exception as e:
        db.rollback()
        print(f"[ERROR] 操作失败: {str(e)}")
        sys.exit(1)
    finally:
        db.close()


def list_users():
    """列出所有用户；没填用户名或手机号的显示为「-」"""
    db = SessionLocal()
    try:
        users = db.query(User).all()
        if not users:
            print("暂无用户")
            return

        print(f"\n{'ID':<6} {'用户名':<14} {'手机号':<16} {'昵称':<12} {'角色':<8} {'状态'}")
        print("-" * 72)
        for u in users:
            role_name = {"admin": "管理员", "reader": "阅读者", "writer": "录入者"}.get(u.role, u.role)
            status = "启用" if u.is_active else "禁用"
            # 手机号、用户名都可能为空：先换成「-」再排版，否则格式化空值会直接报错
            print(f"{u.id:<6} {(u.username or '-'):<14} {(u.phone or '-'):<16} {u.nickname:<12} {role_name:<8} {status}")
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="用户角色管理工具")
    parser.add_argument("--username", type=str, help="登录用户名（推荐）")
    parser.add_argument("--phone", type=str, help="手机号")
    parser.add_argument("--role", type=str, choices=["admin", "reader", "writer"], help="目标角色")
    parser.add_argument("--list", action="store_true", help="列出所有用户")

    args = parser.parse_args()

    if args.list:
        list_users()
    elif (args.username or args.phone) and args.role:
        promote_user(args.role, username=args.username, phone=args.phone)
    else:
        parser.print_help()
        sys.exit(1)
