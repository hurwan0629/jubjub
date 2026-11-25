"""서버 설정. 값은 모두 환경 변수(.env)에서 읽어요. 코드에 주소·키를 직접 쓰지 않아요."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

SERVER_DIR = Path(__file__).resolve().parents[2]

# localhost와 같은 Wi-Fi(사설 IP)의 모든 포트. Expo 웹(8081)과 휴대폰 브라우저에서 부를 수 있어요.
LOCAL_NETWORK_ORIGINS = (
    r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$"
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=SERVER_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

    # DB (Supabase PostgreSQL)
    database_url: str

    # CORS
    cors_origin_regex: str = LOCAL_NETWORK_ORIGINS

    # 인증 (KAN-88)
    jwt_secret: str = Field(default="", repr=False)
    jwt_access_token_minutes: int = Field(default=60, gt=0, le=1440)

    # 로봇
    robot_bridge_url: str = "ws://localhost:9090"
    use_simulator: bool = True
    robot_command_timeout_seconds: float = Field(default=5, gt=0, le=60)
    robot_heartbeat_timeout_seconds: float = Field(default=10, ge=5, le=120)
    robot_schedule_enabled: bool = False

    # 사진 저장 폴더
    photo_dir: Path = Path("./storage/photos")

    # R2 비공개 사진 저장소. 키 값은 repr·로그에 노출하지 않아요.
    r2_account_id: str = Field(default="", repr=False)
    r2_endpoint: str = Field(default="", repr=False)
    r2_access_key_id: SecretStr = SecretStr("")
    r2_secret_access_key: SecretStr = SecretStr("")
    r2_bucket_name: str = ""
    photo_max_bytes: int = Field(default=5 * 1024 * 1024, ge=1, le=20 * 1024 * 1024)

    # 운영 에이전트 LLM
    llm_api_key: str = ""
    llm_model: str = ""

    # Expo 푸시. 실제 발송은 운영 설정에서 명시적으로 켜요.
    expo_push_enabled: bool = False
    expo_push_base_url: str = "https://exp.host/--/api/v2/push"
    expo_push_access_token: SecretStr = SecretStr("")
    expo_push_timeout_seconds: float = Field(default=10, gt=0, le=30)

    @field_validator("database_url")
    @classmethod
    def use_psycopg_driver(cls, v: str) -> str:
        """Supabase에서 복사한 postgresql:// 주소를 SQLAlchemy가 psycopg 3 드라이버로 쓰도록 바꿔요."""
        for prefix in ("postgresql://", "postgres://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix) :]
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()
