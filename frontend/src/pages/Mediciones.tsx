import { useState } from 'react'
import { Col, Flex, Row, Tabs, Typography } from 'antd'
import { BarChartOutlined, ClockCircleOutlined, DollarOutlined, FormOutlined, RobotOutlined } from '@ant-design/icons'
import Encuestas from '../components/mediciones/Encuestas'
import Resultados from '../components/mediciones/Resultados'
import TiemposPanel from '../components/mediciones/TiemposPanel'
import ComparativaIA from '../components/mediciones/ComparativaIA'
import ExactitudPanel from '../components/mediciones/ExactitudPanel'
import WerPanel from '../components/mediciones/WerPanel'
import BancoCasosPanel from '../components/mediciones/BancoCasosPanel'
import GastoPanel from '../components/mediciones/GastoPanel'
import { MEDIDAS } from '@src/core/medidas'

const { Title, Text } = Typography

/** Mediciones de la tesis: encuestas SUS/TAM, tiempos por etapa, calidad de la voz (WER), exactitud de la IA y gasto. */
export default function Mediciones() {
  const [tab, setTab] = useState('encuestas')
  const hoyTexto = new Date().toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const hoy = hoyTexto.charAt(0).toUpperCase() + hoyTexto.slice(1)

  return (
    <div className="animar" style={{ flex: 1, minWidth: 0, padding: '16px 32px 32px', width: '100%' }}>
      <Row align="bottom" style={{ marginBottom: 8 }}>
        <Col flex="auto">
          <Text type="secondary">{hoy}</Text>
          <Title level={2} style={{ margin: '4px 0 0', fontSize: MEDIDAS.tituloSeccion, fontWeight: 500, lineHeight: '32px' }}>Mediciones</Title>
        </Col>
      </Row>

      <Tabs activeKey={tab} onChange={setTab} destroyOnHidden items={[
        { key: 'encuestas', label: 'Responder encuestas', icon: <FormOutlined />, children: <Encuestas /> },
        { key: 'resultados', label: 'Resultados', icon: <BarChartOutlined />, children: <Resultados /> },
        {
          key: 'pipeline', label: 'Métricas IA', icon: <RobotOutlined />,
          children: (
            <Flex vertical gap={16}>
              <div>
                <Text strong><ClockCircleOutlined /> Tiempo de registro — Manual vs. IA</Text><br />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Eficiencia documental: cuánto se tarda en llenar una historia con cada método (medido automáticamente).
                </Text>
              </div>
              <TiemposPanel />
              <WerPanel />
              <BancoCasosPanel />
              <ComparativaIA />
              <ExactitudPanel />
            </Flex>
          ),
        },
        { key: 'gasto', label: 'Gasto de IA', icon: <DollarOutlined />, children: <GastoPanel /> },
      ]} />
    </div>
  )
}
