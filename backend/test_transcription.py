"""
test_transcription.py
─────────────────────────────────────────────────────────────────────────────
Prueba de precisión del modelo Deepgram Nova-3 con frases veterinarias reales.

Metodología:
  1. Genera audio MP3 en memoria usando gTTS (Google TTS) para cada frase de
     referencia — esto da un texto conocido (ground truth).
  2. Envía el audio directamente a transcribe_audio() (sin levantar el servidor).
  3. Calcula el WER (Word Error Rate) por frase y el promedio global.

Limitación: gTTS produce voz sintética, no voz humana real. La precisión real
en consultas puede ser diferente (generalmente mejor para Deepgram nova-3).
Para una prueba más representativa, reemplaza _generar_audio_gtts() con
archivos de audio reales grabados en la clínica.

Uso:
  cd backend
  .\\venv\\Scripts\\python.exe test_transcription.py
  .\\venv\\Scripts\\python.exe test_transcription.py --audio tu_archivo.mp3

Requiere: DEEPGRAM_API_KEY en backend/.env e internet.
"""

import sys
import io
import os
import argparse
import unicodedata

# UTF-8 en la consola Windows para que los acentos y símbolos salgan bien
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Asegura que los imports de services/ funcionen
sys.path.insert(0, os.path.dirname(__file__))

from gtts import gTTS
from services.transcription import transcribe_audio


# ─── Frases de referencia (ground truth) ─────────────────────────────────────

FRASES = [
    # (categoria, texto)
    ("motivo",     "El paciente presenta vómito diarrea y letargo desde hace dos días."),
    ("anamnesis",  "El propietario refiere que el perro no come desde ayer y toma mucha agua."),
    ("tpr_peso",   "El paciente pesa ocho punto cinco kilos y la temperatura es de treinta y nueve grados."),
    ("tpr_fc",     "Frecuencia cardíaca ciento veinte latidos por minuto frecuencia respiratoria veintiocho."),
    ("examen",     "Mucosas rosadas y húmedas tiempo de llenado capilar menor a dos segundos."),
    ("dx",         "Diagnóstico presuntivo gastroenteritis aguda de posible origen viral."),
    ("farmacos",   "Se prescribe metronidazol quince miligramos por kilo cada doce horas por cinco días."),
    ("farmacos2",  "Amoxicilina con ácido clavulánico veinticinco miligramos por kilo vía oral cada ocho horas."),
    ("plan",       "Se indica dieta blanda ayuno hídrico de dos horas y control en siete días."),
    ("urgencia",   "El paciente presenta convulsiones y pérdida de consciencia desde hace diez minutos."),
    ("trauma",     "Fractura de tibia derecha se solicita radiografía y valoración quirúrgica urgente."),
    ("vacuna",     "Se aplica vacuna antirrábica y desparasitación con ivermectina subcutánea punto uno mililitros."),
]


# ─── WER (Word Error Rate) ────────────────────────────────────────────────────

def _normalizar(texto: str) -> str:
    """Minúsculas, sin acentos, sin puntuación."""
    nfkd = unicodedata.normalize("NFKD", texto.lower())
    sin_tilde = "".join(c for c in nfkd if not unicodedata.combining(c))
    return "".join(c if c.isalnum() or c == " " else " " for c in sin_tilde)


def wer(referencia: str, hipotesis: str) -> float:
    """
    Word Error Rate = edits / palabras_referencia.
    0.0 = transcripción perfecta. 1.0+ = muy impreciso.
    """
    ref = _normalizar(referencia).split()
    hyp = _normalizar(hipotesis).split()
    if not ref:
        return 0.0
    n, m = len(ref), len(hyp)
    # Levenshtein con O(m) espacio
    d = list(range(m + 1))
    for i in range(1, n + 1):
        prev, d[0] = d[0], i
        for j in range(1, m + 1):
            tmp = d[j]
            if ref[i - 1] == hyp[j - 1]:
                d[j] = prev
            else:
                d[j] = 1 + min(prev, d[j], d[j - 1])
            prev = tmp
    return d[m] / n


# ─── Generación de audio TTS ─────────────────────────────────────────────────

def _generar_audio_gtts(texto: str) -> bytes:
    """Genera audio MP3 en memoria usando Google TTS (requiere internet)."""
    buf = io.BytesIO()
    gTTS(text=texto, lang="es", slow=False).write_to_fp(buf)
    return buf.getvalue()


# ─── Runner de una frase ──────────────────────────────────────────────────────

def _probar_frase(categoria: str, referencia: str) -> tuple[str, str, str, float]:
    """Devuelve (categoria, referencia, hipotesis, wer_score)."""
    print(f"  [{categoria:<12}] generando TTS… ", end="", flush=True)
    audio = _generar_audio_gtts(referencia)
    print(f"{len(audio):,} bytes → Deepgram… ", end="", flush=True)
    transcript = transcribe_audio(audio, filename="test.mp3")
    score = wer(referencia, transcript)
    marca = "✓" if score < 0.10 else ("~" if score < 0.30 else "✗")
    print(f"{marca}  WER={score:.1%}")
    return categoria, referencia, transcript, score


# ─── Prueba con archivo de audio externo ─────────────────────────────────────

def _probar_archivo(ruta: str) -> None:
    print(f"\nArchivo: {ruta}")
    with open(ruta, "rb") as f:
        audio = f.read()
    print(f"Tamaño: {len(audio):,} bytes — enviando a Deepgram…")
    transcript = transcribe_audio(audio, filename=os.path.basename(ruta))
    print(f"\nTranscripción:\n  {transcript}\n")


# ─── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Prueba de precisión Deepgram Nova-3 con frases veterinarias"
    )
    parser.add_argument(
        "--audio", metavar="ARCHIVO",
        help="Transcribe un archivo de audio real (wav/mp3/webm) sin calcular WER",
    )
    args = parser.parse_args()

    if args.audio:
        _probar_archivo(args.audio)
        return

    # ── Suite TTS ────────────────────────────────────────────────────────────
    ancho = 70
    print("=" * ancho)
    print("  PRUEBA DE PRECISIÓN — Deepgram Nova-3")
    print("  Método: gTTS (Google TTS en español) → Deepgram pre-recorded")
    print("=" * ancho)
    print()

    resultados: list[tuple[str, str, str, float]] = []
    errores: list[tuple[str, str]] = []

    for categoria, referencia in FRASES:
        try:
            resultados.append(_probar_frase(categoria, referencia))
        except Exception as exc:
            print(f"ERROR: {exc}")
            errores.append((categoria, str(exc)))

    # ── Tabla de resultados ──────────────────────────────────────────────────
    print()
    print("=" * ancho)
    print(f"{'':2}{'CATEGORÍA':<14} {'WER':>5}  DETALLE")
    print("-" * ancho)

    wers_validos = []
    for categoria, ref, hyp, score in resultados:
        wers_validos.append(score)
        marca = "✓" if score < 0.10 else ("~" if score < 0.30 else "✗")
        print(f"[{marca}] {categoria:<12} {score:>5.1%}")
        print(f"    REF: {ref}")
        print(f"    HYP: {hyp if hyp else '(vacío)'}")
        print()

    if errores:
        print("-" * ancho)
        print("ERRORES:")
        for cat, msg in errores:
            print(f"  [{cat}] {msg}")
        print()

    # ── Resumen ───────────────────────────────────────────────────────────────
    print("=" * ancho)
    if wers_validos:
        avg   = sum(wers_validos) / len(wers_validos)
        mejor = min(wers_validos)
        peor  = max(wers_validos)
        aprobadas = sum(1 for w in wers_validos if w < 0.10)
        aceptables = sum(1 for w in wers_validos if 0.10 <= w < 0.30)
        malas = sum(1 for w in wers_validos if w >= 0.30)
        print(f"  WER promedio : {avg:.1%}  (mejor {mejor:.1%} / peor {peor:.1%})")
        print(f"  ✓ Excelente (<10%) : {aprobadas}/{len(wers_validos)} frases")
        print(f"  ~ Aceptable (10-30%): {aceptables}/{len(wers_validos)} frases")
        print(f"  ✗ Mejorable  (>30%) : {malas}/{len(wers_validos)} frases")
    else:
        print("  Sin resultados válidos.")
    print()
    print("  NOTA: WER con voz sintética. En audio humano real los valores")
    print("  suelen ser mejores. Para comparar, usa --audio tu_grabacion.mp3")
    print("=" * ancho)


if __name__ == "__main__":
    main()
