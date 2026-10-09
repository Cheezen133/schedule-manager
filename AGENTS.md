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
| 从旧 Mac 克隆 push | 该克隆含已清除的旧历史（患者文件+密钥），push 会让清除白做 |

## 架构与路径

| 组件 | 位置 | 说明 |
|---|---|---|
| 前端源码 | `frontend/` | React 18 + Vite，`npm run dev` 本地调试 |
| 前端线上产物 | `/var/www/schedule-manager/` | 由 update.sh 从 dist 拷贝；**不是** git 管的 dist/ |
| 后端 | `backend/` | FastAPI，systemd 服务 `schedule-manager`，监听 127.0.0.1:8080 |
| nginx | `/etc/nginx/` | ruiyu.work 443/80 → 静态 + `/api` 反代 8080 |
| 运行配置 | `.env`（gitignored） | 服务实际读取的配置；`.env.production` 仅是历史模板，已从仓库清除 |
| 备份 | `database_backups/`（gitignored） | 只保留最新一份（库 56K + uploads 121M） |

分支约定：`main` = 线上运行版本；`dev` = 日常开发；`server-snapshot` = 历史本地快照（**仅本地，永不推送**）。

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

# 后端本地调试（只绑 127.0.0.1，用完 kill；公网调试走 SSH 隧道）
cd backend && python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# 数据库只读排查（凭据在 .env 的 DATABASE_URL）
mysql -u schedule -p schedule_manager -e "SELECT ..."
```

## 标准开发流程

```
git switch dev → 改代码 → 涉及后端则先 bash backup.sh 自测
→ git add -A && git commit && git push origin dev
→ 确认后：git switch main && git merge dev && git push origin main
→ bash update.sh 部署并自动验证
```

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

## 其他注意

- 服务器内存仅 1.9GB，npm build 期间避免并行跑其他重任务
- 本机访问 GitHub 网速慢，git clone/fetch 需要耐心或加 --depth
- `deploy.sh` 是废弃的初装脚本（含 apt upgrade 和旧密码），不要使用
