/**
 * Primera pantalla de una consulta nueva: la persona elige CÓMO la va a llenar
 * antes de empezar. El formulario es el mismo en los dos; cambia solo el método.
 * El cronómetro arranca al elegir, y el método guardado es el que se eligió aquí.
 */
import { Button, Card, Flex, Typography, theme } from 'antd'
import { AudioOutlined, EditOutlined, RightOutlined } from '@ant-design/icons'
import { BRAND } from '@src/core/color'
import type { ModoRegistro } from '@src/utils/historiaClinica'

interface Props {
  onElegir: (modo: ModoRegistro) => void
}

interface Opcion {
  modo: ModoRegistro
  titulo: string
  detalle: string
  icono: React.ReactNode
  principal?: boolean
}

const OPCIONES: Opcion[] = [
  { modo: 'manual', titulo: 'Escribir', detalle: 'Llenas los campos tú mismo.', icono: <EditOutlined /> },
  { modo: 'ia', titulo: 'Dictar', detalle: 'Hablas y la IA llena los campos; tú los revisas.', icono: <AudioOutlined />, principal: true },
]

export default function EleccionModo({ onElegir }: Props) {
  const { token } = theme.useToken()

  return (
    <Card styles={{ body: { padding: 20 } }}>
      <Flex vertical gap={16}>
        <div>
          <Typography.Title level={5} style={{ margin: 0 }}>¿Cómo vas a llenar esta consulta?</Typography.Title>
          <Typography.Text type="secondary">
            El formulario es el mismo en los dos; el tiempo empieza a contar cuando eliges.
          </Typography.Text>
        </div>
        <Flex wrap gap={12}>
          {OPCIONES.map(o => (
            <Button
              key={o.modo}
              onClick={() => onElegir(o.modo)}
              color={o.principal ? 'primary' : 'default'}
              variant="outlined"
              style={{
                flex: '1 1 260px', height: 'auto', padding: '16px 18px', whiteSpace: 'normal', textAlign: 'left',
                borderColor: o.principal ? BRAND.primary : undefined, borderRadius: token.borderRadius,
              }}
            >
              <Flex align="center" gap={14} style={{ width: '100%' }}>
                <span
                  aria-hidden
                  style={{
                    width: 40, height: 40, borderRadius: token.borderRadius, flexShrink: 0,
                    display: 'grid', placeItems: 'center', fontSize: 20,
                    background: o.principal ? BRAND.primary : BRAND.panel,
                    color: o.principal ? token.colorTextLightSolid : BRAND.primary,
                    border: o.principal ? 'none' : `1px solid ${BRAND.border}`,
                  }}
                >
                  {o.icono}
                </span>
                <Flex vertical style={{ flex: 1, minWidth: 0 }}>
                  <Typography.Text strong style={{ fontSize: 16 }}>{o.titulo}</Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>{o.detalle}</Typography.Text>
                </Flex>
                <RightOutlined aria-hidden style={{ color: BRAND.textSecondary, fontSize: 12 }} />
              </Flex>
            </Button>
          ))}
        </Flex>
      </Flex>
    </Card>
  )
}
