import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { Alert, Badge, Button, Flex, Grid, Segmented, Select, Skeleton, Tabs, Typography, theme } from 'antd'
import {
  CheckCircleFilled,
  FileTextOutlined, MedicineBoxOutlined, SaveOutlined,
} from '@ant-design/icons'
import { BRAND } from '@src/core/color'
import { generarPDF } from '../utils/pdfGenerator'
import { api, esVeterinario } from '../services/api'
import { useConfirmar } from '../components/Confirmar'
import { useToast } from '../components/Toast'
import VoiceTextProcessor from '../components/VoiceTextProcessor'
import DocumentosPaciente from '../components/DocumentosPaciente'
import SeccionesConsulta from '../components/consulta/Secciones'
import FormularioVolki from '../components/consulta/FormularioVolki'
import ColumnaPaciente from '../components/consulta/ColumnaPaciente'
import Disposicion from '../components/consulta/Disposicion'
import type { FichaPaciente, FichaResponsable, TurnoPaciente } from '../components/consulta/ColumnaPaciente'
import type { ProductoInventario } from '../components/consulta/TablaProductos'
import TarjetaConsulta from '../components/consulta/TarjetaConsulta'
import EleccionModo from '../components/consulta/EleccionModo'
import Cronometro from '../components/consulta/Cronometro'
import type { Resaltado } from '../components/consulta/campos'
import type { MedicamentoInventario } from '../components/consulta/ListaTratamientos'
import type { VacunaCatalogo } from '../components/consulta/ListaVacunas'
import {
  CAMPOS_FUERA_DE_VOLKI, FIELD_TO_SECTION, agregarSinUbicar, FORM_VACIO, SECCIONES,
  armarPayloadConsulta, claveBorrador, contarCamposLlenos,
  describirCuando, esReciente, fechaPeru, formFromHistoria, formularioVacio, hoyISOPeru,
  leerBorrador, mezclarDatosIA, ordenarHistorias,
} from '@src/utils/historiaClinica'
import type {
  CampoTexto, DatosIA, FormConsulta, Historia, ItemProductoAplicado, ItemTratamiento, ModoRegistro,
} from '@src/utils/historiaClinica'

// Lo que decide qué se guarda vive en `utils/historiaClinica.ts`; se vuelve a
// exportar aquí porque las pruebas (y quien ya importaba de la pantalla) lo piden de este archivo.
export {
  buildPayload, formularioVacio, normalizarBorrador, esReciente, ordenarHistorias,
} from '@src/utils/historiaClinica'

type Paciente = FichaPaciente

interface Doctor { id: number; nombre: string }

/** El servidor devuelve errores con `message`; si no hay, se usa el texto de siempre. */
const mensajeDe = (e: unknown, defecto: string) =>
  (e as { message?: string } | null)?.message ?? defecto

interface AvisoBorrador { cuando: string; recuperado: boolean }


export default function HistoriasClinicas() {
  const confirmar = useConfirmar()
  const toast = useToast()
  const { pacienteId: id } = useParams()
  const navigate = useNavigate()
  const { state: navState } = useLocation()   // { citaId } cuando se viene de "Atender"
  const { token } = theme.useToken()
  const pantallas = Grid.useBreakpoint()
  const movil = !pantallas.md

  // ── Datos
  const [paciente, setPaciente] = useState<Paciente | null>(null)
  // Columna derecha: quién es el responsable y los próximos turnos del paciente
  const [responsable, setResponsable] = useState<FichaResponsable | null>(null)
  const [turnos, setTurnos] = useState<TurnoPaciente[]>([])
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
  const [errForm, setErrForm] = useState<string | null>(null)
  // «Atendió el doctor» falta: el aviso sale junto al selector, no al pie
  const [errDoctor, setErrDoctor] = useState(false)
  const [seccionActiva, setSeccionActiva] = useState('s1')
  // Cómo se llena la consulta NUEVA: se elige antes de empezar (null = aún no
  // eligió) y de ahí salen el método guardado y el momento en que arranca el
  // cronómetro. El formulario es el mismo en los dos; solo cambia el método.
  const [modo, setModo] = useState<ModoRegistro | null>(
    () => (borrador && esReciente(borrador.guardadoEn) ? (borrador.modo ?? 'manual') : null),
  )
  const [inicioMs, setInicioMs] = useState<number | null>(
    () => (borrador && esReciente(borrador.guardadoEn) ? Date.now() : null),
  )
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
  // Palabras del dictado que la IA no puso en ningún campo: se muestran para no perderlas en silencio
  const [sinUbicar, setSinUbicar] = useState<string[]>([])
  const [inferenciasBrut, setInferenciasBrut] = useState<Record<string, string>>({})
  const [highlights, setHighlights] = useState<Record<string, Resaltado>>({})

  // ── Quién atendió. El doctor firma su propia consulta; la recepcionista
  //    la llena por él en consulta cargada y tiene que decir de quién es.
  const llenaRecepcion = !esVeterinario()
  const [doctores, setDoctores] = useState<Doctor[]>([])
  const [vetId, setVetId] = useState('')
  const [catalogoVacunas, setCatalogoVacunas] = useState<VacunaCatalogo[]>([])
  const [medicamentos, setMedicamentos] = useState<MedicamentoInventario[]>([])
  // Todo el inventario, para buscar en «Productos aplicados»
  const [productos, setProductos] = useState<ProductoInventario[]>([])
  // Sube cada vez que la IA llena el formulario: el formulario abre los paneles con datos
  const [senalIA, setSenalIA] = useState(0)
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

  // Responsable del paciente (la ficha del paciente solo trae su id)
  useEffect(() => {
    if (!paciente?.cliente_id) return
    api.get(`/api/clientes/${paciente.cliente_id}`)
      .then((c: FichaResponsable) => setResponsable({ id: c.id, nombre: c.nombre, telefono: c.telefono }))
      .catch(() => setResponsable(null))
  }, [paciente?.cliente_id])

  // Próximos turnos. Se vuelven a pedir al guardar una consulta, porque un
  // «próximo control» agenda un turno solo.
  useEffect(() => {
    api.get(`/api/citas/?paciente_id=${id}&desde=${hoyISOPeru()}`)
      .then((c: TurnoPaciente[]) => setTurnos(
        (Array.isArray(c) ? c : []).filter(t => t.estado === 'pendiente' || t.estado === 'confirmada')))
      .catch(() => setTurnos([]))
  }, [id, historias.length])

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
    api.get('/api/productos/?limit=2000')
      .then((p: ProductoInventario[]) => setProductos(Array.isArray(p) ? p : []))
      .catch(() => { setProductos([]); setCatalogosFallaron(true) })
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

  /** Ir a otra pantalla desde las migas o los botones: si hay consulta a medio llenar, se pregunta. */
  const irConAviso = async (ruta: string) => {
    if (hayCambios && !await confirmar({
      titulo: 'Consulta sin guardar',
      mensaje: 'Tienes una consulta a medio llenar. Se guarda como borrador y podrás retomarla al volver a esta mascota, pero todavía no queda registrada en la historia clínica.',
      confirmarTexto: 'Salir igual',
      peligroso: false,
    })) return
    navigate(ruta)
  }

  /** Después de guardar o cancelar se vuelve a la ficha del paciente (su historial). */
  const irAlHistorial = (estado?: Record<string, unknown>) =>
    navigate(`/pacientes/${id}/historial`, estado ? { state: estado } : undefined)


  // La lista de doctores solo hace falta si la escribe la recepcionista
  useEffect(() => {
    if (!llenaRecepcion) return
    api.get('/api/usuarios/doctores')
      .then((d: Doctor[]) => setDoctores(Array.isArray(d) ? d : []))
      .catch(() => setDoctores([]))
  }, [llenaRecepcion])

  // ── Autoguardado del borrador en localStorage
  useEffect(() => {
    const clave = claveBorrador(id, editandoId)
    if (formularioVacio(form)) {
      localStorage.removeItem(clave)
    } else {
      localStorage.setItem(clave, JSON.stringify({
        form, guardadoEn: new Date().toISOString(), modo,
      }))
    }
  }, [form, id, editandoId, modo])

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
  const setTratamientos = (items: ItemTratamiento[]) => setLista('tratamiento_items', items)
  const setLibreDemanda = (valor: boolean) =>
    setForm(p => ({ ...p, alimentacion_libre_demanda: valor }))
  const setProductosAplicados = (items: ItemProductoAplicado[]) =>
    setForm(p => ({ ...p, productos_aplicados: items }))

  // ── Resetear formulario + estado IA
  const resetForm = () => {
    setForm(FORM_VACIO)
    setEditandoId(null)
    setErrForm(null)
    setHighlights({})
    setTranscripcionIA('')
    setDatosIA(null)
    setSinUbicar([])
    setInferenciasBrut({})
    setSeccionActiva('s1')
    setSeccionesConAviso(new Set())
    setVetId('')
    setAvisoBorrador(null)
    // La siguiente consulta vuelve a la elección y su cronómetro parte de cero
    setModo(null)
    setInicioMs(null)
  }

  // «Cancelar» al pie del formulario: si hay algo escrito, se confirma antes de vaciar
  const cancelarConsulta = async () => {
    if (hayCambios && !await confirmar({
      titulo: 'Cancelar la consulta',
      mensaje: 'Tienes una consulta a medio llenar. Si cancelas, se vacía el formulario y el tiempo se descarta.',
      detalle: 'Lo que escribiste se perderá.',
      confirmarTexto: 'Cancelar y vaciar',
    })) return
    localStorage.removeItem(claveBorrador(id))
    resetForm()
    irAlHistorial()
  }

  // Traer un borrador viejo que se dejó sin tocar
  const recuperarBorrador = () => {
    if (!borrador) return
    setForm(borrador.form)
    setAvisoBorrador(a => (a ? { ...a, recuperado: true } : a))
    // El formulario no se ve hasta elegir cómo se llena: se abre con el modo del borrador
    if (modo === null) elegirModo(borrador.modo ?? 'manual')
  }

  const descartarBorrador = () => {
    localStorage.removeItem(claveBorrador(id))
    setAvisoBorrador(null)
    if (avisoBorrador?.recuperado) setForm(FORM_VACIO)
  }

  // Elegir cómo se llena la consulta nueva: aquí arranca el cronómetro.
  const elegirModo = (m: ModoRegistro) => {
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
    // El que se desplaza es el panel central de la disposición, no la página
    document.querySelector('[data-disposicion="central"]')?.scrollTo({ top: 0, behavior: 'smooth' })
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
    setSenalIA(n => n + 1)

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
    if (reducido && !modo) return   // no se guarda una consulta nueva sin elegir cómo se llenó
    // Una consulta nueva sin nada escrito no se guarda: quedaría con su tiempo y ensuciaría las mediciones
    if (!editandoId && formularioVacio(form)) {
      setErrForm('La consulta está vacía. Escribe o dicta algo antes de guardar.')
      return
    }
    if (llenaRecepcion && !vetId) {
      setErrDoctor(true)
      setErrForm(null)
      const selector = document.getElementById('vet-atendio')
      selector?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      selector?.focus()
      return
    }
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
        // Si se vino de "Atender" un turno, márcalo como atendido
        if (navState?.citaId) {
          try {
            await api.put(`/api/citas/${navState.citaId}`, { estado: 'atendida' })
          } catch {
            toast.error('La consulta quedó guardada, pero no se pudo marcar el turno como atendido. Márcalo desde Turnos.')
          }
        }
      }
      // Guardada: se limpia el borrador y se vuelve al historial, donde ya aparece la consulta
      localStorage.removeItem(claveBorrador(id, editandoId))
      const segundos = !editandoId && typeof payload.segundos_registro === 'number' ? payload.segundos_registro : null
      const fueEdicion = !!editandoId
      resetForm()
      irAlHistorial({ guardada: fueEdicion ? 'actualizada' : 'nueva', segundos })
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

  // Cargando o con error, la pantalla conserva la misma disposición (menú, contenido y
  // columna derecha), para que nada se mueva cuando llegan los datos.
  if (loading) {
    return (
      <Disposicion lateral={<Skeleton active paragraph={{ rows: 8 }} />}>
        <Skeleton active paragraph={{ rows: 10 }} />
      </Disposicion>
    )
  }
  if (error) {
    return (
      <Disposicion lateral={<span />}>
        <Alert
          type="error" showIcon title={error}
          description="Revisa tu conexión. Si estás en el celular con poca señal, vuelve a intentarlo."
          action={
            <Flex gap={8} wrap>
              <Button type="primary" onClick={() => setIntento(n => n + 1)}>Reintentar</Button>
              <Button onClick={() => navigate(-1)}>Volver</Button>
            </Flex>
          }
        />
      </Disposicion>
    )
  }

  // Botones del pie, iguales en consulta nueva y al corregir una guardada
  const pie = (
    <>
      {errForm && <Alert type="error" showIcon title={errForm} />}
      <Flex justify="flex-end" gap={8} wrap>
        <Button size={movil ? 'large' : 'middle'} onClick={cancelarConsulta} style={movil ? { flex: 1 } : undefined}>
          Cancelar
        </Button>
        <Button
          type="primary" size={movil ? 'large' : 'middle'} loading={guardando} onClick={handleSave}
          icon={<SaveOutlined />}
          style={movil ? { flex: 2 } : { minWidth: 180 }}
        >
          {guardando ? 'Guardando…' : editandoId ? 'Actualizar consulta' : 'Guardar'}
        </Button>
      </Flex>
    </>
  )

  const migas = [
    { title: <a href="/clientes" onClick={e => { e.preventDefault(); irConAviso('/clientes') }}>Clientes</a> },
    {
      title: responsable
        ? <a href={`/clientes/${responsable.id}`} onClick={e => { e.preventDefault(); irConAviso(`/clientes/${responsable.id}`) }}>{responsable.nombre}</a>
        : '…',
    },
    { title: <a href={`/pacientes/${id}/historial`} onClick={e => { e.preventDefault(); irConAviso(`/pacientes/${id}/historial`) }}>{paciente?.nombre}</a> },
    { title: 'Consulta' },
  ]


  return (
    <Disposicion
      migas={migas}
      lateral={paciente && (
        <ColumnaPaciente
          paciente={paciente} responsable={responsable}
          historias={historias} turnos={turnos}
          onDescargar={historias.length > 0 ? () => generarPDF(paciente, historias) : undefined}
        />
      )}
    >
      <Flex vertical gap={16}>
            <Flex vertical gap={16}>

              {/* ── Panel IA / Voz ───────────────────────────────────────────── */}
              {/* Solo en «Dictar» (o al corregir una consulta). En «Escribir» no hay voz. */}
              {(modo === 'ia' || !reducido) && (
                <VoiceTextProcessor
                  onResult={({ datos, inferencias, alertas_rango, transcripcion, sin_ubicar }: {
                    datos: DatosIA
                    inferencias: Record<string, string>
                    alertas_rango: Record<string, unknown>
                    transcripcion: string
                    sin_ubicar?: string[]
                  }) => {
                    setSinUbicar(Array.isArray(sin_ubicar) ? sin_ubicar : [])
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

              {/* Lo que la IA no supo dónde poner: se ofrece pasarlo a Observaciones */}
              {sinUbicar.length > 0 && (
                <Alert
                  type="info" showIcon
                  title={`La IA no ubicó: ${sinUbicar.join(', ')}`}
                  description="Revisa si falta algo en el formulario. Puedes pasarlas a Observaciones para no perderlas."
                  action={
                    <Flex gap={8} wrap>
                      <Button
                        size={movil ? 'middle' : 'small'} type="primary"
                        onClick={() => {
                          setForm(p => ({ ...p, observaciones: agregarSinUbicar(p.observaciones, sinUbicar) }))
                          setSinUbicar([])
                        }}
                      >
                        Pasar a Observaciones
                      </Button>
                      <Button size={movil ? 'middle' : 'small'} onClick={() => setSinUbicar([])}>Descartar</Button>
                    </Flex>
                  }
                />
              )}

              {/* Badge de inferidos pendientes */}
              {numInferidos > 0 && (
                <Alert
                  type="warning" showIcon
                  title={`${numInferidos} campo${numInferidos > 1 ? 's' : ''} inferido${numInferidos > 1 ? 's' : ''} por revisar — resaltado${numInferidos > 1 ? 's' : ''} en amarillo abajo`}
                />
              )}

              {/* ── Formulario ─────────────────────────────────────────────── */}
              <Flex vertical gap={12}>
                <Flex align="center" justify="space-between" gap={8} wrap>
                  <Typography.Title level={5} style={{ margin: 0 }}>
                    {editandoId ? 'Editando consulta' : 'Nueva consulta'}
                  </Typography.Title>
                  {editandoId ? (
                    <Button type="link" onClick={cancelarConsulta}>Cancelar edición</Button>
                  ) : modo && inicioMs !== null && (
                    <Flex align="center" gap={12} wrap>
                      <Cronometro key={inicioMs} inicioMs={inicioMs} />
                      <Segmented<ModoRegistro>
                        aria-label="Cómo se llena la consulta" value={modo} onChange={cambiarModo} size={movil ? 'large' : 'middle'}
                        options={[{ value: 'manual', label: 'Escribir' }, { value: 'ia', label: 'Dictar' }]}
                      />
                    </Flex>
                  )}
                </Flex>
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
                      status={errDoctor ? 'error' : undefined}
                      onChange={(v: string) => { setVetId(v ?? ''); setErrDoctor(false) }}
                      options={doctores.map(d => ({ value: String(d.id), label: d.nombre }))}
                      style={{ minWidth: 220 }}
                    />
                    {errDoctor && (
                      <Typography.Text type="danger" role="alert" style={{ fontSize: 13 }}>
                        Indica qué veterinario atendió la consulta.
                      </Typography.Text>
                    )}
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      La consulta queda a su nombre; tu usuario queda registrado como quien la escribió.
                    </Typography.Text>
                  </Flex>
                )}

                {mostrarFormulario && catalogosFallaron && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    No se pudo cargar el inventario; escribe el nombre.
                  </Typography.Text>
                )}

                {/* Consulta nueva: el formulario de Volki, una sola página */}
                {reducido && modo !== null && (
                  <FormularioVolki
                    form={form} resaltados={highlights}
                    set={setCampo} setEop={setEop} setLibreDemanda={setLibreDemanda}
                    setTratamientos={setTratamientos} setProductosAplicados={setProductosAplicados}
                    medicamentos={medicamentos} productos={productos} senalIA={senalIA}
                  >
                    {pie}
                  </FormularioVolki>
                )}

                {/* Corregir una consulta guardada: todos sus campos, por pestañas */}
                {!reducido && (
                  <>
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
                    <SeccionesConsulta
                      activa={seccionVisible}
                      form={form} resaltados={highlights}
                      set={setCampo} setEop={setEop} setLista={setLista}
                      setLibreDemanda={setLibreDemanda} setProductosAplicados={setProductosAplicados}
                      medicamentos={medicamentos} productos={productos} catalogoVacunas={catalogoVacunas}
                      especie={paciente?.especie}
                    />
                    {pie}
                  </>
                )}
              </Flex>
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
    </Disposicion>
  )
}
