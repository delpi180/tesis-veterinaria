import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Col, Empty, Row, Skeleton, Space, Statistic, Tag, Tooltip, Typography } from 'antd'
import {
  CheckOutlined, MedicineBoxOutlined, PlusOutlined, RightOutlined, WarningOutlined,
  WhatsAppOutlined, InboxOutlined, ExperimentOutlined, TeamOutlined,
} from '@ant-design/icons'
import { api, getNombre, getUsuario } from '../services/api'
import { waRecordatorio } from '../utils/citas'
import { BRAND } from '@src/core/color'

const { Title, Text, Paragraph } = Typography

// El gráfico (G2) pesa >800 KB: se descarga aparte, sin retrasar el resto de la pantalla.
const GraficoSemana = lazy(() => import('../components/GraficoSemana'))

// ── Forma de lo que devuelve /api/dashboard/resumen ─────────────────────────
interface Cita {
  id: number
  cliente_id?: number
  fecha_hora: string
  motivo?: string
  paciente: string
  especie: string
  propietario: string
  veterinario?: string
  estado: string
}
interface VacunaProxima {
  paciente_id: number
  cliente_id?: number
  vacuna: string
  proxima_dosis: string
  vencida?: boolean
  paciente: string
  propietario: string
  telefono?: string
}
interface StockBajo { id: number; nombre: string; codigo: string; stock: number; stock_minimo: number }
interface PorVencer { id: number; nombre: string; codigo: string; lote?: string; vencido: boolean; dias: number }
interface Presente { usuario_id: number; nombre: string; hora_ingreso?: string }
interface Resumen {
  consultas_hoy: number
  ingresos_dia: number
  ingresos_mes: number
  total_clientes: number
  total_pacientes: number
  citas_hoy: Cita[]
  consultas_semana: { dia: string; consultas: number }[]
  stock_bajo: StockBajo[]
  por_vencer: PorVencer[]
  vacunas_proximas: VacunaProxima[]
  presentes: Presente[]
}

const fmtMoneda = (n?: number) =>
  `S/ ${Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtHora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })

const HOY_IDX = (new Date().getDay() + 6) % 7

// Saludo según la hora: una pantalla que abres cien veces se siente distinta si
// te habla del momento del día en vez de repetir "Bienvenido de nuevo".
const saludo = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}

const COLOR_ESTADO: Record<string, string> = {
  pendiente: 'gold', confirmada: 'green', atendida: 'blue', cancelada: 'red',
}
const etiquetaEstado = (e?: string) => (e ? e.charAt(0).toUpperCase() + e.slice(1) : '—')

/** Un panel con título y un enlace opcional a la derecha. */
function Panel({ titulo, icono, accion, children }: {
  titulo: string
  icono?: ReactNode
  accion?: ReactNode
  children: ReactNode
}) {
  return (
    <Card
      title={<Space>{icono}{titulo}</Space>}
      extra={accion}
      styles={{ body: { padding: 0 } }}
      style={{ height: '100%' }}
    >
      {children}
    </Card>
  )
}

/** Una fila dentro de un panel: contenido a la izquierda, acciones a la derecha. */
const Fila = ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
  <div
    onClick={onClick}
    style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
      borderTop: `1px solid ${BRAND.border}`, cursor: onClick ? 'pointer' : 'default',
    }}
  >
    {children}
  </div>
)

export default function Inicio() {
  const navigate = useNavigate()
  const [data, setData] = useState<Resumen | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [avisando, setAvisando] = useState<string | null>(null) // clave en proceso: evita el doble clic

  useEffect(() => {
    api.get('/api/dashboard/resumen')
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setCargando(false))
  }, [])

  // Registra que ya se contactó al dueño: el recordatorio deja de aparecer
  // aquí (Vacunación conserva el historial completo). Optimista: desaparece
  // de inmediato y, si falla, se restaura.
  const marcarAvisado = async (v: VacunaProxima) => {
    const clave = `${v.paciente_id}|${v.vacuna}|${v.proxima_dosis}`
    if (avisando) return
    setAvisando(clave)
    setData(prev => prev && ({ ...prev, vacunas_proximas: prev.vacunas_proximas.filter(x => x !== v) }))
    try {
      await api.post('/api/dashboard/vacunas/avisar', {
        paciente_id: v.paciente_id, vacuna: v.vacuna, proxima_dosis: v.proxima_dosis,
      })
    } catch {
      setData(prev => prev && ({ ...prev, vacunas_proximas: [...prev.vacunas_proximas, v] }))
    } finally {
      setAvisando(null)
    }
  }

  const hoyTexto = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
  // Solo la primera letra en mayúscula: con `capitalize` de CSS salía "Setiembre De 2026".
  const hoy = hoyTexto.charAt(0).toUpperCase() + hoyTexto.slice(1)
  // El nombre de pila, no el usuario técnico ("demo_admin"): saludar a una persona.
  const usuario = (getNombre() || getUsuario() || 'Veterinario').split(' ')[0]

  const citasHoy = data?.citas_hoy ?? []
  const citasPendientes = citasHoy.filter(c => c.estado !== 'cancelada' && c.estado !== 'atendida')
  const semana = (data?.consultas_semana ?? []).map((d, i) => ({ ...d, hoy: i === HOY_IDX }))
  const totalSemana = semana.reduce((s, d) => s + d.consultas, 0)
  const stockBajo = data?.stock_bajo ?? []
  const porVencer = data?.por_vencer ?? []
  // Reponer y caducar son dos problemas de inventario distintos, pero para
  // quien mira el panel es una sola pregunta: "¿algo requiere mi atención?"
  const alertasInv = stockBajo.length + porVencer.length
  const vacunas = data?.vacunas_proximas ?? []
  const presentes = data?.presentes ?? []

  const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios)

  return (
    <div className="animar" style={{ flex: 1, minWidth: 0, padding: '32px 24px 40px', maxWidth: 1080, width: '100%', margin: '0 auto' }}>

      {/* Encabezado: qué día es y qué hay que hacer hoy. */}
      <Row justify="space-between" align="bottom" gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col flex="auto">
          <Text type="secondary">{hoy}</Text>
          <Title level={2} style={{ margin: '4px 0 8px' }}>
            {saludo()}, {usuario}
          </Title>
          <Paragraph type="secondary" style={{ margin: 0 }}>
            {cargando ? 'Cargando resumen del día…' : (
              <>
                Hoy tienes <Text strong>{citasPendientes.length} {plural(citasPendientes.length, 'turno', 'turnos')}</Text> {plural(citasPendientes.length, 'pendiente', 'pendientes')}
                {alertasInv > 0 && <> y <Text strong>{alertasInv} {plural(alertasInv, 'alerta', 'alertas')}</Text> de inventario</>}
                {vacunas.length > 0 && <>, con <Text strong>{vacunas.length} {plural(vacunas.length, 'vacuna', 'vacunas')}</Text> por recordar</>}.
              </>
            )}
          </Paragraph>
        </Col>
        <Col>
          <Space wrap>
            <Button icon={<TeamOutlined />} onClick={() => navigate('/clientes')}>Clientes</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/turnos')}>Agendar turno</Button>
          </Space>
        </Col>
      </Row>

      {error && (
        <Alert type="error" showIcon style={{ marginBottom: 16 }}
          message={`No se pudo conectar con el servidor: ${error}`} />
      )}

      {presentes.length > 0 && (
        <Alert
          type="success"
          style={{ marginBottom: 16 }}
          message={
            <Space wrap size={[8, 8]}>
              <Text strong>En turno ahora</Text>
              {presentes.map(p => (
                <Tag key={p.usuario_id} icon={<MedicineBoxOutlined />} color="green" variant="outlined">
                  {p.nombre}{p.hora_ingreso && ` · desde ${fmtHora(p.hora_ingreso)}`}
                </Tag>
              ))}
            </Space>
          }
        />
      )}

      {/* Cifras del día: cuatro números, sin iconos ni fondos de colores. */}
      <Card styles={{ body: { padding: 0 } }} style={{ marginBottom: 16 }}>
        <Row>
          {[
            { titulo: 'Consultas hoy', valor: data?.consultas_hoy ?? '—', sub: `${totalSemana} esta semana` },
            { titulo: 'Ingresos del día', valor: fmtMoneda(data?.ingresos_dia), sub: `${fmtMoneda(data?.ingresos_mes)} en el mes` },
            { titulo: 'Clientes / mascotas', valor: `${data?.total_clientes ?? '—'} / ${data?.total_pacientes ?? '—'}`, sub: 'Registrados en el sistema' },
            {
              titulo: 'Alertas de inventario', valor: alertasInv, alerta: alertasInv > 0,
              sub: !alertasInv ? 'Todo en orden'
                : porVencer.length && stockBajo.length ? 'Por reponer y por vencer'
                : porVencer.length ? 'Productos por vencer' : 'Productos con stock bajo',
            },
          ].map(({ titulo, valor, sub, alerta }, i) => (
            <Col key={titulo} xs={12} md={6} style={{
              padding: '18px clamp(14px, 4vw, 24px)',
              borderLeft: i % 2 === 1 ? `1px solid ${BRAND.border}` : undefined,
              borderTop: i >= 2 ? `1px solid ${BRAND.border}` : undefined,
            }}>
              {cargando ? <Skeleton active paragraph={{ rows: 1 }} title={false} /> : (
                <>
                  <Statistic
                    title={titulo}
                    value={valor as string | number}
                    // clamp: en el celular (2 columnas) 28px partía "S/ 515.00" en dos líneas.
                    styles={{ content: { fontWeight: 700, fontSize: 'clamp(21px, 6vw, 28px)', whiteSpace: 'nowrap', color: alerta ? BRAND.accentText : BRAND.text } }}
                  />
                  <Text type="secondary" style={{ fontSize: 13 }}>{sub}</Text>
                </>
              )}
            </Col>
          ))}
        </Row>
      </Card>

      <Row gutter={[16, 16]}>
        {/* Consultas por día */}
        <Col xs={24} lg={14}>
          <Panel titulo="Consultas por día" accion={<Text type="secondary">{totalSemana} esta semana</Text>}>
            <div style={{ padding: '8px 20px 16px', borderTop: `1px solid ${BRAND.border}` }}>
              {cargando ? <Skeleton.Node active style={{ width: '100%', height: 220 }}>{' '}</Skeleton.Node> : (
                <Suspense fallback={<Skeleton.Node active style={{ width: '100%', height: 220 }}>{' '}</Skeleton.Node>}>
                <GraficoSemana datos={semana} />
                </Suspense>
              )}
              <Space size={16} style={{ justifyContent: 'center', width: '100%', fontSize: 13 }}>
                <Text type="secondary"><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: BRAND.accent, marginRight: 6 }} />Hoy</Text>
                <Text type="secondary"><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: '#b3d6c9', marginRight: 6 }} />Otros días</Text>
              </Space>
            </div>
          </Panel>
        </Col>

        {/* Turnos de hoy */}
        <Col xs={24} lg={10}>
          <Panel
            titulo="Turnos de hoy"
            accion={<Button type="link" size="small" onClick={() => navigate('/turnos')}>Ver todos <RightOutlined /></Button>}
          >
            <div className="scroll-fino" style={{ maxHeight: 300, overflowY: 'auto' }}>
              {cargando ? <div style={{ padding: 20 }}><Skeleton active paragraph={{ rows: 3 }} /></div>
                : citasHoy.length === 0 ? <Empty style={{ padding: 24 }} image={Empty.PRESENTED_IMAGE_SIMPLE} description="Sin turnos para hoy" />
                : citasHoy.map(c => (
                  <Fila key={c.id} onClick={c.cliente_id ? () => navigate(`/clientes/${c.cliente_id}`) : undefined}>
                    <Text strong style={{ color: BRAND.primary, width: 52, flexShrink: 0 }}>{fmtHora(c.fecha_hora)}</Text>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text strong ellipsis style={{ display: 'block' }}>{c.motivo || '(sin motivo)'}</Text>
                      <Text type="secondary" ellipsis style={{ display: 'block', fontSize: 13 }}>
                        {c.paciente} · {c.especie} · {c.propietario}
                      </Text>
                      {c.veterinario && <Text style={{ fontSize: 13, color: BRAND.primary }}>{c.veterinario}</Text>}
                    </div>
                    <Tag color={COLOR_ESTADO[c.estado] ?? 'default'} style={{ marginInlineEnd: 0 }}>{etiquetaEstado(c.estado)}</Tag>
                  </Fila>
                ))}
            </div>
          </Panel>
        </Col>

        {/* Vacunas por recordar */}
        <Col xs={24} lg={12}>
          <Panel titulo="Vacunas por recordar" icono={<ExperimentOutlined />} accion={<Tag>{vacunas.length}</Tag>}>
            <div className="scroll-fino" style={{ maxHeight: 320, overflowY: 'auto' }}>
              {cargando ? <div style={{ padding: 20 }}><Skeleton active paragraph={{ rows: 3 }} /></div>
                : vacunas.length === 0 ? <Empty style={{ padding: 24 }} image={Empty.PRESENTED_IMAGE_SIMPLE} description="Sin vacunas con próxima dosis registrada" />
                : vacunas.map((v, i) => (
                  <Fila key={i}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Space size={8}>
                        <Text strong>{v.vacuna}</Text>
                        {v.vencida && <Tag color="red" style={{ marginInlineEnd: 0 }}>Vencida</Tag>}
                      </Space>
                      <div>
                        <Button type="link" size="small" style={{ padding: 0, height: 'auto' }}
                          onClick={() => v.cliente_id && navigate(`/clientes/${v.cliente_id}`)}>
                          {v.paciente} · {v.propietario}
                        </Button>
                      </div>
                      <Text type="secondary" style={{ fontSize: 13 }}>Próxima dosis: {v.proxima_dosis}</Text>
                    </div>
                    <Space size={6}>
                      {v.telefono && (
                        <Tooltip title="Recordatorio por WhatsApp">
                          <Button
                            shape="circle" icon={<WhatsAppOutlined />} aria-label="Recordatorio por WhatsApp"
                            href={waRecordatorio(v.telefono, v.propietario, v.paciente, null)}
                            target="_blank" rel="noopener noreferrer"
                            style={{ color: '#128c7e', borderColor: '#128c7e' }}
                          />
                        </Tooltip>
                      )}
                      <Tooltip title="Marcar como ya avisado">
                        <Button shape="circle" icon={<CheckOutlined />} aria-label="Marcar como ya avisado"
                          onClick={() => marcarAvisado(v)} />
                      </Tooltip>
                    </Space>
                  </Fila>
                ))}
            </div>
          </Panel>
        </Col>

        {/* Inventario: stock bajo y por vencer */}
        <Col xs={24} lg={12}>
          <Panel
            titulo="Inventario"
            icono={<InboxOutlined />}
            accion={<Button type="link" size="small" onClick={() => navigate('/inventario')}>Ir a inventario <RightOutlined /></Button>}
          >
            <div className="scroll-fino" style={{ maxHeight: 320, overflowY: 'auto' }}>
              {cargando ? <div style={{ padding: 20 }}><Skeleton active paragraph={{ rows: 3 }} /></div>
                : alertasInv === 0 ? <Empty style={{ padding: 24 }} image={Empty.PRESENTED_IMAGE_SIMPLE} description="Todo el inventario está en orden" />
                : (
                  <>
                    {porVencer.map(p => (
                      <Fila key={`v-${p.id}`}>
                        <WarningOutlined style={{ color: p.vencido ? '#c92a2a' : '#d9870a' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Text strong ellipsis style={{ display: 'block' }}>{p.nombre}</Text>
                          <Text type="secondary" style={{ fontSize: 13 }}>{p.codigo}{p.lote ? ` · lote ${p.lote}` : ''}</Text>
                        </div>
                        <Tag color={p.vencido ? 'red' : 'orange'} style={{ marginInlineEnd: 0 }}>
                          {p.vencido ? 'Vencido' : p.dias === 0 ? 'Vence hoy' : `${p.dias} d`}
                        </Tag>
                      </Fila>
                    ))}
                    {stockBajo.map(p => (
                      <Fila key={p.id}>
                        <WarningOutlined style={{ color: '#c92a2a' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Text strong ellipsis style={{ display: 'block' }}>{p.nombre}</Text>
                          <Text type="secondary" style={{ fontSize: 13 }}>{p.codigo}</Text>
                        </div>
                        <Tag color="red" style={{ marginInlineEnd: 0 }}>{p.stock} / mín {p.stock_minimo}</Tag>
                      </Fila>
                    ))}
                  </>
                )}
            </div>
          </Panel>
        </Col>
      </Row>
    </div>
  )
}
