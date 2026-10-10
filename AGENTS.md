# AGENTS.md — AI 代理工作指引

> 本文件面向在此仓库工作的 AI 编码代理（以及人类协作者）。
> 读完全文再动手，尤其是「红线」一节。

## 项目身份

**日程管理系统**：React + Vite 前端 / FastAPI 后端 / MySQL。
**本机就是生产服务器**，线上地址 https://ruiyu.work （nginx 443 → 前端静态 + 反代 API）。
仓库：`Cheezen133/schedule-manager`（公开），origin 已配置，gh CLI 已认证（账号 Cheezen133）。

## 🔴 红线（违反即事故，无例外）

用户数据只存在于两处，**任何操作都不允许丢失或破坏**：

1. **MySQL `schedule_manager` 库**（127.0.0.1:3306，14+ 用户，含聊天、病历评审、患者管理数据）
2. **`backend/uploads/`**（254 个用户上传文件：患者 PDF、聊天图片、语音，约 128MB）

因此，以下操作**绝对禁止**：

| 禁止 | 原因 |
|---|---|
| `git clean -xfd` | 会连 .gitignore 忽略的 uploads/、.env 一起删掉 |
| `rm -rf backend/uploads/`、清空数据库 | 直接销毁用户数据 |
| `DROP TABLE` / `TRUNCATE` | 改表只用增量 `ALTER TABLE ... ADD COLUMN` |
| `git add -f` 强制添加被忽略路径 | 会把患者数据推上公开 GitHub |
| 拷贝前端到 /var/www 时使用 `--delete`（rsync）| `pdfjs/` 等资源不在构建产物里，会被误删 |
| 直接杀 8080 端口的 uvicorn / 改动 systemd 单元 | 那是线上服务，只能 `systemctl restart schedule-manager` |
| 从旧克隆（Mac / Windows 历史目录）push | 旧目录含已清除的患者文件与密钥，push 会让清除白做；一律全新克隆 |
| 在 worktree 里连生产库 `schedule_manager` | worktree 的 .env 已指向沙盒库 `schedule_manager_dev`，勿改回；测试写入必须只进沙盒 |
| 在主目录 `/root/schedule-manager` 直接改代码测试 | 主目录锁定 main 供线上运行；改动一律在 worktree `/root/schedule-manager-dev` |

## 架构与路径

| 组件 | 位置 | 说明 |
|---|---|---|
| **主目录（生产）** | `/root/schedule-manager` | **锁定 main 分支**，线上服务从这里跑，日常不在此改代码 |
| **开发 worktree** | `/root/schedule-manager-dev` | **dev 分支**，所有修改、测试在这里进行 |
| 前端源码 | `frontend/` | React 18 + Vite，`npm run dev` 本地调试 |
| 前端线上产物 | `/var/www/schedule-manager/` | 由 update.sh 从 dist 拷贝；**不是** git 管的 dist/ |
| 后端 | `backend/` | FastAPI，systemd 服务 `schedule-manager`，监听 127.0.0.1:8080 |
| 沙盒数据库 | MySQL `schedule_manager_dev` | 从生产备份克隆，**开发测试只准连它** |
| nginx | `/etc/nginx/` | ruiyu.work 443/80 → 静态 + `/api` 反代 8080 |
| 运行配置 | `.env`（gitignored） | 主目录 .env=生产库；worktree .env=沙盒库（两者独立，勿混） |
| 备份 | `database_backups/`（gitignored） | 只保留最新一份（库 56K + uploads 121M） |

分支约定：`main` = 线上运行版本（主目录）；`dev` = 日常开发（worktree）；`server-snapshot` = 历史本地快照（**仅本地，永不推送**）。

## 常用命令

```bash
# 上线部署（内部自动：备份→拉代码→装依赖→构建→发布→重启→健康检查，失败给回滚命令）
bash update.sh            # 部署 main
bash update.sh dev        # 部署 dev

# 手动备份（改动涉及数据库或单独调试后端前，必须先跑）
bash backup.sh

# 服务管理
systemctl status|restart schedule-manager
journalctl -u schedule-manager -n 50 --no-pager   # 后端日志

# 健康检查
curl https://ruiyu.work/api/v1/health

# 后端测试实例（在 worktree 里跑，只连沙盒库 schedule_manager_dev，用完 kill）
cd /root/schedule-manager-dev/backend
python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# 前端开发服务器（worktree 里，vite 代理已指向 8000）
cd /root/schedule-manager-dev/frontend && npm run dev   # http://localhost:5173

# 数据库只读排查（凭据在 .env 的 DATABASE_URL）
mysql -u schedule -p schedule_manager -e "SELECT ..."
```

## 标准开发流程（worktree 模式）

```
1. 在 /root/schedule-manager-dev（dev 分支）里改代码
2. 测试：worktree 里起 uvicorn 8000（连沙盒库）+ npm run dev，浏览器验证
3. git add -A && git commit -m "说明" && git push origin dev
4. 敲定后合并部署（回到主目录）：
   cd /root/schedule-manager
   git merge dev && git push origin main
   bash update.sh        # 自动：备份→拉代码→构建→发布→重启→健康检查
5. worktree 同步下一轮：cd /root/schedule-manager-dev && git merge main
```

## 开发端协作规范（Mac / Windows）

> 协作架构：**GitHub 是唯一中转站**。开发端（Mac / Windows）与生产服务器从不直接通信，
> 一切代码经由 GitHub 的分支同步；上线口子只有一个——服务器上的 `update.sh`。

### 铁律

1. **只用全新克隆的仓库工作**。历史旧目录（无论 Mac 还是 Windows）可能包含已被清除的
   患者文件与密钥，从旧目录 push 会让全站的隐私清除工作作废。旧目录仅作只读参考，永不 push。
2. **只在 `dev` 分支开发**。`main` 仅由服务器端合并部署，开发端不碰、不推 `main`。
3. **开工先拉**：`git pull origin dev`，避免与其他端改动冲突。
4. **开发端不做任何部署动作**，不碰生产服务器、数据库、域名。

### 日常循环（各端相同）

```bash
git pull origin dev          # 1. 开工前同步
# ...改代码...               # 2. 修改（克隆不含任何真实用户数据，可放心折腾）
git add -A
git commit -m "改动说明"
git push origin dev          # 3. 推回 GitHub，服务器端会自行拉取合并
```

### 本地运行（可选）

克隆中不含 `.env`（被 .gitignore 排除）。本地跑后端前先自建 `.env`（项目根目录）：

```
DATABASE_URL=sqlite:///./schedule_manager.db
JWT_SECRET_KEY=本地随便一个长随机串
DEV_MODE=true
```

与服务器环境完全隔离，互不影响。

**Windows**：创建好 `.env` 后，双击仓库根目录的 `start.bat` 一键启动
（自动装依赖 → 起 backend:8000 + frontend:5173 两个窗口）。
首次使用前建议设置换行符，避免 CRLF 污染 diff：

```bat
git config --global core.autocrlf true
```

**Mac**：`python3 -m uvicorn app.main:app --port 8000`（backend 目录）+ `npm run dev`（frontend 目录），
或自写启动脚本；`.env` 也可指向本地 MySQL。

### 上线流程（仅服务器执行，此处仅备查）

服务器端：`git merge dev → bash update.sh`（自动备份→构建→发布→重启→健康检查）。
开发端的改动在服务器合并部署后，各端经 `git pull` 回流，形成闭环。

## 数据库变更流程（最高危场景）

1. `bash backup.sh`，确认 database_backups/ 出现新文件
2. 只写增量迁移（ADD COLUMN / 新表），禁止 DROP/RENAME 现有列
3. 迁移后抽查核心表行数（users、schedules、chat_messages）
4. 库中 `migration_backup_*` 表是历史迁移保护现场，不要清理

## 已知问题（用户知情并决定暂不处理）

- 公开仓库历史曾泄露 JWT_SECRET_KEY（与线上 .env 同值），用户选择不轮换、仓库保持公开
- GitHub 对已清除旧提交的 raw 缓存可能仍可访问一段时间，待其自然过期

## 回滚

```bash
# 代码：git reset --hard <commit> && systemctl restart schedule-manager
# 前端：重新 npm run build 后 cp -r frontend/dist/* /var/www/schedule-manager/
# 数据：gunzip < database_backups/schedule_manager_*.sql.gz | mysql -u schedule -p schedule_manager
```

## 通用编码行为准则

- **先想后写**：动手前说明假设；有多种理解时列出来问，不要默默选一个；有更简单的方案要说
- **最小改动**：只解决被要求的问题；不顺手“优化”无关代码、注释、格式；每一行改动都应能追溯到需求
- **风格跟随**：与现有代码风格保持一致，即使你有不同偏好；发现无关的坏味道只提及、不擅动
- **可验证地工作**：把任务转成可验证的目标（改 bug → 先复现 → 修到不复现）；多步任务先列计划，每步带验证方式

## 其他注意

- 服务器内存仅 1.9GB，npm build 期间避免并行跑其他重任务
- 本机访问 GitHub 网速慢，git clone/fetch 需要耐心或加 --depth
- `deploy.sh` 是废弃的初装脚本（含 apt upgrade 和旧密码），不要使用
