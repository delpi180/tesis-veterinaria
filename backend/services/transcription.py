import os
import shutil
import tempfile
import whisper
import imageio_ffmpeg


def _setup_ffmpeg():
    """
    imageio-ffmpeg empaqueta el binario como 'ffmpeg-win-x86_64-vX.Y.exe'.
    Whisper llama ["ffmpeg", ...] y necesita 'ffmpeg.exe' en el PATH.
    Esta función garantiza que exista 'ffmpeg.exe' en el directorio del binario
    y lo agrega al PATH del proceso.
    """
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    ffmpeg_dir = os.path.dirname(ffmpeg_exe)

    # Crear ffmpeg.exe si el binario tiene nombre largo con versión
    ffmpeg_plain = os.path.join(ffmpeg_dir, "ffmpeg.exe")
    if not os.path.exists(ffmpeg_plain):
        shutil.copy2(ffmpeg_exe, ffmpeg_plain)
        print(f"[FFMPEG] Copiado como ffmpeg.exe en {ffmpeg_dir}")

    # Agregar al PATH si no está
    path_env = os.environ.get("PATH", "")
    if ffmpeg_dir not in path_env:
        os.environ["PATH"] = ffmpeg_dir + os.pathsep + path_env

    # Verificar que 'ffmpeg' es localizable
    found = shutil.which("ffmpeg")
    if found:
        print(f"[FFMPEG] OK — {found}")
    else:
        print(f"[FFMPEG] ADVERTENCIA: 'ffmpeg' no encontrado en PATH tras configuración")


_setup_ffmpeg()

# Singleton: el modelo se carga una sola vez al primer uso
_model = None


def _get_model() -> whisper.Whisper:
    global _model
    if _model is None:
        print("[WHISPER] Cargando modelo 'base'…")
        _model = whisper.load_model("base")
        print("[WHISPER] Modelo cargado OK")
    return _model


def transcribe_audio(audio_bytes: bytes, filename: str = "audio.wav") -> str:
    model = _get_model()
    suffix = os.path.splitext(filename)[-1] or ".wav"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    print(f"[TRANSCRIBE] Procesando {suffix} — {len(audio_bytes)} bytes")
    try:
        result = model.transcribe(tmp_path, language="es", fp16=False)
        text = result["text"].strip()
        print(f"[TRANSCRIBE] OK — '{text[:80]}{'…' if len(text) > 80 else ''}'")
        return text
    except Exception as e:
        print(f"[TRANSCRIBE] ERROR: {e}")
        raise
    finally:
        os.unlink(tmp_path)
