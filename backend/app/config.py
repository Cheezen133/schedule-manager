"""
应用配置模块
所有配置从环境变量读取，开发环境使用 .env 文件
"""
import os
from dotenv import load_dotenv

load_dotenv()

# 数据库
DATABASE_URL = os.getenv("DATABASE_URL", "mysql+pymysql://schedule:Schedule123%21@localhost:3306/schedule_manager")

# JWT
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret-key-change-in-production-min-64-chars-long!!")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "24"))

# 验证码
VERIFICATION_CODE_LENGTH = 6
VERIFICATION_CODE_EXPIRE_MINUTES = 5
# 开发模式：固定验证码
DEV_MOCK_CODE = "123456"
DEV_MODE = os.getenv("DEV_MODE", "true").lower() == "true"

# CORS
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")

# 应用
APP_NAME = "日程管理系统"
APP_VERSION = "1.0.0"
