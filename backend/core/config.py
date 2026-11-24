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

    # Precios de la IA en dólares, para estimar el gasto. Son ESTIMADOS y cambian:
    # revisarlos en las páginas de precios de OpenAI y Deepgram antes de citarlos en
    # la tesis. Por defecto: gpt-4o-mini (por millón de tokens) y Deepgram nova-3
    # multilingüe en audio grabado (por minuto). Si se cambia de modelo, cambiarlos.
    precio_openai_entrada_millon: float = 0.15
    precio_openai_salida_millon: float = 0.60
    precio_deepgram_minuto: float = 0.0052
    # Tope de gasto de IA por día (hora de Lima), en dólares. 0 = sin tope.
    # Al pasarse, la IA se bloquea hasta mañana y el llenado manual sigue igual.
    tope_gasto_ia_diario_usd: float = 0.0
    # Aviso en pantalla cuando el gasto del mes pase de esto. 0 = sin aviso.
    alerta_gasto_ia_mensual_usd: float = 0.0

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

    # Módulos de tesis (encuestas SUS/TAM, evaluadores, comparativas IA vs
    # léxico). No le sirven de nada a la clínica y confunden al personal, así
    # que vienen apagados. El código queda: se reactiva con MODULOS_TESIS=true
    # cuando haya que volver a medir.
    modulos_tesis: bool = False

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
