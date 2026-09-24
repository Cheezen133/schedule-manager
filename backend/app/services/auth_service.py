"""
认证服务：账号密码注册、登录
"""
import hashlib
import secrets
import re
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from ..models.user import User
from ..utils.security import create_access_token, create_password_recovery_token


def _hash_password(password: str) -> str:
    """使用 PBKDF2-SHA256 对密码进行加盐哈希"""
    salt = secrets.token_hex(16)
    pwd_hash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000)
    return f"pbkdf2:sha256:100000${salt}${pwd_hash.hex()}"


def _verify_password(password: str, stored_hash: str) -> bool:
    """验证密码"""
    try:
        algo, salt, hash_val = stored_hash.split("$")
        iterations = int(algo.split(":")[2])
        computed = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), iterations)
        return computed.hex() == hash_val
    except Exception:
        return False


def validate_password_strength(password: str) -> str | None:
    """
    密码强度检测
    要求：8-16位，必须包含字母和数字
    返回 None 表示通过，否则返回错误信息
    """
    if len(password) < 8:
        return "密码长度不能少于8位"
    if len(password) > 16:
        return "密码长度不能超过16位"
    if not re.search(r'[a-zA-Z]', password):
        return "密码必须包含字母"
    if not re.search(r'\d', password):
        return "密码必须包含数字"
    return None


def register_user(db: Session, username: str, password: str, nickname: str, phone: str | None = None) -> User:
    """
    注册新用户
    返回 (user, None) 表示成功，(None, error_msg) 表示失败
    """
    # 检查用户名是否已存在
    existing = db.query(User).filter(User.username == username).first()
    if existing:
        return None

    # 密码哈希
    password_hash = _hash_password(password)

    # 全新部署或清空数据后的第一个账号必须能完成系统初始化。
    # 已有用户的角色不受此逻辑影响。
    is_first_user = db.query(User.id).first() is None
    user = User(
        username=username,
        password_hash=password_hash,
        nickname=nickname,
        phone=phone,
        role="admin" if is_first_user else "writer",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def login_user(db: Session, username: str, password: str) -> dict | None:
    """
    用户名密码登录
    成功返回 {"access_token": str, "user": User}
    失败返回 None
    """
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        return None

    if not user.is_active:
        return None

    if not user.password_hash:
        return None

    if not _verify_password(password, user.password_hash):
        return None

    # 生成 JWT
    token = create_access_token({
        "sub": str(user.id),
        "username": user.username or "",
        "role": user.role,
    })

    return {"access_token": token, "user": user}


def verify_password_recovery_identity(db: Session, username: str, nickname: str) -> str | None:
    """用户名与当前昵称精确匹配且账号启用时，签发短期重置凭证。"""
    clean_username = username.strip()
    clean_nickname = nickname.strip()
    user = db.query(User).filter(User.username == clean_username).first()
    if (
        user is None
        or not user.is_active
        or user.username != clean_username
        or user.nickname != clean_nickname
    ):
        return None
    return create_password_recovery_token(user.id)


def reset_password(db: Session, user_id: int, new_password: str) -> bool:
    """为启用账号写入新的密码哈希。"""
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if user is None:
        return False
    user.password_hash = _hash_password(new_password)
    user.updated_at = datetime.now(timezone.utc)
    db.commit()
    return True
