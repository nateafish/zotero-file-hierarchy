#!/usr/bin/env bash
# ============================================================
#  一键安装 File Hierarchy Portable translator 到 Zotero（macOS / Linux）
#
#  脚本直接从 GitHub 下载最新的 File Hierarchy.js 并安装到
#  Zotero 数据目录的 translators/ 文件夹，无需手动放文件。
#
#  用法：
#    bash install-mac.sh
#  自定义数据目录：
#    ZOTERO_DATA=/你的/实际路径 bash install-mac.sh
# ============================================================
set -euo pipefail

# 下载地址：本仓库（nateafish/zotero-file-hierarchy）master 分支上的最新构建
URL="https://raw.githubusercontent.com/nateafish/zotero-file-hierarchy/master/File%20Hierarchy.js"

# Zotero 数据目录：默认 ~/Zotero，可用环境变量覆盖
ZOTERO_DATA="${ZOTERO_DATA:-$HOME/Zotero}"
TRANSLATORS_DIR="$ZOTERO_DATA/translators"
TARGET="$TRANSLATORS_DIR/File Hierarchy.js"

if [ ! -d "$ZOTERO_DATA" ]; then
  echo "✗ 未找到 Zotero 数据目录：$ZOTERO_DATA"
  echo "  请确认已打开 Zotero，或在「设置 → 高级 → 文件和文件夹 → 显示数据目录」查看实际路径。"
  echo "  然后用实际路径重新运行，例如："
  echo "    ZOTERO_DATA=/Users/你的用户名/实际路径 bash $0"
  exit 1
fi

mkdir -p "$TRANSLATORS_DIR"

echo "→ 正在从 GitHub 下载 File Hierarchy.js ..."
curl -fsSL "$URL" -o "$TARGET"

echo "✓ 已安装：$TARGET"
echo ""
echo "下一步："
echo "  1. 重启 Zotero"
echo "  2. 选中 Collection → 文件 → 导出"
echo "  3. 格式选「File Hierarchy Portable」，勾选「Export Files」→ 导出"
