import { Column } from '@ant-design/plots'
import { BRAND } from '@src/core/color'

export interface DiaConsultas {
  dia: string
  consultas: number
  /** true para el día de hoy: se pinta con el acento cálido. */
  hoy: boolean
}

/**
 * Consultas por día de la semana. Vive en su propio archivo a propósito:
 * `@ant-design/plots` (G2) pesa más de 800 KB y el resto de Inicio no lo
 * necesita. Inicio lo carga con `lazy`, así que las cifras y los turnos se
 * ven al instante y el gráfico llega después, en vez de retrasar toda la
 * pantalla por un dibujo.
 */
export default function GraficoSemana({ datos }: { datos: DiaConsultas[] }) {
  return (
    <Column
      data={datos}
      xField="dia"
      yField="consultas"
      height={220}
      legend={false}
      style={{
        fill: (d: DiaConsultas) => (d.hoy ? BRAND.accent : '#b3d6c9'),
        maxWidth: 36,
        radiusTopLeft: 6,
        radiusTopRight: 6,
      }}
      // Las consultas son enteras: sin etiquetas de 0,5 ni 1,5 en el eje.
      axis={{
        x: { title: false },
        y: { title: false, tickCount: 4, labelFormatter: (v: number) => (Number.isInteger(v) ? String(v) : '') },
      }}
      tooltip={{ items: [{ channel: 'y', name: 'Consultas' }] }}
    />
  )
}
