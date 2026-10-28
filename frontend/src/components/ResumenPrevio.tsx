import { useEffect, useState } from 'react'
import { Alert, Card, Flex, Skeleton, Tag, Typography } from 'antd'
import { api } from '../services/api'

const { Text } = Typography

interface Resumen {
  alergias: string | null
  condiciones_cronicas: string | null
  total_consultas: number
  ultima_visita: { fecha: string | null; motivo?: string | null; diagnostico?: string | null; indicaciones?: string | null; veterinario?: string | null } | null
  peso: { kg: number; fecha: string | null; cambio_kg: number | null } | null
  tratamientos_en_curso: { medicamento: string; dosis?: string | null; frecuencia?: string | null; fin?: string | null }[]
  pendientes: { tipo: 'vacuna' | 'antiparasitario'; nombre: string; fecha: string; vencida: boolean }[]
  proxima_cita: { fecha_hora: string; motivo?: string | null } | null
}

const fmt = (iso: string) => new Date(iso.length === 10 ? iso + 'T00:00:00' : iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })

// Lo que el doctor necesita saber antes de entrar a la consulta. Todo sale directo
// de lo registrado (sin IA), así que no puede traer un dato inventado.
export default function ResumenPrevio({ pacienteId }: { pacienteId: number | string }) {
  const [r, setR] = useState<Resumen | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let vivo = true
    api.get(`/api/pacientes/${pacienteId}/resumen-previo`)
      .then((d: Resumen) => { if (vivo) setR(d) })
      .catch(() => { if (vivo) setError(true) })
    return () => { vivo = false }
  }, [pacienteId])

  if (error) return null
  if (!r) return <Card size="small"><Skeleton active paragraph={{ rows: 2 }} /></Card>

  const v = r.ultima_visita
  return (
    <Card size="small" title="Antes de entrar a la consulta">
      <Flex vertical gap={10}>
        {r.alergias && <Alert type="error" showIcon title={`Alergias: ${r.alergias}`} />}
        {r.condiciones_cronicas && <Alert type="warning" showIcon title={`Condiciones crónicas: ${r.condiciones_cronicas}`} />}

        {v ? (
          <Text>
            <b>Última visita{v.fecha ? ` (${fmt(v.fecha)})` : ''}:</b> {v.motivo || 'sin motivo'}
            {v.diagnostico ? ` — ${v.diagnostico}` : ''}
            {v.veterinario ? ` · ${v.veterinario}` : ''}
          </Text>
        ) : <Text type="secondary">Primera consulta: todavía no hay historia registrada.</Text>}

        {r.peso && (
          <Text>
            <b>Peso:</b> {r.peso.kg} kg
            {r.peso.cambio_kg != null && r.peso.cambio_kg !== 0 && ` (${r.peso.cambio_kg > 0 ? '+' : ''}${r.peso.cambio_kg} kg desde la visita anterior)`}
          </Text>
        )}

        {r.tratamientos_en_curso.length > 0 && (
          <div>
            <Text strong>Tratamiento en curso: </Text>
            {r.tratamientos_en_curso.map((t, i) => (
              <Tag key={i} color="green">
                {t.medicamento}{t.dosis ? ` ${t.dosis}` : ''}{t.frecuencia ? ` ${t.frecuencia}` : ''}{t.fin ? ` · hasta ${fmt(t.fin)}` : ''}
              </Tag>
            ))}
          </div>
        )}

        {r.pendientes.length > 0 && (
          <div>
            <Text strong>Pendiente: </Text>
            {r.pendientes.map((p, i) => (
              <Tag key={i} color={p.vencida ? 'red' : 'blue'}>
                {p.tipo === 'vacuna' ? 'Vacuna' : 'Antiparasitario'} {p.nombre} · {p.vencida ? 'vencida el' : 'toca el'} {fmt(p.fecha)}
              </Tag>
            ))}
          </div>
        )}

        {r.proxima_cita && <Text><b>Próxima cita:</b> {fmt(r.proxima_cita.fecha_hora)}{r.proxima_cita.motivo ? ` — ${r.proxima_cita.motivo}` : ''}</Text>}
      </Flex>
    </Card>
  )
}
