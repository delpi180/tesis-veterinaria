import { Flex, Spin, Typography } from 'antd'

/**
 * La espera, en un solo lugar: una sola ruedita y un solo bloque centrado de
 * verdad (dentro del área que le toca, no empujado desde arriba con relleno).
 *
 * Para listados preferir `Skeleton` de antd: muestra la forma del contenido y no
 * hace saltar la página cuando llegan los datos. Esto es para lo que no tiene
 * forma previsible (un panel, un reporte, un perfil).
 */
export function Cargando({ texto = 'Cargando…', alto = 220, className }: {
  texto?: string
  alto?: number | string
  className?: string
}) {
  return (
    <Flex vertical align="center" justify="center" gap={12} className={className} style={{ minHeight: alto, flex: 1 }}
      role="status" aria-live="polite">
      <Spin size="large" />
      <Typography.Text type="secondary">{texto}</Typography.Text>
    </Flex>
  )
}

/** La misma espera ocupando la pantalla: entre rutas, mientras carga el módulo. */
export function CargandoPantalla({ texto = 'Cargando…' }: { texto?: string }) {
  return <Cargando texto={texto} alto="60vh" className="w-full" />
}
