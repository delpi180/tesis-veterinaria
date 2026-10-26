import { useEffect, useState } from 'react'
import { Alert, Button, Card, Col, Empty, Flex, Row, Skeleton, Table, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { DownloadOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../../services/api'
import { exportarCSV } from '../../utils/exportUtils'
import { BRAND, ESTADO } from '@src/core/color'
import { fmtSeg, metodoDe, Seccion } from './comun'

const { Text } = Typography

interface Grupo { n: number; promedio_seg?: number | null; sd_seg?: number | null }
interface Registro { id: number; fecha?: string | null; paciente: string; metodo: string; segundos: number }
interface Tiempos {
  total: number
  manual: Grupo
  ia: Grupo
  ahorro_pct?: number | null
  prueba_t?: { significativo: boolean; t: number; df: number; p: number; cohen_d: number; efecto: string } | null
  recientes: Registro[]
}

/** Tiempo de registro: manual vs IA en el mismo formulario. */
export default function TiemposPanel() {
  const [d, setD] = useState<Tiempos | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let vigente = true
    api.get('/api/encuestas/tiempos').then((r: Tiempos) => { if (vigente) setD(r) }).catch(() => {}).finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [])

  if (cargando) return <Card><Skeleton active paragraph={{ rows: 4 }} /></Card>
  if (!d || d.total === 0) {
    return (
      <Card>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<>
          <Text strong>Aún no hay registros cronometrados</Text><br />
          <Text type="secondary">Registra historias en <strong>Consultas</strong> — a mano y con voz/IA — y el sistema medirá el tiempo automáticamente.</Text>
        </>} />
      </Card>
    )
  }

  const grafico = [
    { metodo: 'Manual', seg: d.manual.promedio_seg || 0, fill: ESTADO.atencion },
    { metodo: 'Con IA', seg: d.ia.promedio_seg || 0, fill: BRAND.primary },
  ]
  const kpis = [
    { t: 'Promedio manual', v: fmtSeg(d.manual.promedio_seg), n: `${d.manual.n} reg.${d.manual.sd_seg != null ? ` · DE ${fmtSeg(d.manual.sd_seg)}` : ''}` },
    { t: 'Promedio con IA', v: fmtSeg(d.ia.promedio_seg), n: `${d.ia.n} reg.${d.ia.sd_seg != null ? ` · DE ${fmtSeg(d.ia.sd_seg)}` : ''}` },
    { t: 'Ahorro de tiempo', v: d.ahorro_pct != null ? `${d.ahorro_pct}%` : '—', n: 'IA vs. manual', color: ESTADO.ok },
    { t: 'Total medido', v: String(d.total), n: 'historias' },
  ]
  const pt = d.prueba_t

  const columnas: TableColumnsType<Registro> = [
    { title: 'Fecha', dataIndex: 'fecha', render: (f?: string | null) => f ? new Date(f).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: '2-digit' }) : '—' },
    { title: 'Paciente', dataIndex: 'paciente', render: (p: string) => <Text strong>{p}</Text> },
    { title: 'Método', dataIndex: 'metodo', align: 'center', render: (m: string) => <Tag color={metodoDe(m).tag} style={{ margin: 0 }}>{metodoDe(m).texto}</Tag> },
    { title: 'Tiempo', dataIndex: 'segundos', align: 'right', render: (s: number) => <Text strong>{fmtSeg(s)}</Text> },
  ]

  return (
    <Flex vertical gap={16}>
      <Row gutter={[12, 12]}>
        {kpis.map((k, i) => (
          <Col key={k.t} xs={12} md={6}>
            <Card size="small" className="tarjeta-viva animar" style={{ animationDelay: `${i * 70}ms` }}>
              <Text type="secondary" style={{ fontSize: 12 }}>{k.t}</Text>
              <div style={{ fontSize: 24, fontWeight: 600, lineHeight: '32px', color: k.color }}>{k.v}</div>
              <Text type="secondary" style={{ fontSize: 12 }}>{k.n}</Text>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Significancia estadística (prueba t de Welch) */}
      {pt && (
        <Alert type={pt.significativo ? 'success' : 'info'} showIcon icon={<SafetyCertificateOutlined />}
          title={pt.significativo ? 'La diferencia de tiempo es estadísticamente significativa' : 'La diferencia aún no es estadísticamente significativa'}
          description={<>
            Prueba t de Welch: t = {pt.t}, gl = {pt.df}, <strong>p {pt.p < 0.001 ? '< 0.001' : `= ${pt.p}`}</strong>
            {' · '}Tamaño del efecto (Cohen's d) = {pt.cohen_d} (<span style={{ textTransform: 'capitalize' }}>{pt.efecto}</span>)
          </>} />
      )}

      <Seccion titulo="Tiempo promedio de registro">
        {(d.manual.n === 0 || d.ia.n === 0) && (
          <Alert type="warning" showIcon style={{ marginBottom: 12 }} title="Para comparar necesitas registros de ambos métodos (manual y con IA)." />
        )}
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={grafico} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BRAND.border} vertical={false} />
            <XAxis dataKey="metodo" tick={{ fontSize: 12, fill: BRAND.textSecondary }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: BRAND.textSecondary }} axisLine={false} tickLine={false}
              tickFormatter={(v: number) => `${Math.round(v / 60) || v + 's'}`} />
            <Tooltip formatter={(v) => [fmtSeg(Number(v)), 'Promedio']} contentStyle={{ borderRadius: 12, border: `1px solid ${BRAND.border}`, fontSize: 13 }} />
            <Bar dataKey="seg" radius={[6, 6, 0, 0]} barSize={70}>
              {grafico.map((e, i) => <Cell key={i} fill={e.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Seccion>

      <Seccion titulo="Historial de registros" extra={
        <Flex gap={8} align="center">
          <Tag style={{ margin: 0 }}>{d.recientes.length}</Tag>
          <Button size="small" icon={<DownloadOutlined />} disabled={d.recientes.length === 0}
            onClick={() => exportarCSV(
              'Tiempos de documentacion manual vs IA',
              ['ID', 'Fecha', 'Paciente', 'Metodo', 'Segundos'],
              d.recientes.map(h => [h.id, h.fecha ? new Date(h.fecha).toISOString() : '', h.paciente, metodoDe(h.metodo).csv, h.segundos]),
            )}>Excel</Button>
        </Flex>
      }>
        <Table<Registro> rowKey="id" size="small" columns={columnas} dataSource={d.recientes} pagination={false}
          scroll={{ x: 'max-content', y: 288 }} />
      </Seccion>
    </Flex>
  )
}
