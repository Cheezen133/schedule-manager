# 日程管理系统

团队日程管理平台（React + FastAPI + MySQL）。

## 功能特性

**日程核心**
- 📱 手机号验证码登录，JWT 认证
- 👥 三角色体系：`admin` / `reader`（审核批准、驳回）/ `writer`（录入日程）
- 📅 FullCalendar 月/周/日视图，日程按状态着色，重要日程红色置顶
- 📤 iCal 导出（.ics 可导入 Apple/Google/Outlook 日历）
- 📋 外部联系人电话一键复制、微信跳转

**协作模块**
- 💬 独立聊天：私聊/群聊、图片/PDF/语音多媒体消息、共享文件、收藏
- 📝 备忘录：个人备忘、团队备忘、文件归档、收藏夹
- 🏥 患者管理：患者档案、分组、时间线
- 📋 病历审阅：审阅项目、病例文件、批注、结论、日报
- 📱 移动端适配（MobileActionSheet、长按手势等）

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Python FastAPI + SQLAlchemy + Pydantic |
| 数据库 | MySQL（生产，`schedule_manager` 库）/ SQLite（本地开发可用） |
| 前端 | React 18 + Vite + React Router 6 + FullCalendar + axios |
| 认证 | JWT（手机号 + 验证码） |

## 项目结构

```
schedule-manager/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI 入口
│   │   ├── config.py        # 配置（读 .env）
│   │   ├── models/          # ORM 模型（user/schedule/chat/memo/patient/case_review...）
│   │   ├── schemas/         # Pydantic 模型
│   │   ├── routers/         # API 路由（auth/schedules/chat/memos/case_review/...）
│   │   ├── services/        # 业务逻辑
│   │   └── utils/           # JWT 等工具
│   ├── scripts/             # 命令行工具（如 promote_user.py 提升角色）
│   └── uploads/             # 用户上传文件（gitignored，含患者资料，严禁入库）
├── frontend/
│   └── src/
│       ├── pages/           # 页面组件
│       ├── components/      # layout/schedule/calendar/chat/memo/caseReview/mobile
│       ├── api/             # axios 调用封装（baseURL /api/v1）
│       ├── contexts/        # AuthContext
│       └── hooks/ utils/
├── backup.sh                # 数据备份（MySQL 全库 + uploads）
├── update.sh                # 一键部署（备份→拉代码→构建→发布→重启→健康检查）
└── AGENTS.md                # AI 代理工作指引（数据红线、部署流程）
```

## 本地开发

```bash
# 后端（127.0.0.1 调试，公网访问请走 SSH 隧道）
cd backend && pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000   # API 文档: /docs

# 前端
cd frontend && npm install && npm run dev    # http://localhost:5173
```

- 开发模式（`DEV_MODE=true`）验证码固定 `123456`
- 首次登录默认为 `writer`，提升角色：
  `cd backend && python scripts/promote_user.py --phone 手机号 --role admin`

## 生产部署（当前线上架构）

单台服务器，nginx 443 → 前端静态（`/var/www/schedule-manager/`）+ `/api` 反代 FastAPI（systemd 服务 `schedule-manager`，127.0.0.1:8080）。

```bash
# 日常上线（在服务器项目根目录）
git switch main && git merge dev && git push origin main
bash update.sh        # 自动：备份→拉代码→装依赖→构建→发布→重启→健康检查
```

> ⚠️ 所有操作规范（尤其**用户数据红线**）见 [AGENTS.md](AGENTS.md)。

## 环境变量

配置通过 `.env` 读取（真实生产配置只存在于服务器，不进仓库）：

| 变量 | 说明 | 生产值示例 |
|---|---|---|
| `DATABASE_URL` | 数据库连接 | `mysql+pymysql://user:***@localhost:3306/schedule_manager` |
| `JWT_SECRET_KEY` | JWT 签名密钥 | 64 位以上随机字符串 |
| `JWT_EXPIRE_HOURS` | 令牌有效期 | 168 |
| `DEV_MODE` | 开发模式（固定验证码） | false |
| `CORS_ORIGINS` | 跨域白名单 | `*` |
