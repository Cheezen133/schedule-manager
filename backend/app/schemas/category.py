"""
分类相关的 Pydantic 模型
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class CategoryCreate(BaseModel):
    """创建分类的请求体"""
    name: str = Field(..., min_length=1, max_length=50, description="分类名称")
    description: Optional[str] = Field(None, max_length=200, description="分类描述")
    color: Optional[str] = Field("#3788d8", max_length=7, description="分类颜色")
    icon: Optional[str] = Field("📋", max_length=10, description="分类图标")
    sort_order: int = Field(0, description="排序顺序")


class CategoryUpdate(BaseModel):
    """更新分类的请求体"""
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class CategoryResponse(BaseModel):
    """分类响应体"""
    id: int
    name: str
    description: Optional[str] = None
    color: str
    icon: str
    is_active: bool
    sort_order: int
    created_by: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
