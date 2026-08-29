# 日程管理系统

团队日程管理平台 — 支持录入、审核、日历展示和 iCal 导出。

## 功能特性

- 📱 **手机号验证码登录** — 安全便捷的身份认证
- 👥 **双角色体系** — 录入者（Writer）添加日程，阅读者（Reader）审核决定
- ✅ **审核流程** — 录入者提交 → 阅读者批准/驳回，最终决定权归阅读者
- 📅 **日历展示** — FullCalendar 月/周/日视图，日程按状态着色
- 🔴 **重要标记** — 重要日程红色高亮，置顶显示
- 📤 **iCal 导出** — 一键导出 .ics 文件，可导入 Apple/Google/Outlook 日历
- 📋 **号码复制** — 外部联系人电话一键复制

## 技术栈

- **后端**: Python FastAPI + SQLAlchemy + SQLite
- **前端**: React 18 + Vite + FullCalendar
- **认证**: JWT Token

## 快速开始

### 1. 安装后端依赖

```bash
cd backend
pip install -r requirements.txt
```

### 2. 启动后端

```bash
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. 安装前端依赖

```bash
cd frontend
npm install
```

### 4. 启动前端

```bash
cd frontend
npm run dev
```

### 5. 访问网站

打开浏览器访问 `http://localhost:5173`

## 使用说明

### 首次使用

1. 输入手机号 → 获取验证码（开发环境验证码为 `123456`）
2. 输入验证码 → 登录（首次登录自动注册为"录入者"）
3. 使用命令行工具提升为"阅读者"：

```bash
cd backend
python scripts/promote_user.py --phone 你的手机号 --role reader
```

### 录入者操作

1. 点击侧边栏「新建日程」
2. 填写日程信息（标题、时间、重要标记、外部联系人等）
3. 提交后状态为"待审核"

### 阅读者操作

1. 点击侧边栏「待审核」查看待审核列表
2. 重要日程自动置顶
3. 点击「批准」或「驳回」，可添加审核备注

### 导出日历

1. 在日历页面点击「导出 iCal」按钮
2. 下载 .ics 文件
3. 导入到 Apple 日历 / Google 日历 / Outlook

## 项目结构

```
schedule-manager/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI 入口
│   │   ├── config.py         # 配置
│   │   ├── database.py       # 数据库
│   │   ├── models/           # ORM 模型
│   │   ├── schemas/          # Pydantic 模型
│   │   ├── routers/          # API 路由
│   │   ├── services/         # 业务逻辑
│   │   └── utils/            # 工具函数
│   └── scripts/              # 命令行工具
├── frontend/
│   └── src/
│       ├── pages/            # 页面组件
│       ├── components/       # 通用组件
│       ├── api/              # API 调用
│       └── contexts/         # React Context
└── README.md
```

## 环境变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| DATABASE_URL | 数据库连接 | sqlite:///./schedule_manager.db |
| JWT_SECRET_KEY | JWT 密钥 | (开发默认值) |
| JWT_EXPIRE_HOURS | JWT 过期时间 | 24 |
| DEV_MODE | 开发模式 | true |
| CORS_ORIGINS | CORS 白名单 | http://localhost:5173 |

## 开发说明

- 开发模式验证码固定为 `123456`，后端控制台会打印验证码
- 生产环境需配置真实短信服务（阿里云/腾讯云）
- 生产环境需修改 JWT_SECRET_KEY 为强密码
