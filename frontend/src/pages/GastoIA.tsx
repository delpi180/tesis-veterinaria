import { Col, Row, Typography } from 'antd'
import GastoPanel from '../components/mediciones/GastoPanel'
import { MEDIDAS } from '@src/core/medidas'

const { Title, Text } = Typography

/** Cuánto gasta la IA de la clínica (voz y extracción), cuánto tarda y cuánto costaría probar más. Solo la administradora. */
export default function GastoIA() {
  const hoyTexto = new Date().toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const hoy = hoyTexto.charAt(0).toUpperCase() + hoyTexto.slice(1)
  return (
    <div className="animar" style={{ flex: 1, minWidth: 0, padding: '16px 32px 32px', width: '100%' }}>
      <Row align="bottom" style={{ marginBottom: 16 }}>
        <Col flex="auto">
          <Text type="secondary">{hoy}</Text>
          <Title level={2} style={{ margin: '4px 0 0', fontSize: MEDIDAS.tituloSeccion, fontWeight: 500, lineHeight: '32px' }}>Gasto de IA</Title>
        </Col>
      </Row>
      <GastoPanel />
    </div>
  )
}
