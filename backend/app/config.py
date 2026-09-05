from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    scan_interval_seconds: int = 10
    database_url: str = "sqlite:///./netatlas.db"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
