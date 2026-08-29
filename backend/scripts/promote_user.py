"""
命令行工具：提升用户角色（Writer → Reader）
用法：python scripts/promote_user.py --phone 13812345678 --role reader
"""
import sys
import os
import argparse

# 添加项目路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database import SessionLocal
from app.models.user import User


def promote_user(phone: str, role: str):
    """将指定手机号的用户提升为指定角色"""
    if role not in ("admin", "reader", "writer"):
        print(f"[ERROR] 无效的角色: {role}，只能是 admin、reader 或 writer")
        sys.exit(1)

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.phone == phone).first()
        if user is None:
            print(f"[ERROR] 未找到手机号为 {phone} 的用户")
            sys.exit(1)

        old_role = user.role
        user.role = role
        db.commit()

        role_name = {"admin": "管理员", "reader": "阅读者", "writer": "录入者"}.get(role, role)
        print(f"[OK] 用户 {user.nickname} ({phone}) 的角色已从 {old_role} 变更为 {role_name}")
    except Exception as e:
        db.rollback()
        print(f"[ERROR] 操作失败: {str(e)}")
        sys.exit(1)
    finally:
        db.close()


def list_users():
    """列出所有用户"""
    db = SessionLocal()
    try:
        users = db.query(User).all()
        if not users:
            print("暂无用户")
            return

        print(f"\n{'ID':<6} {'手机号':<16} {'昵称':<12} {'角色':<8} {'状态'}")
        print("-" * 60)
        for u in users:
            role_name = {"admin": "管理员", "reader": "阅读者", "writer": "录入者"}.get(u.role, u.role)
            status = "启用" if u.is_active else "禁用"
            print(f"{u.id:<6} {u.phone:<16} {u.nickname:<12} {role_name:<8} {status}")
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="用户角色管理工具")
    parser.add_argument("--phone", type=str, help="手机号")
    parser.add_argument("--role", type=str, choices=["admin", "reader", "writer"], help="目标角色")
    parser.add_argument("--list", action="store_true", help="列出所有用户")

    args = parser.parse_args()

    if args.list:
        list_users()
    elif args.phone and args.role:
        promote_user(args.phone, args.role)
    else:
        parser.print_help()
        sys.exit(1)
