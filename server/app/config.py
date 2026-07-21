from pydantic_settings import BaseSettings
from pydantic import model_validator


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
    ldap_enabled: bool = True
    ldap_server_uri: str = "ldap://localhost:389"
    ldap_bind_dn: str = ""
    ldap_bind_password: str = ""
    ldap_base_dn: str = ""
    ldap_user_filter: str = "(uid={username})"
    ldap_username_attribute: str = "uid"
    ldap_display_name_attribute: str = "cn"
    ldap_email_attribute: str = "mail"
    ldap_auto_create_user: bool = True

    # 企业微信集成
    wecom_enabled: bool = False
    wecom_corp_id: str = ""
    wecom_agent_id: str = ""
    wecom_agent_secret: str = ""
    wecom_api_base: str = "https://qyapi.weixin.qq.com/cgi-bin"

    # Git 知识库
    git_repos_path: str = "./repos"

    # 密码策略
    password_min_length: int = 8

    # LLM 网关（系统统一配置，用户各自配 API Key）
    llm_gateway_url: str = "https://llm-gateway.company.com/v1"

    # API 基础 URL（用于 Webhook 回调）
    api_base_url: str = "http://localhost:8000"

    # CORS 允许的源，逗号分隔；为空时允许所有（生产环境建议显式指定）
    cors_origins: str = "http://localhost:3000"

    model_config = {"env_prefix": "AI_PM_", "env_file": ".env"}

    @model_validator(mode="after")
    def _override_api_base_url(self) -> "Settings":
        """从 settings.json 覆盖 api_base_url（如果配置了）。"""
        try:
            from pathlib import Path
            import json
            settings_file = Path(__file__).parent.parent / "settings.json"
            if settings_file.exists():
                data = json.loads(settings_file.read_text())
                api_url = data.get("api_base_url")
                if api_url:
                    self.api_base_url = api_url
        except Exception:
            pass
        return self


settings = Settings()
