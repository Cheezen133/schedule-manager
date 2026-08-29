"""
日程相关的 Pydantic 模型
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class ScheduleCreate(BaseModel):
    """创建日程的请求体"""
    title: str = Field(..., min_length=1, max_length=200, description="日程标题")
    description: Optional[str] = Field(None, description="详细描述")
    start_time: datetime = Field(..., description="开始时间")
    end_time: datetime = Field(..., description="结束时间")
    is_all_day: bool = Field(False, description="是否全天事件")
    is_important: bool = Field(False, description="是否重要日程")
    category_id: Optional[int] = Field(None, description="分类ID")
    visibility: Optional[str] = Field("private", max_length=20, description="private / managers / selected / hidden")
    viewer_ids: list[int] = Field(default_factory=list)
    completer_name: Optional[str] = Field(None, max_length=50, description="任务完成人")
    external_contact_name: Optional[str] = Field(None, max_length=100, description="外部联系人姓名")
    external_contact_phone: Optional[str] = Field(None, max_length=20, description="外部联系人电话")
    external_contact_wechat: Optional[str] = Field(None, max_length=50, description="外部联系人微信号")
    color: Optional[str] = Field("#3788d8", max_length=7, description="日历显示颜色")


class ScheduleUpdate(BaseModel):
    """更新日程的请求体"""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    is_all_day: Optional[bool] = None
    is_important: Optional[bool] = None
    category_id: Optional[int] = None
    visibility: Optional[str] = None
    viewer_ids: Optional[list[int]] = None
    completer_name: Optional[str] = None
    is_completed: Optional[bool] = None
    external_contact_name: Optional[str] = None
    external_contact_phone: Optional[str] = None
    external_contact_wechat: Optional[str] = None
    color: Optional[str] = None


class ScheduleResponse(BaseModel):
    """日程响应体"""
    id: int
    title: str
    description: Optional[str]
    start_time: datetime
    end_time: datetime
    is_all_day: bool
    is_important: bool
    status: str
    created_by: int
    creator_name: Optional[str] = None
    reviewed_by: Optional[int] = None
    reviewer_name: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_comment: Optional[str] = None
    completer_name: Optional[str] = None
    is_completed: bool = False
    completed_at: Optional[datetime] = None
    external_contact_name: Optional[str] = None
    external_contact_phone: Optional[str] = None
    external_contact_wechat: Optional[str] = None
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    category_color: Optional[str] = None
    visibility: Optional[str] = "public"
    color: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ReviewAction(BaseModel):
    """审核操作请求体"""
    comment: Optional[str] = Field(None, description="审核备注")


class ApiResponse(BaseModel):
    """统一 API 响应格式"""
    code: int = 0
    message: str = "ok"
    data: Optional[dict | list] = None
