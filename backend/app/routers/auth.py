"""
认证路由：注册、登录、获取当前用户
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.auth import RegisterRequest, LoginRequest, LoginResponse, UserInfo, PasswordRecoveryVerifyRequest, PasswordRecoveryResetRequest
from ..services.auth_service import register_user, login_user, validate_password_strength, verify_password_recovery_identity, reset_password
from ..utils.security import decode_password_recovery_token
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
    result = login_user(db, request.username, request.password, request.auto_login)
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


@router.post("/password-recovery/verify", summary="验证密码找回身份")
async def verify_password_recovery(body: PasswordRecoveryVerifyRequest, db: Session = Depends(get_db)):
    token = verify_password_recovery_identity(db, body.username, body.nickname)
    if token is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="用户名或显示昵称不正确")
    return {
        "code": 0,
        "message": "身份验证成功",
        "data": {"recovery_token": token, "expires_in": 600},
    }


@router.post("/password-recovery/reset", summary="重置账号密码")
async def recover_password(body: PasswordRecoveryResetRequest, db: Session = Depends(get_db)):
    password_error = validate_password_strength(body.new_password)
    if password_error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=password_error)
    try:
        user_id = decode_password_recovery_token(body.recovery_token)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="找回凭证无效或已过期，请重新验证")
    if not reset_password(db, user_id, body.new_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="找回凭证无效或账号已被禁用")
    return {"code": 0, "message": "密码重置成功，请使用新密码登录", "data": None}


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
