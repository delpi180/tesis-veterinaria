/**
 * Contador discreto del tiempo que lleva el registro de la consulta.
 *
 * Es el mismo tiempo que se guarda al final (`segundos_registro`): se ve para que
 * quien registra sepa que se está midiendo, pero sin apurarlo (no cambia de color
 * ni suena). Se reinicia solo cuando `inicioMs` cambia, es decir, al elegir o
 * cambiar el modo.
 */
import { useEffect, useState } from 'react'
import { Typography } from 'antd'
import { ClockCircleOutlined } from '@ant-design/icons'

export const formatoTiempo = (seg: number) => {
  const m = Math.floor(seg / 60)
  const s = seg % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function Cronometro({ inicioMs }: { inicioMs: number }) {
  const [seg, setSeg] = useState(() => Math.max(0, Math.floor((Date.now() - inicioMs) / 1000)))

  useEffect(() => {
    const t = window.setInterval(
      () => setSeg(Math.max(0, Math.floor((Date.now() - inicioMs) / 1000))),
      1000,
    )
    return () => window.clearInterval(t)
  }, [inicioMs])

  return (
    <Typography.Text type="secondary" role="timer" aria-label="Tiempo de registro" style={{ fontVariantNumeric: 'tabular-nums' }}>
      <ClockCircleOutlined /> {formatoTiempo(seg)}
    </Typography.Text>
  )
}
