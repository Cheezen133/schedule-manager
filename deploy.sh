#!/bin/bash
# 日程管理系统 — 腾讯云部署脚本
# 使用方法：上传到服务器后执行 bash deploy.sh

set -e

echo "========================================"
echo "  日程管理系统 — 一键部署脚本"
echo "========================================"

# 1. 系统更新
echo "[1/7] 更新系统..."
apt update && apt upgrade -y

# 2. 安装 MySQL
echo "[2/7] 安装 MySQL..."
if ! command -v mysql &>/dev/null; then
    apt install mysql-server -y
    systemctl start mysql
    systemctl enable mysql
fi

mysql -e "
CREATE DATABASE IF NOT EXISTS schedule_manager CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'schedule'@'localhost' IDENTIFIED BY 'Schedule123!';
GRANT ALL PRIVILEGES ON schedule_manager.* TO 'schedule'@'localhost';
FLUSH PRIVILEGES;
SELECT '数据库创建成功' AS status;
"

# 3. 安装 Python
echo "[3/7] 安装 Python..."
apt install python3 python3-pip -y

# 4. 安装 Node.js 18
echo "[4/7] 安装 Node.js..."
if ! command -v node &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt install nodejs -y
fi

# 5. 安装后端依赖
echo "[5/7] 安装后端依赖..."
pip3 install pymysql
pip3 install -r requirements.txt

# 6. 构建前端
echo "[6/7] 构建前端..."
cd /root/schedule-manager/frontend
npm install
npm run build

# 7. 启动服务
echo "[7/7] 启动服务..."
cd /root/schedule-manager/backend
# 关闭旧进程
pkill -f "uvicorn app.main" 2>/dev/null || true
sleep 1
nohup python3 -m uvicorn app.main:app --host 0.0.0.0 --port 80 &

echo ""
echo "========================================"
echo "  部署完成！"
echo "  访问地址: http://$(curl -s ifconfig.me)"
echo "========================================"
