from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Base de datos
    database_url: str

    # Deepgram — Speech-to-Text
    deepgram_api_key: Optional[str] = None
    deepgram_model: str = "nova-3"
    deepgram_language: str = "multi"

    # OpenAI — LLM para extracción SOAP
    openai_api_key: Optional[str] = None
    llm_model: str = "gpt-4o-mini"

    # Procesamiento de audio
    max_audio_duration_seconds: int = 900
    allowed_audio_formats: str = "webm,mp3,wav,m4a,ogg"

    # Autenticación (sobreescribir en producción vía variables de entorno)
    auth_usuario: str = "admin"
    auth_password: str = "vetlospinos"
    auth_secret: str = "vet-los-pinos-secreto-dev"
    auth_token_horas: int = 12

    model_config = {
        "env_file": str(Path(__file__).resolve().parents[1] / ".env"),
        "env_file_encoding": "utf-8",
    }


settings = Settings()

# Corrección para Render: SQLAlchemy 2.0 requiere postgresql:// en lugar de postgres://
if settings.database_url and settings.database_url.startswith("postgres://"):
    settings.database_url = settings.database_url.replace("postgres://", "postgresql://", 1)
