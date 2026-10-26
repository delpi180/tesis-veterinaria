import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Badge, Button, Card, Col, Empty, Flex, Row, Skeleton, Space, Tag, Tooltip, Typography } from 'antd'
import {
  AlertOutlined, CalendarOutlined, CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, DollarOutlined,
  InboxOutlined, ReloadOutlined, UserOutlined, WhatsAppOutlined,
} from '@ant-design/icons'
import { api, getNombre } from '../services/api'
import { estadoLabel, waRecordatorio } from '../utils/citas'
import { useToast } from '../components/Toast'
import { useRefrescoAuto } from '../hooks/useRefrescoAuto'
import { Fila, Panel } from '../components/PanelLista'
import { BRAND, ESTADO } from '@src/core/color'
import { MEDIDAS } from '@src/core/medidas'

const { Title, Text } = Typography

interface CitaHoy {
  id: number
  fecha_hora: string
  estado: string
  motivo?: string | null
  cliente_id?: number | null
  paciente?: string | null
  especie?: string | null
  propietario?: string | null
  telefono?: string | null
  veterinario?: string | null
}
interface ProductoAviso { id: number; nombre: string; codigo?: string | null; lote?: string | null; stock?: number; stock_minimo?: number; vencido?: boolean; dias?: number }
interface AsistenciaHoy { id: number; nombre: string; hora_ingreso: string; hora_salida?: string | null; tardanza_min?: number }
interface Resumen {
  citas_hoy: CitaHoy[]
  stock_bajo: ProductoAviso[]
  por_vencer: ProductoAviso[]
  asistencias_hoy: AsistenciaHoy[]
}
interface CajaHoy { total?: number; num_ventas?: number }

const fmtMoneda = (n: number | string | null | undefined) =>
  `S/ ${Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtHora = (iso?: string | null) => iso ? new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '—'
const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : 'Ocurrió un error.')

const COLOR_CITA: Record<string, string> = { pendiente: 'warning', confirmada: 'blue', atendida: 'success', cancelada: 'default' }

export default function PanelRecepcion() {
  const navigate = useNavigate()
  const toast = useToast()
  const [data, setData] = useState<Resumen | null>(null)   // /dashboard/resumen
  const [caja, setCaja] = useState<CajaHoy | null>(null)   // /dashboard/cierre-caja
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refrescando, setRefrescando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const [res, cj] = await Promise.all([api.get('/api/dashboard/resumen'), api.get('/api/dashboard/cierre-caja')])
      setData(res); setCaja(cj); setError(null)
    } catch (e) {
      setError(mensajeDe(e))
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])
  // Auto-actualización cada 20 s, solo con la pestaña a la vista
  useRefrescoAuto(cargar, 20000)

  const refrescar = async () => { setRefrescando(true); await cargar(); setRefrescando(false) }

  const cambiarEstado = async (id: number, estado: string) => {
    try {
      await api.put(`/api/citas/${id}`, { estado })
      setData(d => d && ({ ...d, citas_hoy: d.citas_hoy.map(c => c.id === id ? { ...c, estado } : c) }))
    } catch (e) { toast.error(mensajeDe(e)) }
  }

  const nombre = getNombre() || 'Recepción'
  const hoyTexto = new Date().toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const hoy = hoyTexto.charAt(0).toUpperCase() + hoyTexto.slice(1)

  const citasHoy = data?.citas_hoy ?? []
  const pendientes = citasHoy.filter(c => c.estado === 'pendiente')
  const activas = citasHoy.filter(c => c.estado !== 'cancelada')
  const stockBajo = data?.stock_bajo ?? []
  const porVencer = data?.por_vencer ?? []
  const asistenciasHoy = data?.asistencias_hoy ?? []

  // Los tres números del día, cada uno lleva a su pantalla
  const tarjetas = [
    {
      titulo: 'Citas sin confirmar', valor: String(pendientes.length), nota: `de ${activas.length} hoy`,
      icono: <CalendarOutlined />, alerta: pendientes.length > 0, color: ESTADO.atencion, ir: '/turnos',
    },
    {
      titulo: 'Stock bajo', valor: String(stockBajo.length), nota: stockBajo.length ? 'productos por reponer' : 'todo en orden',
      icono: <AlertOutlined />, alerta: stockBajo.length > 0, color: ESTADO.peligro, ir: '/inventario',
    },
    {
      titulo: 'Caja de hoy', valor: fmtMoneda(caja?.total), nota: `${caja?.num_ventas ?? 0} venta(s)`,
      icono: <DollarOutlined />, alerta: false, color: BRAND.primary, ir: '/caja',
    },
  ]

  return (
    <div className="animar" style={{ flex: 1, minWidth: 0, padding: '16px 32px 32px', width: '100%' }}>
      <Row justify="space-between" align="bottom" gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col flex="auto">
          <Text type="secondary">{hoy}</Text>
          <Title level={2} style={{ margin: '4px 0 0', fontSize: MEDIDAS.tituloSeccion, fontWeight: 500, lineHeight: '32px' }}>
            Panel de recepción — {nombre}
          </Title>
        </Col>
        <Col>
          <Button icon={<ReloadOutlined spin={refrescando} />} disabled={refrescando} onClick={refrescar}>Actualizar</Button>
        </Col>
      </Row>

      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        {error && <Alert type="error" showIcon title={error} action={<Button size="small" onClick={refrescar}>Reintentar</Button>} />}

        {cargando ? <Card><Skeleton active paragraph={{ rows: 8 }} /></Card> : (
          <>
            <Row gutter={[16, 16]}>
              {tarjetas.map((t, i) => (
                <Col key={t.titulo} xs={24} sm={8}>
                  <Card hoverable className="tarjeta-viva animar" style={{ animationDelay: `${i * 70}ms`, borderColor: t.alerta ? t.color : undefined }}
                    onClick={() => navigate(t.ir)} role="link" aria-label={`${t.titulo}: ${t.valor}`}>
                    <Flex justify="space-between" align="center">
                      <Text type="secondary">{t.titulo}</Text>
                      <span style={{ fontSize: 20, color: t.alerta ? t.color : BRAND.primary }}>{t.icono}</span>
                    </Flex>
                    <div style={{ fontSize: 30, fontWeight: 500, lineHeight: '40px', color: t.alerta ? t.color : undefined }}>{t.valor}</div>
                    <Text type="secondary" style={{ fontSize: 12 }}>{t.nota}</Text>
                  </Card>
                </Col>
              ))}
            </Row>

            {/* Vencimientos: va antes de "por reponer" porque un producto caducado no se puede vender, no es solo un faltante */}
            {porVencer.length > 0 && (
              <Panel titulo="Vencimientos" icono={<AlertOutlined style={{ color: ESTADO.peligro }} />}>
                {porVencer.slice(0, 6).map(p => (
                  <Fila key={p.id}>
                    <Text style={{ flex: 1, minWidth: 0 }} ellipsis>
                      {p.nombre} <Text type="secondary" style={{ fontSize: 12 }}>{p.lote ? `lote ${p.lote}` : p.codigo}</Text>
                    </Text>
                    <Tag color={p.vencido ? 'error' : 'warning'} style={{ margin: 0 }}>
                      {p.vencido ? 'Vencido' : p.dias === 0 ? 'Vence hoy' : `en ${p.dias} d`}
                    </Tag>
                  </Fila>
                ))}
              </Panel>
            )}

            {stockBajo.length > 0 && (
              <Panel titulo="Productos por reponer" icono={<InboxOutlined style={{ color: ESTADO.peligro }} />}
                accion={<Button type="link" onClick={() => navigate('/inventario')}>Ir al inventario →</Button>}>
                {stockBajo.slice(0, 6).map(p => (
                  <Fila key={p.id}>
                    <Text style={{ flex: 1, minWidth: 0 }}>{p.nombre} <Text type="secondary" style={{ fontSize: 12 }}>{p.codigo}</Text></Text>
                    <Text strong style={{ color: ESTADO.peligro }}>{p.stock} / mín {p.stock_minimo}</Text>
                  </Fila>
                ))}
              </Panel>
            )}

            {/* Turnos del día con acciones rápidas */}
            <Panel titulo="Turnos de hoy" icono={<ClockCircleOutlined />}
              accion={<Space><Tag style={{ margin: 0 }}>{activas.length}</Tag><Button type="link" onClick={() => navigate('/turnos')}>Ir a la agenda →</Button></Space>}>
              {citasHoy.length === 0
                ? <Empty style={{ padding: '24px 0' }} image={Empty.PRESENTED_IMAGE_SIMPLE} description="Sin turnos para hoy." />
                : citasHoy.map(c => {
                  const cancelada = c.estado === 'cancelada'
                  return (
                    <div key={c.id} className={cancelada ? 'fila-inactiva' : undefined}
                      style={{ padding: '12px 20px', borderTop: `1px solid ${BRAND.border}`, opacity: cancelada ? 0.55 : 1 }}>
                      <Flex gap={12} align="center" wrap>
                        <Text strong style={{ color: BRAND.primary, width: 64 }}>{fmtHora(c.fecha_hora)}</Text>
                        <Button type="text" style={{ flex: 1, minWidth: 180, height: 'auto', padding: '2px 8px', textAlign: 'left' }}
                          onClick={() => c.cliente_id && navigate(`/clientes/${c.cliente_id}`)}>
                          <Flex vertical align="flex-start" style={{ minWidth: 0 }}>
                            <Text strong>{c.motivo || '(sin motivo)'}</Text>
                            <Text type="secondary" style={{ fontSize: 12 }}><UserOutlined /> {c.paciente} · {c.especie} · {c.propietario}</Text>
                            {c.veterinario && <Text style={{ fontSize: 12, color: BRAND.primary }}>{c.veterinario}</Text>}
                          </Flex>
                        </Button>
                        <Tag color={COLOR_CITA[c.estado] ?? 'default'} style={{ margin: 0 }}>{estadoLabel(c.estado)}</Tag>
                        <Space size={6} wrap>
                          {c.estado === 'pendiente' && (
                            <Button size="small" icon={<CheckCircleOutlined />} onClick={() => cambiarEstado(c.id, 'confirmada')}>Confirmar</Button>
                          )}
                          {c.estado !== 'atendida' && !cancelada && (
                            <Button size="small" onClick={() => cambiarEstado(c.id, 'atendida')}>Atendida</Button>
                          )}
                          {!cancelada && (
                            <Tooltip title="Cancelar"><Button size="small" danger icon={<CloseCircleOutlined />} aria-label="Cancelar cita" onClick={() => cambiarEstado(c.id, 'cancelada')} /></Tooltip>
                          )}
                          {c.telefono && (
                            <Tooltip title="Recordatorio por WhatsApp">
                              <Button size="small" type="primary" icon={<WhatsAppOutlined />} aria-label="Recordatorio por WhatsApp"
                                href={waRecordatorio(c.telefono, c.propietario, c.paciente, c)} target="_blank" rel="noopener noreferrer" style={{ background: '#25a244' }} />
                            </Tooltip>
                          )}
                        </Space>
                      </Flex>
                    </div>
                  )
                })}
            </Panel>

            {/* Asistencias del día */}
            <Panel titulo="Asistencia de hoy" icono={<ClockCircleOutlined />}
              accion={<Space><Tag color="success" style={{ margin: 0 }}>{asistenciasHoy.length}</Tag><Button type="link" onClick={() => navigate('/asistencia')}>Ver historial completo →</Button></Space>}>
              {asistenciasHoy.length === 0
                ? <Empty style={{ padding: '24px 0' }} image={Empty.PRESENTED_IMAGE_SIMPLE} description="Sin ingresos registrados hoy." />
                : asistenciasHoy.map(a => (
                  <Fila key={a.id}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text strong>{a.nombre}</Text><br />
                      <Space size={8}>
                        <Text type="secondary" style={{ fontSize: 12 }}>Ingreso: <strong>{fmtHora(a.hora_ingreso)}</strong></Text>
                        {(a.tardanza_min ?? 0) > 0 && <Tag color="error" style={{ margin: 0 }}>+{a.tardanza_min} min tardanza</Tag>}
                      </Space>
                    </div>
                    {a.hora_salida
                      ? <Text type="secondary">Salida: <strong>{fmtHora(a.hora_salida)}</strong></Text>
                      : <Badge status="processing" text="En turno" />}
                  </Fila>
                ))}
            </Panel>
          </>
        )}
      </Space>
    </div>
  )
}
