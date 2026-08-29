@echo off
chcp 65001 >nul
title 日程管理系统

echo ========================================
echo    日程管理系统 - 启动脚本
echo ========================================
echo.

:: 检查 Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到 Python，请先安装 Python 3.10+
    pause
    exit /b 1
)

:: 检查 Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到 Node.js，请先安装 Node.js 16+
    pause
    exit /b 1
)

:: 安装后端依赖
echo [1/4] 安装后端依赖...
cd backend
pip install -r requirements.txt -i https://pypi.org/simple/ --quiet
if %errorlevel% neq 0 (
    echo [错误] 后端依赖安装失败
    pause
    exit /b 1
)

:: 安装前端依赖
echo [2/4] 安装前端依赖...
cd ..\frontend
npm install --silent
if %errorlevel% neq 0 (
    echo [错误] 前端依赖安装失败
    pause
    exit /b 1
)

:: 启动后端
echo [3/4] 启动后端服务 (端口 8000)...
cd ..\backend
start "日程管理-后端" cmd /c "python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

:: 等待后端就绪
echo 等待后端启动...
timeout /t 3 /nobreak >nul

:: 启动前端
echo [4/4] 启动前端服务 (端口 5173)...
cd ..\frontend
start "日程管理-前端" cmd /c "npx vite --host 0.0.0.0 --port 5173"

echo.
echo ========================================
echo   启动成功！
echo   前端: http://localhost:5173
echo   后端: http://localhost:8000
echo   API文档: http://localhost:8000/docs
echo ========================================
echo.
echo 首次使用：
echo   1. 打开 http://localhost:5173
echo   2. 输入手机号登录（验证码: 123456）
echo   3. 双击运行 promote_first_admin.bat 设置管理员
echo.

pause
