import { useState, useEffect } from 'react'
import type { CSSProperties } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { Alert, Badge, Button, Flex, Grid, Segmented, Select, Tabs, Typography, theme } from 'antd'
import {
  ArrowLeftOutlined, CheckCircleFilled, CheckOutlined, DownloadOutlined,
  FileTextOutlined, MedicineBoxOutlined, SaveOutlined,
} from '@ant-design/icons'
import { BRAND } from '@src/core/color'
import { generarPDF } from '../utils/pdfGenerator'
import { api, esVeterinario } from '../services/api'
import { useConfirmar } from '../components/Confirmar'
import VoiceTextProcessor from '../components/VoiceTextProcessor'
import DocumentosPaciente from '../components/DocumentosPaciente'
import { CargandoPantalla } from '../components/Cargando'
import SeccionesConsulta from '../components/consulta/Secciones'
import TarjetaConsulta from '../components/consulta/TarjetaConsulta'
import EleccionModo from '../components/consulta/EleccionModo'
import Cronometro, { formatoTiempo } from '../components/consulta/Cronometro'
import type { Resaltado } from '../components/consulta/campos'
import type { MedicamentoInventario } from '../components/consulta/ListaTratamientos'
import type { VacunaCatalogo } from '../components/consulta/ListaVacunas'
import {
  CAMPOS_FUERA_DE_VOLKI, FIELD_TO_SECTION, FORM_VACIO, SECCIONES,
  armarPayloadConsulta, claveBorrador, contarCamposLlenos,
  describirCuando, esReciente, fechaPeru, formFromHistoria, formularioVacio,
  leerBorrador, mezclarDatosIA, ordenarHistorias,
} from '@src/utils/historiaClinica'
import type { CampoTexto, DatosIA, FormConsulta, Historia, ModoRegistro } from '@src/utils/historiaClinica'

// Lo que decide qué se guarda vive en `utils/historiaClinica.ts`; se vuelve a
// exportar aquí porque las pruebas (y quien ya importaba de la pantalla) lo piden de este archivo.
export {
  buildPayload, formularioVacio, normalizarBorrador, esReciente, ordenarHistorias,
} from '@src/utils/historiaClinica'

interface Paciente {
  nombre: string
  especie?: string
  raza?: string
  cliente?: { nombre: string }
}

interface Doctor { id: number; nombre: string }

/** El servidor devuelve errores con `message`; si no hay, se usa el texto de siempre. */
const mensajeDe = (e: unknown, defecto: string) =>
  (e as { message?: string } | null)?.message ?? defecto

interface AvisoBorrador { cuando: string; recuperado: boolean }

/** Texto en una sola línea que termina en «…» si no cabe. */
const CORTAR: CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

export default function HistoriasClinicas() {
  const confirmar = useConfirmar()
  const { pacienteId: id } = useParams()
  const navigate = useNavigate()
  const { state: navState } = useLocation()   // { citaId } cuando se viene de "Atender"
  const { token } = theme.useToken()
  const pantallas = Grid.useBreakpoint()
  const movil = !pantallas.md

  // ── Datos
  const [paciente, setPaciente] = useState<Paciente | null>(null)
  const [historias, setHistorias] = useState<Historia[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Sube al pulsar «Reintentar» para volver a pedir los datos del paciente
  const [intento, setIntento] = useState(0)

  // ── Formulario
  // El borrador se lee UNA vez al montar (initializer perezoso) y de ahí sale
  // tanto el formulario inicial como el aviso que se le muestra al usuario.
  const [borrador] = useState(() => leerBorrador(id))
  const [form, setForm] = useState<FormConsulta>(
    () => (borrador && esReciente(borrador.guardadoEn) ? borrador.form : FORM_VACIO)
  )
  // Aviso visible: recuperado (reciente) o disponible (viejo, sin tocar)
  const [avisoBorrador, setAvisoBorrador] = useState<AvisoBorrador | null>(
    () => (borrador
      ? { cuando: describirCuando(borrador.guardadoEn), recuperado: esReciente(borrador.guardadoEn) }
      : null)
  )
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [guardadoOk, setGuardadoOk] = useState(false)
  const [errForm, setErrForm] = useState<string | null>(null)
  const [seccionActiva, setSeccionActiva] = useState('s1')
  // Cómo se llena la consulta NUEVA: se elige antes de empezar (null = aún no
  // eligió) y de ahí salen el método guardado y el momento en que arranca el
  // cronómetro. El formulario es el mismo en los dos; solo cambia el método.
  const [modo, setModo] = useState<ModoRegistro | null>(null)
  const [inicioMs, setInicioMs] = useState<number | null>(null)
  // Segundos de la última consulta guardada, para mostrarlos al volver a la elección
  const [ultimoTiempo, setUltimoTiempo] = useState<number | null>(null)
  // Consulta nueva = formulario de una sola página con los campos de la
  // réplica; corregir una guardada muestra todos sus campos, por pestañas.
  const reducido = editandoId === null
  const mostrarFormulario = !reducido || modo !== null
  const seccionVisible = reducido ? 'todas' : seccionActiva
  // Secciones donde la IA dejó algo por revisar (punto naranja en la pestaña)
  const [seccionesConAviso, setSeccionesConAviso] = useState<Set<string>>(() => new Set())

  // ── IA / voz
  const [transcripcionIA, setTranscripcionIA] = useState('')
  const [datosIA, setDatosIA] = useState<DatosIA | null>(null)
  const [inferenciasBrut, setInferenciasBrut] = useState<Record<string, string>>({})
  const [highlights, setHighlights] = useState<Record<string, Resaltado>>({})

  // ── Quién atendió. El doctor firma su propia consulta; la recepcionista
  //    la llena por él en consulta cargada y tiene que decir de quién es.
  const llenaRecepcion = !esVeterinario()
  const [doctores, setDoctores] = useState<Doctor[]>([])
  const [vetId, setVetId] = useState('')
  const [catalogoVacunas, setCatalogoVacunas] = useState<VacunaCatalogo[]>([])
  const [medicamentos, setMedicamentos] = useState<MedicamentoInventario[]>([])
  // Si no cargan los catálogos, los campos siguen siendo de texto libre pero hay que decirlo
  const [catalogosFallaron, setCatalogosFallaron] = useState(false)

  // ── Carga inicial
  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      api.get(`/api/pacientes/${id}`),
      api.get(`/api/pacientes/${id}/historias/`),
    ])
      .then(([pac, hists]) => { setPaciente(pac); setHistorias(Array.isArray(hists) ? hists : []) })
      .catch(() => setError('No se pudo cargar el paciente.'))
      .finally(() => setLoading(false))
  }, [id, intento])

  // Catálogo de vacunas. Vive en el backend porque es el mismo que usa la
  // consolidación para agrupar; si falla, el desplegable queda vacío y la
  // vacuna se sigue pudiendo escribir a mano ("Otra").
  useEffect(() => {
    api.get('/api/catalogos/vacunas')
      .then((v: VacunaCatalogo[]) => setCatalogoVacunas(Array.isArray(v) ? v : []))
      .catch(() => { setCatalogoVacunas([]); setCatalogosFallaron(true) })
    // Medicamentos del inventario, para enlazar lo recetado con lo que la
    // clínica tiene. Si falla, el campo sigue siendo texto libre.
    api.get('/api/productos/?categoria=medicamento&limit=500')
      .then((p: MedicamentoInventario[]) => setMedicamentos(Array.isArray(p) ? p : []))
      .catch(() => { setMedicamentos([]); setCatalogosFallaron(true) })
  }, [])

  // ── Salir con la consulta a medio llenar ───────────────────────────────────
  // El borrador la salva, pero nadie lo sabe en el momento: sin aviso, cerrar
  // la pestaña se siente como perder el trabajo.
  const hayCambios = !formularioVacio(form)

  useEffect(() => {
    if (!hayCambios) return
    const alSalir = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', alSalir)
    return () => window.removeEventListener('beforeunload', alSalir)
  }, [hayCambios])

  /** Navegación interna: el aviso del navegador no cubre moverse dentro de la
   *  aplicación, así que el botón de volver pregunta por su cuenta. */
  const salir = async () => {
    if (hayCambios && !await confirmar({
      titulo: 'Consulta sin guardar',
      mensaje: 'Tienes una consulta a medio llenar. Se guarda como borrador y podrás retomarla al volver a esta mascota, pero todavía no queda registrada en la historia clínica.',
      confirmarTexto: 'Salir igual',
      peligroso: false,
    })) return
    navigate(-1)
  }

  // La lista de doctores solo hace falta si la escribe la recepcionista
  useEffect(() => {
    if (!llenaRecepcion) return
    api.get('/api/usuarios/doctores')
      .then((d: Doctor[]) => setDoctores(Array.isArray(d) ? d : []))
      .catch(() => setDoctores([]))
  }, [llenaRecepcion])

  // ── Autoguardado del borrador en localStorage
  useEffect(() => {
    if (formularioVacio(form)) {
      localStorage.removeItem(claveBorrador(id))
    } else {
      localStorage.setItem(claveBorrador(id), JSON.stringify({
        form, guardadoEn: new Date().toISOString(),
      }))
    }
  }, [form, id])

  // ── Setters que limpian su resaltado al editar
  const setCampo = (f: CampoTexto, valor: string) => {
    setForm(p => ({ ...p, [f]: valor }))
    if (highlights[f]) setHighlights(p => { const n = { ...p }; delete n[f]; return n })
  }
  const setEop = (s: string, c: 'estado' | 'detalle', valor: string) =>
    setForm(p => ({
      ...p,
      examen_particular: { ...p.examen_particular, [s]: { ...p.examen_particular[s], [c]: valor } },
    }))
  const setLista = (campo: 'tratamiento_items' | 'vacunas_items', items: unknown[]) =>
    setForm(p => ({ ...p, [campo]: items }))

  // ── Resetear formulario + estado IA
  const resetForm = () => {
    setForm(FORM_VACIO)
    setEditandoId(null)
    setErrForm(null)
    setHighlights({})
    setTranscripcionIA('')
    setDatosIA(null)
    setInferenciasBrut({})
    setSeccionActiva('s1')
    setSeccionesConAviso(new Set())
    setVetId('')
    setAvisoBorrador(null)
    // La siguiente consulta vuelve a la elección y su cronómetro parte de cero
    setModo(null)
    setInicioMs(null)
  }

  // Traer un borrador viejo que se dejó sin tocar
  const recuperarBorrador = () => {
    if (!borrador) return
    setForm(borrador.form)
    setAvisoBorrador(a => (a ? { ...a, recuperado: true } : a))
  }

  const descartarBorrador = () => {
    localStorage.removeItem(claveBorrador(id))
    setAvisoBorrador(null)
    if (avisoBorrador?.recuperado) setForm(FORM_VACIO)
  }

  // Elegir cómo se llena la consulta nueva: aquí arranca el cronómetro.
  const elegirModo = (m: ModoRegistro) => {
    setUltimoTiempo(null)
    setModo(m)
    setInicioMs(Date.now())
  }

  // Cambiar de modo a mitad. Si ya hay algo escrito, se avisa antes: el
  // formulario se vacía para que el tiempo medido en cada modo parta de cero.
  const cambiarModo = async (nuevo: ModoRegistro) => {
    if (nuevo === modo) return
    if (hayCambios) {
      const ok = await confirmar({
        titulo: 'Cambiar de modo',
        mensaje: 'Tienes una consulta a medio llenar. Al cambiar de modo se vacía el formulario y el tiempo vuelve a empezar de cero.',
        detalle: 'Lo que escribiste se perderá.',
        confirmarTexto: 'Cambiar y vaciar',
      })
      if (!ok) return
      resetForm()
    }
    elegirModo(nuevo)
  }

  const handleEdit = (h: Historia) => {
    // Corregir una consulta guardada no se mide: se ven todos sus campos
    setModo(null)
    setInicioMs(null)
    setForm(formFromHistoria(h))
    setEditandoId(h.id)
    // Al corregir, se mantiene el doctor que ya figuraba
    setVetId(h.veterinario_id ? String(h.veterinario_id) : '')
    setHighlights({})
    setSeccionActiva('s1')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Auto-editar si viene de otra pantalla con un editarHistoriaId específico
  useEffect(() => {
    if (navState?.editarHistoriaId && historias.length > 0) {
      const h = historias.find(x => x.id === navState.editarHistoriaId)
      if (h) {
        handleEdit(h)
      }
    }
  }, [historias, navState])

  const handleDelete = async (h: Historia) => {
    const fecha = fechaPeru((h.fecha || h.creado_en) as string)
    if (!await confirmar({
      titulo: 'Eliminar consulta',
      mensaje: `Se borrará la consulta del ${fecha} del historial de este paciente.`,
      detalle: 'No se puede deshacer. Es parte del registro clínico del animal.',
      confirmarTexto: 'Eliminar consulta',
    })) return
    try {
      await api.del(`/api/pacientes/${id}/historias/${h.id}`)
      setHistorias(p => p.filter(x => x.id !== h.id))
      if (editandoId === h.id) resetForm()   // si estábamos editándola, limpia el formulario
    } catch (e) {
      setErrForm(mensajeDe(e, 'No se pudo eliminar la consulta.'))
    }
  }

  // ── Volcar datos de IA al formulario
  const applyIA = (datos: DatosIA, inferencias: Record<string, string>, alertasRango: Record<string, unknown> = {}) => {
    // En una consulta nueva la IA solo llena los campos del formulario que se ve;
    // lo demás que haya entendido se ignora (y no se resalta).
    const soloVolki = reducido
    const fuera = (campo: string) => soloVolki && (CAMPOS_FUERA_DE_VOLKI as string[]).includes(campo)

    setForm(prev => mezclarDatosIA(prev, datos, medicamentos, soloVolki))

    // Resaltados: "explicito" → "ok", "inferido" → "inferido"
    const hl: Record<string, Resaltado> = {}
    for (const [campo, tipo] of Object.entries(inferencias)) {
      if (fuera(campo)) continue
      hl[campo] = tipo === 'inferido' ? 'inferido' : 'ok'
    }
    // Las alertas de rango fisiológico tienen prioridad (rojo)
    for (const campo of Object.keys(alertasRango || {})) {
      if (fuera(campo)) continue
      hl[campo] = 'alerta'
    }
    setHighlights(hl)

    // Marcar las secciones con inferidos o alertas de rango y llevar al doctor
    // a la primera: con pestañas no basta con "abrirlas", hay que ir.
    const porRevisar = new Set<string>()
    for (const [campo, tipo] of Object.entries(hl))
      if ((tipo === 'inferido' || tipo === 'alerta') && FIELD_TO_SECTION[campo])
        porRevisar.add(FIELD_TO_SECTION[campo])
    setSeccionesConAviso(porRevisar)
    if (porRevisar.size > 0) {
      const primera = SECCIONES.find(sec => porRevisar.has(sec.id))
      if (primera) setSeccionActiva(primera.id)
    }
  }

  // ── Guardar
  const handleSave = async () => {
    if (llenaRecepcion && !vetId) {
      setErrForm('Indica qué veterinario atendió la consulta.')
      return
    }
    if (reducido && !modo) return   // no se guarda una consulta nueva sin elegir cómo se llenó
    setGuardando(true); setErrForm(null)
    try {
      // Consulta nueva: campos de Volki + tiempo y método elegidos. Corregir: todo, sin medir.
      const payload = armarPayloadConsulta(form, { editando: !reducido, modo, inicioMs })
      if (llenaRecepcion) payload.veterinario_id = Number(vetId)
      // Auditoría IA
      if (transcripcionIA) payload.transcripcion = transcripcionIA
      if (datosIA) payload.datos_ia = { ...datosIA, inferencias: inferenciasBrut }

      if (editandoId) {
        const r = await api.put(`/api/pacientes/${id}/historias/${editandoId}`, payload)
        setHistorias(p => ordenarHistorias(p.map(h => h.id === editandoId ? r : h)))
      } else {
        const r = await api.post(`/api/pacientes/${id}/historias/`, payload)
        setHistorias(p => ordenarHistorias([r, ...p]))
        if (typeof payload.segundos_registro === 'number') setUltimoTiempo(payload.segundos_registro)
        // Si se vino de "Atender" un turno, márcalo como atendido
        if (navState?.citaId) {
          try { await api.put(`/api/citas/${navState.citaId}`, { estado: 'atendida' }) } catch { /* no crítico */ }
        }
      }
      setGuardadoOk(true)
      setTimeout(() => setGuardadoOk(false), 2500)
      resetForm()
    } catch (e) {
      setErrForm(mensajeDe(e, 'Error al guardar.'))
    } finally {
      setGuardando(false)
    }
  }

  // Secciones con algo escrito: la pestaña lo muestra para saber de un vistazo
  // qué falta, sin tener que entrar a cada una.
  const seccionesLlenas = (() => {
    const llenas = new Set<string>()
    for (const [campo, valor] of Object.entries(form)) {
      if (!valor || (Array.isArray(valor) && valor.length === 0)) continue
      const sec = FIELD_TO_SECTION[campo]
      if (sec) llenas.add(sec)
    }
    // Los que no están en el mapa campo→sección
    if ((form.tratamiento_items?.length || form.vacunas_items?.length ||
         form.proxima_cita)) llenas.add('s5')
    if (form.examen_particular &&
        Object.values(form.examen_particular).some(x => x.estado || x.detalle)) llenas.add('s3')
    return llenas
  })()

  // ── Contador de inferidos pendientes
  const numInferidos = Object.values(highlights).filter(v => v === 'inferido').length

  if (loading) return <CargandoPantalla />
  if (error) return (
    <Alert
      type="error" showIcon title={error} style={{ margin: 24 }}
      description="Revisa tu conexión. Si estás en el celular con poca señal, vuelve a intentarlo."
      action={
        <Flex gap={8} wrap>
          <Button type="primary" onClick={() => setIntento(n => n + 1)}>Reintentar</Button>
          <Button onClick={() => navigate(-1)}>Volver</Button>
        </Flex>
      }
    />
  )

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: movil ? 12 : 20 }}>
      <Flex vertical gap={16}>

        {/* Encabezado */}
        <Flex
          align="center" justify="space-between" gap={8}
          style={{ background: BRAND.primary, color: token.colorTextLightSolid, borderRadius: token.borderRadiusLG, padding: '10px 14px' }}
        >
          <Flex align="center" gap={10} style={{ minWidth: 0, flex: 1 }}>
            <Button
              type="text" aria-label="Volver" onClick={salir}
              icon={<ArrowLeftOutlined />} style={{ color: token.colorTextLightSolid, flexShrink: 0 }}
            />
            {/* Un nombre o una raza largos se cortan con «…» en vez de empujar el botón PDF */}
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: 17, lineHeight: 1.2, color: 'inherit', ...CORTAR }}>{paciente?.nombre}</h1>
              <div
                style={{ fontSize: 13, opacity: 0.85, ...CORTAR }}
                title={[paciente?.especie, paciente?.raza, paciente?.cliente?.nombre].filter(Boolean).join(' · ')}
              >
                {paciente?.especie}{paciente?.raza ? ` · ${paciente.raza}` : ''}
                {paciente?.cliente ? ` · ${paciente.cliente.nombre}` : ''}
              </div>
            </div>
          </Flex>
          <Button
            style={{ flexShrink: 0 }}
            icon={<DownloadOutlined />} disabled={historias.length === 0}
            aria-label="Descargar historia clínica en PDF"
            onClick={() => generarPDF(paciente, historias)}
          >
            {movil ? null : 'PDF'}
          </Button>
        </Flex>

        {/* ── Panel IA / Voz ─────────────────────────────────────────────── */}
        {/* Solo en «Dictar» (o al corregir una consulta). En «Escribir» no hay voz. */}
        {(modo === 'ia' || !reducido) && (
          <VoiceTextProcessor
            onResult={({ datos, inferencias, alertas_rango, transcripcion }: {
              datos: DatosIA
              inferencias: Record<string, string>
              alertas_rango: Record<string, unknown>
              transcripcion: string
            }) => {
              // `applyIA` marca que este registro se asistió con IA
              setTranscripcionIA(transcripcion)
              setDatosIA(datos)
              setInferenciasBrut(inferencias)
              applyIA(datos, inferencias, alertas_rango)
            }}
            resumirResultado={({ datos }: { datos: DatosIA }) => {
              // Confirmar cuántos campos se completaron: sin esto el veterinario
              // tiene que recorrer el formulario entero para saber qué entendió la IA.
              const n = contarCamposLlenos(datos, reducido)
              return n ? `${n} campo${n > 1 ? 's' : ''} completado${n > 1 ? 's' : ''}` : 'No se detectaron datos'
            }}
          />
        )}

        {/* Badge de inferidos pendientes */}
        {numInferidos > 0 && (
          <Alert
            type="warning" showIcon
            title={`${numInferidos} campo${numInferidos > 1 ? 's' : ''} inferido${numInferidos > 1 ? 's' : ''} por revisar — resaltado${numInferidos > 1 ? 's' : ''} en amarillo abajo`}
          />
        )}

        {/* ── Formulario ─────────────────────────────────────────────────── */}
        <Flex vertical gap={12}>
          <Flex align="center" justify="space-between" gap={8} wrap>
            <Typography.Title level={5} style={{ margin: 0 }}>
              {editandoId ? 'Editando consulta' : 'Nueva consulta'}
            </Typography.Title>
            {editandoId ? (
              <Button type="link" onClick={resetForm}>Cancelar edición</Button>
            ) : modo && inicioMs !== null && (
              <Flex align="center" gap={12} wrap>
                <Cronometro key={inicioMs} inicioMs={inicioMs} />
                <Segmented<ModoRegistro>
                  value={modo} onChange={cambiarModo} size={movil ? 'large' : 'middle'}
                  options={[{ value: 'manual', label: 'Escribir' }, { value: 'ia', label: 'Dictar' }]}
                />
              </Flex>
            )}
          </Flex>
          {reducido && modo === null && ultimoTiempo !== null && (
            <Alert
              type="success" showIcon
              title={`Consulta guardada. Tiempo de registro: ${formatoTiempo(ultimoTiempo)}.`}
            />
          )}

          {avisoBorrador && (
            <Alert
              type="warning" showIcon icon={<FileTextOutlined />}
              title={avisoBorrador.recuperado
                ? <>Se recuperó un borrador <strong>{avisoBorrador.cuando}</strong>. Revísalo antes de guardar.</>
                : <>Hay un borrador sin guardar <strong>{avisoBorrador.cuando}</strong>.</>}
              action={
                <Flex gap={8}>
                  {!avisoBorrador.recuperado && (
                    <Button size="small" type="primary" onClick={recuperarBorrador}>Recuperarlo</Button>
                  )}
                  <Button size="small" onClick={descartarBorrador}>Descartar</Button>
                </Flex>
              }
            />
          )}

          {reducido && modo === null && <EleccionModo onElegir={elegirModo} />}

          {mostrarFormulario && llenaRecepcion && (
            <Flex
              wrap align="center" gap={8}
              style={{ background: token.colorPrimaryBg, border: `1px solid ${token.colorPrimaryBorder}`, borderRadius: token.borderRadius, padding: '8px 12px' }}
            >
              <MedicineBoxOutlined style={{ color: BRAND.primary }} />
              <label htmlFor="vet-atendio" style={{ fontWeight: 600 }}>Atendió el doctor:</label>
              <Select
                id="vet-atendio" value={vetId || undefined} placeholder="Selecciona…"
                onChange={(v: string) => setVetId(v ?? '')}
                options={doctores.map(d => ({ value: String(d.id), label: d.nombre }))}
                style={{ minWidth: 220 }}
              />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                La consulta queda a su nombre; tu usuario queda registrado como quien la escribió.
              </Typography.Text>
            </Flex>
          )}

          {/* Pestañas: solo al corregir una consulta guardada (la nueva va en una página) */}
          {!reducido && (
            <Tabs
              activeKey={seccionActiva} onChange={setSeccionActiva}
              size={movil ? 'large' : 'middle'} style={{ marginBottom: -8 }}
              items={SECCIONES.map(sec => ({
                key: sec.id,
                label: (
                  <Flex align="center" gap={6}>
                    <span>{sec.num}. {sec.corto}</span>
                    {seccionesLlenas.has(sec.id) && <CheckCircleFilled style={{ color: BRAND.primary, fontSize: 12 }} />}
                    {/* Punto de aviso: la IA dejó algo por revisar en esa sección */}
                    {seccionesConAviso.has(sec.id) && <Badge status="warning" />}
                  </Flex>
                ),
              }))}
            />
          )}

          {mostrarFormulario && catalogosFallaron && (seccionVisible === 'todas' || seccionVisible === 's5') && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              No se pudo cargar el inventario; escribe el nombre.
            </Typography.Text>
          )}

          {mostrarFormulario && (
            <>
              <SeccionesConsulta
                activa={seccionVisible} reducido={reducido} editando={!!editandoId}
                form={form} resaltados={highlights}
                set={setCampo} setEop={setEop} setLista={setLista}
                medicamentos={medicamentos} catalogoVacunas={catalogoVacunas}
                especie={paciente?.especie}
              />

              {errForm && <Alert type="error" showIcon title={errForm} />}

              <Button
                type="primary" size="large" block loading={guardando} onClick={handleSave}
                icon={guardadoOk ? <CheckOutlined /> : <SaveOutlined />}
              >
                {guardadoOk ? 'Guardado'
                  : guardando ? 'Guardando…'
                  : editandoId ? 'Actualizar consulta' : 'Guardar consulta'}
              </Button>
            </>
          )}
        </Flex>

        {/* ── Documentos: si se está editando una consulta puntual, se acotan a
            ella (radiografía/análisis de ESA visita); si no, quedan a nivel
            de la mascota (p. ej. la libreta de vacunación escaneada). ────── */}
        {id && (
          editandoId
            ? <DocumentosPaciente pacienteId={id} historiaId={editandoId} titulo="Documentos de esta consulta" />
            : <DocumentosPaciente pacienteId={id} />
        )}

        {/* ── Historial ──────────────────────────────────────────────────── */}
        <Flex vertical gap={8}>
          <Typography.Title level={5} style={{ margin: 0 }}>Historial ({historias.length})</Typography.Title>
          {historias.length === 0
            ? <Typography.Text type="secondary" italic>Sin consultas registradas.</Typography.Text>
            : historias.map(h => <TarjetaConsulta key={h.id} h={h} onEdit={handleEdit} onDelete={handleDelete} />)}
        </Flex>

      </Flex>
    </div>
  )
}
