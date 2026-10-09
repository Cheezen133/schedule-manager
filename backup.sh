#!/bin/bash
# ============================================================
# 数据备份脚本（用户数据保护的第一道防线）
# 备份内容：MySQL schedule_manager 全库 + backend/uploads 全部用户文件
# 存放位置：database_backups/（已被 .gitignore 排除，绝不会传到 GitHub）
# 用法：bash backup.sh   （手动执行；update.sh 部署前也会自动调用）
# ============================================================
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_DIR="$PROJECT_DIR/database_backups"
ENV_FILE="$PROJECT_DIR/.env"
UPLOADS_DIR="$PROJECT_DIR/backend/uploads"

mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d_%H%M%S)

# ---- 从 .env 解析数据库连接信息（密码不落脚本）----
DB_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)
DB_USER=$(echo "$DB_URL" | sed -E 's|.*//([^:]+):.*|\1|')
DB_PASS=$(echo "$DB_URL" | sed -E 's|.*//[^:]+:([^@]+)@.*|\1|')
DB_HOST=$(echo "$DB_URL" | sed -E 's|.*@([^:/]+).*|\1|')
DB_PORT=$(echo "$DB_URL" | sed -E 's|.*:([0-9]+)/.*|\1|')
DB_NAME=$(echo "$DB_URL" | sed -E 's|.*/([^?]+).*|\1|')

echo "[1/2] 备份 MySQL 数据库 $DB_NAME ..."
mysqldump --single-transaction --no-tablespaces --routines --triggers --events \
  -h"${DB_HOST}" -P"${DB_PORT}" -u"${DB_USER}" -p"${DB_PASS}" "$DB_NAME" \
  | gzip > "$BACKUP_DIR/${DB_NAME}_${STAMP}.sql.gz"
SQL_SIZE=$(du -h "$BACKUP_DIR/${DB_NAME}_${STAMP}.sql.gz" | cut -f1)

echo "[2/2] 备份用户上传文件（uploads/）..."
tar -czf "$BACKUP_DIR/uploads_${STAMP}.tar.gz" -C "$PROJECT_DIR/backend" uploads
UP_SIZE=$(du -h "$BACKUP_DIR/uploads_${STAMP}.tar.gz" | cut -f1)

# ---- 轮转：只保留最新一份（节省磁盘） ----
ls -1t "$BACKUP_DIR"/${DB_NAME}_*.sql.gz 2>/dev/null | tail -n +2 | xargs -r rm -f
ls -1t "$BACKUP_DIR"/uploads_*.tar.gz  2>/dev/null | tail -n +2 | xargs -r rm -f

echo "=========================================="
echo "✅ 备份完成（$STAMP）"
echo "   数据库: ${DB_NAME}_${STAMP}.sql.gz ($SQL_SIZE)"
echo "   用户文件: uploads_${STAMP}.tar.gz ($UP_SIZE)"
echo "=========================================="
