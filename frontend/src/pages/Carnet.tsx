import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Card, Empty, Flex, Skeleton, Tag, Typography } from 'antd'
import { BRAND } from '@src/core/color'
import { api } from '../services/api'

const { Title, Text } = Typography

interface Fila { aplicada: string | null; proxima: string | null; estado: 'vencida' | 'al_dia' | null }
interface Carnet {
  clinica: string
  mascota: { nombre: string; especie: string; raza?: string | null }
  vacunas: (Fila & { nombre: string })[]
  desparasitaciones: (Fila & { producto: string })[]
  proxima_cita: string | null
}

const fmt = (iso: string) => new Date(iso.length === 10 ? iso + 'T00:00:00' : iso)
  .toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })

function Estado({ f }: { f: Fila }) {
  if (!f.proxima) return <Text type="secondary">Sin próxima dosis</Text>
  return f.estado === 'vencida'
    ? <Tag color="error" style={{ margin: 0 }}>Toca desde el {fmt(f.proxima)}</Tag>
    : <Tag color="success" style={{ margin: 0 }}>Al día · próxima {fmt(f.proxima)}</Tag>
}

function Lista({ titulo, filas, vacio }: { titulo: string; filas: { clave: string; nombre: string; f: Fila }[]; vacio: string }) {
  return (
    <Card size="small" title={titulo}>
      {filas.length === 0 ? <Text type="secondary">{vacio}</Text> : (
        <Flex vertical gap={14}>
          {filas.map(x => (
            <Flex key={x.clave} vertical gap={4}>
              <Text strong>{x.nombre}</Text>
              {x.f.aplicada && <Text type="secondary" style={{ fontSize: 13 }}>Aplicada el {fmt(x.f.aplicada)}</Text>}
              <Estado f={x.f} />
            </Flex>
          ))}
        </Flex>
      )}
    </Card>
  )
}

// Página pública que abre el dueño desde el enlace que le manda la clínica. Sin menú ni sesión.
export default function CarnetPublico() {
  const { token } = useParams()
  const [c, setC] = useState<Carnet | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get(`/api/carnet/publico/${token}`).then(setC).catch(e => setError(e instanceof Error ? e.message : 'No se pudo cargar.'))
  }, [token])

  return (
    <div style={{ minHeight: '100vh', background: BRAND.panel, padding: '24px 16px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        {error ? (
          <Card><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={error} /></Card>
        ) : !c ? <Card><Skeleton active paragraph={{ rows: 6 }} /></Card> : (
          <Flex vertical gap={16}>
            <div>
              <Text type="secondary">{c.clinica}</Text>
              <Title level={2} style={{ margin: '2px 0 0' }}>Carnet de {c.mascota.nombre}</Title>
              <Text type="secondary">{[c.mascota.especie, c.mascota.raza].filter(Boolean).join(' · ')}</Text>
            </div>
            {c.proxima_cita && (
              <Card size="small"><Text strong>Próxima cita: </Text><Text>{fmt(c.proxima_cita)}</Text></Card>
            )}
            <Lista titulo="Vacunas" vacio="Todavía no hay vacunas registradas."
              filas={c.vacunas.map(v => ({ clave: v.nombre, nombre: v.nombre, f: v }))} />
            <Lista titulo="Desparasitación" vacio="Todavía no hay desparasitaciones registradas."
              filas={c.desparasitaciones.map(d => ({ clave: d.producto, nombre: d.producto, f: d }))} />
            <Text type="secondary" style={{ fontSize: 12, textAlign: 'center' }}>
              Si una fecha no coincide con lo que recuerda, consulte en la clínica.
            </Text>
          </Flex>
        )}
      </div>
    </div>
  )
}
