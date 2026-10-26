import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Col, Empty, Flex, Row, Select, Skeleton, Space, Table, Tag, Tooltip, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  DeleteOutlined, EditOutlined, LeftOutlined, MedicineBoxOutlined, PlusOutlined, PrinterOutlined, ReloadOutlined,
  RightOutlined, UserOutlined, WhatsAppOutlined, ClockCircleOutlined,
} from '@ant-design/icons'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { api, getToken } from '../services/api'
import { useConfirmar } from '../components/Confirmar'
import { useToast } from '../components/Toast'
import { Panel } from '../components/PanelLista'
import AsistenteTurno, { type CitaTurno, type Doctor } from '../components/turnos/AsistenteTurno'
import { estadoLabel, ESTADOS_CITA, waRecordatorio } from '../utils/citas'
import { clinicaActual } from '../services/clinica'
import { BRAND, PDF_MARCA } from '@src/core/color'
import { MEDIDAS } from '@src/core/medidas'

const { Title, Text } = Typography

const API_BASE_URL = import.meta.env.VITE_API_URL ?? ''

const NOMBRES_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DIAS_SEMANA = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do']
const COLOR_CITA: Record<string, string> = { pendiente: 'warning', confirmada: 'blue', atendida: 'success', cancelada: 'default' }

interface Cita extends CitaTurno {
  paciente_especie?: string | null
  cliente_id?: number | null
  telefono?: string | null
  veterinario_nombre?: string | null
}
interface InfoPaciente { nombre: string; especie: string; propietario: string; clienteId?: number | null; telefono?: string | null }

const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : 'Ocurrió un error.')
const pad2 = (n: number) => String(n).padStart(2, '0')
const formatHora = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
const formatFecha = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
const SIN_INFO: InfoPaciente = { nombre: '(sin nombre)', especie: '-', propietario: '-' }
const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function buildCalendar(year: number, month: number): (number | null)[][] {
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(firstDow).fill(null)]
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  const weeks: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  const ult = weeks[weeks.length - 1]
  if (ult.length < 7) ult.push(...Array(7 - ult.length).fill(null))
  return weeks
}

export default function Turnos() {
  const confirmar = useConfirmar()
  const toast = useToast()
  const navigate = useNavigate()
  const now = useMemo(() => new Date(), [])

  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [selected, setSelected] = useState<number | null>(now.getDate())
  const [citas, setCitas] = useState<Cita[]>([])
  const [pacienteMap, setPacienteMap] = useState<Record<number, InfoPaciente>>({})
  const [doctores, setDoctores] = useState<Doctor[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Asistente de turno
  const [modalAbierto, setModalAbierto] = useState(false)
  const [editCita, setEditCita] = useState<Cita | null>(null)   // turno que se corrige; null = turno nuevo
  const [fechaNueva, setFechaNueva] = useState('')
  const [filtroDoctor, setFiltroDoctor] = useState<number | null>(null)
  const [refrescando, setRefrescando] = useState(false)

  const todayDay = now.getDate()
  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth()

  // Solo se piden las citas del mes visible, más las próximas 20 (el listado
  // "Próximos turnos" puede caer en otro mes). Antes se traía toda la historia.
  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true)
    setError(null)
    const desdeMes = `${viewYear}-${pad2(viewMonth + 1)}-01`
    const hastaMes = `${viewYear}-${pad2(viewMonth + 1)}-${pad2(new Date(viewYear, viewMonth + 1, 0).getDate())}`
    const hoy = new Date()
    const hoyStr = `${hoy.getFullYear()}-${pad2(hoy.getMonth() + 1)}-${pad2(hoy.getDate())}`
    try {
      const [citasMes, citasProximas, doctoresData] = await Promise.all([
        api.get(`/api/citas/?desde=${desdeMes}&hasta=${hastaMes}`),
        api.get(`/api/citas/?desde=${hoyStr}&limit=20`),
        api.get('/api/usuarios/doctores'),
      ])
      // Unión sin duplicados (una cita de hoy puede aparecer en ambas listas)
      const combinadas = new Map<number, Cita>()
      ;[...citasMes, ...citasProximas].forEach((c: Cita) => combinadas.set(c.id, c))
      const citasData = Array.from(combinadas.values())
      // La info del paciente/dueño viene embebida en cada cita (no se cargan los 2000+ clientes).
      const map: Record<number, InfoPaciente> = {}
      citasData.forEach(c => {
        if (c.paciente_id) map[c.paciente_id] = {
          nombre: c.paciente_nombre ?? '(sin nombre)', especie: c.paciente_especie ?? '-',
          propietario: c.propietario ?? '-', clienteId: c.cliente_id, telefono: c.telefono,
        }
      })
      setPacienteMap(map); setCitas(citasData); setDoctores(doctoresData)
    } catch (e) {
      setError(mensajeDe(e))
    } finally {
      setCargando(false)
    }
  }, [viewYear, viewMonth])

  useEffect(() => { cargar() }, [cargar])

  // Sincronización en tiempo real vía Server-Sent Events (SSE)
  useEffect(() => {
    const token = getToken() || ''
    const es = new EventSource(`${API_BASE_URL}/api/citas/stream?token=${encodeURIComponent(token)}`)
    es.onmessage = (e) => { if (e.data === 'citas_updated' && !modalAbierto) cargar(true) }
    return () => es.close()
  }, [modalAbierto, cargar])

  const refrescar = async () => { setRefrescando(true); await cargar(true); setRefrescando(false) }

  // Agenda filtrada opcionalmente por doctor asignado
  const citasVisibles = filtroDoctor ? citas.filter(c => c.veterinario_id === filtroDoctor) : citas
  const citasDelDia = (dia: number | null) => {
    if (!dia) return []
    return citasVisibles.filter(c => {
      const d = new Date(c.fecha_hora)
      return d.getFullYear() === viewYear && d.getMonth() === viewMonth && d.getDate() === dia
    })
  }
  const diasConTurno = new Set(
    citasVisibles
      .filter(c => { const d = new Date(c.fecha_hora); return d.getFullYear() === viewYear && d.getMonth() === viewMonth })
      .map(c => new Date(c.fecha_hora).getDate()),
  )
  const hoyInicio = new Date(now.getFullYear(), now.getMonth(), todayDay)
  const citasProximas = [...citasVisibles]
    .filter(c => new Date(c.fecha_hora) >= hoyInicio)
    .sort((a, b) => +new Date(a.fecha_hora) - +new Date(b.fecha_hora))
    .slice(0, 20)

  const panelDia = selected ?? todayDay
  const panelFecha = mayus(new Date(viewYear, viewMonth, panelDia).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }))
  const panelEsHoy = isCurrentMonth && panelDia === todayDay
  const turnosDia = citasDelDia(panelDia).sort((a, b) => +new Date(a.fecha_hora) - +new Date(b.fecha_hora))
  const weeks = buildCalendar(viewYear, viewMonth)

  const cambiarMes = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1)
    setViewYear(d.getFullYear()); setViewMonth(d.getMonth()); setSelected(null)
  }

  // Imprime/descarga la agenda del día seleccionado en PDF (para el mostrador)
  const imprimirAgenda = () => {
    const lista = turnosDia
    const fechaTxt = mayus(new Date(viewYear, viewMonth, panelDia).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    doc.setFillColor(...PDF_MARCA); doc.rect(0, 0, 210, 20, 'F')
    doc.setTextColor(255, 255, 255); doc.setFontSize(14); doc.setFont('helvetica', 'bold')
    doc.text(`${clinicaActual().nombre} — Agenda del día`, 14, 9)
    doc.setFontSize(10); doc.setFont('helvetica', 'normal')
    doc.text(fechaTxt, 14, 16)
    if (lista.length === 0) {
      doc.setTextColor(80); doc.text('Sin turnos para este día.', 14, 30)
    } else {
      autoTable(doc, {
        startY: 26,
        head: [['Hora', 'Paciente', 'Especie', 'Dueño', 'Teléfono', 'Motivo', 'Doctor', 'Estado']],
        body: lista.map(c => [
          formatHora(c.fecha_hora), c.paciente_nombre ?? '—', c.paciente_especie ?? '—', c.propietario ?? '—',
          c.telefono ?? '—', c.motivo ?? '—', c.veterinario_nombre ?? 'Sin asignar', estadoLabel(c.estado),
        ]),
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: PDF_MARCA },
        margin: { left: 14, right: 14 },
      })
    }
    doc.save(`Agenda_${viewYear}-${pad2(viewMonth + 1)}-${pad2(panelDia)}.pdf`)
  }

  // Cambia el estado de una cita (confirmar / atender / cancelar)
  const cambiarEstado = async (cita: Cita, nuevoEstado: string) => {
    if (nuevoEstado === cita.estado) return
    try {
      await api.put(`/api/citas/${cita.id}`, { estado: nuevoEstado })
      setCitas(prev => prev.map(c => c.id === cita.id ? { ...c, estado: nuevoEstado } : c))
    } catch (e) { toast.error(mensajeDe(e)) }
  }

  // Elimina un turno (creado por error o duplicado). Confirma antes.
  const eliminarCita = async (cita: Cita) => {
    if (!await confirmar({
      titulo: 'Eliminar turno',
      mensaje: 'El turno desaparece de la agenda y no se puede recuperar.',
      detalle: 'Si el turno ya se atendió o el cliente no vino, es mejor cambiarle el estado a "Atendida" o "Cancelada": así queda el registro de lo que pasó.',
      confirmarTexto: 'Eliminar turno',
    })) return
    try {
      await api.del(`/api/citas/${cita.id}`)
      setCitas(prev => prev.filter(c => c.id !== cita.id))
      toast.success('Turno eliminado')
    } catch (e) { toast.error(mensajeDe(e)) }
  }

  // Texto de trazabilidad para el tooltip del botón "Editar turno"
  const tituloTrazabilidad = (cita: Cita) => {
    if (!cita.creado_por && !cita.actualizado_por) return 'Editar turno'
    let txt = `Agendado por ${cita.creado_por ?? '—'}`
    if (cita.actualizado_por && cita.actualizado_por !== cita.creado_por) txt += ` · última edición: ${cita.actualizado_por}`
    return txt
  }

  const abrirModal = () => {
    setEditCita(null)
    setFechaNueva(`${viewYear}-${pad2(viewMonth + 1)}-${pad2(panelDia)}`)
    setModalAbierto(true)
  }
  const abrirEditar = (cita: Cita) => { setEditCita(cita); setModalAbierto(true) }
  const cerrarModal = () => { setModalAbierto(false); setEditCita(null) }

  const opcionesEstado = ESTADOS_CITA.map(s => ({ value: s, label: estadoLabel(s) }))
  const selectorEstado = (cita: Cita) => (
    <Select size="small" value={cita.estado} options={opcionesEstado} onChange={v => cambiarEstado(cita, v)}
      aria-label="Estado del turno" style={{ minWidth: 118 }} />
  )
  const acciones = (cita: Cita, info: InfoPaciente, atender = false) => (
    <Space size={4} wrap>
      {atender && (
        <Tooltip title="Atender (registrar historia)">
          <Button size="small" type="primary" onClick={() => navigate(`/pacientes/${cita.paciente_id}/historial`, { state: { citaId: cita.id } })}>Atender</Button>
        </Tooltip>
      )}
      <Tooltip title={tituloTrazabilidad(cita)}><Button size="small" icon={<EditOutlined />} aria-label="Editar turno" onClick={() => abrirEditar(cita)} /></Tooltip>
      <Tooltip title="Eliminar turno"><Button size="small" danger icon={<DeleteOutlined />} aria-label="Eliminar turno" onClick={() => eliminarCita(cita)} /></Tooltip>
      {info.telefono && (
        <Tooltip title="Recordatorio por WhatsApp">
          <Button size="small" type="primary" icon={<WhatsAppOutlined />} aria-label="Recordatorio por WhatsApp" style={{ background: '#25a244' }}
            href={waRecordatorio(info.telefono, info.propietario, info.nombre, cita)} target="_blank" rel="noopener noreferrer" />
        </Tooltip>
      )}
    </Space>
  )
  const infoDe = (c: Cita) => pacienteMap[c.paciente_id] ?? SIN_INFO

  const columnas: TableColumnsType<Cita> = [
    { title: 'Fecha', key: 'f', render: (_, c) => <Text strong>{formatFecha(c.fecha_hora)}</Text> },
    { title: 'Hora', key: 'h', render: (_, c) => formatHora(c.fecha_hora) },
    {
      title: 'Paciente', key: 'p',
      render: (_, c) => { const i = infoDe(c); return <Button type="link" style={{ padding: 0 }} disabled={!i.clienteId} onClick={() => i.clienteId && navigate(`/clientes/${i.clienteId}`)}>{i.nombre}</Button> },
    },
    { title: 'Motivo', dataIndex: 'motivo', render: (m?: string | null) => m ?? '—' },
    { title: 'Propietario', key: 'o', render: (_, c) => <Text type="secondary">{infoDe(c).propietario}</Text> },
    { title: 'Doctor', key: 'd', render: (_, c) => c.veterinario_nombre ? <Text style={{ color: BRAND.primary }}><MedicineBoxOutlined /> {c.veterinario_nombre}</Text> : <Text type="secondary">—</Text> },
    { title: 'Estado', key: 'e', render: (_, c) => selectorEstado(c) },
    { title: 'Acciones', key: 'a', align: 'center', render: (_, c) => acciones(c, infoDe(c)) },
  ]

  const hoyTexto = mayus(now.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))

  return (
    <div className="animar" style={{ flex: 1, minWidth: 0, padding: '16px 32px 32px', width: '100%' }}>
      <Row justify="space-between" align="bottom" gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col flex="auto">
          <Text type="secondary">{hoyTexto}</Text>
          <Title level={2} style={{ margin: '4px 0 0', fontSize: MEDIDAS.tituloSeccion, fontWeight: 500, lineHeight: '32px' }}>Turnos y agenda</Title>
        </Col>
        <Col>
          <Space wrap>
            <Select allowClear showSearch optionFilterProp="label" placeholder="Todos los doctores" aria-label="Filtrar por doctor" style={{ minWidth: 200, maxWidth: '100%' }}
              value={filtroDoctor ?? undefined} onChange={v => setFiltroDoctor(v ?? null)}
              options={doctores.map(d => ({ value: d.id, label: d.nombre }))} />
            <Button icon={<ReloadOutlined spin={refrescando} />} disabled={refrescando} onClick={refrescar}>Actualizar</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={abrirModal}>Nuevo turno</Button>
          </Space>
        </Col>
      </Row>

      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        {error && <Alert type="error" showIcon title={error} action={<Button size="small" onClick={() => cargar()}>Reintentar</Button>} />}

        <Row gutter={[16, 16]}>
          {/* Calendario */}
          <Col xs={24} md={16}>
            <Card className="tarjeta-viva" styles={{ body: { padding: 0 } }}>
              <Flex justify="space-between" align="center" style={{ padding: '12px 20px', borderBottom: `1px solid ${BRAND.border}`, background: BRAND.panel }}>
                <Button type="text" icon={<LeftOutlined />} aria-label="Mes anterior" onClick={() => cambiarMes(-1)} />
                <Text strong style={{ fontSize: 16 }}>{NOMBRES_MES[viewMonth]} {viewYear}</Text>
                <Button type="text" icon={<RightOutlined />} aria-label="Mes siguiente" onClick={() => cambiarMes(1)} />
              </Flex>
              <div style={{ padding: '8px 12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center' }}>
                  {DIAS_SEMANA.map(d => <Text key={d} type="secondary" strong style={{ fontSize: 12, padding: '8px 0' }}>{d}</Text>)}
                  {weeks.flat().map((dia, i) => {
                    if (!dia) return <span key={i} />
                    const esHoy = isCurrentMonth && dia === todayDay
                    const esSel = dia === selected
                    return (
                      <div key={i} style={{ display: 'grid', placeItems: 'center', padding: 2 }}>
                        <Button shape="circle" size="large" type={esHoy ? 'primary' : esSel ? 'default' : 'text'}
                          aria-label={`Día ${dia}${diasConTurno.has(dia) ? ', con turnos' : ''}`} aria-pressed={esSel}
                          onClick={() => setSelected(dia)}
                          style={{ position: 'relative', ...(esSel && !esHoy ? { borderColor: BRAND.primary, color: BRAND.primary, fontWeight: 600 } : {}) }}>
                          {dia}
                          {diasConTurno.has(dia) && !esHoy && (
                            <span style={{ position: 'absolute', bottom: 3, left: '50%', marginLeft: -2, width: 4, height: 4, borderRadius: '50%', background: BRAND.accent }} />
                          )}
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </div>
              <Flex gap={16} style={{ padding: '10px 20px', borderTop: `1px solid ${BRAND.border}`, fontSize: 12 }}>
                <Text type="secondary"><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: BRAND.primary, marginRight: 6 }} />Hoy</Text>
                <Text type="secondary"><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: BRAND.accent, marginRight: 6 }} />Con turnos</Text>
              </Flex>
            </Card>
          </Col>

          {/* Turnos del día seleccionado */}
          <Col xs={24} md={8}>
            <Panel titulo={panelEsHoy ? 'Turnos de hoy' : `Turnos del día ${panelDia}`} icono={<ClockCircleOutlined />}
              accion={<Button size="small" icon={<PrinterOutlined />} disabled={turnosDia.length === 0} onClick={imprimirAgenda}>Imprimir</Button>}>
              <div style={{ padding: '0 20px 8px' }}><Text type="secondary" style={{ fontSize: 12 }}>{panelFecha}</Text></div>
              {cargando ? <div style={{ padding: 20 }}><Skeleton active paragraph={{ rows: 3 }} /></div>
                : turnosDia.length === 0 ? <Empty style={{ padding: '24px 0' }} image={Empty.PRESENTED_IMAGE_SIMPLE} description="Sin turnos para este día" />
                  : turnosDia.map(cita => {
                    const info = infoDe(cita)
                    return (
                      <div key={cita.id} className="fila-hover" style={{ padding: '12px 20px', borderTop: `1px solid ${BRAND.border}`, opacity: cita.estado === 'cancelada' ? 0.6 : 1 }}>
                        <Flex justify="space-between" align="center">
                          <Text strong><ClockCircleOutlined /> {formatHora(cita.fecha_hora)}</Text>
                          <Tag color={COLOR_CITA[cita.estado] ?? 'default'} style={{ margin: 0 }}>{estadoLabel(cita.estado)}</Tag>
                        </Flex>
                        <div><Text strong>{cita.motivo ?? '(sin motivo)'}</Text></div>
                        <Button type="link" size="small" style={{ padding: 0, height: 'auto' }} disabled={!info.clienteId}
                          onClick={() => info.clienteId && navigate(`/clientes/${info.clienteId}`)}>{info.nombre} · {info.especie}</Button>
                        <div><Text type="secondary" style={{ fontSize: 12 }}><UserOutlined /> {info.propietario}</Text></div>
                        {cita.veterinario_nombre && <div><Text style={{ fontSize: 12, color: BRAND.primary }}><MedicineBoxOutlined /> {cita.veterinario_nombre}</Text></div>}
                        <Flex gap={6} align="center" wrap style={{ marginTop: 8 }}>
                          {selectorEstado(cita)}
                          {acciones(cita, info, true)}
                        </Flex>
                      </div>
                    )
                  })}
              <div style={{ padding: '12px 20px', borderTop: `1px solid ${BRAND.border}` }}>
                <Button block icon={<PlusOutlined />} onClick={abrirModal}>Nuevo turno</Button>
              </div>
            </Panel>
          </Col>
        </Row>

        <Panel titulo="Próximos turnos" icono={<ClockCircleOutlined />} accion={<Tag style={{ margin: 0 }}>{citasProximas.length}</Tag>}>
          {cargando ? <div style={{ padding: 20 }}><Skeleton active paragraph={{ rows: 5 }} /></div> : (
            <Table<Cita> rowKey="id" size="middle" columns={columnas} dataSource={citasProximas} pagination={false} scroll={{ x: 'max-content' }}
              rowClassName={c => (c.estado === 'cancelada' ? 'fila-inactiva' : '')}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No hay turnos próximos registrados" /> }} />
          )}
        </Panel>
      </Space>

      {modalAbierto && (
        <AsistenteTurno
          key={editCita?.id ?? 'nuevo'}
          editCita={editCita}
          fechaInicial={fechaNueva}
          doctores={doctores}
          citas={citas}
          onCerrar={cerrarModal}
          onGuardado={async () => { await cargar(true); cerrarModal() }}
          onIrAClientes={() => navigate('/clientes')}
        />
      )}
    </div>
  )
}
