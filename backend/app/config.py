from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
ROOT_ENV = BACKEND_DIR.parent / ".env"


class Settings(BaseSettings):
    # extra="ignore": KEITARO_LOGIN/PASSWORD не используются
    model_config = SettingsConfigDict(
        env_file=str(ROOT_ENV), env_file_encoding="utf-8", extra="ignore", env_ignore_empty=True
    )

    KEITARO_HOST: str = ""
    KEITARO_API_URL: str | None = None
    KEITARO_API_KEY: str
    DATABASE_URL: str = f"sqlite+aiosqlite:///{(BACKEND_DIR / 'app.db').as_posix()}"
    DEFAULT_DOMAIN_ID: int | None = None
    DEFAULT_GROUP_ID: int | None = None
    DEFAULT_TRAFFIC_SOURCE_ID: int | None = None
    DEFAULT_GROUP_NAME: str = "FORTESTS"
    DEFAULT_TRAFFIC_SOURCE_NAME: str = "FORTESTS"
    SAFE_REDIRECT_URL: str = "https://google.com"
    # Требование стенда: кампании называются test_<фамилия>_<имя>
    CAMPAIGN_NAME_PREFIX: str = "test_kuznetsov_"
    CORS_ORIGINS: str = "http://localhost:5173"
    REPORT_TIMEZONE: str = "Europe/Moscow"
    TRACKER_PUBLIC_URL: str | None = None

    @model_validator(mode="after")
    def _derive_api_url(self) -> "Settings":
        if not self.KEITARO_API_URL:
            base = self.KEITARO_HOST.strip().rstrip("/").removesuffix("/admin")
            self.KEITARO_API_URL = f"{base}/admin_api/v1"
        if not self.TRACKER_PUBLIC_URL:
            self.TRACKER_PUBLIC_URL = self.KEITARO_HOST.strip().rstrip("/").removesuffix("/admin")
        self.TRACKER_PUBLIC_URL = self.TRACKER_PUBLIC_URL.rstrip("/")
        return self

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
