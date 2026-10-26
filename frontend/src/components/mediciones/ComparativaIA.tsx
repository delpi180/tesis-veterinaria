import { useState } from 'react'
import { Alert, Button, Card, Col, Flex, Input, Progress, Row, Typography } from 'antd'
import { ClockCircleOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { api } from '../../services/api'
import { BRAND, ESTADO } from '@src/core/color'
import { mensajeDe, Seccion } from './comun'

const { Text } = Typography

const TEXTO_EJEMPLO =
  'El paciente llega por vómitos y diarrea desde hace dos días. Está decaído y no quiere comer. ' +
  'Temperatura 39.5 grados, frecuencia cardiaca 120. Mucosas pálidas. ' +
  'Sospecho de gastroenteritis. Le indico dieta blanda y metronidazol cada 12 horas por 5 días.'

interface Dato { campos_completados: number; total_campos: number; tiempo_ms?: number | null; error?: string }

function Tarjeta({ titulo, color, dato }: { titulo: string; color: string; dato: Dato }) {
  const pct = dato.total_campos ? Math.round((dato.campos_completados / dato.total_campos) * 100) : 0
  return (
    <Card size="small" title={titulo}>
      {dato.error ? <Alert type="error" showIcon title={dato.error} /> : (
        <Flex vertical gap={8}>
          <Flex justify="space-between" align="end">
            <Text type="secondary" style={{ fontSize: 12 }}>Campos completados</Text>
            <Text strong style={{ fontSize: 18 }}>{dato.campos_completados}/{dato.total_campos}</Text>
          </Flex>
          <Progress percent={pct} showInfo={false} strokeColor={color} />
          <Text type="secondary" style={{ fontSize: 12 }}><ClockCircleOutlined /> {dato.tiempo_ms != null ? `${dato.tiempo_ms} ms` : '—'}</Text>
        </Flex>
      )}
    </Card>
  )
}

/** Comparativa IA vs. método léxico (evaluación de tesis). */
export default function ComparativaIA() {
  const [texto, setTexto] = useState(TEXTO_EJEMPLO)
  const [res, setRes] = useState<{ lexico: Dato; ia: Dato } | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const comparar = async () => {
    if (!texto.trim()) { setError('Ingresa un texto de consulta.'); return }
    setCargando(true); setError(null); setRes(null)
    try {
      setRes(await api.post('/api/comparar-extraccion', { texto }))
    } catch (e) { setError(mensajeDe(e)) } finally { setCargando(false) }
  }

  return (
    <Seccion titulo="Comparativa: IA vs. método léxico"
      nota="Procesa el mismo texto con ambos métodos y compara cuántos campos clínicos completa cada uno y su tiempo.">
      <Flex vertical gap={12}>
        <Input.TextArea rows={4} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Pega aquí la transcripción de una consulta…" aria-label="Texto de la consulta" />
        {error && <Alert type="error" showIcon title={error} />}
        <div><Button type="primary" icon={<ThunderboltOutlined />} loading={cargando} onClick={comparar}>{cargando ? 'Comparando…' : 'Comparar métodos'}</Button></div>
        {res && (
          <Row gutter={[12, 12]} className="animar">
            <Col xs={24} md={12}><Tarjeta titulo="Método léxico (reglas)" color={ESTADO.atencion} dato={res.lexico} /></Col>
            <Col xs={24} md={12}><Tarjeta titulo="Método IA (GPT)" color={BRAND.primary} dato={res.ia} /></Col>
          </Row>
        )}
      </Flex>
    </Seccion>
  )
}
