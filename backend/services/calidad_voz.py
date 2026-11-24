"""Calidad de la transcripción de voz: WER (Word Error Rate, tasa de error de palabras).

    WER = (sustituidas + borradas + insertadas) / palabras de la referencia

Se compara lo que escribió Deepgram (hipótesis) contra lo que de verdad se dijo,
escrito a mano (referencia). Un WER de 0.10 son ~10 errores cada 100 palabras.

Además se calcula el error SOLO sobre los términos clínicos (fármacos, diagnósticos,
procedimientos, siglas): un error en «amoxicilina» pesa mucho más que uno en «el».

Límite conocido: no se intenta igualar «treinta y nueve punto dos» con «39.2». La
referencia debe escribirse con el mismo formato de números que da el sistema (cifras),
o esos casos cuentan como error. Se anota en la tesis como limitación.
"""
import re
import unicodedata

from services.vocabulario_clinico import CATEGORIAS


def normalizar(texto: str) -> list[str]:
    """Minúsculas, sin tildes ni signos; conserva el punto decimal entre cifras."""
    t = unicodedata.normalize("NFD", (texto or "").lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    t = re.sub(r"(?<=\d),(?=\d)", ".", t)          # 39,2 -> 39.2
    t = re.sub(r"(?<!\d)\.|\.(?!\d)", " ", t)       # puntos que no son decimales
    t = re.sub(r"[^a-z0-9ñ.\s]", " ", t)
    return t.split()


def _terminos_clinicos(extra: list[str] | None = None) -> set[str]:
    """Palabras clínicas de un solo término, ya normalizadas."""
    out: set[str] = set()
    for categoria in CATEGORIAS:
        for entrada in categoria:
            palabras = normalizar(str(entrada))
            if len(palabras) == 1 and len(palabras[0]) >= 3:
                out.add(palabras[0])
    for entrada in extra or []:
        palabras = normalizar(str(entrada))
        if len(palabras) == 1:
            out.add(palabras[0])
    return out


def alinear(ref: list[str], hip: list[str]) -> list[tuple[str, str | None, str | None]]:
    """Alineación mínima por distancia de edición. Devuelve (op, palabra_ref, palabra_hip).

    op: 'ok' | 'sub' | 'del' (la referencia tenía la palabra y no salió) | 'ins' (sobra).
    """
    n, m = len(ref), len(hip)
    d = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        d[i][0] = i
    for j in range(1, m + 1):
        d[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            costo = 0 if ref[i - 1] == hip[j - 1] else 1
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + costo)

    ops: list[tuple[str, str | None, str | None]] = []
    i, j = n, m
    while i > 0 or j > 0:
        if i > 0 and j > 0 and d[i][j] == d[i - 1][j - 1] + (0 if ref[i - 1] == hip[j - 1] else 1):
            ops.append(("ok" if ref[i - 1] == hip[j - 1] else "sub", ref[i - 1], hip[j - 1]))
            i, j = i - 1, j - 1
        elif i > 0 and d[i][j] == d[i - 1][j] + 1:
            ops.append(("del", ref[i - 1], None))
            i -= 1
        else:
            ops.append(("ins", None, hip[j - 1]))
            j -= 1
    ops.reverse()
    return ops


def calcular_wer(referencia: str, hipotesis: str, terminos_extra: list[str] | None = None) -> dict:
    """WER general y WER sobre términos clínicos, con las palabras que fallaron."""
    ref, hip = normalizar(referencia), normalizar(hipotesis)
    if not ref:
        raise ValueError("La referencia no tiene palabras.")

    ops = alinear(ref, hip)
    sust = sum(1 for o in ops if o[0] == "sub")
    borr = sum(1 for o in ops if o[0] == "del")
    inse = sum(1 for o in ops if o[0] == "ins")
    wer = (sust + borr + inse) / len(ref)

    clinicos = _terminos_clinicos(terminos_extra)
    ref_clin = [o for o in ops if o[1] is not None and o[1] in clinicos]
    fallan_clin = [o for o in ref_clin if o[0] != "ok"]
    wer_clin = (len(fallan_clin) / len(ref_clin)) if ref_clin else None

    return {
        "palabras_ref": len(ref),
        "palabras_hip": len(hip),
        "sustituidas": sust,
        "borradas": borr,
        "insertadas": inse,
        "wer": round(wer, 4),
        "terminos_clinicos": len(ref_clin),
        "wer_clinico": round(wer_clin, 4) if wer_clin is not None else None,
        "errores": [
            {"tipo": o[0], "referencia": o[1], "sistema": o[2]}
            for o in ops if o[0] != "ok"
        ][:60],
        "errores_clinicos": [
            {"tipo": o[0], "referencia": o[1], "sistema": o[2]} for o in fallan_clin
        ][:30],
    }
