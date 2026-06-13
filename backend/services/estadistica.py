"""
Estadística para la evaluación de tesis — implementación autocontenida
(sin scipy): descriptivos, IC 95%, Cronbach's alpha, prueba t de Welch
y tamaño del efecto (Cohen's d).
"""
import math
from statistics import mean, median, pstdev, stdev, variance


# ── Distribución t (función beta incompleta, Numerical Recipes) ──────────────

def _betacf(a: float, b: float, x: float) -> float:
    MAXIT, EPS, FPMIN = 200, 3e-12, 1e-300
    qab, qap, qam = a + b, a + 1.0, a - 1.0
    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < FPMIN:
        d = FPMIN
    d = 1.0 / d
    h = d
    for m in range(1, MAXIT + 1):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < FPMIN:
            d = FPMIN
        c = 1.0 + aa / c
        if abs(c) < FPMIN:
            c = FPMIN
        d = 1.0 / d
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if abs(d) < FPMIN:
            d = FPMIN
        c = 1.0 + aa / c
        if abs(c) < FPMIN:
            c = FPMIN
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < EPS:
            break
    return h


def _betai(a: float, b: float, x: float) -> float:
    """Función beta incompleta regularizada I_x(a, b)."""
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    bt = math.exp(
        math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
        + a * math.log(x) + b * math.log(1.0 - x)
    )
    if x < (a + 1.0) / (a + b + 2.0):
        return bt * _betacf(a, b, x) / a
    return 1.0 - bt * _betacf(b, a, 1.0 - x) / b


def t_sf_two_tailed(t: float, df: float) -> float:
    """p-valor a dos colas para un estadístico t con df grados de libertad."""
    if df <= 0:
        return None
    x = df / (df + t * t)
    return _betai(df / 2.0, 0.5, x)


# t crítico (dos colas, alfa=0.05) por grados de libertad; 1.96 si df>30
_T_CRIT_95 = {
    1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365,
    8: 2.306, 9: 2.262, 10: 2.228, 11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145,
    15: 2.131, 16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086,
    21: 2.080, 22: 2.074, 23: 2.069, 24: 2.064, 25: 2.060, 26: 2.056,
    27: 2.052, 28: 2.048, 29: 2.045, 30: 2.042,
}


def _t_crit(df: int) -> float:
    if df <= 0:
        return None
    return _T_CRIT_95.get(df, 1.96)


# ── Descriptivos ─────────────────────────────────────────────────────────────

def _r(v, n=2):
    return round(float(v), n) if v is not None else None


def descriptivos(valores: list) -> dict:
    """media, sd (muestral), mediana, min, max e IC 95% de la media."""
    xs = [float(v) for v in valores if v is not None]
    n = len(xs)
    if n == 0:
        return {"n": 0, "media": None, "sd": None, "mediana": None,
                "min": None, "max": None, "ic95_low": None, "ic95_high": None}
    m = mean(xs)
    if n == 1:
        return {"n": 1, "media": _r(m), "sd": None, "mediana": _r(m),
                "min": _r(m), "max": _r(m), "ic95_low": None, "ic95_high": None}
    sd = stdev(xs)
    err = _t_crit(n - 1) * sd / math.sqrt(n)
    return {
        "n": n, "media": _r(m), "sd": _r(sd), "mediana": _r(median(xs)),
        "min": _r(min(xs)), "max": _r(max(xs)),
        "ic95_low": _r(m - err), "ic95_high": _r(m + err),
    }


# ── Cronbach's alpha ─────────────────────────────────────────────────────────

def cronbach_alpha(respuestas: list[list[float]]) -> float | None:
    """
    respuestas: lista de evaluadores, cada uno con su vector de ítems.
    alpha = k/(k-1) * (1 - sum(var_item)/var_total)
    """
    if len(respuestas) < 2:
        return None
    k = len(respuestas[0])
    if k < 2 or any(len(r) != k for r in respuestas):
        return None
    columnas = list(zip(*respuestas))           # por ítem
    var_items = sum(variance(col) for col in columnas)
    totales = [sum(r) for r in respuestas]       # puntaje total por evaluador
    var_total = variance(totales)
    if var_total == 0:
        return None
    alpha = (k / (k - 1)) * (1 - var_items / var_total)
    return round(alpha, 3)


def interpretar_alpha(a: float | None) -> str:
    if a is None:
        return "—"
    if a >= 0.9:  return "Excelente"
    if a >= 0.8:  return "Bueno"
    if a >= 0.7:  return "Aceptable"
    if a >= 0.6:  return "Cuestionable"
    if a >= 0.5:  return "Pobre"
    return "Inaceptable"


# ── Prueba t de Welch + Cohen's d ────────────────────────────────────────────

def t_test_welch(a: list, b: list) -> dict | None:
    """Compara dos grupos independientes (varianzas desiguales)."""
    a = [float(x) for x in a if x is not None]
    b = [float(x) for x in b if x is not None]
    na, nb = len(a), len(b)
    if na < 2 or nb < 2:
        return None
    ma, mb = mean(a), mean(b)
    va, vb = variance(a), variance(b)
    if va == 0 and vb == 0:
        return None
    se = math.sqrt(va / na + vb / nb)
    if se == 0:
        return None
    t = (ma - mb) / se
    # Grados de libertad de Welch-Satterthwaite
    df = (va / na + vb / nb) ** 2 / (
        (va / na) ** 2 / (na - 1) + (vb / nb) ** 2 / (nb - 1)
    )
    p = t_sf_two_tailed(t, df)
    # Cohen's d con SD agrupada
    sp = math.sqrt(((na - 1) * va + (nb - 1) * vb) / (na + nb - 2))
    d = (ma - mb) / sp if sp else None
    return {
        "t": round(t, 3),
        "df": round(df, 1),
        "p": round(p, 4) if p is not None else None,
        "significativo": bool(p is not None and p < 0.05),
        "cohen_d": round(d, 3) if d is not None else None,
        "efecto": _interpretar_d(d),
    }


def _interpretar_d(d) -> str:
    if d is None:
        return "—"
    a = abs(d)
    if a >= 0.8:  return "grande"
    if a >= 0.5:  return "mediano"
    if a >= 0.2:  return "pequeño"
    return "insignificante"
