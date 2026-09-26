"""
日程管理系统 — FastAPI 应用入口
"""
import os
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from .config import APP_NAME, APP_VERSION, CORS_ORIGINS
from .database import init_db
from .routers import auth, schedules, export, categories, attachments, messages, notifications, search, dashboard, users, chat, schedule_management, memos, case_review


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期：启动时初始化数据库"""
    print(f"[INFO] {APP_NAME} v{APP_VERSION} 启动中...")
    init_db()
    print("[INFO] 数据库初始化完成")
    yield
    print("[INFO] 应用关闭")


app = FastAPI(
    title=APP_NAME,
    version=APP_VERSION,
    description="团队日程管理平台 — 支持录入、审核、日历展示和 iCal 导出",
    lifespan=lifespan,
)

# CORS 中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# 注册路由
app.include_router(auth.router)
app.include_router(schedules.router)
app.include_router(export.router)
app.include_router(categories.router)
app.include_router(attachments.router)
app.include_router(messages.router)
app.include_router(notifications.router)
app.include_router(search.router)
app.include_router(dashboard.router)
app.include_router(users.router)
app.include_router(chat.router)
app.include_router(schedule_management.router)
app.include_router(memos.router)
app.include_router(case_review.router)


@app.get("/api/v1/health", tags=["健康检查"])
async def health_check():
    """健康检查接口"""
    return {"status": "ok", "app": APP_NAME, "version": APP_VERSION}


# 生产环境：服务前端静态文件
frontend_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if frontend_dist.exists():
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        """服务前端 SPA（仅生产环境）"""
        if full_path == "api" or full_path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": "API endpoint not found"})

        file_path = (frontend_dist / full_path).resolve()
        if frontend_dist == file_path or frontend_dist in file_path.parents:
            if file_path.exists() and file_path.is_file():
                return FileResponse(file_path)

        index_file = frontend_dist / "index.html"
        if index_file.exists():
            # 非 API 地址交给前端路由处理。
            return FileResponse(index_file)

        return JSONResponse(status_code=404, content={"detail": "Frontend build not found"})
