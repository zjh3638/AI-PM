#!/bin/bash
# ─────────────────────────────────────────────────────────
# AI-PM 自动化部署脚本
#
# 功能: 构建镜像 → 推送到内网 registry → 远程拉取启动 → 健康检查
# 目标: 一条命令把当前项目发布到 7.24.14.14 并对外提供服务
#
# 流程(7步):
#   1. 配置 SSH 免密登录
#   2. 本地 docker insecure-registry
#   3. 构建应用镜像
#   4. 推送镜像到 registry
#   5. 远程 docker insecure-registry
#   6. 远程拉取镜像 + 启动服务
#   7. 健康检查
#
# 用法:
#   ./scripts/deploy.sh              # 全流程:build + push + remote deploy + verify
#   ./scripts/deploy.sh build-only   # 仅本地构建+推送,不远程部署
#   ./scripts/deploy.sh remote-only  # 仅远程拉取+启动(用已推送的镜像)
#   ./scripts/deploy.sh verify       # 仅健康检查
#
# 前置依赖:
#   - 本地: docker, ssh, sshpass(首次部署公钥用)
#   - 远程: docker, docker-compose
# ─────────────────────────────────────────────────────────

set -euo pipefail

# ═══ 配置 ════════════════════════════════════════════════
REGISTRY="7.24.4.68:28085"
REMOTE_HOST="7.24.14.14"
REMOTE_USER="root"
REMOTE_DIR="/opt/ai-pm"
# 从环境变量读取密码,避免硬编码;首次 ssh-copy-id 时使用
REMOTE_PASS="${REMOTE_PASS:-}"
SSH_KEY="${HOME}/.ssh/id_ed25519"

IMAGES=("ai-pm-backend:latest" "ai-pm-frontend:latest")

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[$(date +%H:%M:%S)]${NC} $*"; }
ok()   { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*" >&2; }

# ═══ 前置检查 ════════════════════════════════════════════
preflight() {
  log "前置检查..."
  command -v docker >/dev/null || { err "未安装 docker"; exit 1; }
  command -v ssh >/dev/null    || { err "未安装 ssh"; exit 1; }

  if [[ ! -f "$SSH_KEY" ]] && [[ -z "$REMOTE_PASS" ]]; then
    err "首次部署需要 REMOTE_PASS 环境变量来安装 SSH 公钥"
    err "请运行: REMOTE_PASS='你的密码' ./scripts/deploy.sh"
    exit 1
  fi
  ok "前置检查通过"
}

# ═══ 1. SSH 密钥免密登录 ══════════════════════════════════
ensure_ssh_key() {
  log "步骤 1/7: 检查 SSH 免密登录..."

  # 检查是否已免密
  if ssh -o BatchMode=yes -o ConnectTimeout=5 \
        "${REMOTE_USER}@${REMOTE_HOST}" 'true' 2>/dev/null; then
    ok "已配置 SSH 免密登录"
    return
  fi

  # 生成密钥
  if [[ ! -f "$SSH_KEY" ]]; then
    log "  生成 SSH 密钥对..."
    ssh-keygen -t ed25519 -f "$SSH_KEY" -N "" -C "ai-pm-deploy@$(hostname)" >/dev/null
  fi

  # 需要 sshpass 来首次安装公钥
  if [[ -z "$REMOTE_PASS" ]]; then
    err "SSH 免密未配置,需要 REMOTE_PASS 环境变量来安装公钥"
    err "请运行: REMOTE_PASS='你的密码' ./scripts/deploy.sh"
    exit 1
  fi

  if ! command -v sshpass >/dev/null; then
    err "需要 sshpass 来首次安装公钥,请安装:"
    err "  yum install -y sshpass   # CentOS/RHEL"
    err "  apt-get install -y sshpass  # Debian/Ubuntu"
    exit 1
  fi

  log "  安装公钥到 ${REMOTE_HOST}..."
  sshpass -p "$REMOTE_PASS" ssh-copy-id \
    -o StrictHostKeyChecking=no \
    "${REMOTE_USER}@${REMOTE_HOST}" >/dev/null 2>&1

  # 验证
  if ssh -o BatchMode=yes "${REMOTE_USER}@${REMOTE_HOST}" 'true' 2>/dev/null; then
    ok "SSH 免密登录配置成功"
  else
    err "SSH 免密配置失败"
    exit 1
  fi
}

# ═══ 2. 配置 insecure-registries ═════════════════════════
ensure_insecure_registry_local() {
  log "步骤 2/7: 检查本地 docker insecure-registries..."

  if grep -q "$REGISTRY" /etc/docker/daemon.json 2>/dev/null; then
    ok "本地已配置 insecure-registry: $REGISTRY"
    return
  fi

  log "  追加 $REGISTRY 到 /etc/docker/daemon.json..."
  warn "  将重启本地 docker,会短暂中断所有容器"
  python3 - "$REGISTRY" <<'PY'
import json, sys
reg = sys.argv[1]
path = "/etc/docker/daemon.json"
try:
    with open(path) as f:
        cfg = json.load(f)
except FileNotFoundError:
    cfg = {}
regs = cfg.setdefault("insecure-registries", [])
if reg not in regs:
    regs.append(reg)
with open(path, "w") as f:
    json.dump(cfg, f, indent=2)
PY
  systemctl restart docker
  ok "本地 insecure-registry 配置完成"
}

ensure_insecure_registry_remote() {
  log "步骤 5/7: 检查远程 docker insecure-registries..."

  ssh "${REMOTE_USER}@${REMOTE_HOST}" "grep -q '$REGISTRY' /etc/docker/daemon.json 2>/dev/null" \
    && { ok "远程已配置 insecure-registry: $REGISTRY"; return; }

  log "  在远程追加 $REGISTRY 到 /etc/docker/daemon.json..."
  warn "  将重启远程 docker,会短暂中断目标机所有容器"
  ssh "${REMOTE_USER}@${REMOTE_HOST}" "python3 - '$REGISTRY' <<'PY'
import json, sys
reg = sys.argv[1]
path = '/etc/docker/daemon.json'
try:
    with open(path) as f:
        cfg = json.load(f)
except FileNotFoundError:
    cfg = {}
regs = cfg.setdefault('insecure-registries', [])
if reg not in regs:
    regs.append(reg)
with open(path, 'w') as f:
    json.dump(cfg, f, indent=2)
PY
systemctl restart docker"
  ok "远程 insecure-registry 配置完成"
}

# ═══ 3. 构建并推送镜像 ════════════════════════════════════
build_and_push() {
  log "步骤 3/7: 构建应用镜像..."
  cd "$PROJECT_DIR"
  docker-compose build
  ok "镜像构建完成"

  log "步骤 4/7: 推送镜像到 ${REGISTRY}..."
  for img in "${IMAGES[@]}"; do
    local full="${REGISTRY}/${img}"
    log "  tagging & pushing $full..."
    docker tag "$img" "$full"
    docker push "$full"
  done
  ok "镜像推送完成"
}

# ═══ 4. 远程部署 ══════════════════════════════════════════
remote_deploy() {
  log "步骤 6/7: 远程部署到 ${REMOTE_HOST}..."

  local ssh_prefix="ssh ${REMOTE_USER}@${REMOTE_HOST}"

  # 创建工作目录
  $ssh_prefix "mkdir -p ${REMOTE_DIR}"

  # 推送部署文件
  log "  推送部署文件..."
  scp -q "${PROJECT_DIR}/docker-compose.prod.yml" \
         "${PROJECT_DIR}/.env.example" \
         "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"

  # settings.json (compose.prod.yml 挂载 ./server/settings.json)
  if [[ -f "$PROJECT_DIR/server/settings.json" ]]; then
    $ssh_prefix "mkdir -p ${REMOTE_DIR}/server"
    scp -q "${PROJECT_DIR}/server/settings.json" \
           "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/server/"
    $ssh_prefix "chmod 644 ${REMOTE_DIR}/server/settings.json"
  fi

  # 拉取镜像并重打 tag 为本地名(compose.prod.yml 中用的是本地名)
  for img in "${IMAGES[@]}"; do
    local full="${REGISTRY}/${img}"
    log "  远程拉取 $full..."
    $ssh_prefix "docker pull '$full' && docker tag '$full' '$img'"
  done

  # 首次生成 .env
  $ssh_prefix "test -f ${REMOTE_DIR}/.env" 2>/dev/null || {
    log "  首次部署,生成 .env(随机密码)..."
    local pg_pass jwt_secret
    pg_pass=$(openssl rand -hex 16)
    jwt_secret=$(openssl rand -hex 32)
    $ssh_prefix "cp ${REMOTE_DIR}/.env.example ${REMOTE_DIR}/.env" \
      && $ssh_prefix "sed -i 's|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${pg_pass}|' ${REMOTE_DIR}/.env" \
      && $ssh_prefix "sed -i 's|^AI_PM_JWT_SECRET=.*|AI_PM_JWT_SECRET=${jwt_secret}|' ${REMOTE_DIR}/.env"
    warn "  已生成随机 POSTGRES_PASSWORD 和 AI_PM_JWT_SECRET"
    warn "  请手动编辑 ${REMOTE_DIR}/.env 填入 AI_PM_LLM_GATEWAY_URL"
  }

  # 启动服务
  log "  启动服务..."
  $ssh_prefix "cd ${REMOTE_DIR} && docker-compose -f docker-compose.prod.yml up -d"
  ok "远程服务已启动"
}

# ═══ 5. 健康检查验证 ══════════════════════════════════════
verify() {
  log "步骤 7/7: 健康检查..."
  local max=30
  for i in $(seq 1 $max); do
    if curl -sf "http://${REMOTE_HOST}/api/health" >/dev/null 2>&1; then
      ok "后端健康检查通过 (尝试 $i 次)"
      break
    fi
    [[ $i -eq $max ]] && { err "健康检查超时"; }
    sleep 2
  done

  echo ""
  echo "══════════════════════════════════════════════════════════"
  ok "部署完成! 服务已通过 http://${REMOTE_HOST}/ 对外提供服务"
  echo "══════════════════════════════════════════════════════════"
  echo ""
  echo "  访问地址:"
  echo "    前端:  http://${REMOTE_HOST}/"
  echo "    健康检查: http://${REMOTE_HOST}/api/health"
  echo ""
  echo "  管理命令(在 ${REMOTE_HOST} 上):"
  echo "    cd ${REMOTE_DIR}"
  echo "    docker-compose -f docker-compose.prod.yml ps"
  echo "    docker-compose -f docker-compose.prod.yml logs -f"
  echo "    docker-compose -f docker-compose.prod.yml restart"
  echo "    docker-compose -f docker-compose.prod.yml down"
  echo ""

  if ! ssh "${REMOTE_USER}@${REMOTE_HOST}" "grep -q 'AI_PM_LLM_GATEWAY_URL=http' ${REMOTE_DIR}/.env" 2>/dev/null; then
    warn "AI_PM_LLM_GATEWAY_URL 未配置,AI 功能不可用"
    warn "请 ssh ${REMOTE_USER}@${REMOTE_HOST} 编辑 ${REMOTE_DIR}/.env 后重启 backend:"
    warn "  docker-compose -f ${REMOTE_DIR}/docker-compose.prod.yml restart backend"
  fi
}

# ═══ Main ════════════════════════════════════════════════
main() {
  local cmd="${1:-all}"
  echo ""
  echo "══════════════════════════════════════════════════════════"
  echo "  AI-PM 自动化部署 → ${REMOTE_HOST}"
  echo "══════════════════════════════════════════════════════════"
  echo ""

  case "$cmd" in
    all)
      preflight
      ensure_ssh_key
      ensure_insecure_registry_local
      build_and_push
      ensure_insecure_registry_remote
      remote_deploy
      verify
      ;;
    build-only)
      preflight
      ensure_insecure_registry_local
      build_and_push
      ;;
    remote-only)
      preflight
      ensure_ssh_key
      ensure_insecure_registry_remote
      remote_deploy
      verify
      ;;
    verify)
      verify
      ;;
    *)
      err "未知命令: $cmd"
      echo "用法: $0 {all|build-only|remote-only|verify}"
      exit 1
      ;;
  esac
}

main "$@"
