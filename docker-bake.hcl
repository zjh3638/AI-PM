# Docker Bake — 统一构建 AI-PM 全部镜像
#
# 公网构建:
#   docker buildx bake
#
# 内网构建（指定镜像源）:
#   docker buildx bake \
#     --set *.args.APT_MIRROR=mirrors.internal \
#     --set *.args.PIP_INDEX_URL=http://mirrors.internal/pypi/simple/ \
#     --set *.args.NPM_REGISTRY=http://mirrors.internal/npm/
#
# 仅构建后端:
#   docker buildx bake backend
#
# 仅构建前端:
#   docker buildx bake frontend

# ── Variables (override via --set or environment) ────────
variable "APT_MIRROR" { default = "" }
variable "APT_MIRROR_PROTOCOL" { default = "http" }
variable "PIP_INDEX_URL" { default = "" }
variable "PIP_TRUSTED_HOST" { default = "" }
variable "UV_INDEX_URL" { default = "" }
variable "NPM_REGISTRY" { default = "" }
variable "NPM_STRICT_SSL" { default = "true" }
variable "TAG" { default = "latest" }

# ── Default group builds all targets ─────────────────────
group "default" {
  targets = ["backend", "frontend"]
}

# ── Backend (Python FastAPI) ─────────────────────────────
target "backend" {
  context    = "./server"
  dockerfile = "Dockerfile"
  tags       = ["ai-pm-backend:${TAG}"]
  args = {
    APT_MIRROR          = "${APT_MIRROR}"
    APT_MIRROR_PROTOCOL = "${APT_MIRROR_PROTOCOL}"
    PIP_INDEX_URL       = "${PIP_INDEX_URL}"
    PIP_TRUSTED_HOST    = "${PIP_TRUSTED_HOST}"
    UV_INDEX_URL        = "${UV_INDEX_URL}"
  }
}

# ── Frontend (React SPA + Nginx) ────────────────────────
target "frontend" {
  context    = "."
  dockerfile = "Dockerfile.frontend"
  tags       = ["ai-pm-frontend:${TAG}"]
  args = {
    NPM_REGISTRY   = "${NPM_REGISTRY}"
    NPM_STRICT_SSL = "${NPM_STRICT_SSL}"
  }
}
