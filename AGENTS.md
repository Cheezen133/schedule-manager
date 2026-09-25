# AGENTS.md — schedule-manager

日程管理系统（FastAPI 后端 + React 前端）。fork 自 Cheezen133/schedule-manager，现为独立私有仓库，原仓库留作 `upstream` 远端。本文件只做目录，方法和进度在路由表指向的文件里。

<!-- BEGIN DEFAULTS -->
## 操作默认

准入判据：违反只造成可返工的浪费，且触发点在动作之前。不可逆损坏归铁律，触发点可观察归路由，纯个人风格归 memory，判不出就问用户。

- 只写被要求的功能：不为一次性代码做抽象，不加没要求的配置项，不为不可能发生的情况写错误处理。
- 自己这次改动造成的无用 import、变量、函数，同一次删掉。
- 新代码沿用所在文件的写法（命名、注释密度、组织方式），即使你有更顺手的写法。
- 修后端 bug 先在 `backend/tests/` 写出能复现的测试再修；后端改完跑 `cd backend && .venv/bin/python -m unittest discover -s tests`。
- 后端命令一律用 `backend/.venv/bin/python`，依赖只装在这个虚拟环境里。
- 本地启动后端前确认根目录 `.env` 把 `DATABASE_URL` 指向 SQLite：代码默认连 MySQL，启动时也不会自动建表（缺表会报错并提示跑迁移），README 和 `环境说明.md` 里的相反说法已过时。
- 提交时不带 `.claude/`：其中 `launch.json` 有指向本机临时目录的测试项。
<!-- END DEFAULTS -->

<!-- BEGIN GUARDRAILS -->
## 铁律

- 测试和演示只用临时新建的 SQLite 库和测试账号，不拿 `backend/schedule_manager.db`、生产库或用户的真实账号来试。
- `deploy.sh` 和 `backend/scripts/` 下会改库的脚本（`migrate_database`、`reset_database`、`promote_user`）只在用户明确要求、并确认目标服务器或数据库之后运行；`migrate_database --check` 和对临时测试库的运行除外。
- `.env.production` 和代码里的密钥、密码不输出到对话、日志或新文件；新增密钥不进 git。
- 推送、开 PR、合并只在用户明确要求时做；`upstream` 只拉不推，也不向它开 PR。
<!-- END GUARDRAILS -->

<!-- BEGIN ROUTES -->
## 工作流路由

| 何时 | 读（方法 / 教训） | 写（进度） |
|---|---|---|
| 修改 `frontend/src` 下任何页面、组件或样式前 | `tasks/lessons/mobile-ios.md` | `tasks/todo/mobile-ios.md` |
| 修改后端的权限校验、日程状态流转、审计或删除逻辑前 | `LOGIC_BUG_AUDIT.md` | — |
<!-- END ROUTES -->

<!-- BEGIN TODOS -->
## 零散待办

- `.env.production`（含 JWT 签名密钥）和代码里写死的数据库默认密码都在公开的上游仓库里 → 下一步：用户确认生产环境是否沿用，决定是否轮换。
- 日程审核（通过／驳回）请求失败时，桌面和手机界面都没有提示 → 下一步：用户决定是否修。
<!-- END TODOS -->
