#!/bin/bash
# ============================================================
# 一键部署脚本（唯一的上线入口）
# 流程：强制备份 → 拉取代码 → 装依赖 → 构建前端 → 发布 → 重启后端 → 健康检查
# 用法：
#   bash update.sh           # 部署 origin/main 最新
#   bash update.sh dev       # 部署 origin/dev
# 安全保证：备份失败会立即中止，绝不碰线上
# ============================================================
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BRANCH="${1:-main}"
WEB_DIR="/var/www/schedule-manager"
cd "$PROJECT_DIR"

echo "==== [0/6] 强制备份用户数据（失败即中止） ===="
bash "$PROJECT_DIR/backup.sh"

PREV_COMMIT=$(git rev-parse HEAD)
echo "$PREV_COMMIT" > "/tmp/opencode/last_deploy_commit"

echo "==== [1/6] 拉取代码（$BRANCH） ===="
git fetch origin
git switch "$BRANCH" 2>/dev/null || true
git pull origin "$BRANCH"
CUR_COMMIT=$(git rev-parse --short HEAD)
echo "当前版本: $CUR_COMMIT（回滚点: ${PREV_COMMIT:0:7}）"

echo "==== [2/6] 安装后端依赖 ===="
pip3 install -q -r backend/requirements.txt

echo "==== [3/6] 构建前端 ===="
cd frontend
npm install --silent --no-fund --no-audit
npm run build --silent
cd "$PROJECT_DIR"

echo "==== [4/6] 发布前端到 $WEB_DIR ===="
# 注意：绝不能加 --delete！/var/www 里的 pdfjs/ 等资源不在构建产物中，删了会坏
mkdir -p "$WEB_DIR"
cp -r frontend/dist/* "$WEB_DIR/"

echo "==== [5/6] 重启后端服务 ===="
systemctl restart schedule-manager
sleep 3

echo "==== [6/6] 健康检查 ===="
if curl -sf -o /dev/null https://ruiyu.work/api/v1/health; then
  echo "✅ 部署成功，线上正常  https://ruiyu.work"
else
  echo "❌ 健康检查失败！最近日志："
  journalctl -u schedule-manager -n 20 --no-pager || tail -30 /root/schedule-manager/backend/nohup.out
  echo ""
  echo "回滚方法："
  echo "  git reset --hard $PREV_COMMIT && systemctl restart schedule-manager"
  echo "  然后重跑: cd frontend && npm run build && cp -r dist/* $WEB_DIR/"
  exit 1
fi
