/**
 * Lógica de la consulta clínica, sin pantalla: catálogos, formulario vacío,
 * lo que se manda al servidor, el borrador y cómo se vuelcan los datos de la IA.
 *
 * Vive aparte de `pages/HistoriasClinicas.tsx` para poder probarse sin dibujar
 * nada, y porque decide qué queda escrito en la historia del animal.
 */
import { nombresSimilares } from './similitud'

// ── Tipos ───────────────────────────────────────────────────────────────────

export interface OpcionCatalogo { v: string; l: string }

export interface EstadoSistema { estado: string; detalle: string }

export interface ItemTratamiento {
  medicamento: string
  producto_id?: number | null
  dosis?: string
  via?: string
  frecuencia?: string
  duracion_dias?: string | number | null
  /** Texto libre de antes: se conserva tal cual, no se reescribe al editar. */
  duracion?: string
  /** Fragmento que oyó el dictado para esta línea. */
  dicho?: string
}

/** Un producto usado en la consulta (jeringa, suero…), como en «Productos aplicados» de Volki. */
export interface ItemProductoAplicado {
  producto_id: number | null
  nombre: string
  cantidad: number
}

export interface ItemVacuna {
  vacuna: string
  lote?: string
  proxima_dosis?: string
  dicho?: string
}

/** Los campos del formulario que son texto (los números también se escriben como texto). */
export const CAMPOS_TEXTO = [
  'fecha',
  'motivo_consulta', 'tiempo_evolucion', 'derivado_por',
  'detalle', 'alimentacion_tipo', 'alimentacion_cantidad_gr', 'alimentacion_veces_dia',
  'antecedentes', 'tipo_consulta',
  'temperatura_c', 'peso_kg', 'frecuencia_cardiaca',
  'frecuencia_respiratoria', 'condicion_corporal',
  'mucosas', 'tllc', 'estado_sensorio', 'hidratacion',
  'pulso', 'linfonodulos',
  'diagnostico_presuntivo', 'diagnosticos_diferenciales',
  'diagnostico_definitivo',
  'examenes_solicitados',
  'indicaciones', 'observaciones', 'pronostico', 'proxima_cita',
] as const
export type CampoTexto = typeof CAMPOS_TEXTO[number]

/** Todos los campos del formulario son texto, salvo las listas y el EOP. */
export type FormConsulta = Record<CampoTexto, string> & {
  examen_particular: Record<string, EstadoSistema>
  tratamiento_items: ItemTratamiento[]
  vacunas_items: ItemVacuna[]
  /** «A libre demanda»: si está marcada, no hay cantidad ni veces al día. */
  alimentacion_libre_demanda: boolean
  productos_aplicados: ItemProductoAplicado[]
}

/** Lo que la IA devuelve al dictar: cualquier parte del formulario, a medias. */
export type DatosIA = Partial<Record<CampoTexto, string | number | null>> & {
  examen_particular?: Record<string, string | Partial<EstadoSistema> | null> | null
  tratamiento_items?: Partial<ItemTratamiento>[] | null
  vacunas_items?: Partial<ItemVacuna>[] | null
}

/** Consulta tal como la devuelve el servidor (ver `HistoriaClinicaOut` en schemas.py). */
export type Historia = Partial<Record<CampoTexto, string | number | null>> & {
  id: number
  creado_en?: string | null
  veterinario_id?: number | null
  documentos_count?: number
  examen_particular?: Record<string, string | Partial<EstadoSistema> | null> | null
  tratamiento_items?: ItemTratamiento[] | null
  vacunas_items?: ItemVacuna[] | null
  alimentacion_libre_demanda?: boolean | null
  productos_aplicados?: ItemProductoAplicado[] | null
}

export interface BorradorGuardado { form: FormConsulta; guardadoEn: string | null; modo?: ModoRegistro | null }

// ── Catálogos ───────────────────────────────────────────────────────────────

export const SISTEMAS_EOP = [
  'tegumentario', 'cardiovascular', 'respiratorio', 'digestivo',
  'urinario', 'reproductor', 'nervioso', 'musculoesqueletico',
  'linfatico', 'sentidos', 'endocrino',
]
export const SISTEMA_LABELS: Record<string, string> = {
  tegumentario: 'Tegumentario', cardiovascular: 'Cardiovascular',
  respiratorio: 'Respiratorio', digestivo: 'Digestivo',
  urinario: 'Urinario', reproductor: 'Reproductor',
  nervioso: 'Nervioso', musculoesqueletico: 'Músculo-esquelético',
  linfatico: 'Linfático', sentidos: 'Sentidos especiales',
  endocrino: 'Endocrino',
}

export const OPT: Record<string, OpcionCatalogo[]> = {
  tipo_consulta: [
    { v: 'primera_vez', l: 'Primera vez' }, { v: 'control', l: 'Control' },
    { v: 'urgencia', l: 'Urgencia' }, { v: 'vacunacion', l: 'Vacunación' },
  ],
  mucosas: [
    { v: 'rosadas', l: 'Rosadas' }, { v: 'palidas', l: 'Pálidas' },
    { v: 'congestivas', l: 'Congestivas' }, { v: 'ictericas', l: 'Ictéricas' },
    { v: 'cianoticas', l: 'Cianóticas' },
  ],
  tllc: [
    { v: 'normal', l: 'Normal (<2 seg)' },
    { v: 'aumentado', l: 'Aumentado (>2 seg)' },
  ],
  estado_sensorio: [
    { v: 'alerta', l: 'Alerta' }, { v: 'deprimido', l: 'Deprimido' },
    { v: 'estuporoso', l: 'Estuporoso' }, { v: 'comatoso', l: 'Comatoso' },
  ],
  hidratacion: [
    { v: 'normal', l: 'Normal' },
    { v: 'leve_5', l: 'Deshidratación leve (5%)' },
    { v: 'moderada_7', l: 'Deshidratación moderada (7%)' },
    { v: 'grave_10', l: 'Deshidratación grave (10%)' },
    { v: 'shock_12', l: 'Shock hipovolémico (>12%)' },
  ],
  pulso: [
    { v: 'fuerte', l: 'Fuerte' }, { v: 'debil', l: 'Débil' },
    { v: 'filiforme', l: 'Filiforme' }, { v: 'ausente', l: 'Ausente' },
  ],
  pronostico: [
    { v: 'favorable', l: 'Favorable' }, { v: 'reservado', l: 'Reservado' },
    { v: 'desfavorable', l: 'Desfavorable' }, { v: 'grave', l: 'Grave' },
  ],
  sistema_estado: [
    { v: 'normal', l: 'Normal' },
    { v: 'alterado', l: 'Alterado' },
    { v: 'no_evaluado', l: 'No evaluado' },
  ],
}

/** Los mismos tres estados de cada sistema, con las palabras de Volki (botones de opción).
 *  Los valores guardados no cambian: solo cómo se leen en el formulario de consulta nueva. */
export const ESTADOS_SISTEMA_VOLKI: OpcionCatalogo[] = [
  { v: 'normal', l: 'Normal' },
  { v: 'alterado', l: 'Anormal' },
  { v: 'no_evaluado', l: 'No explorado' },
]

export const getLabel = (field: string, value?: string | number | null) => {
  if (!value) return value
  return OPT[field]?.find(o => o.v === String(value))?.l ?? value
}

// ── Fechas en hora de Perú ──────────────────────────────────────────────────
// `toISOString()` da la fecha en UTC: desde las 7 pm de Lima ya es «mañana», y un
// lote que vence mañana aparecía como vencido. Todo lo que se muestra o compara
// como «hoy» sale de aquí, con la zona fija, sin depender de la hora del aparato.
export const ZONA_PERU = 'America/Lima'
const ES_FECHA_ISO = /^\d{4}-\d{2}-\d{2}/

/** Hoy en Perú como «aaaa-mm-dd». */
export const hoyISOPeru = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_PERU }).format(new Date())

/** Suma días a una fecha «aaaa-mm-dd» (puede ser negativo) sin pasar por zonas horarias. */
export function sumarDiasISO(iso: string, dias: number): string {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10)
}

/** Solo la parte de fecha de lo que escribió el usuario («2026-10-21T14:30» → «2026-10-21»),
 *  o la de hoy en Perú si no hay nada válido. */
export const fechaBaseISO = (desde?: string | null) =>
  desde && ES_FECHA_ISO.test(desde) ? desde.slice(0, 10) : hoyISOPeru()

/** «2026-11-05» → «5 nov 2026». Una fecha sin hora no se corre de día. */
export const fechaISOLegible = (iso: string) =>
  new Date(iso.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  })

/** «2026-11-05» → «05/11/2026»; si no es una fecha (texto viejo), se deja tal cual. */
export const fechaISOCorta = (iso: string) =>
  ES_FECHA_ISO.test(iso) && iso.length === 10 ? iso.split('-').reverse().join('/') : iso

/** Un instante (UTC) mostrado como fecha corta en hora de Perú: «21 oct 2026». */
export const fechaPeru = (v: string | number | Date) =>
  new Date(v).toLocaleDateString('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: ZONA_PERU,
  })

/** Un instante (UTC) mostrado con fecha y hora en Perú: «21 oct 2026, 02:30 p. m.». */
export const fechaHoraPeru = (v: string | number | Date) =>
  new Date(v).toLocaleString('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: ZONA_PERU,
  })

/** Un instante (UTC) como «dd/mm/aaaa» en hora de Perú. */
export const fechaNumericaPeru = (v: string | number | Date) =>
  new Date(v).toLocaleDateString('es-PE', { timeZone: ZONA_PERU })

export const toLocalDatetimeString = (v?: string | null) => {
  if (!v) return ''
  const sVal = String(v)
  if (sVal.length === 10) return sVal + 'T00:00'
  const d = new Date(sVal)
  if (isNaN(d.getTime())) return sVal
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// El historial va de la consulta más reciente a la más antigua por FECHA DE
// ATENCIÓN, no por orden de tecleo: una consulta vieja que se digitaliza hoy
// tiene que caer en su lugar, no arriba de todo.
export const ordenarHistorias = (lista: Historia[]): Historia[] =>
  [...lista].sort((a, b) => {
    const fa = new Date((a.fecha || a.creado_en) as string).getTime()
    const fb = new Date((b.fecha || b.creado_en) as string).getTime()
    return fb - fa || (b.id - a.id)
  })

// ── Secciones del formulario ────────────────────────────────────────────────

export const SECCIONES = [
  { id: 's1', num: '1', titulo: 'Anamnesis', corto: 'Anamnesis' },
  { id: 's2', num: '2', titulo: 'Examen objetivo general (EOG)', corto: 'E. general' },
  { id: 's3', num: '3', titulo: 'Examen objetivo particular (EOP)', corto: 'E. particular' },
  { id: 's4', num: '4', titulo: 'Diagnóstico', corto: 'Diagnóstico' },
  { id: 's5', num: '5', titulo: 'Plan, tratamiento y vacunas', corto: 'Plan' },
]

// Campo → sección (para saltar a lo que la IA dejó por revisar)
export const FIELD_TO_SECTION: Record<string, string> = {
  motivo_consulta: 's1', tiempo_evolucion: 's1', derivado_por: 's1',
  detalle: 's1', alimentacion_tipo: 's1', alimentacion_cantidad_gr: 's1', alimentacion_veces_dia: 's1',
  antecedentes: 's1', tipo_consulta: 's1',
  temperatura_c: 's2', peso_kg: 's2', frecuencia_cardiaca: 's2',
  frecuencia_respiratoria: 's2', condicion_corporal: 's2',
  mucosas: 's2', tllc: 's2', estado_sensorio: 's2', hidratacion: 's2',
  pulso: 's2', linfonodulos: 's2',
  diagnostico_presuntivo: 's4', diagnosticos_diferenciales: 's4',
  diagnostico_definitivo: 's4',
  examenes_solicitados: 's5', indicaciones: 's5', observaciones: 's5', pronostico: 's5',
}

// ── Estado inicial ──────────────────────────────────────────────────────────

export const eopVacio = (): Record<string, EstadoSistema> =>
  Object.fromEntries(SISTEMAS_EOP.map(s => [s, { estado: '', detalle: '' }]))

export const TX_EMPTY: ItemTratamiento = { medicamento: '', producto_id: null, dosis: '', via: '', frecuencia: '', duracion_dias: '' }
export const VX_EMPTY: ItemVacuna = { vacuna: '', lote: '', proxima_dosis: '' }

export const FORM_VACIO: FormConsulta = {
  // Vacío = "ahora" (el caso normal). Se llena para digitalizar una consulta
  // vieja de papel o para corregir la fecha de una ya registrada.
  fecha: '',
  motivo_consulta: '', tiempo_evolucion: '', derivado_por: '',
  detalle: '', alimentacion_tipo: '', alimentacion_cantidad_gr: '', alimentacion_veces_dia: '',
  alimentacion_libre_demanda: false,
  antecedentes: '', tipo_consulta: '',
  temperatura_c: '', peso_kg: '', frecuencia_cardiaca: '',
  frecuencia_respiratoria: '', condicion_corporal: '',
  mucosas: '', tllc: '', estado_sensorio: '', hidratacion: '',
  pulso: '', linfonodulos: '',
  examen_particular: eopVacio(),
  diagnostico_presuntivo: '', diagnosticos_diferenciales: '',
  diagnostico_definitivo: '',
  examenes_solicitados: '',
  tratamiento_items: [],
  vacunas_items: [],
  indicaciones: '', observaciones: '', pronostico: '', proxima_cita: '',
  productos_aplicados: [],
}

const NUM_FIELDS = [
  'temperatura_c', 'peso_kg', 'frecuencia_cardiaca',
  'frecuencia_respiratoria', 'condicion_corporal', 'alimentacion_cantidad_gr',
  'alimentacion_veces_dia',
]

// Plantillas de consulta: pre-rellenan los campos típicos de cada tipo de visita
// para acelerar el registro. No tocan peso ni constantes (se miden por animal):
// solo motivo, tipo, plan, vacunas/tratamiento sugerido e indicaciones.
export interface Plantilla {
  id: string
  label: string
  campos: Partial<Record<CampoTexto, string>>
  tratamiento_items?: ItemTratamiento[]
  vacunas_items?: ItemVacuna[]
}

export const PLANTILLAS: Plantilla[] = [
  {
    id: 'vacunacion', label: 'Vacunación',
    campos: {
      tipo_consulta: 'vacunacion',
      motivo_consulta: 'Vacunación',
      pronostico: 'favorable',
      indicaciones: 'Reposo relativo por 24 h. Vigilar reacción local o decaimiento; ante cualquier signo, contactar a la clínica.',
    },
    vacunas_items: [{ ...VX_EMPTY }],
  },
  {
    id: 'control', label: 'Control sano',
    campos: {
      tipo_consulta: 'control',
      motivo_consulta: 'Control de salud / chequeo general',
      pronostico: 'favorable',
      indicaciones: 'Mantener alimentación balanceada y el plan de vacunación/desparasitación al día.',
    },
  },
  {
    id: 'desparasitacion', label: 'Desparasitación',
    campos: {
      tipo_consulta: 'control',
      motivo_consulta: 'Desparasitación',
      pronostico: 'favorable',
      indicaciones: 'Repetir la desparasitación según peso y calendario indicado.',
    },
    tratamiento_items: [{ medicamento: 'Antiparasitario', dosis: '', via: 'Oral', frecuencia: 'Dosis única', duracion: '' }],
  },
  {
    id: 'urgencia', label: 'Emergencia',
    campos: {
      tipo_consulta: 'urgencia',
      motivo_consulta: 'Atención de urgencia',
      pronostico: 'reservado',
    },
  },
]

/** Rellena solo los campos vacíos (no pisa lo ya escrito) y agrega las filas
 *  sugeridas de tratamiento o vacunas si aún no hay ninguna. */
export function aplicarPlantillaAlForm(prev: FormConsulta, tpl: Plantilla): FormConsulta {
  const next = { ...prev }
  for (const [k, v] of Object.entries(tpl.campos || {}) as [CampoTexto, string][]) {
    const actual = next[k]
    if (!actual || !actual.trim()) next[k] = v
  }
  if (tpl.tratamiento_items && !(prev.tratamiento_items || []).some(i => i.medicamento?.trim()))
    next.tratamiento_items = tpl.tratamiento_items.map(i => ({ ...i }))
  if (tpl.vacunas_items && !(prev.vacunas_items || []).some(i => i.vacuna?.trim()))
    next.vacunas_items = tpl.vacunas_items.map(i => ({ ...i }))
  return next
}

// ── Lo que se manda al servidor y cómo se vuelve a abrir ────────────────────

/** Campos de nuestra consulta que el formulario de Volki no tiene. La consulta
 *  nueva usa el formulario de Volki, así que al guardarla (y al volcar lo que
 *  entendió la IA) se dejan fuera, aunque vengan de un borrador viejo. Así el
 *  tiempo medido en manual y en voz es sobre exactamente los mismos campos. */
export const CAMPOS_FUERA_DE_VOLKI: (keyof FormConsulta)[] = [
  'antecedentes', 'tipo_consulta', 'tiempo_evolucion',
  'frecuencia_cardiaca', 'frecuencia_respiratoria', 'tllc', 'pulso', 'linfonodulos',
  'diagnostico_presuntivo', 'diagnosticos_diferenciales',
  'examenes_solicitados', 'pronostico', 'vacunas_items',
]

/** A qué casilla del formulario de Volki va lo que Volki no tiene cuando la IA lo
 *  entiende al dictar. Antes se descartaba sin avisar (y el diagnóstico quedaba
 *  vacío si la IA lo ponía solo como «presuntivo»); ahora va con su etiqueta a
 *  una casilla que sí existe, para no perder nada. */
export const DESTINO_VOLKI: Record<string, CampoTexto> = {
  diagnostico_presuntivo: 'diagnostico_definitivo',
  diagnosticos_diferenciales: 'diagnostico_definitivo',
  antecedentes: 'detalle', tiempo_evolucion: 'detalle', linfonodulos: 'detalle',
  examenes_solicitados: 'indicaciones',
  frecuencia_cardiaca: 'observaciones', frecuencia_respiratoria: 'observaciones',
  tllc: 'observaciones', pulso: 'observaciones', pronostico: 'observaciones',
  tipo_consulta: 'observaciones', vacunas_items: 'observaciones',
}

/** Minúsculas, sin tildes ni signos y con espacios simples: para comparar textos. */
function normalizarTexto(t: unknown): string {
  return String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Agrega `linea` debajo de lo que ya había, salvo que `clave` (el contenido) ya esté escrito. */
function agregarLinea(actual: string, linea: string, clave: string): string {
  const base = (actual ?? '').trim()
  if (normalizarTexto(clave) === '' || normalizarTexto(base).includes(normalizarTexto(clave))) return actual ?? ''
  return base === '' ? linea : `${base}\n${linea}`
}

/** Junta textos sin repetir: si uno ya contiene a otro se queda el más largo. */
function unirUnicos(partes: string[]): string {
  const out: string[] = []
  for (const p of partes.map(x => x.trim()).filter(Boolean)) {
    const n = normalizarTexto(p)
    // Igual al anterior: queda el último (el definitivo gana al presuntivo)
    const igual = out.findIndex(o => normalizarTexto(o) === n)
    if (igual >= 0) { out[igual] = p; continue }
    if (out.some(o => normalizarTexto(o).includes(n))) continue
    const j = out.findIndex(o => n.includes(normalizarTexto(o)))
    if (j >= 0) out[j] = p
    else out.push(p)
  }
  return out.join('; ')
}

/** Suma `valor` a lo que el doctor ya había escrito en la casilla, sin pisarlo ni repetirlo. */
function combinarTexto(base: string, valor: string): string {
  if (!valor) return base
  if (base.trim() === '') return valor
  const nb = normalizarTexto(base), nv = normalizarTexto(valor)
  if (nb.includes(nv)) return base
  if (nv.includes(nb)) return valor
  return `${base.trim()}; ${valor}`
}

const TIPO_CONSULTA_DICHO: Record<string, string> = {
  primera_vez: 'primera vez', control: 'control', urgencia: 'urgencia / emergencia', vacunacion: 'vacunación',
}

/** Pasa a casillas de Volki lo que Volki no tiene (ver DESTINO_VOLKI). Modifica `next`.
 *  Es idempotente: procesar dos veces el mismo dictado no repite nada. */
export function redirigirAVolki(next: FormConsulta, prev: FormConsulta, datos: DatosIA): void {
  const txt = (k: string): string => {
    const v = (datos as Record<string, unknown>)[k]
    return v === null || v === undefined ? '' : String(v).trim()
  }

  // Diagnóstico: el presuntivo no se pierde si la IA no dio uno definitivo.
  const dx = unirUnicos([txt('diagnostico_presuntivo'), txt('diagnostico_definitivo')])
  if (dx) next.diagnostico_definitivo = combinarTexto(prev.diagnostico_definitivo ?? '', dx)
  if (txt('diagnosticos_diferenciales'))
    next.diagnostico_definitivo = agregarLinea(
      next.diagnostico_definitivo, `Diferenciales: ${txt('diagnosticos_diferenciales')}`, txt('diagnosticos_diferenciales'))

  // Anamnesis
  for (const [campo, etiqueta] of [
    ['antecedentes', 'Antecedentes'], ['tiempo_evolucion', 'Evolución'], ['linfonodulos', 'Linfonódulos'],
  ] as const) {
    if (txt(campo)) next.detalle = agregarLinea(next.detalle, `${etiqueta}: ${txt(campo)}`, txt(campo))
  }

  // Indicaciones
  if (txt('examenes_solicitados'))
    next.indicaciones = agregarLinea(next.indicaciones, `Exámenes: ${txt('examenes_solicitados')}`, txt('examenes_solicitados'))

  // Observaciones: datos sueltos del dictado y vacunas
  const piezas: string[] = []
  if (txt('frecuencia_cardiaca')) piezas.push(`FC ${txt('frecuencia_cardiaca')} lpm`)
  if (txt('frecuencia_respiratoria')) piezas.push(`FR ${txt('frecuencia_respiratoria')} rpm`)
  if (txt('tllc')) piezas.push(`TLLC ${txt('tllc')}`)
  if (txt('pulso')) piezas.push(`Pulso ${txt('pulso')}`)
  if (txt('pronostico')) piezas.push(`Pronóstico ${txt('pronostico')}`)
  if (txt('tipo_consulta')) piezas.push(`Tipo de consulta ${TIPO_CONSULTA_DICHO[txt('tipo_consulta')] ?? txt('tipo_consulta')}`)
  const nuevas = piezas.filter(p => !normalizarTexto(next.observaciones).includes(normalizarTexto(p)))
  if (nuevas.length > 0)
    next.observaciones = next.observaciones.trim() === ''
      ? `Dictado: ${nuevas.join('; ')}`
      : `${next.observaciones.trim()}\nDictado: ${nuevas.join('; ')}`

  const vacunas = (datos.vacunas_items ?? [])
    .filter(v => v?.vacuna?.trim())
    .map(v => {
      const extra = [v.lote ? `lote ${v.lote}` : '', v.proxima_dosis ? `próxima dosis ${v.proxima_dosis}` : '']
        .filter(Boolean).join(', ')
      return extra ? `${v.vacuna!.trim()} (${extra})` : v.vacuna!.trim()
    })
    .filter(v => !normalizarTexto(next.observaciones).includes(normalizarTexto(v)))
  if (vacunas.length > 0)
    next.observaciones = next.observaciones.trim() === ''
      ? `Vacunas: ${vacunas.join('; ')}`
      : `${next.observaciones.trim()}\nVacunas: ${vacunas.join('; ')}`
}

export function buildPayload(formCompleto: FormConsulta, soloVolki = false) {
  let form = formCompleto
  if (soloVolki) {
    const vacio = FORM_VACIO as Record<string, unknown>
    form = { ...formCompleto }
    for (const k of CAMPOS_FUERA_DE_VOLKI)
      (form as Record<string, unknown>)[k] = Array.isArray(vacio[k]) ? [] : ''
  }
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(form)) {
    if (['examen_particular', 'tratamiento_items', 'vacunas_items', 'productos_aplicados',
         'alimentacion_libre_demanda'].includes(k)) continue
    if (v === '' || v === null || v === undefined) {
      out[k] = null
    } else if (NUM_FIELDS.includes(k)) {
      const n = Number(v)
      if (isNaN(n)) {
        out[k] = null
      } else {
        // Redondear campos que deben ser enteros estrictos
        const isFloat = ['temperatura_c', 'peso_kg'].includes(k)
        out[k] = isFloat ? n : Math.round(n)
      }
    } else if (k === 'fecha' || k === 'proxima_cita') {
      // Interpreta como hora LOCAL y la envía como instante UTC correcto (evita el corrimiento de 5h)
      out[k] = v ? new Date(v + ':00').toISOString() : null
    } else {
      out[k] = v
    }
  }
  const ep: Record<string, { estado: string | null; detalle: string | null }> = {}
  for (const [s, val] of Object.entries(form.examen_particular)) {
    if (val.estado || val.detalle?.trim())
      ep[s] = { estado: val.estado || null, detalle: val.detalle?.trim() || null }
  }
  out.examen_particular = Object.keys(ep).length > 0 ? ep : null
  const tx = (form.tratamiento_items || []).filter(i => i.medicamento?.trim())
  out.tratamiento_items = tx.length > 0
    ? tx.map(i => ({
        medicamento: i.medicamento || null, producto_id: i.producto_id ?? null,
        dosis: i.dosis || null,
        via: i.via || null, frecuencia: i.frecuencia || null,
        duracion_dias: Number(i.duracion_dias) > 0 ? Math.round(Number(i.duracion_dias)) : null,
        // Lo escrito antes a mano se conserva tal cual: es lo que dice la
        // historia clínica de ese día y no se reescribe al editarla.
        duracion: i.duracion || null,
      }))
    : null
  // «A libre demanda» no tiene cantidad ni veces al día: no se guarda lo que haya quedado escrito
  out.alimentacion_libre_demanda = form.alimentacion_libre_demanda ? true : null
  if (form.alimentacion_libre_demanda) {
    out.alimentacion_cantidad_gr = null
    out.alimentacion_veces_dia = null
  }
  const pa = (form.productos_aplicados || []).filter(i => i.nombre?.trim() && Number(i.cantidad) > 0)
  out.productos_aplicados = pa.length > 0
    ? pa.map(i => ({ producto_id: i.producto_id ?? null, nombre: i.nombre.trim(), cantidad: Number(i.cantidad) }))
    : null
  const vx = (form.vacunas_items || []).filter(i => i.vacuna?.trim())
  out.vacunas_items = vx.length > 0
    ? vx.map(i => ({ vacuna: i.vacuna || null, lote: i.lote || null, proxima_dosis: i.proxima_dosis || null }))
    : null
  return out
}

/** Cómo se llena la consulta nueva: la persona lo elige ANTES de empezar. */
export type ModoRegistro = 'manual' | 'ia'

/** Lo que se manda al guardar. Una consulta nueva lleva solo los campos de Volki
 *  y la medición de tiempo (desde que se eligió el modo, con el método elegido,
 *  no el que se adivine al final). Al corregir una ya guardada se manda todo y no
 *  se toca la medición original. */
export function armarPayloadConsulta(
  form: FormConsulta,
  { editando, modo, inicioMs, ahoraMs = Date.now(), etapasIA = null }: {
    editando: boolean
    modo: ModoRegistro | null
    inicioMs: number | null
    ahoraMs?: number
    etapasIA?: EtapasIA | null
  },
): Record<string, unknown> {
  const payload = buildPayload(form, !editando)
  if (!editando && modo && inicioMs !== null) {
    const total = Math.max(1, Math.round((ahoraMs - inicioMs) / 1000))
    payload.segundos_registro = total
    payload.metodo_registro = modo
    if (modo === 'ia') {
      const etapas = etapasDeLatencia(etapasIA, total)
      if (etapas) payload.etapas_registro = etapas
    }
  }
  return payload
}

/** Lo que tardó cada etapa de la IA (segundos), medido en el navegador. */
export interface EtapasIA {
  grabacion_s?: number | null
  transcripcion_s?: number | null
  extraccion_s?: number | null
}

/** Etapas guardadas con la historia. `revision_s` es lo que sobra del tiempo total una vez
 *  quitadas las etapas de la IA: la revisión y el llenado a mano del doctor. Sin etapas
 *  (no se usó la IA aunque se eligiera «Dictar») no se guarda nada. */
export function etapasDeLatencia(etapas: EtapasIA | null | undefined, totalSeg: number): Record<string, number> | null {
  if (!etapas) return null
  const out: Record<string, number> = {}
  for (const k of ['grabacion_s', 'transcripcion_s', 'extraccion_s'] as const) {
    const v = etapas[k]
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[k] = v
  }
  if (Object.keys(out).length === 0) return null
  const usado = Object.values(out).reduce((a, b) => a + b, 0)
  out.revision_s = Math.max(0, Math.round((totalSeg - usado) * 10) / 10)
  return out
}

export function formFromHistoria(h: Historia): FormConsulta {
  const f: FormConsulta = { ...FORM_VACIO }
  for (const k of CAMPOS_TEXTO) {
    const v = h[k]
    if (v !== null && v !== undefined)
      f[k] = (k === 'fecha' || k === 'proxima_cita') ? toLocalDatetimeString(String(v)) : String(v)
  }
  const ep = eopVacio()
  if (h.examen_particular && typeof h.examen_particular === 'object') {
    for (const s of SISTEMAS_EOP) {
      const val = h.examen_particular[s]
      if (!val) continue
      ep[s] = typeof val === 'string'
        ? { estado: '', detalle: val }
        : { estado: val.estado || '', detalle: val.detalle || '' }
    }
  }
  f.examen_particular = ep
  f.tratamiento_items = Array.isArray(h.tratamiento_items)
    ? h.tratamiento_items.map((i: ItemTratamiento) => ({
        medicamento: i.medicamento || '', producto_id: i.producto_id ?? null,
        dosis: i.dosis || '', via: i.via || '', frecuencia: i.frecuencia || '',
        duracion_dias: i.duracion_dias ?? '', duracion: i.duracion || '' }))
    : []
  f.vacunas_items = Array.isArray(h.vacunas_items)
    ? h.vacunas_items.map((i: ItemVacuna) => ({ vacuna: i.vacuna || '', lote: i.lote || '', proxima_dosis: i.proxima_dosis || '' }))
    : []
  f.alimentacion_libre_demanda = !!h.alimentacion_libre_demanda
  f.productos_aplicados = Array.isArray(h.productos_aplicados)
    ? h.productos_aplicados.map((i: ItemProductoAplicado) => ({
        producto_id: i.producto_id ?? null, nombre: i.nombre || '', cantidad: Number(i.cantidad) || 1 }))
    : []
  return f
}

// ── Borrador en el navegador ────────────────────────────────────────────────
//
// Se guarda para que un cierre accidental o un corte de luz no borre media
// consulta. Lo que se guarda ahora incluye CUÁNDO: antes el borrador volvía
// solo, sin decir nada, y un texto empezado el lunes reaparecía el jueves
// dentro de "Nueva consulta" listo para guardarse como el examen de ese día.
export const claveBorrador = (id: string | number | undefined, editandoId?: number | null) =>
  editandoId ? `draft_historia_${id}_editando_${editandoId}` : `draft_historia_${id}`

/** ¿El formulario está intacto? Se usa para no guardar borradores vacíos y
 *  para saber si hay algo que perder al salir. */
export function formularioVacio(f: FormConsulta): boolean {
  return Object.entries(f).every(([key, valor]) => {
    if (key === 'examen_particular') {
      if (!valor) return true
      return Object.values(valor as Record<string, EstadoSistema>).every(sys => !sys.estado && !sys.detalle)
    }
    if (Array.isArray(valor)) return valor.length === 0
    return !valor
  })
}

// Un borrador reciente es casi siempre "se me cerró la pestaña": se recupera
// solo. Uno viejo es otra consulta, otro día: no se toca sin permiso.
const HORAS_RECUPERACION_AUTOMATICA = 12

/** Completa un borrador guardado con los campos que le falten.
 *
 *  Un borrador escrito por una versión anterior de la aplicación no tiene los
 *  campos que se agregaron después. Cargarlo tal cual dejaba, por ejemplo,
 *  `examen_particular` sin definir y la pantalla de consulta entera reventaba
 *  al intentar dibujar los sistemas — con el texto del doctor atrapado dentro
 *  de un borrador que ya no se podía abrir.
 */
export function normalizarBorrador(guardado?: Partial<FormConsulta> | null): FormConsulta {
  return {
    ...FORM_VACIO,
    ...guardado,
    examen_particular: { ...eopVacio(), ...(guardado?.examen_particular ?? {}) },
    tratamiento_items: Array.isArray(guardado?.tratamiento_items) ? guardado.tratamiento_items : [],
    vacunas_items: Array.isArray(guardado?.vacunas_items) ? guardado.vacunas_items : [],
    alimentacion_libre_demanda: !!guardado?.alimentacion_libre_demanda,
    productos_aplicados: Array.isArray(guardado?.productos_aplicados) ? guardado.productos_aplicados : [],
  }
}

export function leerBorrador(id: string | undefined): BorradorGuardado | null {
  const crudo = localStorage.getItem(claveBorrador(id))
  if (!crudo) return null
  try {
    const dato = JSON.parse(crudo)
    if (!dato || typeof dato !== 'object') return null
    // Formato viejo: el objeto ERA el formulario, sin fecha. Se trata como
    // antiguo (no se recupera solo) porque no hay forma de saber de cuándo es.
    if (!dato.form) return { form: normalizarBorrador(dato), guardadoEn: null }
    const modo = dato.modo === 'manual' || dato.modo === 'ia' ? dato.modo : null
    return { form: normalizarBorrador(dato.form), guardadoEn: dato.guardadoEn ?? null, modo }
  } catch (e) {
    console.error('No se pudo leer el borrador:', e)
    return null
  }
}

export function esReciente(guardadoEn?: string | null): boolean {
  if (!guardadoEn) return false
  const horas = (Date.now() - new Date(guardadoEn).getTime()) / 3600000
  return horas >= 0 && horas < HORAS_RECUPERACION_AUTOMATICA
}

export function describirCuando(guardadoEn?: string | null): string {
  if (!guardadoEn) return 'de una sesión anterior'
  const d = new Date(guardadoEn)
  const min = Math.round((Date.now() - d.getTime()) / 60000)
  if (min < 1) return 'de hace un momento'
  if (min < 60) return `de hace ${min} min`
  const hrs = Math.round(min / 60)
  if (hrs < 24) return `de hace ${hrs} h`
  // 24 h a propósito: "11:32 a. m." termina en punto y deja "a. m.." al cerrar
  // la frase, y en registro clínico la hora sin am/pm es menos ambigua.
  // Hora de Perú, no la del aparato: así el aviso dice lo mismo en cualquier PC.
  const hora = d.toLocaleTimeString('es-PE', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONA_PERU,
  })
  const dia = d.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', timeZone: ZONA_PERU })
  return `del ${dia} a las ${hora}`
}

/** Lo mínimo que se necesita de un producto del inventario para avisar de su stock y vencimiento. */
export interface MedicamentoParaAvisos {
  id: number
  nombre: string
  stock?: number | null
  unidad?: string | null
  fecha_vencimiento?: string | null
}

/** Lo que hay que avisar de una línea de tratamiento: producto enlazado del
 *  inventario, si está vencido o sin stock, y cuándo termina. «Hoy» es en hora
 *  de Perú: con la fecha UTC, desde las 7 pm un lote que vence mañana se
 *  mostraba como ya vencido. La fecha de fin se cuenta desde la fecha de la
 *  consulta, no desde hoy: una consulta que se digitaliza días después no
 *  reinicia el tratamiento. */
export function avisosDeTratamiento(
  item: ItemTratamiento, medicamentos: MedicamentoParaAvisos[], desde?: string,
) {
  const p = medicamentos.find(m => m.id === item.producto_id)
  const vencido = !!p?.fecha_vencimiento && p.fecha_vencimiento <= hoyISOPeru()
  const sinStock = !!p && (p.stock ?? 0) <= 0
  const dias = Number(item.duracion_dias)
  const termina = dias >= 1 ? fechaISOLegible(sumarDiasISO(fechaBaseISO(desde), dias - 1)) : null
  return { p, vencido, sinStock, termina }
}

// ── Ficha del paciente (columna derecha de la consulta) ─────────────────────

/** «2 años y 6 meses» a partir de la fecha de nacimiento; si no hay, la edad en años que se anotó. */
export function edadLegible(
  p: { fecha_nacimiento?: string | null; edad?: number | null }, hoy = hoyISOPeru(),
): string | null {
  if (p.fecha_nacimiento) {
    const [a, m, d] = p.fecha_nacimiento.slice(0, 10).split('-').map(Number)
    const [ha, hm, hd] = hoy.split('-').map(Number)
    let meses = (ha - a) * 12 + (hm - m)
    if (hd < d) meses -= 1
    if (meses < 0) return null
    const anios = Math.floor(meses / 12)
    const resto = meses % 12
    const partes = []
    if (anios) partes.push(`${anios} ${anios === 1 ? 'año' : 'años'}`)
    if (resto || !anios) partes.push(`${resto} ${resto === 1 ? 'mes' : 'meses'}`)
    return partes.join(' y ')
  }
  return p.edad != null ? `${p.edad} ${p.edad === 1 ? 'año' : 'años'}` : null
}

/** Próximas dosis anotadas en las vacunas de las consultas (solo fechas completas, de hoy en adelante). */
export function proximasDosis(historias: Historia[], hoy = hoyISOPeru()): { vacuna: string; fecha: string }[] {
  const vistos = new Set<string>()
  const salida: { vacuna: string; fecha: string }[] = []
  for (const h of historias) {
    for (const v of h.vacunas_items ?? []) {
      const fecha = v.proxima_dosis
      if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha < hoy) continue
      const clave = `${v.vacuna}|${fecha}`
      if (vistos.has(clave)) continue
      vistos.add(clave)
      salida.push({ vacuna: v.vacuna, fecha })
    }
  }
  return salida.sort((a, b) => a.fecha.localeCompare(b.fecha))
}

/** Peso de la consulta más reciente que lo tenga (las historias ya vienen de la más nueva a la más antigua). */
export function ultimoPeso(historias: Historia[]): { kg: string; fecha: string } | null {
  const h = historias.find(x => x.peso_kg !== null && x.peso_kg !== undefined && x.peso_kg !== '')
  if (!h) return null
  return { kg: String(h.peso_kg), fecha: fechaPeru((h.fecha || h.creado_en) as string) }
}

// ── Datos que devuelve la IA ────────────────────────────────────────────────

/** Cuenta los campos que la IA logró completar (incluye los sistemas del EOP).
 *  Con el formulario de Volki también cuentan los que van redirigidos a otra
 *  casilla (ver DESTINO_VOLKI): ya no se descarta nada, así que el número no cambia. */
export function contarCamposLlenos(datos?: DatosIA | null): number {
  if (!datos) return 0
  const lleno = (v: unknown) => v !== null && v !== undefined && v !== '' &&
    !(Array.isArray(v) && v.length === 0)
  let n = 0
  for (const [k, v] of Object.entries(datos)) {
    if (k === 'examen_particular') {
      n += Object.values(v || {}).filter(lleno).length
    } else if (lleno(v)) {
      n += 1
    }
  }
  return n
}

/** Producto del inventario que corresponde al medicamento dictado, o null si no hay
 *  una coincidencia clara. Primero el nombre exacto (igual que al escribirlo a mano);
 *  si no, uno parecido ("amoxicilina" ↔ "Amoxicilina 500 mg"), pero solo cuando es
 *  un único producto: con dos candidatos es mejor no adivinar. */
export function buscarMedicamento(
  nombre: string | undefined | null,
  medicamentos: { id: number; nombre: string }[] = [],
): number | null {
  const buscado = (nombre || '').trim().toLowerCase()
  if (!buscado) return null
  const exacto = medicamentos.find(p => p.nombre.toLowerCase() === buscado)
  if (exacto) return exacto.id
  const parecidos = medicamentos.filter(p => nombresSimilares(p.nombre, nombre))
  return parecidos.length === 1 ? parecidos[0].id : null
}

/** Días de tratamiento cuando lo dictado trae un número claro ("5 días", "por 7 días").
 *  Con semanas, rangos o frases como "hasta mejorar" devuelve null: no se inventa. */
export function diasDeDuracion(texto?: string | null): string | null {
  const m = /^\s*(?:por\s+|durante\s+|x\s*)?(\d{1,3})\s*d[ií]as?\s*\.?\s*$/i.exec(texto || '')
  if (!m) return null
  const dias = Number(m[1])
  return dias >= 1 && dias <= 365 ? String(dias) : null
}

/** Vuelca lo que entendió la IA sobre el formulario actual, mezclando en vez
 *  de pisar lo que el doctor ya había escrito. `medicamentos` es el inventario:
 *  con él, lo dictado queda enlazado al producto y salen los avisos de stock
 *  y vencimiento. */
export function mezclarDatosIA(
  prev: FormConsulta,
  datos: DatosIA,
  medicamentos: { id: number; nombre: string }[] = [],
  soloVolki = false,
): FormConsulta {
  const next: FormConsulta = { ...prev }
  for (const k of CAMPOS_TEXTO) {
    // En la consulta nueva solo se llenan los campos que tiene Volki
    if (soloVolki && (CAMPOS_FUERA_DE_VOLKI as string[]).includes(k)) continue
    // La fecha de la consulta la fija el usuario, no el dictado: si el doctor
    // menciona una fecha al hablar, no debe reescribir cuándo fue la consulta.
    if (k === 'fecha') continue
    const val = datos[k]
    if (val === null || val === undefined) continue
    if (k === 'proxima_cita') {
      next[k] = toLocalDatetimeString(String(val))
    } else {
      next[k] = String(val)
    }
  }
  // Lo que Volki no tiene no se descarta: va con etiqueta a una casilla que sí existe
  if (soloVolki) redirigirAVolki(next, prev, datos)
  // EOP (Examen objetivo particular por sistemas) - Mezcla inteligente en lugar de sobreescribir todo
  const ep: Record<string, EstadoSistema> = next.examen_particular
    ? Object.fromEntries(
        Object.entries(next.examen_particular).map(([s, val]) => [s, { ...val }])
      )
    : eopVacio()
  if (datos.examen_particular && typeof datos.examen_particular === 'object') {
    for (const s of SISTEMAS_EOP) {
      const val = datos.examen_particular[s]
      if (!val) continue
      ep[s] = typeof val === 'string'
        ? { estado: ep[s]?.estado || '', detalle: val }
        : { estado: val.estado || ep[s]?.estado || '', detalle: val.detalle || ep[s]?.detalle || '' }
    }
  }
  next.examen_particular = ep

  // Listas — Mezcla inteligente en lugar de sobreescribir todo
  if (Array.isArray(datos.tratamiento_items) && datos.tratamiento_items.length > 0) {
    const existingTx = (prev.tratamiento_items || []).filter(i => i.medicamento?.trim())
    const mergedTx = [...existingTx]
    // Solo se fusiona contra lo que YA estaba en el formulario, no contra
    // lo que este mismo dictado acaba de agregar: un dictado puede traer
    // dos pautas legítimas del mismo fármaco ("inyectable hoy y tabletas
    // por 7 días") y buscar en toda la lista las colapsaba en una,
    // borrando una indicación sin avisar.
    const nPrevias = existingTx.length

    datos.tratamiento_items.forEach(incoming => {
      const matchedIdx = mergedTx.findIndex((item, i) =>
        i < nPrevias && nombresSimilares(item.medicamento, incoming.medicamento))
      if (matchedIdx > -1) {
        const matchedItem = { ...mergedTx[matchedIdx] }
        if (incoming.medicamento) matchedItem.medicamento = incoming.medicamento
        if (incoming.dosis) matchedItem.dosis = incoming.dosis
        if (incoming.via) matchedItem.via = incoming.via
        if (incoming.frecuencia) matchedItem.frecuencia = incoming.frecuencia
        if (incoming.duracion) {
          matchedItem.duracion = incoming.duracion
          // Si el doctor ya puso los días a mano, no se le pisan
          const dias = diasDeDuracion(incoming.duracion)
          if (dias && !matchedItem.duracion_dias) matchedItem.duracion_dias = dias
        }
        if (incoming.dicho) matchedItem.dicho = incoming.dicho
        if (!matchedItem.producto_id) {
          matchedItem.producto_id = buscarMedicamento(matchedItem.medicamento, medicamentos)
        }
        mergedTx[matchedIdx] = matchedItem
      } else {
        mergedTx.push({
          medicamento: incoming.medicamento || '',
          producto_id: buscarMedicamento(incoming.medicamento, medicamentos),
          dosis: incoming.dosis || '',
          via: incoming.via || '',
          frecuencia: incoming.frecuencia || '',
          duracion: incoming.duracion || '',
          duracion_dias: diasDeDuracion(incoming.duracion) ?? '',
          dicho: incoming.dicho || '',
        })
      }
    })
    next.tratamiento_items = mergedTx
  }

  if (!soloVolki && Array.isArray(datos.vacunas_items) && datos.vacunas_items.length > 0) {
    const existingVx = (prev.vacunas_items || []).filter(i => i.vacuna?.trim())
    const mergedVx = [...existingVx]
    const nPreviasVx = existingVx.length   // ver comentario en tratamientos

    datos.vacunas_items.forEach(incoming => {
      const matchedIdx = mergedVx.findIndex((item, i) =>
        i < nPreviasVx && nombresSimilares(item.vacuna, incoming.vacuna))
      if (matchedIdx > -1) {
        const matchedItem = { ...mergedVx[matchedIdx] }
        if (incoming.vacuna) matchedItem.vacuna = incoming.vacuna
        if (incoming.lote) matchedItem.lote = incoming.lote
        if (incoming.proxima_dosis) matchedItem.proxima_dosis = incoming.proxima_dosis
        if (incoming.dicho) matchedItem.dicho = incoming.dicho
        mergedVx[matchedIdx] = matchedItem
      } else {
        mergedVx.push({
          vacuna: incoming.vacuna || '',
          lote: incoming.lote || '',
          proxima_dosis: incoming.proxima_dosis || '',
          dicho: incoming.dicho || '',
        })
      }
    })
    next.vacunas_items = mergedVx
  }

  return next
}

/**
 * Pasa a «Observaciones» las palabras que la IA no ubicó en ningún campo, para
 * que no se pierdan en silencio. No repite lo que ya está escrito ni deja
 * términos duplicados.
 */
export function agregarSinUbicar(observaciones: string, terminos: string[]): string {
  const actual = observaciones ?? ''
  const nuevos = terminos.filter((t, i) =>
    t.trim() !== '' &&
    terminos.indexOf(t) === i &&
    !actual.toLowerCase().includes(t.toLowerCase()))
  if (nuevos.length === 0) return actual
  const linea = `No ubicado por la IA: ${nuevos.join(', ')}.`
  return actual.trim() === '' ? linea : `${actual.trim()}\n${linea}`
}
