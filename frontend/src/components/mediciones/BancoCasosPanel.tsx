import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Col, Flex, Popconfirm, Row, Segmented, Table, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { DownloadOutlined, PlayCircleOutlined } from '@ant-design/icons'
import { api, descargarArchivo } from '../../services/api'
import { mensajeDe, Seccion } from './comun'
import { usd } from './GastoPanel'

const { Text } = Typography

interface DetalleCaso { tipo: string; nombre: string; estado: 'ok' | 'falla' | 'error' | 'saltado'; fallos: string[]; ms?: number }
interface Corrida {
  id: number; fecha: string | null; modelo: string; casos: number; correctos: number; saltados: number
  exactitud: number | null; ic95_inf: number | null; ic95_sup: number | null
  latencia_media_ms: number | null; costo_usd: number | null; detalle: DetalleCaso[]
}
interface Estimado { casos: number; total_usd: number; origen: string; tope_diario_usd: number | null; gasto_hoy_usd: number }

const ESTADO_CASO: Record<string, { texto: string; color: string }> = {
  ok: { texto: 'Correcto', color: 'success' },
  falla: { texto: 'Falló', color: 'error' },
  error: { texto: 'Error', color: 'error' },
  saltado: { texto: 'Saltado', color: 'default' },
}
const pct = (v: number | null | undefined) => (v == null ? '—' : `${(v * 100).toFixed(1)} %`)

/** Banco de casos con respuesta conocida: se corre cuando cambia el modelo o el prompt, y cada corrida queda guardada. */
export default function BancoCasosPanel() {
  const [tipo, setTipo] = useState<'todos' | 'historia' | 'receta'>('todos')
  const [corridas, setCorridas] = useState<Corrida[]>([])
  const [est, setEst] = useState<Estimado | null>(null)
  const [corriendo, setCorriendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(() => {
    api.get('/api/evaluacion/banco').then((r: Corrida[]) => setCorridas(r)).catch(() => {})
  }, [])
  useEffect(cargar, [cargar])
  useEffect(() => {
    let vigente = true
    api.get(`/api/evaluacion/banco/estimar?tipo=${tipo}`).then((r: Estimado) => { if (vigente) setEst(r) }).catch(() => {})
    return () => { vigente = false }
  }, [tipo, corridas.length])

  const correr = async () => {
    setCorriendo(true); setError(null)
    try { await api.post(`/api/evaluacion/banco?tipo=${tipo}`, {}); cargar() }
    catch (e) { setError(mensajeDe(e)) } finally { setCorriendo(false) }
  }

  const ultima = corridas[0]
  const columnasCorridas: TableColumnsType<Corrida> = [
    { title: 'Fecha', dataIndex: 'fecha', render: (f: string | null) => f ? new Date(f).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : '—' },
    { title: 'Modelo', dataIndex: 'modelo' },
    { title: 'Correctos', align: 'right', render: (_, c) => `${c.correctos}/${c.casos}` },
    { title: 'Exactitud', align: 'right', render: (_, c) => <Text strong>{pct(c.exactitud)}</Text> },
    { title: 'IC 95 %', align: 'right', render: (_, c) => `${pct(c.ic95_inf)} – ${pct(c.ic95_sup)}` },
    { title: 'Latencia media', dataIndex: 'latencia_media_ms', align: 'right', render: (v: number | null) => v == null ? '—' : `${(v / 1000).toFixed(1)} s` },
    { title: 'Costo', dataIndex: 'costo_usd', align: 'right', render: (v: number | null) => usd(v) },
  ]
  const columnasCasos: TableColumnsType<DetalleCaso> = [
    { title: 'Caso', dataIndex: 'nombre', render: (n: string, d) => <><Tag style={{ margin: '0 6px 0 0' }}>{d.tipo}</Tag>{n}</> },
    { title: 'Resultado', dataIndex: 'estado', align: 'center', render: (e: string) => <Tag color={ESTADO_CASO[e].color} style={{ margin: 0 }}>{ESTADO_CASO[e].texto}</Tag> },
    { title: 'Qué salió mal', dataIndex: 'fallos', render: (f: string[]) => f.length ? <Text type="secondary" style={{ fontSize: 12 }}>{f.join(' · ')}</Text> : '' },
  ]

  return (
    <Seccion titulo="Exactitud sobre casos fijos (gold standard)"
      nota="Dictados con la respuesta correcta ya conocida (fallos reales reportados por los doctores). Se corre cada vez que cambie el modelo o el prompt, y queda guardado para comparar antes y después. No usa voz: cuesta unos centavos."
      extra={<Button size="small" icon={<DownloadOutlined />} onClick={() => descargarArchivo('/api/evaluacion/exportar?tabla=banco', 'banco_casos.csv').catch(e => setError(mensajeDe(e)))}>Excel</Button>}>
      <Flex vertical gap={12}>
        <Flex gap={12} wrap align="center">
          <Segmented value={tipo} onChange={v => setTipo(v as typeof tipo)}
            options={[{ label: 'Todos', value: 'todos' }, { label: 'Historia', value: 'historia' }, { label: 'Receta', value: 'receta' }]} />
          <Popconfirm title="¿Correr el banco ahora?" okText="Correr"
            description={est ? `${est.casos} llamadas a la IA, aprox. ${usd(est.total_usd)} (${est.origen}).` : 'Gasta unos centavos de IA.'}
            onConfirm={correr}>
            <Button type="primary" icon={<PlayCircleOutlined />} loading={corriendo}>{corriendo ? 'Corriendo…' : 'Correr banco'}</Button>
          </Popconfirm>
          {est && <Text type="secondary" style={{ fontSize: 12 }}>{est.casos} casos · costo estimado {usd(est.total_usd)}</Text>}
        </Flex>
        {error && <Alert type="error" showIcon title={error} />}

        {ultima && (
          <Row gutter={[12, 12]}>
            <Col xs={12} md={6}><Card size="small"><Text type="secondary" style={{ fontSize: 12 }}>Última exactitud</Text><div style={{ fontSize: 24, fontWeight: 600 }}>{pct(ultima.exactitud)}</div><Text type="secondary" style={{ fontSize: 12 }}>{ultima.correctos} de {ultima.casos} casos</Text></Card></Col>
            <Col xs={12} md={6}><Card size="small"><Text type="secondary" style={{ fontSize: 12 }}>IC 95 %</Text><div style={{ fontSize: 24, fontWeight: 600 }}>{pct(ultima.ic95_inf)}–{pct(ultima.ic95_sup)}</div><Text type="secondary" style={{ fontSize: 12 }}>pocos casos = rango amplio</Text></Card></Col>
            <Col xs={12} md={6}><Card size="small"><Text type="secondary" style={{ fontSize: 12 }}>Latencia media</Text><div style={{ fontSize: 24, fontWeight: 600 }}>{ultima.latencia_media_ms != null ? `${(ultima.latencia_media_ms / 1000).toFixed(1)} s` : '—'}</div><Text type="secondary" style={{ fontSize: 12 }}>por caso</Text></Card></Col>
            <Col xs={12} md={6}><Card size="small"><Text type="secondary" style={{ fontSize: 12 }}>Costo de la corrida</Text><div style={{ fontSize: 24, fontWeight: 600 }}>{usd(ultima.costo_usd)}</div><Text type="secondary" style={{ fontSize: 12 }}>{ultima.modelo}</Text></Card></Col>
          </Row>
        )}

        <Table<Corrida> rowKey="id" size="small" columns={columnasCorridas} dataSource={corridas} pagination={false}
          scroll={{ x: 'max-content', y: 220 }} locale={{ emptyText: 'Aún no se corrió el banco.' }}
          expandable={{ expandedRowRender: c => <Table<DetalleCaso> rowKey="nombre" size="small" columns={columnasCasos} dataSource={c.detalle} pagination={false} /> }} />
      </Flex>
    </Seccion>
  )
}
