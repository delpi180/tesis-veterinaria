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

    # CORS: "*" en dev; en prod poner el dominio de Vercel (CSV) vía variable.
    cors_origins: str = "*"

    # Rate-limit del login (anti fuerza bruta)
    login_max_intentos: int = 8     # intentos fallidos permitidos
    login_ventana_seg:  int = 300   # ventana de tiempo (5 min)

    model_config = {
        "env_file": str(Path(__file__).resolve().parents[1] / ".env"),
        "env_file_encoding": "utf-8",
    }


settings = Settings()

# Forzar el uso de psycopg3 (psycopg-binary) con la URL de Postgres
if settings.database_url:
    if settings.database_url.startswith("postgres://"):
        settings.database_url = settings.database_url.replace("postgres://", "postgresql+psycopg://", 1)
    elif settings.database_url.startswith("postgresql://"):
        settings.database_url = settings.database_url.replace("postgresql://", "postgresql+psycopg://", 1)
