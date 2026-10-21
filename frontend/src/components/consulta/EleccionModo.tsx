/**
 * Primera pantalla de una consulta nueva: la persona elige CÓMO la va a llenar
 * antes de empezar. El formulario es el mismo en los dos; cambia solo el método.
 * El cronómetro arranca al elegir, y el método guardado es el que se eligió aquí.
 */
import { Button, Flex, Typography, theme } from 'antd'
import { AudioOutlined, EditOutlined } from '@ant-design/icons'
import { BRAND } from '@src/core/color'
import type { ModoRegistro } from '@src/utils/historiaClinica'

interface Props {
  onElegir: (modo: ModoRegistro) => void
}

export default function EleccionModo({ onElegir }: Props) {
  const { token } = theme.useToken()
  const boton = {
    flex: '1 1 220px', height: 'auto', minHeight: 120, padding: 16, whiteSpace: 'normal',
    borderRadius: token.borderRadiusLG,
  } as const

  return (
    <Flex vertical gap={12}>
      <Typography.Text type="secondary">
        ¿Cómo vas a llenar esta consulta? El formulario es el mismo; el tiempo empieza a contar cuando eliges.
      </Typography.Text>
      <Flex wrap gap={12}>
        <Button style={boton} onClick={() => onElegir('manual')}>
          <Flex vertical align="center" gap={6}>
            <EditOutlined style={{ fontSize: 28, color: BRAND.primary }} />
            <Typography.Text strong style={{ fontSize: 18 }}>Escribir</Typography.Text>
            <Typography.Text type="secondary">Llenas los campos tú mismo.</Typography.Text>
          </Flex>
        </Button>
        <Button type="primary" style={boton} onClick={() => onElegir('ia')}>
          <Flex vertical align="center" gap={6}>
            <AudioOutlined style={{ fontSize: 28 }} />
            <span style={{ fontSize: 18, fontWeight: 600 }}>Dictar</span>
            <span style={{ opacity: 0.9 }}>Hablas y la IA llena los campos; tú los revisas.</span>
          </Flex>
        </Button>
      </Flex>
    </Flex>
  )
}
