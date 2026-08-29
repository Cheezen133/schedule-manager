"""
认证路由：注册、登录、获取当前用户
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.auth import RegisterRequest, LoginRequest, LoginResponse, UserInfo
from ..services.auth_service import register_user, login_user, validate_password_strength
from ..dependencies import get_current_user
from ..models.user import User

router = APIRouter(prefix="/api/v1/auth", tags=["认证"])


@router.post("/register", summary="用户注册")
async def register(body: RegisterRequest, db: Session = Depends(get_db)):
    """使用用户名和密码注册新账号"""
    # 密码强度检测
    err = validate_password_strength(body.password)
    if err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err)

    user = register_user(db, body.username, body.password, body.nickname, body.phone)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="用户名已被占用，请换一个",
        )

    return {
        "code": 0,
        "message": "注册成功，请登录",
        "data": {
            "id": user.id,
            "username": user.username,
            "nickname": user.nickname,
        },
    }


@router.post("/login", response_model=LoginResponse, summary="账号密码登录")
async def login(request: LoginRequest, db: Session = Depends(get_db)):
    """使用用户名和密码登录，返回 JWT Token"""
    result = login_user(db, request.username, request.password)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
        )

    user = result["user"]
    return LoginResponse(
        access_token=result["access_token"],
        token_type="bearer",
        user=UserInfo(
            id=user.id,
            username=user.username,
            phone=user.phone,
            nickname=user.nickname,
            role=user.role,
            is_active=user.is_active,
        ),
    )


@router.get("/me", response_model=UserInfo, summary="获取当前用户信息")
async def get_me(current_user: User = Depends(get_current_user)):
    """获取当前登录用户的详细信息"""
    return UserInfo(
        id=current_user.id,
        username=current_user.username,
        phone=current_user.phone,
        nickname=current_user.nickname,
        role=current_user.role,
        is_active=current_user.is_active,
    )
