import { useState } from 'react'
import { Alert, Button, Card, Col, Flex, Input, Row, Table, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { AimOutlined } from '@ant-design/icons'
import { api } from '../../services/api'
import { mensajeDe, Seccion } from './comun'

const { Text } = Typography

const CAMPOS = [
  { k: 'motivo_consulta', l: 'Motivo de consulta' },
  { k: 'diagnostico_presuntivo', l: 'Dx presuntivo' },
  { k: 'temperatura_c', l: 'Temperatura (°C)' },
  { k: 'peso_kg', l: 'Peso (kg)' },
  { k: 'frecuencia_cardiaca', l: 'Frec. cardiaca' },
  { k: 'mucosas', l: 'Mucosas' },
  { k: 'hidratacion', l: 'Hidratación' },
  { k: 'indicaciones', l: 'Indicaciones' },
]
const EJEMPLO = 'Perro labrador viene por vómitos y diarrea hace dos días. Temperatura 39.2, mucosas pálidas, un poco deshidratado. Sospecho gastroenteritis. Le indico dieta blanda y reposo.'
const ESTADO_ACC: Record<string, { color: string; label: string }> = {
  correcto: { color: 'success', label: 'Correcto' },
  omitido: { color: 'warning', label: 'Omitido' },
  extra: { color: 'blue', label: 'Extra' },
  incorrecto: { color: 'error', label: 'Incorrecto' },
  '—': { color: 'default', label: '—' },
}

interface Detalle { campo: string; referencia?: string | null; ia?: string | null; estado: string }
interface Resultado { exactitud_pct?: number | null; precision?: number | null; recall?: number | null; f1?: number | null; detalle: Detalle[] }

/** Exactitud de la extracción de la IA contra una referencia escrita a mano (gold-standard). */
export default function ExactitudPanel() {
  const [texto, setTexto] = useState(EJEMPLO)
  const [ref, setRef] = useState<Record<string, string>>({
    motivo_consulta: 'vómitos y diarrea', diagnostico_presuntivo: 'gastroenteritis',
    temperatura_c: '39.2', mucosas: 'palidas', hidratacion: 'leve_5', indicaciones: 'dieta blanda y reposo',
  })
  const [res, setRes] = useState<Resultado | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const evaluar = async () => {
    if (!texto.trim()) { setError('Ingresa la transcripción.'); return }
    setCargando(true); setError(null); setRes(null)
    try {
      const referencia = Object.fromEntries(Object.entries(ref).filter(([, v]) => v !== ''))
      setRes(await api.post('/api/comparar-exactitud', { texto, referencia }))
    } catch (e) { setError(mensajeDe(e)) } finally { setCargando(false) }
  }

  const metricas = res ? [
    { l: 'Exactitud', v: res.exactitud_pct, suf: '%' }, { l: 'Precisión', v: res.precision },
    { l: 'Recall', v: res.recall }, { l: 'F1-score', v: res.f1 },
  ] : []

  const columnas: TableColumnsType<Detalle> = [
    { title: 'Campo', dataIndex: 'campo', render: (c: string) => <Text strong>{c}</Text> },
    { title: 'Referencia', dataIndex: 'referencia', render: (v?: string | null) => v ?? '—' },
    { title: 'IA extrajo', dataIndex: 'ia', render: (v?: string | null) => v ?? '—' },
    {
      title: 'Estado', dataIndex: 'estado', align: 'center',
      render: (s: string) => { const e = ESTADO_ACC[s] ?? ESTADO_ACC['—']; return <Tag color={e.color} style={{ margin: 0 }}>{e.label}</Tag> },
    },
  ]

  return (
    <Seccion titulo="Exactitud vs. referencia (gold-standard)"
      nota="Escribe la transcripción y los valores correctos esperados; la IA extrae y se compara campo por campo (precisión / recall / F1).">
      <Flex vertical gap={12}>
        <Input.TextArea rows={3} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Transcripción de la consulta…" aria-label="Transcripción" />
        <Row gutter={[12, 8]}>
          {CAMPOS.map(({ k, l }) => (
            <Col key={k} xs={24} md={12}>
              <Flex align="center" gap={8}>
                <label htmlFor={`ref-${k}`} style={{ width: 128, flexShrink: 0, fontSize: 12 }}><Text type="secondary">{l}</Text></label>
                <Input id={`ref-${k}`} value={ref[k] ?? ''} onChange={e => setRef(r => ({ ...r, [k]: e.target.value }))} placeholder="(vacío = no esperado)" />
              </Flex>
            </Col>
          ))}
        </Row>
        {error && <Alert type="error" showIcon title={error} />}
        <div><Button type="primary" icon={<AimOutlined />} loading={cargando} onClick={evaluar}>{cargando ? 'Evaluando…' : 'Evaluar exactitud'}</Button></div>

        {res && (
          <Flex vertical gap={12} className="animar">
            <Row gutter={[12, 12]}>
              {metricas.map(m => (
                <Col key={m.l} xs={12} md={6}>
                  <Card size="small" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 600 }}>{m.v != null ? `${m.v}${m.suf ?? ''}` : '—'}</div>
                    <Text type="secondary" style={{ fontSize: 12 }}>{m.l}</Text>
                  </Card>
                </Col>
              ))}
            </Row>
            <Table<Detalle> rowKey="campo" size="small" columns={columnas} dataSource={res.detalle} pagination={false} scroll={{ x: 'max-content' }} />
          </Flex>
        )}
      </Flex>
    </Seccion>
  )
}
