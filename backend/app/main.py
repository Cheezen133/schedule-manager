"""
日程管理系统 — FastAPI 应用入口
"""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import APP_NAME, APP_VERSION, CORS_ORIGINS
from .database import init_db
from .routers import auth, schedules, export, categories, attachments, messages, notifications, search, dashboard, users, chat, schedule_management, memos


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


@app.get("/api/v1/health", tags=["健康检查"])
async def health_check():
    """健康检查接口"""
    return {"status": "ok", "app": APP_NAME, "version": APP_VERSION}


# 生产环境：服务前端静态文件
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
if os.path.exists(frontend_dist):
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        """服务前端 SPA（仅生产环境）"""
        import os as _os
        file_path = _os.path.join(frontend_dist, full_path)
        if _os.path.exists(file_path) and not _os.path.isdir(file_path):
            from fastapi.responses import FileResponse
            return FileResponse(file_path)

        from fastapi.responses import FileResponse
        return FileResponse(_os.path.join(frontend_dist, "index.html"))
