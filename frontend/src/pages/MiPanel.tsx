import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Badge, Button, Col, Empty, Row, Skeleton, Space, Tag, Typography } from 'antd'
import {
  CalendarOutlined, ClockCircleOutlined, FileTextOutlined, IdcardOutlined, LoginOutlined,
  LogoutOutlined, MedicineBoxOutlined, ReloadOutlined, TeamOutlined, ExperimentOutlined, HeartOutlined,
} from '@ant-design/icons'
import { api, getNombre, getToken } from '../services/api'
import { BRAND, ESTADO } from '@src/core/color'
import { MEDIDAS } from '@src/core/medidas'
import { Fila, Panel } from '../components/PanelLista'

const { Title, Text } = Typography

const API_BASE_URL = import.meta.env.VITE_API_URL ?? ''

// ── Forma de lo que devuelve /api/mi-panel/ ────────────────────────────────
interface AsistenciaHoy {
  marcado: boolean
  hora_ingreso?: string | null
  hora_salida?: string | null
  hora_entrada_perfil?: string | null
  dias_laborales?: string | null
}
interface MiTurno {
  id: number; cliente_id?: number; paciente_id?: number
  fecha_hora: string; motivo?: string | null
  paciente: string; especie: string; propietario: string
}
interface Seguimiento {
  paciente_id: number; cliente_id?: number
  paciente: string; especie: string; propietario: string; proxima_cita: string
}
interface HistoriaReciente {
  id: number; cliente_id?: number; fecha: string
  paciente: string; especie: string; propietario: string; motivo?: string | null
}
interface TurnoClinica {
  id: number; cliente_id?: number; fecha_hora: string; paciente: string
  veterinario?: string | null; motivo?: string | null; estado: string; es_mio?: boolean
}
interface Colega { nombre: string; rol: string; en_turno: boolean; hora_ingreso?: string | null }
interface ConsultaEquipo {
  id: number; paciente_id?: number; fecha: string; paciente: string; especie: string
  diagnostico?: string | null; motivo?: string | null; veterinario?: string | null; es_mio?: boolean
}
interface ClinicaHoy { agenda: TurnoClinica[]; colegas: Colega[]; consultas_equipo: ConsultaEquipo[] }
interface MiPanelData {
  doctor?: { id?: number }
  asistencia_hoy: AsistenciaHoy
  mis_turnos: MiTurno[]
  seguimiento: Seguimiento[]
  resumen_historias: { total: number; recientes: HistoriaReciente[] }
  clinica_hoy?: Partial<ClinicaHoy>
}

const DIAS: [string, string][] = [
  ['lun', 'Lun'], ['mar', 'Mar'], ['mie', 'Mié'], ['jue', 'Jue'], ['vie', 'Vie'], ['sab', 'Sáb'], ['dom', 'Dom'],
]

const fmtFechaHora = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
const fmtFecha = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtHora = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '—'

const capitalizar = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

const Vacio = ({ texto }: { texto: string }) => (
  <Empty style={{ padding: 24 }} image={Empty.PRESENTED_IMAGE_SIMPLE} description={texto} />
)

export default function MiPanel() {
  const navigate = useNavigate()
  const [data, setData] = useState<MiPanelData | null>(null)
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback((silencioso = false) => {
    if (!silencioso) setCargando(true)
    return api.get('/api/mi-panel/')
      .then((d: MiPanelData) => { setData(d); setError(null) })
      .catch((e: Error) => setError(e.message))
      .finally(() => setCargando(false))
  }, [])

  useEffect(() => { cargar() }, [cargar])

  // Sincronización en tiempo real con Server-Sent Events: cuando recepción cambia un turno, se actualiza solo
  useEffect(() => {
    const es = new EventSource(`${API_BASE_URL}/api/citas/stream?token=${encodeURIComponent(getToken() || '')}`)
    es.onmessage = e => { if (e.data === 'citas_updated') cargar(true) }
    return () => es.close()
  }, [cargar])

  const refrescar = async () => { setRefrescando(true); await cargar(true); setRefrescando(false) }

  const nombre = getNombre() || 'Doctor'
  const hoy = capitalizar(new Date().toLocaleDateString('es-PE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Lima',
  }))

  // Vista compartida del equipo, con valores por defecto por si responde un backend anterior que aún no la envía
  const clinica: ClinicaHoy = { agenda: [], colegas: [], consultas_equipo: [], ...(data?.clinica_hoy ?? {}) }
  const irACliente = (cid?: number) => { if (cid) navigate(`/clientes/${cid}`) }

  const a = data?.asistencia_hoy
  const enTurno = !!a?.marcado && !a?.hora_salida
  const estadoAsistencia = !a?.marcado ? 'Aún sin marcar ingreso' : a.hora_salida ? 'Turno finalizado' : 'En turno (trabajando)'
  // El ámbar claro no alcanza el contraste mínimo: el estado se lee de un vistazo con tonos oscuros
  const colorEstado = !a?.marcado ? BRAND.accentText : a.hora_salida ? BRAND.textSecondary : '#1e6b32'
  const diasTrabaja = (a?.dias_laborales || '').split(',')

  return (
    <div className="animar" style={{ flex: 1, minWidth: 0, padding: '16px 32px 32px', width: '100%' }}>
      {/* Encabezado */}
      <Row justify="space-between" align="bottom" gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col flex="auto">
          <Text type="secondary">{hoy}</Text>
          <Title level={2} style={{ margin: '4px 0 0', fontSize: MEDIDAS.tituloSeccion, fontWeight: 500, lineHeight: '32px' }}>
            Mi panel — {nombre}
          </Title>
        </Col>
        <Col>
          <Space wrap>
            {data?.doctor?.id && (
              <Button icon={<IdcardOutlined />} onClick={() => navigate(`/usuarios/${data.doctor!.id}/perfil`)}>
                Ver mi perfil
              </Button>
            )}
            <Button icon={<ReloadOutlined spin={refrescando} />} onClick={refrescar} disabled={refrescando}>
              Actualizar
            </Button>
          </Space>
        </Col>
      </Row>

      {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}

      {cargando && !data ? (
        <Row gutter={[16, 16]}>
          {[0, 1, 2].map(i => <Col key={i} xs={24} lg={8}><Skeleton active paragraph={{ rows: 4 }} /></Col>)}
        </Row>
      ) : data && a && (
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>

          {/* Asistencia de hoy y horario. La marcación la registra recepción: aquí el doctor solo la consulta. */}
          <Panel titulo="Mi asistencia de hoy" icono={<ClockCircleOutlined />}>
            <Row gutter={[16, 16]} style={{ padding: 20, borderTop: `1px solid ${BRAND.border}` }}>
              <Col xs={24} md={12}>
                <Space align="center" size={14}>
                  <Badge status={enTurno ? 'processing' : 'default'} color={enTurno ? ESTADO.ok : undefined} />
                  <div>
                    <Text strong style={{ color: colorEstado, fontSize: 16 }}>{estadoAsistencia}</Text>
                    <div>
                      <Text type="secondary" style={{ fontSize: 13 }}>
                        {a.marcado && a.hora_salida ? 'Marcación del día completa.'
                          : a.marcado ? 'Tu ingreso ya fue registrado por recepción.'
                          : 'Recepción registra tu ingreso y salida.'}
                      </Text>
                    </div>
                  </div>
                </Space>
                {a.marcado && (
                  <Space size={16} wrap style={{ marginTop: 12 }}>
                    <Text><LoginOutlined style={{ color: ESTADO.ok }} /> Ingreso: <Text strong>{fmtHora(a.hora_ingreso)}</Text></Text>
                    {a.hora_salida && <Text><LogoutOutlined style={{ color: ESTADO.peligro }} /> Salida: <Text strong>{fmtHora(a.hora_salida)}</Text></Text>}
                  </Space>
                )}
              </Col>
              <Col xs={24} md={12}>
                <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                  <Space wrap>
                    <Text type="secondary" strong style={{ fontSize: 12, textTransform: 'uppercase' }}>Horario pactado</Text>
                    <Tag color="green" variant="outlined" style={{ marginInlineEnd: 0 }}>
                      {a.hora_entrada_perfil ? `${a.hora_entrada_perfil} hrs` : 'No asignado'}
                    </Tag>
                  </Space>
                  <Space wrap size={[6, 6]}>
                    <Text type="secondary" strong style={{ fontSize: 12, textTransform: 'uppercase' }}>Días laborales</Text>
                    {/* El día que no se trabaja se distingue por forma (hueco y tachado), no solo por un color más pálido */}
                    {DIAS.map(([code, lbl]) => {
                      const activo = diasTrabaja.includes(code)
                      return (
                        <Tag key={code} color={activo ? 'green' : undefined} variant={activo ? 'filled' : 'outlined'}
                          title={activo ? `${lbl}: trabaja` : `${lbl}: no trabaja`}
                          style={{ marginInlineEnd: 0, fontWeight: 600, textDecoration: activo ? undefined : 'line-through' }}>
                          {lbl}
                        </Tag>
                      )
                    })}
                  </Space>
                </Space>
              </Col>
            </Row>
          </Panel>

          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <Panel titulo="Mis próximos turnos" icono={<CalendarOutlined />} accion={<Tag>{data.mis_turnos.length}</Tag>}>
                {data.mis_turnos.length === 0 ? <Vacio texto="No tienes turnos asignados próximamente." />
                  : data.mis_turnos.map(t => (
                    <Fila key={t.id} onClick={() => irACliente(t.cliente_id)}>
                      <div style={{ width: 64, flexShrink: 0, textAlign: 'center' }}>
                        <Text strong style={{ color: BRAND.primary, display: 'block' }}>{fmtHora(t.fecha_hora)}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>{fmtFecha(t.fecha_hora)}</Text>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text strong ellipsis style={{ display: 'block' }}>{t.motivo || '(sin motivo)'}</Text>
                        <Text type="secondary" ellipsis style={{ display: 'block', fontSize: 13 }}>
                          {t.paciente} · {t.especie} — {t.propietario}
                        </Text>
                      </div>
                      {t.paciente_id && (
                        <Button type="primary" size="small"
                          onClick={e => { e.stopPropagation(); navigate(`/pacientes/${t.paciente_id}/historial`, { state: { citaId: t.id } }) }}>
                          Atender
                        </Button>
                      )}
                    </Fila>
                  ))}
              </Panel>
            </Col>

            <Col xs={24} lg={12}>
              <Panel titulo="Controles y vacunas próximas" icono={<ExperimentOutlined />} accion={<Tag>{data.seguimiento.length}</Tag>}>
                {data.seguimiento.length === 0 ? <Vacio texto="Sin controles próximos de tus pacientes." />
                  : data.seguimiento.map(s => (
                    <Fila key={s.paciente_id} onClick={() => irACliente(s.cliente_id)}>
                      <HeartOutlined style={{ color: BRAND.accent, fontSize: 18 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text strong ellipsis style={{ display: 'block' }}>{s.paciente} · {s.especie}</Text>
                        <Text type="secondary" ellipsis style={{ display: 'block', fontSize: 13 }}>{s.propietario}</Text>
                      </div>
                      <Text style={{ color: BRAND.accentText, fontSize: 13 }}>{fmtFechaHora(s.proxima_cita)}</Text>
                    </Fila>
                  ))}
              </Panel>
            </Col>
          </Row>

          <Panel titulo="Mis historias registradas" icono={<FileTextOutlined />} accion={<Tag>{data.resumen_historias.total}</Tag>}>
            {data.resumen_historias.recientes.length === 0 ? <Vacio texto="Aún no has registrado historias clínicas." />
              : data.resumen_historias.recientes.map(h => (
                <Fila key={h.id} onClick={() => irACliente(h.cliente_id)}>
                  <FileTextOutlined style={{ color: BRAND.textSecondary }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text strong ellipsis style={{ display: 'block' }}>{h.paciente} · {h.especie}</Text>
                    <Text type="secondary" ellipsis style={{ display: 'block', fontSize: 13 }}>{h.motivo || '(sin motivo)'} — {h.propietario}</Text>
                  </div>
                  <Text type="secondary" style={{ fontSize: 13 }}>{fmtFecha(h.fecha)}</Text>
                </Fila>
              ))}
          </Panel>

          {/* La clínica hoy: los doctores se cubren entre sí, y para retomar un paciente de un colega hace falta ver qué pasa en la clínica */}
          <Space size={8} style={{ marginTop: 8 }}>
            <TeamOutlined style={{ color: BRAND.primary }} />
            <Text strong>La clínica hoy</Text>
            <Text type="secondary" style={{ fontSize: 13 }}>· visible para todo el equipo</Text>
          </Space>

          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <Panel titulo="Agenda del día" icono={<CalendarOutlined />} accion={<Tag>{clinica.agenda.length}</Tag>}>
                {clinica.agenda.length === 0 ? <Vacio texto="Sin turnos agendados para hoy." /> : (
                  <div className="scroll-fino" style={{ maxHeight: 300, overflowY: 'auto' }}>
                    {clinica.agenda.map(t => (
                      <Fila key={t.id} onClick={() => irACliente(t.cliente_id)}>
                        <Text strong style={{ width: 52, flexShrink: 0, color: t.es_mio ? BRAND.primary : BRAND.textSecondary }}>
                          {fmtHora(t.fecha_hora)}
                        </Text>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Space size={8}>
                            <Text strong ellipsis>{t.paciente}</Text>
                            {t.es_mio && <Tag color="green" style={{ marginInlineEnd: 0 }}>Tuyo</Tag>}
                          </Space>
                          <Text type="secondary" ellipsis style={{ display: 'block', fontSize: 13 }}>
                            {t.veterinario ?? 'Sin asignar'}{t.motivo ? ` · ${t.motivo}` : ''}
                          </Text>
                        </div>
                        <Text type="secondary" style={{ fontSize: 12 }}>{capitalizar(t.estado)}</Text>
                      </Fila>
                    ))}
                  </div>
                )}
              </Panel>
            </Col>

            <Col xs={24} lg={12}>
              <Panel titulo="Colegas de turno" icono={<IdcardOutlined />} accion={<Tag>{clinica.colegas.length}</Tag>}>
                {clinica.colegas.length === 0 ? <Vacio texto="Nadie más tiene marcación registrada hoy." />
                  : clinica.colegas.map((c, i) => (
                    <Fila key={i}>
                      <Badge status={c.en_turno ? 'success' : 'default'} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text strong ellipsis style={{ display: 'block' }}>{c.nombre}</Text>
                        <Text type="secondary" style={{ fontSize: 13 }}>{capitalizar(c.rol)}</Text>
                      </div>
                      <Text type="secondary" style={{ fontSize: 13 }}>
                        {c.en_turno ? `desde ${fmtHora(c.hora_ingreso)}` : 'salió'}
                      </Text>
                    </Fila>
                  ))}
              </Panel>
            </Col>
          </Row>

          <Panel titulo="Últimas consultas del equipo" icono={<MedicineBoxOutlined />} accion={<Tag>{clinica.consultas_equipo.length}</Tag>}>
            {clinica.consultas_equipo.length === 0 ? <Vacio texto="Todavía no hay consultas registradas." />
              : clinica.consultas_equipo.map(h => (
                <Fila key={h.id} onClick={h.paciente_id ? () => navigate(`/pacientes/${h.paciente_id}/historial`) : undefined}>
                  <MedicineBoxOutlined style={{ color: h.es_mio ? BRAND.primary : BRAND.textSecondary }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text strong ellipsis style={{ display: 'block' }}>{h.paciente} · {h.especie}</Text>
                    <Text type="secondary" ellipsis style={{ display: 'block', fontSize: 13 }}>
                      {h.diagnostico || h.motivo || '(sin diagnóstico)'}
                    </Text>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <Text style={{ display: 'block', fontSize: 13, color: h.es_mio ? BRAND.primary : BRAND.textSecondary }}>
                      {h.es_mio ? 'Tú' : h.veterinario ?? '—'}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>{fmtFecha(h.fecha)}</Text>
                  </div>
                </Fila>
              ))}
          </Panel>
        </Space>
      )}
    </div>
  )
}
