import os
import time
from deepgram import DeepgramClient
from core.config import settings
from services.vocabulario import keyterms
from services import uso_ia


def transcribe_audio(audio_bytes: bytes, filename: str = "audio.wav", db=None,
                     medicion: dict | None = None, operacion: str = "transcripcion") -> str:
    """
    Transcribe audio_bytes a texto usando Deepgram (pre-recorded REST).
    Devuelve el transcript como string plano.

    - El modelo y el idioma son configurables en .env (DEEPGRAM_MODEL,
      DEEPGRAM_LANGUAGE). Por defecto nova-3 + multi (maneja español con
      nombres de marca en inglés).
    - Se aplica keyterm boosting. El vocabulario incluye los medicamentos y
      razas que esta clínica realmente maneja, no solo una lista genérica
      (ver services/vocabulario.py). Si la combinación modelo/idioma no
      soporta keyterm, reintenta automáticamente sin él.
    - Si llega `db`, deja el gasto y la latencia en `uso_ia`. Si llega `medicion`
      (un dict), se llena con `latencia_ms` y `duracion_audio_s` para que el
      endpoint se los devuelva al navegador.
    """
    if not settings.deepgram_api_key:
        raise RuntimeError(
            "DEEPGRAM_API_KEY no está configurada. "
            "Agrégala al archivo .env del backend."
        )

    ext = os.path.splitext(filename)[-1].lower() or ".wav"
    # Timeout amplio: una consulta de 90 min (el tope que permite el grabador)
    # tarda varios minutos en transcribirse. Con 5 min se cortaba y se perdía
    # el trabajo de toda la consulta.
    client = DeepgramClient(api_key=settings.deepgram_api_key, timeout=900.0)

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

    vocabulario = keyterms(db)
    print(f"[DEEPGRAM] {len(vocabulario)} términos de refuerzo")

    def _llamar_con(lista: list[str]):
        kwargs = dict(base_kwargs)
        if lista:
            kwargs["keyterm"] = lista
        return client.listen.v1.media.transcribe_file(**kwargs)

    # Reintento escalonado: lista completa → mitad (por si pasamos el límite de
    # ~500 tokens de Deepgram) → sin refuerzo. Antes era todo o nada, y un solo
    # término de más dejaba el dictado entero sin refuerzo, en silencio.
    intentos = [vocabulario, vocabulario[: max(len(vocabulario) // 2, 1)], []]
    response = None
    ultimo_error: Exception | None = None
    t0 = time.perf_counter()
    for i, lista in enumerate(intentos):
        if i > 0 and not lista and not vocabulario:
            break          # ya se intentó sin refuerzo
        try:
            response = _llamar_con(lista)
            if i > 0:
                print(f"[DEEPGRAM] OK con {len(lista)} de {len(vocabulario)} términos de refuerzo")
            break
        except Exception as exc:
            ultimo_error = exc
            print(f"[DEEPGRAM] intento {i + 1} falló ({str(exc)[:120]}); se reduce el refuerzo")
    latencia_ms = round((time.perf_counter() - t0) * 1000)
    if response is None:
        uso_ia.registrar(db, servicio="deepgram", operacion=operacion,
                         modelo=settings.deepgram_model, latencia_ms=latencia_ms, exito=False)
        raise RuntimeError(f"Error al conectar con Deepgram: {ultimo_error}") from ultimo_error

    try:
        transcript = response.results.channels[0].alternatives[0].transcript
    except (AttributeError, IndexError, KeyError) as exc:
        raise RuntimeError(f"Respuesta inesperada de Deepgram: {exc}") from exc

    # Duración del audio según Deepgram: es lo que se cobra. Si no viene, queda en None.
    try:
        duracion = float(response.metadata.duration)
    except (AttributeError, TypeError, ValueError):
        duracion = None
    if medicion is not None:
        medicion.update(latencia_ms=latencia_ms, duracion_audio_s=duracion)
    uso_ia.registrar(db, servicio="deepgram", operacion=operacion,
                     modelo=settings.deepgram_model, segundos_audio=duracion,
                     latencia_ms=latencia_ms)

    print(
        f"[DEEPGRAM] OK — '{transcript[:80]}{'…' if len(transcript) > 80 else ''}'"
    )
    return transcript
