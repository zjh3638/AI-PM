from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "mysql+asyncmy://root@localhost:3306/ai_pm"
    jwt_secret: str = "change-me-in-production"
    jwt_expiration: int = 86400000  # 24 hours in ms
    git_repos_path: str = "/data/ai-pm/repos"

    model_config = {"env_prefix": "AI_PM_", "env_file": ".env"}


settings = Settings()
