# Plan de trabajo: mejor toma de mediciones para la tesis

## Estado (24-nov-2026): las 6 fases están implementadas, sin commit
- Pruebas: backend 232 pasan (26 nuevas en `tests/test_medicion_ia.py`); frontend lint 0 errores, tipos, 102 pruebas y build OK.
- Migración `1b90c8b2cfed` (3 tablas + `historias_clinicas.etapas_registro`), probada subir/bajar/subir en la base de prueba.
- Nada se probó contra Deepgram/OpenAI reales ni en el navegador: se mockeó para no gastar.
- Pantallas: `/gasto-ia` (admin, siempre) y `/mediciones` (solo con `MODULOS_TESIS=true` en el servidor y `VITE_MODULOS_TESIS=true` en Vercel).
- Variables nuevas: `PRECIO_OPENAI_ENTRADA_MILLON`, `PRECIO_OPENAI_SALIDA_MILLON`, `PRECIO_DEEPGRAM_MINUTO`, `TOPE_GASTO_IA_DIARIO_USD`, `ALERTA_GASTO_IA_MENSUAL_USD`. Los precios por defecto son estimados: verificarlos.
- El banco tiene 15 casos (8 historia + 7 receta), no 30. Para llegar a 30 hay que redactarlos en `services/banco_evaluacion.py`.
- No se registra el gasto de la voz de Inventario y Servicios (no pasan por la sesión de base).


## Qué hay hoy (revisado en el código)
- `HistoriaClinica.segundos_registro` y `metodo_registro` ('manual' | 'ia'): solo guardan **un total** por historia.
  El cronómetro está en `frontend/src/components/consulta/Cronometro.tsx`; la comparación en `GET /api/encuestas/tiempos`.
- `ExactitudPanel.tsx` + `/api/comparar-exactitud`: ya compara la extracción de la IA contra una referencia escrita a mano
  (gold standard) y da exactitud, precisión, recall y F1 por campo. **Esto ya existe; falta guardarlo y hacerlo repetible.**
- `services/transcription.py` (Deepgram nova-3) y `services/historia_extractor.py` (OpenAI `gpt-4o-mini`) **no miden
  tiempo por etapa**. El extractor imprime los tokens con `print` pero **no los guarda**.
- No hay WER ni registro de gasto.

## Los 2 instrumentos recomendados
1. **WER (Word Error Rate / tasa de error de palabras)** — calidad de la **transcripción de voz**.
   `WER = (sustituidas + borradas + insertadas) / palabras de la referencia`. Se compara lo que escribió Deepgram contra
   una transcripción hecha a mano del mismo audio. Es el estándar para reconocimiento de voz, así que es fácil de defender
   y de citar. Además se reporta el WER solo sobre **términos clínicos** (fármacos, dosis, órganos), que es lo que importa
   en veterinaria.
2. **Exactitud de la extracción por campo (gold standard → precisión, recall, F1)** — calidad de lo que la IA **rellena**
   en la historia. Ya existe en `ExactitudPanel`; se amplía para correrlo sobre un **conjunto fijo de casos** y guardar el
   resultado.

Y en paralelo la **latencia por etapa** (no es "calidad", es velocidad): grabación → Deepgram → OpenAI → revisión del
doctor → guardado. Se reporta con mediana y percentil 95 (la media se distorsiona con valores extremos).

> Nota: "Golden State" = *gold standard* (referencia hecha a mano por un humano). "Win rate error" probablemente es
> *Word Error Rate (WER)*. Si te referías a otra cosa, avísame.

## Fases

### Fase 1 — Latencia por etapa (manual y voz)
- Tabla nueva `mediciones_registro` (una fila por historia): `historia_id`, `metodo`, `ms_grabacion`, `ms_deepgram`,
  `ms_openai`, `ms_revision` (el doctor corrigiendo), `ms_total`, `ediciones_hechas`.
- Backend: medir con `time.perf_counter()` alrededor de Deepgram y OpenAI y devolver los tiempos en la respuesta.
- Frontend: el cronómetro manda también las etapas; en modo manual solo `ms_total` y `ediciones_hechas`.
- Conservar `segundos_registro` como está (no romper los datos ya tomados).
- Migración Alembic (probar en `vet_demo` antes; en Railway se aplica sola).

### Fase 2 — WER de la transcripción
- `services/calidad_voz.py`: función `wer(referencia, hipotesis)` (normaliza tildes, mayúsculas, puntuación; distancia de
  edición por palabras). Sin dependencias nuevas, o `jiwer` si prefieres.
- Tabla `evaluaciones_voz`: `audio_ref`, `texto_referencia`, `texto_deepgram`, `wer`, `wer_clinico`, `duracion_audio_s`.
- Pantalla en `Mediciones.tsx`: subir audio + escribir la transcripción correcta → ver WER y qué palabras fallaron.
- Pruebas con ejemplos conocidos (ej. 1 palabra mal de 10 = 0.10).

### Fase 3 — Conjunto de casos de prueba fijo (gold standard guardado)
- Guardar 20–30 casos (texto o audio + referencia) para poder **repetir** la medición con el mismo material cuando
  cambie el modelo o el prompt.
- `ExactitudPanel` pasa de "un caso a la vez" a "correr todos y guardar resultado con fecha y modelo".
- Mostrar exactitud/F1 **por campo** (qué campos falla más la IA) con IC 95 %.
- Los casos se redactan a mano; **no inventar datos clínicos reales ni de clientes**.

### Fase 4 — Gasto de IA (créditos)
- Tabla `uso_ia`: `fecha`, `servicio` ('deepgram'|'openai'), `modelo`, `tokens_entrada`, `tokens_salida`,
  `segundos_audio`, `costo_estimado_usd`, `historia_id` (opcional).
- Guardar lo que hoy solo se imprime (`completion.usage`) y la duración del audio.
- Precios en `core/config.py` (configurables, no fijos en el código). **Verificar los precios vigentes** de Deepgram y
  OpenAI antes de usarlos; cambian.
- Pantalla "Gasto de IA" (solo admin): hoy / semana / mes, costo por historia, y **proyección**.

### Fase 5 — Predecir y limitar el gasto en pruebas
- Estimador: `costo ≈ minutos_audio × tarifa_Deepgram + (tokens_in × p_in + tokens_out × p_out)`, calibrado con el
  promedio real de la Fase 4. Ejemplo: "30 historias de prueba ≈ US$ X".
- Tope configurable (`TOPE_GASTO_IA_DIARIO`): si se pasa, el sistema avisa y bloquea la IA (el modo manual sigue).
- Para pruebas: correr contra `vet_demo`, y repetir el gold standard con **textos** (sin Deepgram) cuando solo se
  cambie el prompt, así se gasta mucho menos.
- Alerta cuando el gasto del mes pase de un umbral.

### Fase 6 — Reporte para la tesis
- Exportar a CSV/Excel: tiempos por etapa, WER, exactitud por campo y gasto, con mediana, p95, IC 95 %.
- Pasar por el agente `revisor-tesis` antes de usar cualquier número en el documento.
- Tamaño de muestra y fórmulas: citar fuentes (agente `investigador`); no inventar cifras.

## Orden sugerido y esfuerzo
| Fase | Qué da | Esfuerzo |
|------|--------|----------|
| 4 (solo guardar tokens/segundos) | Empezar a registrar gasto ya | chico |
| 1 | Latencia por etapa | mediano |
| 2 | WER | mediano |
| 3 | Gold standard repetible | mediano |
| 5 | Predicción y tope de gasto | chico (depende de 4) |
| 6 | Reporte | chico |

Recomiendo empezar por **4 → 1**: son las que ya estás perdiendo datos si empiezas a medir hoy.

## Decisiones tuyas pendientes
- ¿WER solo sobre el texto, o también sobre términos clínicos? (recomendado: ambos)
- ¿Cuántos casos de gold standard puedes redactar? (mínimo ~20)
- ¿Tope diario de gasto en dólares para pruebas?
- ¿Las pruebas de voz se hacen con doctores reales o con audios grabados por ti?
