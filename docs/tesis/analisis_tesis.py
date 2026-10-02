#!/usr/bin/env python3
"""Reproduce los estadísticos del informe de tesis (Informe_Tesis_G5_v4_3.docx).

Entradas : datos/pretest.csv y datos/postest.csv (idénticos a las Tablas 4 y 7 del informe).
Salida   : cada resultado con la tabla / apartado del informe donde aparece.
Uso      : python3 analisis_tesis.py          (requiere numpy y scipy)

Convenciones: el tiempo total es la columna total_min de cada CSV (suma de segmentos redondeada
a 2 decimales, tal como se muestra en las Tablas 4 y 7); los estadísticos por segmento usan los
segundos exactos. Bootstrap y sensibilidad usan semilla 42.
"""
import csv, os
from decimal import Decimal, ROUND_HALF_UP
import numpy as np
from scipy import stats as st

AQUI = os.path.dirname(os.path.abspath(__file__))
def leer(nombre):
    with open(os.path.join(AQUI, 'datos', nombre), encoding='utf8') as f:
        return list(csv.DictReader(f))
def seg(s): m, x = s.split(':'); return int(m) * 60 + int(x)
def f(x, d=2):
    s = str(Decimal(repr(round(float(x), 9))).quantize(Decimal(1).scaleb(-d), rounding=ROUND_HALF_UP))
    return s.replace('.', ',').replace('-', '−')

pre_r, post_r = leer('pretest.csv'), leer('postest.csv')
pre = np.array([float(r['total_min']) for r in pre_r]); post = np.array([float(r['total_min']) for r in post_r])
esc = np.array([seg(r['escritura_mmss']) for r in pre_r]) / 60; dig = np.array([seg(r['digitacion_mmss']) for r in pre_r]) / 60
hab = np.array([seg(r['habla_doctor_mmss']) for r in post_r]) / 60; pro = np.array([seg(r['procesamiento_ia_mmss']) for r in post_r]) / 60
n = 30  # ambas fases: solo medicina general

def desc(x):
    q1, q3 = np.percentile(x, [25, 75])
    return dict(media=x.mean(), mediana=np.median(x), DE=x.std(ddof=1), CV=x.std(ddof=1) / x.mean() * 100, min=x.min(), Q1=q1, Q3=q3, max=x.max())
def mostrar(titulo, d): print(f'\n{titulo}'); [print(f'  {k:8s} {f(v)}') for k, v in d.items()]

mostrar('Tabla 5 - descriptivos del pretest', desc(pre))
mostrar('Tabla 8 - descriptivos del postest', desc(post))
print('\nSegmentos del pretest (apartado 6.1.1):', 'escritura', f(esc.mean()), f(esc.std(ddof=1)), '| digitación', f(dig.mean()), f(dig.std(ddof=1)),
      '| % digitación', f(dig.mean() / pre.mean() * 100, 1))
print('Tabla 6 - correlaciones (r Pearson, rho Spearman):')
for nombre, a, b in (('escritura-total', esc, pre), ('digitación-total', dig, pre), ('escritura-digitación', esc, dig)):
    print(f'  {nombre:22s} r={f(st.pearsonr(a, b)[0], 3)}  rho={f(st.spearmanr(a, b)[0], 3)}')
print('Tabla 9 - segmentos del postest: habla', f(hab.mean()), f(hab.std(ddof=1)), '| procesamiento', f(pro.mean()), f(pro.std(ddof=1)),
      '| % habla', f(hab.mean() / (hab.mean() + pro.mean()) * 100, 1), '| r habla-total', f(st.pearsonr(hab, post)[0], 3))

sw1, sw2 = st.shapiro(pre), st.shapiro(post)
print('\nTabla 12 - Shapiro-Wilk: pretest W=%s p=%s | postest W=%s p=%s' % (f(sw1[0], 3), f(sw1[1], 3), f(sw2[0], 3), f(sw2[1], 3)))
lev = st.levene(pre, post, center='median'); print('Tabla 13 - Levene (mediana): F=%s p=%s' % (f(lev.statistic, 3), f(lev.pvalue, 5)))
t1 = st.ttest_1samp(pre, 5, alternative='greater'); chi1 = (n - 1) * pre.var(ddof=1)
print('Tabla 15 (HE1): t=%s p=%s | chi2=%s p=%s | IC95 media=%s' % (f(t1.statistic, 3), f(t1.pvalue, 3), f(chi1), f(st.chi2.sf(chi1, n - 1), 3), [f(v) for v in st.t.interval(.95, n - 1, pre.mean(), st.sem(pre))]))
t2 = st.ttest_1samp(post, 5, alternative='less'); chi2 = (n - 1) * post.var(ddof=1)
print('Tabla 16 (HE2): t=%s | chi2=%s | W Wilcoxon=%s | IC95 media=%s' % (f(t2.statistic, 3), f(chi2), f(st.wilcoxon(post - 5, alternative='less').statistic), [f(v) for v in st.t.interval(.95, n - 1, post.mean(), st.sem(post))]))
v1, v2 = pre.var(ddof=1) / n, post.var(ddof=1) / n; gl = (v1 + v2) ** 2 / (v1 ** 2 / (n - 1) + v2 ** 2 / (n - 1))
w = st.ttest_ind(pre, post, equal_var=False); U = st.mannwhitneyu(pre, post, alternative='two-sided')
d = (pre.mean() - post.mean()) / np.sqrt((pre.var(ddof=1) + post.var(ddof=1)) / 2)
print('Tabla 17 (HE3): t Welch=%s gl=%s | U=%s | d de Cohen=%s' % (f(w.statistic), f(gl), f(U.statistic), f(d)))

rng = np.random.default_rng(42); bs = []
for _ in range(10000):
    a, b = rng.choice(pre, n), rng.choice(post, n); bs.append((a.mean() - b.mean()) / a.mean() * 100)
red = (pre.mean() - post.mean()) / pre.mean() * 100; ic = np.percentile(bs, [2.5, 97.5])
k = .5; vv1, vv2 = pre.var(ddof=1) / n * k * k, post.var(ddof=1) / n; tt = (post.mean() - k * pre.mean()) / np.sqrt(vv1 + vv2)
gl2 = (vv1 + vv2) ** 2 / (vv1 ** 2 / (n - 1) + vv2 ** 2 / (n - 1))
print('Tabla 18 (HG): reducción=%s %% | IC95 bootstrap=[%s; %s] | t umbral=%s gl=%s p=%s' % (f(red, 1), f(ic[0], 1), f(ic[1], 1), f(tt), f(gl2), f(st.t.cdf(tt, gl2), 4)))

print('\nTabla 19 - sensibilidad al error del observador:')
for b in (0.1, 0.2):
    a, c = pre - b, post + b; ww = st.ttest_ind(a, c, equal_var=False)
    print(f'  sesgo {b} min: reducción={f((a.mean() - c.mean()) / a.mean() * 100, 1)} % t={f(ww.statistic)}')
print('  umbral de ruptura (reducción = 50 %%): sesgo = %s min (%s s)' % (f((0.5 * pre.mean() - post.mean()) / 1.5), f((0.5 * pre.mean() - post.mean()) / 1.5 * 60, 0)))
for s in (10, 30, 60):
    e = s / 60; r2 = np.random.default_rng(42); rd = []
    for _ in range(5000):
        a, c = pre + r2.uniform(-e, e, n), post + r2.uniform(-e, e, n); rd.append((a.mean() - c.mean()) / a.mean() * 100)
    print(f'  error aleatorio ±{s} s: percentiles 2,5-97,5 = {f(np.percentile(rd, 2.5), 1)} % - {f(np.percentile(rd, 97.5), 1)} %')

print('\nTabla 20 - tendencia intra-fase:')
for nombre, x in (('postest', post), ('pretest', pre)):
    x_ = np.arange(1, n + 1); lr = st.linregress(x_, x * 60); kt = st.kendalltau(x_, x); wl = st.ttest_ind(x[:15], x[15:], equal_var=False)
    print(f'  {nombre}: 1.ª mitad {f(x[:15].mean())} ({f(x[:15].std(ddof=1))}) | 2.ª mitad {f(x[15:].mean())} ({f(x[15:].std(ddof=1))}) | p Welch={f(wl.pvalue, 3)} | pendiente={f(lr.slope)} s/obs (p={f(lr.pvalue, 3)}) | tau={f(kt.statistic, 3)} (p={f(kt.pvalue, 3)})')
