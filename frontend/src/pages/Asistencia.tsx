import { useCallback, useEffect, useState } from 'react'
import { Alert, Badge, Button, Col, Empty, Flex, Input, Modal, Row, Select, Skeleton, Space, Table, Tag, Tooltip, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  BarChartOutlined, ClockCircleOutlined, DeleteOutlined, EditOutlined, HistoryOutlined,
  LoginOutlined, LogoutOutlined, ReloadOutlined, WarningOutlined, MedicineBoxOutlined,
} from '@ant-design/icons'
import { api } from '../services/api'
import { useToast } from '../components/Toast'
import { useConfirmar } from '../components/Confirmar'
import { useRefrescoAuto } from '../hooks/useRefrescoAuto'
import { BRAND, ESTADO } from '@src/core/color'
import { MEDIDAS } from '@src/core/medidas'
import { Fila, Panel } from '../components/PanelLista'

const { Title, Text } = Typography

// ── Forma de lo que devuelve /api/asistencia/ ──────────────────────────────
interface Doctor { id: number; nombre: string }
interface Marcacion {
  id: number
  usuario_id: number
  usuario_nombre?: string | null
  fecha: string
  hora_ingreso: string
  hora_salida?: string | null
  tardanza_min?: number | null
  horas_trabajadas?: number | null
}
interface ResumenDoctor {
  usuario_id: number
  usuario_nombre?: string | null
  dias: number
  total_horas: number
  tardanzas: number
}
interface Filtros { usuarioId: string; desde: string; hasta: string }

const pad = (n: number) => String(n).padStart(2, '0')
const aFechaLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
/** Fecha de hoy en hora local (AAAA-MM-DD), sin desfase por UTC. */
const hoyStr = () => aFechaLocal(new Date())
const haceUnaSemanaStr = () => { const d = new Date(); d.setDate(d.getDate() - 7); return aFechaLocal(d) }

const fmtHora = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '—'

/** ISO → valor para <input type="datetime-local"> en hora local. */
const aInputLocal = (iso?: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${aFechaLocal(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const fmtFecha = (f?: string) => {
  if (!f) return '—'
  // f viene como 'AAAA-MM-DD'; se evita el desfase de zona horaria
  const [y, m, d] = f.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
}

const nombreDe = (r: { usuario_id: number; usuario_nombre?: string | null }) => r.usuario_nombre ?? `#${r.usuario_id}`

const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : 'Ocurrió un error.')

export default function Asistencia() {
  const confirmar = useConfirmar()
  const toast = useToast()
  const [doctores, setDoctores] = useState<Doctor[]>([])
  const [hoyRegs, setHoyRegs] = useState<Marcacion[]>([])      // marcaciones de hoy (para los botones)
  const [registros, setRegistros] = useState<Marcacion[]>([])  // reporte filtrado
  const [resumen, setResumen] = useState<ResumenDoctor[]>([])  // totales por doctor
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [marcando, setMarcando] = useState<number | null>(null) // doctor en proceso: evita el doble clic
  const [filtros, setFiltros] = useState<Filtros>({ usuarioId: '', desde: haceUnaSemanaStr(), hasta: hoyStr() })

  // Corrección manual de una marcación
  const [editando, setEditando] = useState<Marcacion | null>(null)
  const [formEdit, setFormEdit] = useState({ hora_ingreso: '', hora_salida: '' })
  const [guardandoEdit, setGuardandoEdit] = useState(false)
  const [errorEdit, setErrorEdit] = useState<string | null>(null)

  const cargarDoctores = useCallback(async () => {
    const data = await api.get('/api/usuarios/doctores')
    setDoctores(Array.isArray(data) ? data : [])
  }, [])

  const cargarHoy = useCallback(async () => {
    const h = hoyStr()
    const data = await api.get(`/api/asistencia/?desde=${h}&hasta=${h}`)
    setHoyRegs(Array.isArray(data) ? data : [])
  }, [])

  const cargarReporte = useCallback(async () => {
    const p = new URLSearchParams()
    if (filtros.usuarioId) p.set('usuario_id', filtros.usuarioId)
    if (filtros.desde) p.set('desde', filtros.desde)
    if (filtros.hasta) p.set('hasta', filtros.hasta)
    const [data, res] = await Promise.all([
      api.get(`/api/asistencia/?${p.toString()}`),
      api.get(`/api/asistencia/resumen?${p.toString()}`),
    ])
    setRegistros(Array.isArray(data) ? data : [])
    setResumen(Array.isArray(res) ? res : [])
  }, [filtros])

  useEffect(() => {
    // Carga inicial; el reporte filtrado se vuelve a pedir solo con «Buscar»
    Promise.all([cargarDoctores(), cargarHoy(), cargarReporte()])
      .catch(e => toast.error(mensajeDe(e)))
      .finally(() => setCargando(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-actualización cada 20 s (silenciosa), solo con la pestaña a la vista
  useRefrescoAuto(() => { Promise.all([cargarHoy(), cargarReporte()]).catch(() => {}) }, 20000)

  const refrescar = async () => {
    setRefrescando(true)
    try { await Promise.all([cargarDoctores(), cargarHoy(), cargarReporte()]) }
    catch (e) { toast.error(mensajeDe(e)) }
    finally { setRefrescando(false) }
  }

  // Marcación abierta de hoy para un doctor (sin hora de salida)
  const abiertaDe = (docId: number) => hoyRegs.find(r => r.usuario_id === docId && !r.hora_salida)

  const marcarIngreso = async (doc: Doctor) => {
    if (marcando) return
    setMarcando(doc.id)
    try {
      await api.post('/api/asistencia/ingreso', { usuario_id: doc.id })
      toast.success(`Ingreso de ${doc.nombre} registrado`)
      await Promise.all([cargarHoy(), cargarReporte()])
    } catch (e) { toast.error(mensajeDe(e)) }
    finally { setMarcando(null) }
  }

  const marcarSalida = async (reg: Marcacion, doc: Doctor) => {
    if (marcando) return
    setMarcando(doc.id)
    try {
      await api.post(`/api/asistencia/${reg.id}/salida`)
      toast.success(`Salida de ${doc.nombre} registrada`)
      await Promise.all([cargarHoy(), cargarReporte()])
    } catch (e) { toast.error(mensajeDe(e)) }
    finally { setMarcando(null) }
  }

  const eliminar = async (reg: Marcacion) => {
    if (!await confirmar({
      titulo: 'Eliminar marcación',
      mensaje: `Se borrará la marcación de ${reg.usuario_nombre ?? 'este usuario'}.`,
      detalle: 'Si la hora está mal, es mejor corregirla que borrarla: así queda constancia del turno trabajado.',
      confirmarTexto: 'Eliminar',
    })) return
    try {
      await api.del(`/api/asistencia/${reg.id}`)
      setRegistros(prev => prev.filter(x => x.id !== reg.id))
      setHoyRegs(prev => prev.filter(x => x.id !== reg.id))
      toast.success('Marcación eliminada')
    } catch (e) { toast.error(mensajeDe(e)) }
  }

  // ── Corrección de horas ────────────────────────────────────────────────────
  // Los horarios varían y no siempre se alcanza a marcar en el momento exacto,
  // así que la recepción puede ajustar la hora real sin borrar el registro.
  const abrirCorreccion = (reg: Marcacion) => {
    setEditando(reg)
    setFormEdit({ hora_ingreso: aInputLocal(reg.hora_ingreso), hora_salida: aInputLocal(reg.hora_salida) })
    setErrorEdit(null)
  }

  const guardarCorreccion = async () => {
    if (!editando) return
    if (!formEdit.hora_ingreso) { setErrorEdit('La hora de ingreso es obligatoria.'); return }
    if (formEdit.hora_salida && formEdit.hora_salida <= formEdit.hora_ingreso) {
      setErrorEdit('La hora de salida debe ser posterior a la de ingreso.'); return
    }
    setGuardandoEdit(true); setErrorEdit(null)
    try {
      await api.put(`/api/asistencia/${editando.id}`, {
        hora_ingreso: new Date(formEdit.hora_ingreso).toISOString(),
        hora_salida: formEdit.hora_salida ? new Date(formEdit.hora_salida).toISOString() : null,
      })
      toast.success('Marcación corregida')
      setEditando(null)
      await Promise.all([cargarHoy(), cargarReporte()])
    } catch (e) { setErrorEdit(mensajeDe(e)) }
    finally { setGuardandoEdit(false) }
  }

  const hoyTexto = new Date().toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const hoy = hoyTexto.charAt(0).toUpperCase() + hoyTexto.slice(1)

  const columnasResumen: TableColumnsType<ResumenDoctor> = [
    { title: 'Doctor', key: 'doctor', render: (_, r) => <Text strong>{nombreDe(r)}</Text> },
    { title: 'Días', dataIndex: 'dias', align: 'center' },
    { title: 'Total horas', dataIndex: 'total_horas', align: 'right', render: (h: number) => <Text strong style={{ color: BRAND.primary }}>{h} h</Text> },
    {
      title: 'Tardanzas', dataIndex: 'tardanzas', align: 'center',
      render: (t: number) => t > 0 ? <Tag color="red" style={{ marginInlineEnd: 0 }}>{t}</Tag> : <Text style={{ color: ESTADO.ok }}>0</Text>,
    },
  ]

  const columnasRegistros: TableColumnsType<Marcacion> = [
    { title: 'Doctor', key: 'doctor', render: (_, r) => <Text strong>{nombreDe(r)}</Text> },
    { title: 'Fecha', dataIndex: 'fecha', render: (f: string) => fmtFecha(f) },
    {
      title: 'Ingreso', key: 'ingreso',
      render: (_, r) => (
        <Space size={8} wrap>
          <Text style={{ color: '#1e6b32' }}>{fmtHora(r.hora_ingreso)}</Text>
          {r.tardanza_min != null && r.tardanza_min > 0 ? (
            <Tag color="red" icon={<WarningOutlined />} style={{ marginInlineEnd: 0 }}>+{r.tardanza_min} min</Tag>
          ) : r.tardanza_min === 0 ? (
            <Tag color="green" style={{ marginInlineEnd: 0 }}>A tiempo</Tag>
          ) : null}
        </Space>
      ),
    },
    {
      title: 'Salida', key: 'salida',
      render: (_, r) => r.hora_salida
        ? <Text style={{ color: ESTADO.peligro }}>{fmtHora(r.hora_salida)}</Text>
        : <Tag color="gold" style={{ marginInlineEnd: 0 }}>En turno</Tag>,
    },
    {
      title: 'Horas', dataIndex: 'horas_trabajadas', align: 'right',
      render: (h?: number | null) => <Text strong>{h != null ? `${h} h` : '—'}</Text>,
    },
    {
      title: '', key: 'acciones', align: 'right', width: 100,
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="Corregir horas">
            <Button type="text" icon={<EditOutlined />} aria-label="Corregir horas" onClick={() => abrirCorreccion(r)} />
          </Tooltip>
          <Tooltip title="Eliminar">
            <Button type="text" danger icon={<DeleteOutlined />} aria-label="Eliminar marcación" onClick={() => eliminar(r)} />
          </Tooltip>
        </Space>
      ),
    },
  ]

  return (
    <div className="animar" style={{ flex: 1, minWidth: 0, padding: '16px 32px 32px', width: '100%' }}>
      <Row justify="space-between" align="bottom" gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col flex="auto">
          <Text type="secondary">{hoy}</Text>
          <Title level={2} style={{ margin: '4px 0 0', fontSize: MEDIDAS.tituloSeccion, fontWeight: 500, lineHeight: '32px' }}>
            Control de asistencia
          </Title>
        </Col>
        <Col>
          <Button icon={<ReloadOutlined spin={refrescando} />} onClick={refrescar} disabled={refrescando}>Actualizar</Button>
        </Col>
      </Row>

      <Space orientation="vertical" size={16} style={{ width: '100%' }}>

        {/* ── Marcación rápida del día ─────────────────────────────── */}
        <Panel titulo="Marcación de hoy" icono={<ClockCircleOutlined />}>
          {cargando ? <div style={{ padding: 20 }}><Skeleton active paragraph={{ rows: 3 }} /></div>
            : doctores.length === 0 ? (
              <Empty style={{ padding: 24 }} image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={<>No hay doctores registrados. Crea cuentas de veterinario en <strong>Usuarios</strong>.</>} />
            ) : doctores.map(doc => {
              const abierta = abiertaDe(doc.id)
              return (
                <Fila key={doc.id}>
                  <MedicineBoxOutlined style={{ color: BRAND.primary, fontSize: 20 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text strong ellipsis style={{ display: 'block' }}>{doc.nombre}</Text>
                    <Space size={6}>
                      <Badge status={abierta ? 'processing' : 'default'} color={abierta ? ESTADO.ok : undefined} />
                      <Text type="secondary" style={{ fontSize: 13, color: abierta ? '#1e6b32' : undefined }}>
                        {abierta ? `En turno desde ${fmtHora(abierta.hora_ingreso)}` : 'Fuera de turno'}
                      </Text>
                    </Space>
                  </div>
                  {abierta ? (
                    <Button danger type="primary" icon={<LogoutOutlined />} loading={marcando === doc.id}
                      onClick={() => marcarSalida(abierta, doc)}>Marcar salida</Button>
                  ) : (
                    <Button type="primary" icon={<LoginOutlined />} loading={marcando === doc.id}
                      onClick={() => marcarIngreso(doc)}>Marcar ingreso</Button>
                  )}
                </Fila>
              )
            })}
        </Panel>

        {/* ── Resumen por doctor (según el rango filtrado) ─────────── */}
        {resumen.length > 0 && (
          <Panel titulo="Resumen de horas por doctor" icono={<BarChartOutlined />}>
            <Table<ResumenDoctor> rowKey="usuario_id" size="middle" pagination={false}
              columns={columnasResumen} dataSource={resumen} scroll={{ x: 'max-content' }} />
          </Panel>
        )}

        {/* ── Historial de marcaciones ─────────────────────────────── */}
        <Panel titulo="Historial de marcaciones" icono={<HistoryOutlined />}>
          <Flex wrap gap={8} align="center" style={{ padding: '12px 20px', borderTop: `1px solid ${BRAND.border}` }}>
            <Select
              aria-label="Doctor" style={{ minWidth: 200 }} value={filtros.usuarioId}
              onChange={(v: string) => setFiltros(f => ({ ...f, usuarioId: v }))}
              options={[{ value: '', label: 'Todos los doctores' }, ...doctores.map(d => ({ value: String(d.id), label: d.nombre }))]}
            />
            <Input type="date" aria-label="Desde" style={{ width: 160 }} value={filtros.desde}
              onChange={e => setFiltros(f => ({ ...f, desde: e.target.value }))} />
            <Input type="date" aria-label="Hasta" style={{ width: 160 }} value={filtros.hasta}
              onChange={e => setFiltros(f => ({ ...f, hasta: e.target.value }))} />
            <Button type="primary" onClick={() => cargarReporte().catch(e => toast.error(mensajeDe(e)))}>Buscar</Button>
          </Flex>
          <Table<Marcacion> rowKey="id" size="middle" columns={columnasRegistros} dataSource={registros}
            pagination={{ pageSize: 15, hideOnSinglePage: true, showSizeChanger: false }}
            scroll={{ x: 'max-content' }}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Sin marcaciones para los filtros seleccionados." /> }} />
        </Panel>
      </Space>

      {/* ── Corregir horas de una marcación ─────────────────────────── */}
      <Modal
        open={!!editando} onCancel={() => setEditando(null)} destroyOnHidden
        title={editando && (
          <Flex vertical>
            <span>Corregir marcación</span>
            <Text type="secondary" style={{ fontSize: 13, fontWeight: 400 }}>{nombreDe(editando)} · {fmtFecha(editando.fecha)}</Text>
          </Flex>
        )}
        okText="Guardar corrección" cancelText="Cancelar" onOk={guardarCorreccion} confirmLoading={guardandoEdit}
      >
        <Flex vertical gap={16} style={{ paddingTop: 8 }}>
          <Text type="secondary">
            Ajusta la hora real de entrada y salida cuando el horario varíe o no se haya alcanzado a marcar en el momento.
          </Text>
          <Flex vertical gap={6}>
            <label htmlFor="asist-ingreso"><Text strong>Hora de ingreso *</Text></label>
            <Input id="asist-ingreso" type="datetime-local" size="large" autoFocus value={formEdit.hora_ingreso}
              onChange={e => setFormEdit(f => ({ ...f, hora_ingreso: e.target.value }))} />
          </Flex>
          <Flex vertical gap={6}>
            <label htmlFor="asist-salida"><Text strong>Hora de salida</Text></label>
            <Input id="asist-salida" type="datetime-local" size="large" value={formEdit.hora_salida}
              onChange={e => setFormEdit(f => ({ ...f, hora_salida: e.target.value }))} />
            <Text type="secondary" style={{ fontSize: 13 }}>Déjala vacía si el doctor sigue en turno.</Text>
          </Flex>
          {errorEdit && <Alert type="error" showIcon title={errorEdit} />}
        </Flex>
      </Modal>
    </div>
  )
}
