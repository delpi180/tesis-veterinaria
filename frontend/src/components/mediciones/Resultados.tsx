import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Col, Empty, Flex, Progress, Row, Skeleton, Space, Table, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons'
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../../services/api'
import { exportarCSV } from '../../utils/exportUtils'
import { BRAND, ESTADO } from '@src/core/color'
import PanelEstadistico, { type Estadistica } from './PanelEstadistico'
import { AZUL, fmt, mensajeDe, rolLabel, Seccion, susGrade } from './comun'

const { Text } = Typography

interface Resumen {
  total_sus: number; total_tam: number; puntaje_sus_promedio?: number | null
  util_percibida_promedio?: number | null; facilidad_uso_promedio?: number | null; intencion_uso_promedio?: number | null
}
interface Sus { evaluador_id: number; puntaje: number; creado_en?: string | null; [k: string]: unknown }
interface Tam { evaluador_id: number; util_percibida: number; facilidad_uso: number; intencion_uso: number; creado_en?: string | null; [k: string]: unknown }
interface Fila { id: number; nombre: string; rol: string; sus: number | null; util: number | null; facil: number | null; int: number | null }

const ESCALA = [
  { rango: '≥ 90', letra: 'A', label: 'Excelente' }, { rango: '≥ 80', letra: 'B', label: 'Bueno' },
  { rango: '≥ 70', letra: 'C', label: 'Aceptable' }, { rango: '≥ 60', letra: 'D', label: 'Pobre' },
  { rango: '< 60', letra: 'F', label: 'Deficiente' },
]

function BarraTAM({ label, valor, color }: { label: string; valor?: number | null; color: string }) {
  return (
    <div>
      <Flex justify="space-between" align="baseline">
        <Text strong style={{ fontSize: 13 }}>{label}</Text>
        <Text strong>{fmt(valor)} <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>/ 7</Text></Text>
      </Flex>
      <Progress percent={valor != null ? Math.round((valor / 7) * 100) : 0} showInfo={false} strokeColor={color} />
    </div>
  )
}

/** Resultados de SUS y TAM: promedios, rigor estadístico, gráfico por evaluador y detalle. */
export default function Resultados() {
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [estad, setEstad] = useState<Estadistica | null>(null)
  const [susList, setSusList] = useState<Sus[]>([])
  const [tamList, setTamList] = useState<Tam[]>([])
  const [evMap, setEvMap] = useState<Record<string, { nombre: string; rol: string }>>({})
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true); setError(null)
    try {
      const [res, est, sus, tam, evs] = await Promise.all([
        api.get('/api/encuestas/resumen'), api.get('/api/encuestas/estadisticas'),
        api.get('/api/sus/'), api.get('/api/tam/'), api.get('/api/evaluadores/'),
      ])
      setResumen(res); setEstad(est); setSusList(sus); setTamList(tam)
      const map: Record<string, { nombre: string; rol: string }> = {}
      ;(evs as { id: number; nombre: string; rol: string }[]).forEach(e => { map[e.id] = { nombre: e.nombre, rol: e.rol } })
      setEvMap(map)
    } catch (e) {
      setError(mensajeDe(e))
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const filas = useMemo<Fila[]>(() => {
    const map: Record<number, Partial<Fila>> = {}
    susList.forEach(s => { map[s.evaluador_id] = { ...map[s.evaluador_id], sus: s.puntaje } })
    tamList.forEach(t => { map[t.evaluador_id] = { ...map[t.evaluador_id], util: t.util_percibida, facil: t.facilidad_uso, int: t.intencion_uso } })
    return Object.entries(map)
      .map(([id, d]) => ({
        id: parseInt(id), nombre: evMap[id]?.nombre ?? `Evaluador ${id}`, rol: evMap[id]?.rol ?? '—',
        sus: d.sus ?? null, util: d.util ?? null, facil: d.facil ?? null, int: d.int ?? null,
      }))
      .sort((a, b) => (b.sus ?? -1) - (a.sus ?? -1))
  }, [susList, tamList, evMap])

  const grafico = useMemo(() => [...susList].sort((a, b) => b.puntaje - a.puntaje).map(s => ({
    nombre: (evMap[s.evaluador_id]?.nombre ?? `Ev.${s.evaluador_id}`).split(' ').slice(0, 2).join(' '),
    puntaje: s.puntaje,
  })), [susList, evMap])

  const exportarSus = () => exportarCSV(
    'Encuesta SUS - respuestas detalladas',
    ['ID', 'Evaluador', 'Rol', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'Puntaje SUS (0-100)', 'Fecha'],
    susList.map(s => [
      s.evaluador_id, evMap[s.evaluador_id]?.nombre ?? `Evaluador ${s.evaluador_id}`, evMap[s.evaluador_id]?.rol ?? '—',
      s.p1, s.p2, s.p3, s.p4, s.p5, s.p6, s.p7, s.p8, s.p9, s.p10, s.puntaje,
      s.creado_en ? new Date(s.creado_en).toISOString() : '',
    ]),
  )
  const exportarTam = () => exportarCSV(
    'Encuesta TAM - respuestas detalladas',
    ['ID', 'Evaluador', 'Rol', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11', 'p12', 'Utilidad percibida', 'Facilidad de uso', 'Intencion de uso', 'Fecha'],
    tamList.map(t => [
      t.evaluador_id, evMap[t.evaluador_id]?.nombre ?? `Evaluador ${t.evaluador_id}`, evMap[t.evaluador_id]?.rol ?? '—',
      t.p1, t.p2, t.p3, t.p4, t.p5, t.p6, t.p7, t.p8, t.p9, t.p10, t.p11, t.p12,
      t.util_percibida, t.facilidad_uso, t.intencion_uso, t.creado_en ? new Date(t.creado_en).toISOString() : '',
    ]),
  )

  const columnas: TableColumnsType<Fila> = [
    { title: 'Evaluador', dataIndex: 'nombre', render: (n: string) => <Text strong>{n}</Text> },
    { title: 'Rol', dataIndex: 'rol', render: rolLabel },
    { title: 'SUS', dataIndex: 'sus', align: 'center', render: (v: number | null) => <Text strong>{v ?? '—'}</Text> },
    { title: 'Grado', key: 'g', align: 'center', render: (_, r) => r.sus != null ? <Tag color={susGrade(r.sus).tag} style={{ margin: 0 }}>{susGrade(r.sus).letra}</Tag> : null },
    { title: 'Utilidad', dataIndex: 'util', align: 'center', render: fmt },
    { title: 'Facilidad', dataIndex: 'facil', align: 'center', render: fmt },
    { title: 'Intención', dataIndex: 'int', align: 'center', render: fmt },
  ]

  const barra = (
    <Space wrap>
      <Button icon={<DownloadOutlined />} disabled={susList.length === 0} onClick={exportarSus}>SUS (Excel)</Button>
      <Button icon={<DownloadOutlined />} disabled={tamList.length === 0} onClick={exportarTam}>TAM (Excel)</Button>
      <Button icon={<ReloadOutlined spin={cargando} />} disabled={cargando} onClick={cargar}>Actualizar</Button>
    </Space>
  )

  const g = resumen ? susGrade(resumen.puntaje_sus_promedio) : null
  const sinDatos = resumen?.total_sus === 0

  return (
    <Flex vertical gap={16}>
      <Flex justify="space-between" align="center" wrap gap={8}>
        <Text strong>Resultados de evaluación — SUS &amp; TAM</Text>
        {barra}
      </Flex>

      {error && <Alert type="error" showIcon title={error} />}
      {cargando && <Card><Skeleton active paragraph={{ rows: 6 }} /></Card>}
      {!cargando && sinDatos && (
        <Card><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<>
          <Text strong>Aún no hay encuestas registradas</Text><br />
          <Text type="secondary">Ve a la pestaña "Responder encuestas" para registrar el primer evaluador.</Text>
        </>} /></Card>
      )}

      {!cargando && !sinDatos && resumen && g && (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}>
              <Seccion titulo="SUS global" extra={<Tag color={g.tag} style={{ margin: 0 }}>{g.etiqueta}</Tag>}>
                <Text type="secondary" style={{ fontSize: 12 }}>N = {resumen.total_sus} evaluadores</Text>
                <Flex align="end" gap={12} style={{ margin: '8px 0' }}>
                  <span style={{ fontSize: 56, fontWeight: 600, lineHeight: 1 }}>{resumen.puntaje_sus_promedio?.toFixed(1)}</span>
                  <div style={{ paddingBottom: 4 }}>
                    <span style={{ fontSize: 28, fontWeight: 600, color: g.hex }}>{g.letra}</span>
                    <div><Text type="secondary" style={{ fontSize: 12 }}>/100</Text></div>
                  </div>
                </Flex>
                <Progress percent={resumen.puntaje_sus_promedio ?? 0} showInfo={false} strokeColor={g.hex} />
                <Flex vertical gap={2} style={{ fontSize: 12, marginTop: 8 }}>
                  {ESCALA.map(({ rango, letra, label }) => {
                    const actual = g.letra === letra
                    return (
                      <Flex key={letra} gap={6} style={{ fontWeight: actual ? 700 : 400, color: actual ? g.hex : BRAND.textSecondary }}>
                        <span style={{ width: 32 }}>{rango}</span><span style={{ width: 16 }}>{letra}</span><span>{label}</span>
                      </Flex>
                    )
                  })}
                  <Text type="secondary" style={{ fontSize: 12, marginTop: 4 }}>SUS ≥ 68 = por encima del promedio</Text>
                </Flex>
              </Seccion>
            </Col>
            <Col xs={24} md={16}>
              <Seccion titulo="TAM — Dimensiones" nota={`N = ${resumen.total_tam} evaluadores · Escala 1–7`}>
                <Flex vertical gap={12}>
                  <BarraTAM label="Utilidad percibida (p1–p5)" valor={resumen.util_percibida_promedio} color={BRAND.primary} />
                  <BarraTAM label="Facilidad de uso (p6–p9)" valor={resumen.facilidad_uso_promedio} color={AZUL} />
                  <BarraTAM label="Intención de uso (p10–p12)" valor={resumen.intencion_uso_promedio} color={ESTADO.ok} />
                </Flex>
                <Row gutter={12} style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BRAND.border}`, textAlign: 'center' }}>
                  {[['Utilidad', resumen.util_percibida_promedio], ['Facilidad', resumen.facilidad_uso_promedio], ['Intención', resumen.intencion_uso_promedio]].map(([l, v]) => (
                    <Col key={l as string} span={8}>
                      <div style={{ fontSize: 24, fontWeight: 600 }}>{fmt(v as number | null)}</div>
                      <Text type="secondary" style={{ fontSize: 12 }}>{l as string}</Text>
                    </Col>
                  ))}
                </Row>
              </Seccion>
            </Col>
          </Row>

          <PanelEstadistico estad={estad} />

          {grafico.length > 0 && (
            <Seccion titulo="Puntaje SUS por evaluador" nota="La línea punteada marca el umbral de promedio (68)">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={grafico} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BRAND.border} vertical={false} />
                  <XAxis dataKey="nombre" tick={{ fontSize: 11, fill: BRAND.textSecondary }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: BRAND.textSecondary }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip cursor={{ fill: BRAND.panel }} content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0]; const gr = susGrade(Number(d.value))
                    return (
                      <div style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                        <strong>{(d.payload as { nombre: string }).nombre}</strong><br />SUS: <strong>{d.value}</strong><br />
                        <span style={{ color: gr.hex, fontWeight: 600 }}>{gr.letra} — {gr.etiqueta}</span>
                      </div>
                    )
                  }} />
                  <ReferenceLine y={68} stroke="#94a3b8" strokeDasharray="4 3" label={{ value: '68', position: 'right', fontSize: 10, fill: '#94a3b8' }} />
                  <Bar dataKey="puntaje" radius={[4, 4, 0, 0]} maxBarSize={56}>
                    {grafico.map((e, i) => <Cell key={i} fill={susGrade(e.puntaje).hex} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Seccion>
          )}

          <Seccion titulo="Detalle por evaluador">
            <Table<Fila> rowKey="id" size="middle" columns={columnas} dataSource={filas} pagination={false} scroll={{ x: 'max-content' }} />
          </Seccion>
        </>
      )}
    </Flex>
  )
}
