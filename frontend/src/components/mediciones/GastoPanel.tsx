import { useEffect, useState } from 'react'
import { Alert, Card, Col, Empty, Flex, InputNumber, Row, Skeleton, Switch, Table, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../../services/api'
import { BRAND, ESTADO } from '@src/core/color'
import { mensajeDe, Seccion } from './comun'

const { Text } = Typography

interface Latencia { n: number; mediana_ms?: number | null; p95_ms?: number | null }
interface Gasto {
  hoy_usd: number; semana_usd: number; mes_usd: number; proyeccion_mes_usd: number
  por_historia_usd: number | null; historias_con_ia: number
  segundos_audio_promedio: number | null; tokens_entrada_promedio: number | null; tokens_salida_promedio: number | null
  tope_diario_usd: number | null; tope_alcanzado: boolean
  alerta_mensual_usd: number | null; alerta_mensual_superada: boolean
  precios: { openai_entrada_millon: number; openai_salida_millon: number; deepgram_minuto: number; modelo_llm: string; modelo_voz: string }
  latencia: Record<string, Latencia>
  por_dia: { dia: string; usd: number }[]
  llamadas_fallidas_30d: number
}
interface Estimado {
  n_historias: number; por_historia_usd: number; voz_usd: number; extraccion_usd: number; total_usd: number
  origen: string; tope_diario_usd: number | null; gasto_hoy_usd: number
}

/** Dólares con los decimales justos: los montos son de centavos o menos. */
export const usd = (v: number | null | undefined) =>
  v == null ? '—' : `US$ ${v < 1 ? v.toFixed(4) : v.toFixed(2)}`
const ms = (v: number | null | undefined) => (v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`)
const NOMBRE_SERVICIO: Record<string, string> = { deepgram: 'Voz → texto (Deepgram)', openai: 'Texto → historia (OpenAI)' }

/** Cuánto gasta la IA, cuánto tarda y cuánto costaría hacer más pruebas. */
export default function GastoPanel() {
  const [g, setG] = useState<Gasto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [historias, setHistorias] = useState<number>(30)
  const [conVoz, setConVoz] = useState(true)
  const [est, setEst] = useState<Estimado | null>(null)

  useEffect(() => {
    let vigente = true
    api.get('/api/ia/gasto')
      .then((r: Gasto) => { if (vigente) setG(r) })
      .catch((e: unknown) => { if (vigente) setError(mensajeDe(e)) })
    return () => { vigente = false }
  }, [])

  useEffect(() => {
    let vigente = true
    const n = Math.max(1, Math.round(historias || 1))
    const t = setTimeout(() => {
      api.get(`/api/ia/gasto/estimar?historias=${n}&con_voz=${conVoz}`)
        .then((r: Estimado) => { if (vigente) setEst(r) })
        .catch(() => { if (vigente) setEst(null) })
    }, 300)
    return () => { vigente = false; clearTimeout(t) }
  }, [historias, conVoz])

  if (error) return <Alert type="error" showIcon title={error} />
  if (!g) return <Card><Skeleton active paragraph={{ rows: 4 }} /></Card>

  const kpis = [
    { t: 'Hoy', v: usd(g.hoy_usd), n: g.tope_diario_usd ? `Tope diario ${usd(g.tope_diario_usd)}` : 'Sin tope diario' },
    { t: 'Últimos 7 días', v: usd(g.semana_usd), n: 'voz + extracción' },
    { t: 'Este mes', v: usd(g.mes_usd), n: `Proyección ${usd(g.proyeccion_mes_usd)}` },
    { t: 'Por historia con IA', v: usd(g.por_historia_usd), n: `${g.historias_con_ia} historias medidas` },
  ]
  const filasLatencia = Object.entries(g.latencia).map(([servicio, d]) => ({ servicio, ...d }))
  const columnas: TableColumnsType<(typeof filasLatencia)[number]> = [
    { title: 'Servicio', dataIndex: 'servicio', render: (s: string) => <Text strong>{NOMBRE_SERVICIO[s] ?? s}</Text> },
    { title: 'Llamadas', dataIndex: 'n', align: 'right' },
    { title: 'Mediana', dataIndex: 'mediana_ms', align: 'right', render: ms },
    { title: 'Percentil 95', dataIndex: 'p95_ms', align: 'right', render: ms },
  ]

  return (
    <Flex vertical gap={16}>
      {g.tope_alcanzado && (
        <Alert type="error" showIcon title="Se llegó al tope de gasto de hoy: la IA está bloqueada hasta mañana."
          description="El llenado manual sigue funcionando. Para subir el tope: TOPE_GASTO_IA_DIARIO_USD en las variables del servidor." />
      )}
      {g.alerta_mensual_superada && (
        <Alert type="warning" showIcon title={`El gasto del mes pasó de ${usd(g.alerta_mensual_usd)}.`} />
      )}

      <Row gutter={[12, 12]}>
        {kpis.map((k, i) => (
          <Col key={k.t} xs={12} md={6}>
            <Card size="small" className="tarjeta-viva animar" style={{ animationDelay: `${i * 70}ms` }}>
              <Text type="secondary" style={{ fontSize: 12 }}>{k.t}</Text>
              <div style={{ fontSize: 24, fontWeight: 600, lineHeight: '32px' }}>{k.v}</div>
              <Text type="secondary" style={{ fontSize: 12 }}>{k.n}</Text>
            </Card>
          </Col>
        ))}
      </Row>

      <Seccion titulo="Gasto por día" nota="Últimos 14 días, hora de Lima. Incluye voz, extracción y las corridas de evaluación.">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={g.por_dia} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BRAND.border} vertical={false} />
            <XAxis dataKey="dia" tick={{ fontSize: 11, fill: BRAND.textSecondary }} axisLine={false} tickLine={false}
              tickFormatter={(d: string) => d.slice(8) + '/' + d.slice(5, 7)} />
            <YAxis tick={{ fontSize: 11, fill: BRAND.textSecondary }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v) => [usd(Number(v)), 'Gasto']} labelFormatter={(d) => String(d)}
              contentStyle={{ borderRadius: 12, border: `1px solid ${BRAND.border}`, fontSize: 13 }} />
            <Bar dataKey="usd" fill={BRAND.primary} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Seccion>

      <Seccion titulo="¿Cuánto costaría probar más?"
        nota="Cuenta con los promedios reales de la clínica; si todavía no hay datos, usa supuestos y lo avisa. No llama a ninguna IA.">
        <Flex vertical gap={12}>
          <Flex gap={16} align="center" wrap>
            <Flex gap={8} align="center">
              <label htmlFor="n-hist"><Text type="secondary">Historias a probar</Text></label>
              <InputNumber id="n-hist" min={1} max={5000} value={historias} onChange={v => setHistorias(Number(v) || 1)} />
            </Flex>
            <Flex gap={8} align="center">
              <Switch checked={conVoz} onChange={setConVoz} aria-label="Incluir voz" />
              <Text type="secondary">{conVoz ? 'Con voz (Deepgram + OpenAI)' : 'Solo texto (OpenAI)'}</Text>
            </Flex>
          </Flex>
          {est ? (
            <>
              <Row gutter={[12, 12]}>
                <Col xs={12} md={6}><Card size="small"><Text type="secondary" style={{ fontSize: 12 }}>Total estimado</Text><div style={{ fontSize: 22, fontWeight: 600 }}>{usd(est.total_usd)}</div></Card></Col>
                <Col xs={12} md={6}><Card size="small"><Text type="secondary" style={{ fontSize: 12 }}>Por historia</Text><div style={{ fontSize: 22, fontWeight: 600 }}>{usd(est.por_historia_usd)}</div></Card></Col>
                <Col xs={12} md={6}><Card size="small"><Text type="secondary" style={{ fontSize: 12 }}>Voz</Text><div style={{ fontSize: 22, fontWeight: 600 }}>{usd(est.voz_usd)}</div></Card></Col>
                <Col xs={12} md={6}><Card size="small"><Text type="secondary" style={{ fontSize: 12 }}>Extracción</Text><div style={{ fontSize: 22, fontWeight: 600 }}>{usd(est.extraccion_usd)}</div></Card></Col>
              </Row>
              <Flex gap={8} wrap align="center">
                <Tag color={est.origen.startsWith('datos') ? 'green' : 'orange'} style={{ margin: 0 }}>Basado en: {est.origen}</Tag>
                {est.tope_diario_usd != null && est.total_usd > Math.max(est.tope_diario_usd - est.gasto_hoy_usd, 0) && (
                  <Tag color="error" style={{ margin: 0 }}>Supera lo que queda del tope de hoy: repartir en varios días</Tag>
                )}
              </Flex>
            </>
          ) : <Text type="secondary">Calculando…</Text>}
        </Flex>
      </Seccion>

      <Seccion titulo="Latencia de los servicios" nota="Lo que tarda cada servicio en responder (solo llamadas que salieron bien, últimos 30 días). Mediana = lo normal; percentil 95 = el 95 % de las veces tarda eso o menos.">
        {filasLatencia.length === 0
          ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Aún no hay llamadas registradas." />
          : <Table rowKey="servicio" size="small" columns={columnas} dataSource={filasLatencia} pagination={false} scroll={{ x: 'max-content' }} />}
        {g.llamadas_fallidas_30d > 0 && (
          <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12, color: ESTADO.atencion }}>
            {g.llamadas_fallidas_30d} llamada(s) fallaron en los últimos 30 días (no se cobran).
          </Text>
        )}
      </Seccion>

      <Alert type="info" showIcon
        title="Los precios son estimados"
        description={<>
          {g.precios.modelo_llm}: US$ {g.precios.openai_entrada_millon} por millón de tokens de entrada y US$ {g.precios.openai_salida_millon} de salida.{' '}
          {g.precios.modelo_voz}: US$ {g.precios.deepgram_minuto} por minuto de audio. Verifícalos en las páginas de precios de OpenAI y Deepgram antes de citarlos en la tesis;
          se cambian con las variables del servidor.
        </>} />
    </Flex>
  )
}
