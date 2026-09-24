"""
FastAPI 依赖注入：数据库会话、当前用户、角色校验
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from .database import get_db
from .utils.security import decode_access_token
from .models.user import User

# HTTP Bearer 认证方案
security_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    从 JWT Token 中解析当前登录用户
    未登录返回 401
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="请先登录",
        )

    token = credentials.credentials
    try:
        payload = decode_access_token(token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="登录已过期，请重新登录",
        )

    user_id = payload.get("sub")
    if user_id is None or payload.get("token_type", "access") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的登录凭证",
        )

    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在或已被禁用",
        )

    return user


ROLE_NAMES = {"admin": "管理员", "reader": "阅读者", "writer": "录入者"}


def require_role(role: str):
    """
    角色校验依赖工厂 — 要求精确匹配
    用法: Depends(require_role("admin"))
    """

    def role_checker(current_user: User = Depends(get_current_user)):
        if current_user.role != role:
            role_name = ROLE_NAMES.get(role, role)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"此操作需要「{role_name}」权限",
            )
        return current_user

    return role_checker


def require_any_role(*roles: str):
    """
    角色校验依赖工厂 — 满足任一角色即可
    用法: Depends(require_any_role("admin", "writer"))
    """

    def role_checker(current_user: User = Depends(get_current_user)):
        if current_user.role not in roles:
            role_names = " / ".join(ROLE_NAMES.get(r, r) for r in roles)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"此操作需要「{role_names}」权限",
            )
        return current_user

    return role_checker
