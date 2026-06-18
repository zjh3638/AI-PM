from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # 数据库
    database_url: str = "mysql+asyncmy://root@localhost:3306/ai_pm"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # JWT
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expiration: int = 86400  # 24 hours in seconds

    # 企微
    wecom_corp_id: str = ""
    wecom_agent_id: str = ""
    wecom_secret: str = ""

    # Git 知识库
    git_repos_path: str = "./repos"

    # 密码策略
    password_min_length: int = 8

    # Hermes Agent（延后至 Plan 3）
    hermes_api_url: str = "http://localhost:8080"

    # API 基础 URL（用于 Webhook 回调）
    api_base_url: str = "http://localhost:8000"

    model_config = {"env_prefix": "AI_PM_", "env_file": ".env"}


settings = Settings()
