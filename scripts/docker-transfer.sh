#!/bin/bash
# ─────────────────────────────────────────────────────────
# AI-PM Docker 镜像传输 & 部署打包工具
#
# 场景:
#   服务器 A（有公网/代码）: 构建镜像 → 打包
#   服务器 B（内网运行）:    加载镜像 → 部署
#
# 用法:
#   在服务器 A 上:
#     ./scripts/docker-transfer.sh build    # 构建应用镜像
#     ./scripts/docker-transfer.sh package  # 打包镜像 + 部署文件 → deploy-package/
#
#   将 deploy-package/ 整个目录拷贝到服务器 B
#
#   在服务器 B 上:
#     cd deploy-package
#     ./deploy.sh                           # 加载镜像 + 启动全部服务
# ─────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

IMAGES=(
  "ai-pm-backend:latest"
  "ai-pm-frontend:latest"
)
BASE_IMAGES=(
  "7.24.4.68:28085/1ms/postgres:16-alpine"
  "7.24.4.68:28085/1ms/redis:7-alpine"
)
PACKAGE_DIR="$PROJECT_DIR/deploy-package"
APP_TARBALL="ai-pm-images.tar.gz"
BASE_TARBALL="ai-pm-base-images.tar.gz"

usage() {
  cat <<EOF
用法: $0 {build|package|package-all}

  build      在服务器 A 上构建应用镜像
  package    构建 + 打包应用镜像和部署文件 → deploy-package/
  package-all 构建 + 打包应用镜像 + 拉取基础镜像一起打包

输出目录: deploy-package/
  ├── ai-pm-images.tar.gz      # 应用镜像
  ├── ai-pm-base-images.tar.gz # 基础镜像（仅 package-all）
  ├── docker-compose.prod.yml  # 部署编排
  ├── .env.example             # 配置模板
  ├── settings.json            # 后端配置模板
  └── deploy.sh                # 服务器 B 一键部署脚本
EOF
  exit 1
}

# ── build: 构建应用镜像 ──────────────────────────────────
do_build() {
  echo "=== 构建应用镜像（服务器 A）==="
  cd "$PROJECT_DIR"
  docker-compose build
  echo "构建完成"
}

# ── package: 打包部署文件 ────────────────────────────────
do_package() {
  local include_base="${1:-false}"

  echo "=== 1/4 构建应用镜像 ==="
  do_build

  echo ""
  echo "=== 2/4 打包应用镜像 ==="
  cd "$PROJECT_DIR"
  rm -rf "$PACKAGE_DIR"
  mkdir -p "$PACKAGE_DIR"
  docker save "${IMAGES[@]}" | gzip > "$PACKAGE_DIR/$APP_TARBALL"
  echo "  → $APP_TARBALL ($(du -h "$PACKAGE_DIR/$APP_TARBALL" | cut -f1))"

  if [ "$include_base" = "true" ]; then
    echo ""
    echo "=== 3/4 拉取 & 打包基础镜像 ==="
    for img in "${BASE_IMAGES[@]}"; do
      echo "  pulling $img..."
      docker pull "$img"
    done
    docker save "${BASE_IMAGES[@]}" | gzip > "$PACKAGE_DIR/$BASE_TARBALL"
    echo "  → $BASE_TARBALL ($(du -h "$PACKAGE_DIR/$BASE_TARBALL" | cut -f1))"
    step="4/4"
  else
    step="3/3"
  fi

  echo ""
  echo "=== ${step} 复制部署文件 ==="

  # 生产 compose 文件（无 build 指令）
  cp "$PROJECT_DIR/docker-compose.prod.yml" "$PACKAGE_DIR/"

  # 配置模板
  cp "$PROJECT_DIR/.env.example" "$PACKAGE_DIR/"

  # settings.json 模板
  if [ -f "$PROJECT_DIR/server/settings.json" ]; then
    cp "$PROJECT_DIR/server/settings.json" "$PACKAGE_DIR/"
  fi

  # 生成服务器 B 上的部署脚本
  cat > "$PACKAGE_DIR/deploy.sh" << 'DEPLOY_SCRIPT'
#!/bin/bash
# ───────────────────────────────────────────────────────
# AI-PM 内网部署脚本（在服务器 B 上运行）
# 前提: 已安装 Docker & Docker Compose v2
# ───────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")"

echo "========================================="
echo "  AI-PM 内网部署"
echo "========================================="
echo ""

# ── 1. 检查 .env ──────────────────────────────────────
if [ ! -f .env ]; then
  echo "[!] 未找到 .env 文件"
  echo "    请先复制并编辑配置: cp .env.example .env"
  echo "    必须设置: POSTGRES_PASSWORD, AI_PM_JWT_SECRET, AI_PM_LLM_GATEWAY_URL"
  exit 1
fi

# ── 2. 检查 settings.json ──────────────────────────────
if [ ! -f settings.json ]; then
  echo "[!] 未找到 settings.json，创建默认配置..."
  echo '{"llm_gateway_url": ""}' > settings.json
  echo "    已创建默认 settings.json，LLM 网关地址将从环境变量读取"
fi

# ── 3. 加载镜像 ────────────────────────────────────────
echo ">>> 加载应用镜像..."
if [ -f ai-pm-images.tar.gz ]; then
  gunzip -c ai-pm-images.tar.gz | docker load
  echo "    应用镜像加载完成"
else
  echo "    [!] 未找到 ai-pm-images.tar.gz，跳过"
fi

if [ -f ai-pm-base-images.tar.gz ]; then
  echo ">>> 加载基础镜像..."
  gunzip -c ai-pm-base-images.tar.gz | docker load
  echo "    基础镜像加载完成"
fi

# ── 4. 检查基础镜像 ────────────────────────────────────
echo ""
echo ">>> 检查基础镜像..."
for img in 7.24.4.68:28085/1ms/postgres:16-alpine 7.24.4.68:28085/1ms/redis:7-alpine; do
  if docker image inspect "$img" >/dev/null 2>&1; then
    echo "    ✓ $img"
  else
    echo "    ○ $img 本地不存在，docker-compose 将自动拉取"
  fi
done

# ── 5. 启动服务 ────────────────────────────────────────
echo ""
echo ">>> 启动服务..."
docker-compose -f docker-compose.prod.yml up -d

# ── 6. 等待健康检查 ────────────────────────────────────
echo ""
echo ">>> 等待服务就绪..."
sleep 5

echo ""
echo ">>> 服务状态:"
docker-compose -f docker-compose.prod.yml ps

echo ""
echo "========================================="
echo "  部署完成"
echo "========================================="
echo ""
echo "  验证:"
echo "    curl http://localhost/api/health"
echo "    curl http://localhost/"
echo ""
echo "  管理:"
echo "    docker-compose -f docker-compose.prod.yml ps"
echo "    docker-compose -f docker-compose.prod.yml logs -f"
echo "    docker-compose -f docker-compose.prod.yml restart"
echo "    docker-compose -f docker-compose.prod.yml down"
DEPLOY_SCRIPT

  chmod +x "$PACKAGE_DIR/deploy.sh"

  echo ""
  echo "========================================="
  echo "  打包完成: deploy-package/"
  echo "========================================="
  echo ""
  echo "文件列表:"
  ls -lh "$PACKAGE_DIR/"
  echo ""
  echo "接下来:"
  echo "  1. 将 deploy-package/ 目录拷贝到服务器 B"
  echo "  2. 在服务器 B 上:"
  echo "     cd deploy-package"
  echo "     cp .env.example .env  # 编辑 .env 填入实际值"
  echo "     ./deploy.sh            # 一键部署"
}

# ── Main ────────────────────────────────────────────────
cmd="${1:-}"
case "$cmd" in
  build)
    do_build
    ;;
  package)
    do_package false
    ;;
  package-all)
    do_package true
    ;;
  *)
    usage
    ;;
esac
