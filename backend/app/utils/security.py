"""
JWT 编解码工具
"""
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from ..config import JWT_SECRET_KEY, JWT_ALGORITHM, JWT_EXPIRE_HOURS


def create_access_token(data: dict) -> str:
    """
    创建 JWT 访问令牌
    data 应包含: sub (user_id), phone, role
    """
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS)
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return encoded_jwt


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
