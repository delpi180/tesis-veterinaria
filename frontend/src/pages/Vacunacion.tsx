import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Col, Empty, Flex, Input, Row, Segmented, Skeleton, Space, Table, Tag, Tooltip, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CheckCircleOutlined, CheckOutlined, ClockCircleOutlined, DownloadOutlined, ExperimentOutlined, ReloadOutlined,
  SearchOutlined, WarningOutlined, WhatsAppOutlined,
} from '@ant-design/icons'
import { api } from '../services/api'
import { clinicaActual } from '../services/clinica'
import { Panel } from '../components/PanelLista'
import { ESTADO } from '@src/core/color'
import { MEDIDAS } from '@src/core/medidas'

const { Title, Text } = Typography

const POR_PAGINA = 50

interface Registro {
  paciente_id: number
  paciente: string
  especie?: string | null
  cliente_id?: number | null
  propietario?: string | null
  telefono?: string | null
  vacuna: string
  tipo?: 'vacuna' | 'antiparasitario' | null
  fecha_aplicada?: string | null
  proxima_dosis?: string | null
  estado: 'vencida' | 'proxima' | 'programada' | null
  avisado?: boolean
}

const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : 'Ocurrió un error.')

const fmtFecha = (iso?: string | null) => {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
}

const ESTADOS: Record<string, { label: string; color: string; icono: ReactNode }> = {
  vencida: { label: 'Vencida', color: 'error', icono: <WarningOutlined /> },
  proxima: { label: 'Próxima', color: 'warning', icono: <ClockCircleOutlined /> },
  programada: { label: 'Programada', color: 'blue', icono: <CheckCircleOutlined /> },
  sin: { label: 'Sin fecha', color: 'default', icono: <ClockCircleOutlined /> },
}
const estadoDe = (v: Registro) => ESTADOS[v.estado ?? 'sin'] ?? ESTADOS.sin

const FILTROS = [
  { value: 'todas', label: 'Todas' },
  { value: 'vencida', label: 'Vencidas' },
  { value: 'proxima', label: 'Próximas (30 días)' },
  { value: 'sin', label: 'Sin próxima dosis' },
  // La desparasitación se sigue igual que una vacuna: para recepción es la misma
  // tarea (llamar al dueño), así que se trabaja en la misma lista.
  { value: 'vacunas', label: 'Solo vacunas' },
  { value: 'antiparasitario', label: 'Solo desparasitación' },
]

const waLink = (v: Registro) => {
  const num = (v.telefono || '').replace(/\D/g, '')
  const intl = num.length === 9 ? `51${num}` : num
  const que = v.tipo === 'antiparasitario' ? `la desparasitación (*${v.vacuna}*)` : `la vacuna *${v.vacuna}*`
  const msg = `Hola ${v.propietario || ''}, le recordamos que ${v.paciente || 'su mascota'} tiene pendiente ${que} en ${clinicaActual().nombre}. ¡Le esperamos!`
  return `https://wa.me/${intl}?text=${encodeURIComponent(msg)}`
}

export default function Vacunacion() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Registro[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refrescando, setRefrescando] = useState(false)
  const [filtro, setFiltro] = useState('todas')
  const [busq, setBusq] = useState('')
  const [pagina, setPagina] = useState(1)

  const cargar = useCallback(async () => {
    try {
      const d = await api.get('/api/dashboard/vacunas')
      setItems(Array.isArray(d) ? d : [])
      setError(null)
    } catch (e) {
      setError(mensajeDe(e))
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])
  const refrescar = async () => { setRefrescando(true); await cargar(); setRefrescando(false) }

  // Optimista: cambia la fila a "Avisado" de inmediato; si falla, se revierte.
  const marcarAvisado = async (v: Registro) => {
    setItems(prev => prev.map(x => x === v ? { ...x, avisado: true } : x))
    try {
      await api.post('/api/dashboard/vacunas/avisar', {
        paciente_id: v.paciente_id, vacuna: v.vacuna, proxima_dosis: v.proxima_dosis, tipo: v.tipo ?? 'vacuna',
      })
    } catch {
      setItems(prev => prev.map(x => x.paciente_id === v.paciente_id && x.vacuna === v.vacuna && x.proxima_dosis === v.proxima_dosis ? { ...x, avisado: false } : x))
    }
  }

  const term = busq.trim().toLowerCase()
  const filtrados = items.filter(v => {
    if (filtro === 'vencida' && v.estado !== 'vencida') return false
    if (filtro === 'proxima' && v.estado !== 'proxima') return false
    if (filtro === 'sin' && v.estado !== null) return false
    if (filtro === 'vacunas' && (v.tipo ?? 'vacuna') !== 'vacuna') return false
    if (filtro === 'antiparasitario' && v.tipo !== 'antiparasitario') return false
    if (term && !`${v.paciente ?? ''} ${v.propietario ?? ''} ${v.vacuna ?? ''}`.toLowerCase().includes(term)) return false
    return true
  })

  const vencidas = items.filter(v => v.estado === 'vencida').length
  const proximas = items.filter(v => v.estado === 'proxima').length

  const exportarCSV = () => {
    const cab = ['Paciente', 'Especie', 'Tipo', 'Vacuna/Producto', 'Aplicada', 'Proxima dosis', 'Estado', 'Dueno', 'Telefono']
    const filas = filtrados.map(v => [
      v.paciente, v.especie, v.tipo === 'antiparasitario' ? 'Desparasitación' : 'Vacuna',
      v.vacuna, fmtFecha(v.fecha_aplicada), v.proxima_dosis ?? '',
      estadoDe(v).label, v.propietario, v.telefono ?? '',
    ].map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(','))
    const csv = '﻿' + [cab.join(','), ...filas].join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url; a.download = `vacunacion_${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const hoyTexto = new Date().toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const hoy = hoyTexto.charAt(0).toUpperCase() + hoyTexto.slice(1)

  const tarjetas = [
    { titulo: 'Vencidas', valor: vencidas, color: vencidas ? ESTADO.peligro : undefined },
    { titulo: 'Próximas (30 días)', valor: proximas, color: proximas ? ESTADO.atencion : undefined },
    { titulo: 'Total registros', valor: items.length, color: undefined },
  ]

  const columnas: TableColumnsType<Registro> = [
    {
      title: 'Paciente', key: 'paciente',
      render: (_, v) => (
        <div>
          <Button type="link" style={{ padding: 0, height: 'auto', fontWeight: 500 }}
            onClick={() => v.cliente_id && navigate(`/clientes/${v.cliente_id}`)}>{v.paciente}</Button><br />
          <Text type="secondary" style={{ fontSize: 12 }}>{v.especie}</Text>
        </div>
      ),
    },
    {
      title: 'Vacuna', key: 'vacuna',
      render: (_, v) => (
        <Space size={6} wrap>
          {v.vacuna}
          {v.tipo === 'antiparasitario' && <Tag color="cyan" icon={<ExperimentOutlined />} style={{ margin: 0 }}>Desparasitación</Tag>}
        </Space>
      ),
    },
    { title: 'Aplicada', dataIndex: 'fecha_aplicada', render: (f?: string | null) => <Text type="secondary">{fmtFecha(f)}</Text> },
    { title: 'Próxima dosis', dataIndex: 'proxima_dosis', render: (f?: string | null) => f || '—' },
    {
      title: 'Estado', key: 'estado', align: 'center',
      render: (_, v) => { const e = estadoDe(v); return <Tag color={e.color} icon={e.icono} style={{ marginInlineEnd: 0 }}>{e.label}</Tag> },
    },
    { title: 'Dueño', dataIndex: 'propietario', render: (p?: string | null) => <Text type="secondary">{p}</Text> },
    {
      title: '', key: 'acciones', align: 'right',
      render: (_, v) => (
        <Space size={6}>
          {v.avisado
            ? <Tooltip title="Ya se avisó al dueño"><Tag color="success" icon={<CheckOutlined />} style={{ margin: 0 }}>Avisado</Tag></Tooltip>
            : <Tooltip title="Marcar como ya avisado"><Button size="small" icon={<CheckOutlined />} aria-label="Marcar como avisado" onClick={() => marcarAvisado(v)} /></Tooltip>}
          {v.telefono && (
            <Tooltip title="Recordar por WhatsApp">
              <Button size="small" type="primary" icon={<WhatsAppOutlined />} aria-label="Recordar por WhatsApp"
                href={waLink(v)} target="_blank" rel="noopener noreferrer" style={{ background: '#25a244' }} />
            </Tooltip>
          )}
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
            Vacunación
          </Title>
        </Col>
        <Col>
          <Space wrap>
            <Button icon={<DownloadOutlined />} disabled={filtrados.length === 0} onClick={exportarCSV}>Exportar</Button>
            <Button icon={<ReloadOutlined spin={refrescando} />} disabled={refrescando} onClick={refrescar}>Actualizar</Button>
          </Space>
        </Col>
      </Row>

      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        <Row gutter={[16, 16]}>
          {tarjetas.map((t, i) => (
            <Col key={t.titulo} xs={12} sm={8}>
              <Card className="tarjeta-viva animar" style={{ animationDelay: `${i * 70}ms` }}>
                <Text type="secondary">{t.titulo}</Text>
                <div style={{ fontSize: 30, fontWeight: 500, lineHeight: '40px', color: t.color }}>{cargando ? '—' : t.valor}</div>
              </Card>
            </Col>
          ))}
        </Row>

        <Panel titulo="Vacunas y desparasitación" icono={<ExperimentOutlined />} accion={<Tag>{filtrados.length}</Tag>}>
          <Flex gap={12} wrap align="center" style={{ padding: '12px 20px' }}>
            <div style={{ maxWidth: '100%', overflowX: 'auto' }}>
              <Segmented value={filtro} options={FILTROS} onChange={v => { setFiltro(String(v)); setPagina(1) }} />
            </div>
            <Input allowClear prefix={<SearchOutlined />} placeholder="Buscar mascota, dueño o vacuna…" aria-label="Buscar"
              value={busq} onChange={e => { setBusq(e.target.value); setPagina(1) }} style={{ width: 260, marginLeft: 'auto' }} />
          </Flex>

          {error && <Alert type="error" showIcon title={error} style={{ margin: '0 20px 16px' }} action={<Button size="small" onClick={refrescar}>Reintentar</Button>} />}

          {cargando ? <div style={{ padding: 20 }}><Skeleton active paragraph={{ rows: 6 }} /></div> : (
            <Table<Registro> rowKey={v => `${v.paciente_id}|${v.vacuna}|${v.proxima_dosis ?? ''}|${v.fecha_aplicada ?? ''}`}
              size="middle" columns={columnas} dataSource={filtrados} scroll={{ x: 'max-content' }}
              pagination={{ current: pagina, pageSize: POR_PAGINA, onChange: setPagina, hideOnSinglePage: true, showSizeChanger: false,
                showTotal: (t) => `${t} registros` }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Sin registros de vacunación para este filtro." /> }} />
          )}
        </Panel>
      </Space>
    </div>
  )
}
