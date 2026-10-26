import { Alert, Col, Flex, Row, Tag, Typography } from 'antd'
import { BRAND } from '@src/core/color'
import { alphaColor, fmtN, Seccion } from './comun'

const { Text } = Typography

interface Dim { media?: number | null; sd?: number | null; alpha?: number | null }
export interface Estadistica {
  n_evaluadores: number
  muestra_suficiente: boolean
  sus: {
    media?: number; sd?: number; mediana?: number; min?: number; max?: number; ic95_low?: number; ic95_high?: number
    alpha?: number | null; alpha_interp?: string
    interpretacion?: { adjetivo?: string; aceptabilidad?: string; percentil?: number; nota?: string }
  }
  tam: { alpha_global?: number | null; alpha_global_interp?: string; utilidad?: Dim; facilidad?: Dim; intencion?: Dim }
}

const DIMENSIONES = [
  { k: 'utilidad', l: 'Utilidad percibida' },
  { k: 'facilidad', l: 'Facilidad de uso' },
  { k: 'intencion', l: 'Intención de uso' },
] as const

/** Rigor estadístico: descriptivos, IC 95 %, Cronbach e interpretación. */
export default function PanelEstadistico({ estad }: { estad: Estadistica | null }) {
  if (!estad) return null
  const { sus, tam, n_evaluadores, muestra_suficiente } = estad
  const ip = sus.interpretacion || {}
  const acept = ip.aceptabilidad === 'Aceptable' ? 'success' : ip.aceptabilidad === 'Marginal' ? 'warning' : 'error'

  return (
    <Seccion titulo="Rigor estadístico" extra={<Text type="secondary" style={{ fontSize: 12 }}>N = {n_evaluadores} evaluadores</Text>}>
      <Flex vertical gap={16}>
        {!muestra_suficiente && (
          <Alert type="warning" showIcon title={<>Muestra pequeña (N = {n_evaluadores}). Los resultados son válidos pero la potencia
            estadística es limitada; para la sustentación se recomienda <strong>N ≥ 12</strong>.</>} />
        )}
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Flex vertical gap={12} style={{ border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 16, height: '100%' }}>
              <Flex justify="space-between" align="center" wrap gap={8}>
                <Text type="secondary" strong>SUS</Text>
                <Tag color={alphaColor(sus.alpha)} style={{ margin: 0 }}>α = {fmtN(sus.alpha)} · {sus.alpha_interp}</Tag>
              </Flex>
              <div>
                <div style={{ fontSize: 32, fontWeight: 600, lineHeight: '38px' }}>
                  {fmtN(sus.media)}<Text type="secondary" style={{ fontSize: 16 }}> ± {fmtN(sus.sd)}</Text>
                </div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Media ± DE · Mediana {fmtN(sus.mediana)} · Rango {fmtN(sus.min)}–{fmtN(sus.max)}
                </Text>
                <div style={{ marginTop: 4 }}><Text style={{ fontSize: 13 }}>IC 95%: <strong>[{fmtN(sus.ic95_low)} – {fmtN(sus.ic95_high)}]</strong></Text></div>
              </div>
              <Flex gap={6} wrap>
                <Tag color="green" style={{ margin: 0 }}>{ip.adjetivo}</Tag>
                <Tag color={acept} style={{ margin: 0 }}>{ip.aceptabilidad}</Tag>
                <Tag style={{ margin: 0 }}>Percentil {fmtN(ip.percentil)}</Tag>
                <Tag style={{ margin: 0 }}>Nota {ip.nota}</Tag>
              </Flex>
            </Flex>
          </Col>
          <Col xs={24} md={12}>
            <Flex vertical gap={12} style={{ border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 16, height: '100%' }}>
              <Flex justify="space-between" align="center" wrap gap={8}>
                <Text type="secondary" strong>TAM</Text>
                <Tag color={alphaColor(tam.alpha_global)} style={{ margin: 0 }}>α global = {fmtN(tam.alpha_global)} · {tam.alpha_global_interp}</Tag>
              </Flex>
              {DIMENSIONES.map(({ k, l }) => {
                const d = tam[k] || {}
                return (
                  <Flex key={k} justify="space-between" align="center" gap={8}>
                    <Text>{l}</Text>
                    <Flex gap={8} align="center">
                      <Text strong>{fmtN(d.media)} <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>± {fmtN(d.sd)}</Text></Text>
                      <Tag color={alphaColor(d.alpha)} style={{ margin: 0 }}>α {fmtN(d.alpha)}</Tag>
                    </Flex>
                  </Flex>
                )
              })}
              <Text type="secondary" style={{ fontSize: 12 }}>Escala 1–7 · Media ± DE por dimensión</Text>
            </Flex>
          </Col>
        </Row>
      </Flex>
    </Seccion>
  )
}
