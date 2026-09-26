"""
JWT 编解码工具
"""
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from ..config import JWT_SECRET_KEY, JWT_ALGORITHM, JWT_EXPIRE_HOURS


def create_access_token(data: dict, *, persistent: bool = False) -> str:
    """
    创建 JWT 访问令牌
    data 应包含: sub (user_id), phone, role
    """
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    to_encode.update({
        "iat": now,
        "token_type": "access",
        "auto_login": persistent,
    })
    if not persistent:
        to_encode["exp"] = now + timedelta(hours=JWT_EXPIRE_HOURS)
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return encoded_jwt


def create_password_recovery_token(user_id: int) -> str:
    """创建仅供密码重置使用的 10 分钟临时令牌。"""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": f"password-recovery:{user_id}",
        "token_type": "password_recovery",
        "iat": now,
        "exp": now + timedelta(minutes=10),
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_password_recovery_token(token: str) -> int:
    """验证密码找回令牌并返回用户 ID；普通登录令牌不能通过。"""
    payload = decode_access_token(token)
    subject = payload.get("sub", "")
    if payload.get("token_type") != "password_recovery" or not str(subject).startswith("password-recovery:"):
        raise JWTError("无效的密码找回凭证")
    try:
        return int(str(subject).split(":", 1)[1])
    except (TypeError, ValueError, IndexError) as error:
        raise JWTError("无效的密码找回凭证") from error


def decode_access_token(token: str) -> dict:
    """
    解码 JWT 令牌，返回 payload
    如果令牌无效或过期，抛出 JWTError
    """
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError as e:
        raise JWTError(f"Token 验证失败: {str(e)}")
