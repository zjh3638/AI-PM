from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # 数据库
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/ai_pm"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # JWT
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expiration: int = 86400  # 24 hours in seconds

    # LDAP
    ldap_enabled: bool = False
    ldap_server_uri: str = "ldap://localhost:389"
    ldap_bind_dn: str = ""
    ldap_bind_password: str = ""
    ldap_base_dn: str = ""
    ldap_user_filter: str = "(uid={username})"
    ldap_username_attribute: str = "uid"
    ldap_display_name_attribute: str = "cn"
    ldap_email_attribute: str = "mail"
    ldap_auto_create_user: bool = True

    # Git 知识库
    git_repos_path: str = "./repos"

    # 密码策略
    password_min_length: int = 8

    # LLM 网关（系统统一配置，用户各自配 API Key）
    llm_gateway_url: str = "https://llm-gateway.company.com/v1"

    # API 基础 URL（用于 Webhook 回调）
    api_base_url: str = "http://localhost:8000"

    model_config = {"env_prefix": "AI_PM_", "env_file": ".env"}


settings = Settings()
