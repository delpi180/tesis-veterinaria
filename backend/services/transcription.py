import os
from deepgram import DeepgramClient
from core.config import settings


# Vocabulario veterinario para "keyterm boosting": ayuda a Deepgram a no
# transcribir mal nombres de fármacos, vacunas y términos clínicos frecuentes.
KEYTERMS_VET = [
    # Vacunas
    "Nobivac", "Vanguard", "Eurican", "Defensor", "Rabisin", "Bravecto",
    "Quíntuple", "Séxtuple", "Antirrábica", "Triple felina", "Puppy",
    # Fármacos
    "Amoxicilina", "Metronidazol", "Meloxicam", "Carprofeno", "Enrofloxacina",
    "Ivermectina", "Cefalexina", "Dexametasona", "Prednisona", "Tramadol",
    "Maropitant", "Cerenia", "Omeprazol", "Ranitidina", "Furosemida",
    "Doxiciclina", "Gabapentina", "Apoquel",
    # Términos clínicos
    "mucosas", "ictéricas", "cianóticas", "linfonódulos", "taquicardia",
    "deshidratado", "hematuria", "anorexia", "condición corporal",
]


def transcribe_audio(audio_bytes: bytes, filename: str = "audio.wav") -> str:
    """
    Transcribe audio_bytes a texto usando Deepgram (pre-recorded REST).
    Devuelve el transcript como string plano.

    - El modelo y el idioma son configurables en .env (DEEPGRAM_MODEL,
      DEEPGRAM_LANGUAGE). Por defecto nova-3 + multi (maneja español con
      nombres de marca en inglés).
    - Se aplica keyterm boosting con vocabulario veterinario. Si la combinación
      modelo/idioma no soporta keyterm, reintenta automáticamente sin él.
    """
    if not settings.deepgram_api_key:
        raise RuntimeError(
            "DEEPGRAM_API_KEY no está configurada. "
            "Agrégala al archivo .env del backend."
        )

    ext = os.path.splitext(filename)[-1].lower() or ".wav"
    client = DeepgramClient(api_key=settings.deepgram_api_key, timeout=300.0)

    base_kwargs = dict(
        request=audio_bytes,
        model=settings.deepgram_model,
        language=settings.deepgram_language,
        smart_format=True,   # puntuación y números formateados
    )

    print(
        f"[DEEPGRAM] Enviando {ext} ({len(audio_bytes):,} bytes) "
        f"— modelo={settings.deepgram_model} lang={settings.deepgram_language}"
    )

    def _llamar(con_keyterms: bool):
        kwargs = dict(base_kwargs)
        if con_keyterms:
            kwargs["keyterm"] = KEYTERMS_VET
        return client.listen.v1.media.transcribe_file(**kwargs)

    try:
        try:
            response = _llamar(con_keyterms=True)
        except Exception as exc_kt:
            # El parámetro keyterm puede no estar soportado por el modelo/idioma:
            # reintentar sin él en vez de fallar la consulta.
            print(f"[DEEPGRAM] keyterm no aplicado ({exc_kt}); reintentando sin keyterm.")
            response = _llamar(con_keyterms=False)
    except Exception as exc:
        raise RuntimeError(f"Error al conectar con Deepgram: {exc}") from exc

    try:
        transcript = response.results.channels[0].alternatives[0].transcript
    except (AttributeError, IndexError, KeyError) as exc:
        raise RuntimeError(f"Respuesta inesperada de Deepgram: {exc}") from exc

    print(
        f"[DEEPGRAM] OK — '{transcript[:80]}{'…' if len(transcript) > 80 else ''}'"
    )
    return transcript
