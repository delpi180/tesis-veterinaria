import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Alert, Button, Card, Col, Descriptions, Empty, Flex, Row, Skeleton, Space, Table, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  ArrowLeftOutlined, CalendarOutlined, ClockCircleOutlined, FileTextOutlined, IdcardOutlined, PhoneOutlined,
  SafetyCertificateOutlined, UserOutlined,
} from '@ant-design/icons'
import { api, esVeterinario } from '../services/api'
import { Panel } from '../components/PanelLista'
import { BRAND } from '@src/core/color'
import { MEDIDAS } from '@src/core/medidas'

const { Title, Text } = Typography

const DIA_LABEL: Record<string, string> = { lun: 'Lun', mar: 'Mar', mie: 'Mié', jue: 'Jue', vie: 'Vie', sab: 'Sáb', dom: 'Dom' }

const fmtFecha = (iso?: string | null) => iso
  ? new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtHora = (iso?: string | null) => iso
  ? new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '—'
const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : 'Ocurrió un error.')

interface Usuario {
  nombre: string; usuario: string; rol: string; activo: boolean; dni?: string | null; telefono?: string | null
  especialidad?: string | null; creado_en?: string | null; hora_entrada?: string | null; dias_laborales?: string | null
}
interface Seguimiento { paciente: string; especie: string; propietario: string; proxima_cita: string }
interface Tratado { paciente_id?: number | null; paciente: string; especie: string; propietario: string; ultima_atencion: string }
interface Marcacion { id: number; fecha: string; hora_ingreso: string; hora_salida?: string | null }
interface Perfil {
  usuario: Usuario
  asistencia: { total_dias: number; total_horas: number; tardanzas: number; recientes: Marcacion[] }
  pacientes_tratados: { total: number; lista: Tratado[] }
  total_historias: number
  seguimiento: Seguimiento[]
}

export default function PerfilDoctor() {
  const { usuarioId } = useParams()
  const navigate = useNavigate()
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    api.get(`/api/usuarios/${usuarioId}/perfil`)
      .then((p: Perfil) => { if (vigente) { setPerfil(p); setError(null) } })
      .catch((e: unknown) => { if (vigente) setError(mensajeDe(e)) })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [usuarioId])

  const rutaVolver = esVeterinario() ? '/mi-panel' : '/usuarios'
  const volver = <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(rutaVolver)}>Volver</Button>
  const caja = { flex: 1, minWidth: 0, padding: '16px 32px 32px', width: '100%' } as const

  if (cargando) return <div className="animar" style={caja}><Card><Skeleton active paragraph={{ rows: 8 }} /></Card></div>
  if (error || !perfil) {
    return (
      <div className="animar" style={caja}>
        <Space orientation="vertical" size={16}>
          <Alert type="error" showIcon title={error || 'No se pudo cargar el perfil.'} />
          {volver}
        </Space>
      </div>
    )
  }

  const { usuario: u, asistencia, pacientes_tratados, total_historias, seguimiento } = perfil
  const esVet = u.rol === 'veterinario'
  const dias = (u.dias_laborales || '').split(',').filter(Boolean).map(d => DIA_LABEL[d] ?? d).join(', ')

  const tarjetas = [
    ...(esVet ? [
      { titulo: 'Pacientes tratados', valor: pacientes_tratados.total, icono: <UserOutlined /> },
      { titulo: 'Historias registradas', valor: total_historias, icono: <FileTextOutlined /> },
      { titulo: 'En seguimiento', valor: seguimiento.length, icono: <CalendarOutlined /> },
    ] : []),
    { titulo: 'Días de asistencia', valor: asistencia.total_dias, icono: <ClockCircleOutlined /> },
  ]

  const colSeguimiento: TableColumnsType<Seguimiento> = [
    { title: 'Paciente', key: 'p', render: (_, s) => <Text strong>{s.paciente} <Text type="secondary">({s.especie})</Text></Text> },
    { title: 'Propietario', dataIndex: 'propietario' },
    { title: 'Próximo control', dataIndex: 'proxima_cita', render: fmtFecha },
  ]
  const colTratados: TableColumnsType<Tratado> = [
    {
      title: 'Paciente', key: 'p',
      render: (_, p) => (
        <>
          {p.paciente_id ? <Link to={`/pacientes/${p.paciente_id}/historial`}>{p.paciente}</Link> : <Text strong>{p.paciente}</Text>}
          <Text type="secondary"> ({p.especie})</Text>
        </>
      ),
    },
    { title: 'Propietario', dataIndex: 'propietario' },
    { title: 'Última atención', dataIndex: 'ultima_atencion', render: fmtFecha },
  ]
  const colAsistencia: TableColumnsType<Marcacion> = [
    { title: 'Fecha', dataIndex: 'fecha', render: fmtFecha },
    { title: 'Ingreso', dataIndex: 'hora_ingreso', render: (h: string) => <Text strong>{fmtHora(h)}</Text> },
    { title: 'Salida', dataIndex: 'hora_salida', render: fmtHora },
  ]
  const vacio = (t: string) => ({ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t} /> })

  return (
    <div className="animar" style={caja}>
      <Row justify="space-between" align="bottom" gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col flex="auto">
          <Space size={8} wrap>
            <Tag color={esVet ? 'green' : 'blue'} style={{ margin: 0 }}>{esVet ? 'Veterinario' : 'Recepcionista'}</Tag>
            <Tag color={u.activo ? 'success' : 'default'} style={{ margin: 0 }}>{u.activo ? 'Activo' : 'Inactivo'}</Tag>
          </Space>
          <Title level={2} style={{ margin: '4px 0 0', fontSize: MEDIDAS.tituloSeccion, fontWeight: 500, lineHeight: '32px' }}>
            Perfil — {u.nombre}
          </Title>
        </Col>
        <Col>{volver}</Col>
      </Row>

      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        <Card title="Datos personales" className="tarjeta-viva">
          <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} size="small">
            <Descriptions.Item label={<><UserOutlined /> Usuario</>}>{u.usuario || '—'}</Descriptions.Item>
            <Descriptions.Item label={<><IdcardOutlined /> DNI</>}>{u.dni || '—'}</Descriptions.Item>
            <Descriptions.Item label={<><PhoneOutlined /> Teléfono</>}>{u.telefono || '—'}</Descriptions.Item>
            {esVet && <Descriptions.Item label={<><SafetyCertificateOutlined /> Especialidad</>}>{u.especialidad || '—'}</Descriptions.Item>}
            <Descriptions.Item label={<><CalendarOutlined /> Usuario desde</>}>{fmtFecha(u.creado_en)}</Descriptions.Item>
            {esVet && (
              <Descriptions.Item label={<><ClockCircleOutlined /> Horario laboral</>}>
                {u.hora_entrada ? `${u.hora_entrada} · ${dias || 'sin días asignados'}` : 'No configurado'}
              </Descriptions.Item>
            )}
          </Descriptions>
        </Card>

        <Row gutter={[16, 16]}>
          {tarjetas.map((t, i) => (
            <Col key={t.titulo} xs={12} md={6}>
              <Card className="tarjeta-viva animar" style={{ animationDelay: `${i * 70}ms` }}>
                <Flex gap={12} align="center">
                  <div style={{ fontSize: 20, color: BRAND.primary, background: BRAND.panel, width: 40, height: 40, borderRadius: 10, display: 'grid', placeItems: 'center' }}>{t.icono}</div>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>{t.titulo}</Text>
                    <div style={{ fontSize: 24, fontWeight: 500, lineHeight: '30px' }}>{t.valor}</div>
                  </div>
                </Flex>
              </Card>
            </Col>
          ))}
        </Row>

        {esVet && (
          <Panel titulo="Pacientes en seguimiento" icono={<CalendarOutlined />}>
            <Table<Seguimiento> rowKey={(s) => `${s.paciente}-${s.proxima_cita}`} size="middle" columns={colSeguimiento} dataSource={seguimiento}
              pagination={false} scroll={{ x: 'max-content' }} locale={vacio('Sin controles próximos agendados')} />
          </Panel>
        )}

        {esVet && (
          <Panel titulo="Pacientes tratados" icono={<UserOutlined />} accion={<Tag style={{ margin: 0 }}>{pacientes_tratados.total}</Tag>}>
            <Table<Tratado> rowKey={(p) => `${p.paciente_id ?? p.paciente}-${p.ultima_atencion}`} size="middle" columns={colTratados}
              dataSource={pacientes_tratados.lista} scroll={{ x: 'max-content', y: 384 }} pagination={false}
              locale={vacio('Aún no ha atendido pacientes')} />
          </Panel>
        )}

        <Panel titulo="Asistencia reciente" icono={<ClockCircleOutlined />}
          accion={<Text type="secondary" style={{ fontSize: 12 }}>
            {asistencia.total_dias} día(s) · {asistencia.total_horas} h totales · {asistencia.tardanzas} tardanza(s)
          </Text>}>
          <Table<Marcacion> rowKey="id" size="middle" columns={colAsistencia} dataSource={asistencia.recientes}
            pagination={false} scroll={{ x: 'max-content' }} locale={vacio('Sin marcaciones registradas')} />
        </Panel>
      </Space>
    </div>
  )
}
