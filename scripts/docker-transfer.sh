#!/bin/bash
# ─────────────────────────────────────────────────────────
# AI-PM Docker 镜像传输工具
#
# 用于「公网构建 → 传输到内网部署」的场景。
#
# 用法:
#   # 在公网机器上构建并打包
#   ./scripts/docker-transfer.sh save
#
#   # 将生成的 ai-pm-images.tar.gz 传输到内网机器
#   # 在内网机器上加载
#   ./scripts/docker-transfer.sh load
# ─────────────────────────────────────────────────────────

set -euo pipefail

IMAGES=(
  "ai-pm-backend:latest"
  "ai-pm-frontend:latest"
)
TARBALL="ai-pm-images.tar.gz"
REQUIRED_IMAGES=(
  "postgres:16-alpine"
  "redis:7-alpine"
)
REQUIRED_TARBALL="ai-pm-base-images.tar.gz"

usage() {
  echo "用法: $0 {save|load|save-all|load-all}"
  echo ""
  echo "  save      构建应用镜像并打包（不含 postgres/redis 基础镜像）"
  echo "  load      从 tar.gz 加载应用镜像"
  echo "  save-all  打包应用镜像 + 拉取基础镜像并一起打包"
  echo "  load-all  加载全部镜像（应用 + 基础镜像）"
  echo ""
  echo "  基础镜像 (postgres:16-alpine, redis:7-alpine) 较大，"
  echo "  建议在内网机器上单独 docker pull（如果有镜像代理），"
  echo "  或用 save-all/load-all 一起传输。"
  exit 1
}

cmd="${1:-}"
case "$cmd" in
  save)
    echo "=== 构建应用镜像 ==="
    docker compose build

    echo "=== 打包应用镜像 → ${TARBALL} ==="
    docker save "${IMAGES[@]}" | gzip > "$TARBALL"
    echo "完成: ${TARBALL} ($(du -h "$TARBALL" | cut -f1))"
    ;;

  load)
    if [ ! -f "$TARBALL" ]; then
      echo "错误: 找不到 ${TARBALL}，请先将其复制到当前目录"
      exit 1
    fi
    echo "=== 加载应用镜像 ← ${TARBALL} ==="
    gunzip -c "$TARBALL" | docker load
    echo "已加载 ${#IMAGES[@]} 个镜像"
    echo "运行: docker compose up -d"
    ;;

  save-all)
    echo "=== 构建应用镜像 ==="
    docker compose build

    echo "=== 拉取基础镜像 ==="
    for img in "${REQUIRED_IMAGES[@]}"; do
      docker pull "$img"
    done

    ALL_IMAGES=("${IMAGES[@]}" "${REQUIRED_IMAGES[@]}")

    echo "=== 打包全部镜像 → ${REQUIRED_TARBALL} ==="
    docker save "${ALL_IMAGES[@]}" | gzip > "$REQUIRED_TARBALL"
    echo "完成: ${REQUIRED_TARBALL} ($(du -h "$REQUIRED_TARBALL" | cut -f1))"
    ;;

  load-all)
    if [ ! -f "$REQUIRED_TARBALL" ]; then
      echo "错误: 找不到 ${REQUIRED_TARBALL}，请先将其复制到当前目录"
      exit 1
    fi
    echo "=== 加载全部镜像 ← ${REQUIRED_TARBALL} ==="
    gunzip -c "$REQUIRED_TARBALL" | docker load
    echo "已加载全部镜像"
    echo "运行: docker compose up -d"
    ;;

  *)
    usage
    ;;
esac
