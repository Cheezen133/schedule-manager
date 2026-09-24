"""
认证相关的 Pydantic 模型
"""
from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50, description="登录账号（3-50位）")
    password: str = Field(..., min_length=8, max_length=16, description="登录密码（8-16位）")
    nickname: str = Field(..., min_length=1, max_length=50, description="显示名称")
    phone: str | None = Field(None, description="手机号（可选）")


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=50, description="登录账号")
    password: str = Field(..., min_length=1, max_length=64, description="登录密码")


class PasswordRecoveryVerifyRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=50, description="登录账号")
    nickname: str = Field(..., min_length=1, max_length=50, description="当前系统显示昵称")


class PasswordRecoveryResetRequest(BaseModel):
    recovery_token: str = Field(..., min_length=1, description="密码找回临时凭证")
    new_password: str = Field(..., min_length=8, max_length=16, description="新密码")


class UserInfo(BaseModel):
    id: int
    username: str | None = None
    phone: str | None = None
    nickname: str
    role: str
    is_active: bool

    class Config:
        from_attributes = True


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserInfo
