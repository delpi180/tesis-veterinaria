import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Empty, Flex, Skeleton, Space, Tag, Tooltip, Typography } from 'antd'
import { CalendarOutlined, CheckOutlined, ExperimentOutlined, MedicineBoxOutlined, ReloadOutlined, UndoOutlined, WhatsAppOutlined } from '@ant-design/icons'
import { api } from '../services/api'
import { waRecordatorio } from '../utils/citas'
import { clinicaActual } from '../services/clinica'
import { useToast } from '../components/Toast'
import { Fila, Panel } from '../components/PanelLista'
import { ESTADO } from '@src/core/color'
import { MEDIDAS } from '@src/core/medidas'

const { Title, Text } = Typography

interface Cita {
  id: number; fecha_hora: string; estado: string; motivo?: string | null
  paciente_nombre?: string | null; propietario?: string | null; telefono?: string | null; recordado_en?: string | null
}
interface Pendiente {
  paciente_id: number; paciente?: string | null; propietario?: string | null; telefono?: string | null
  vacuna: string; tipo: 'vacuna' | 'antiparasitario'; proxima_dosis: string; fecha: string | null; vencida: boolean
}
interface Tratamiento {
  id: number; paciente?: string | null; propietario?: string | null; telefono?: string | null
  medicamento: string; fin?: string | null; sin_control: boolean
}

const DIAS_ADELANTE = 7   // vacunas y desparasitaciones: lo vencido y lo que toca esta semana

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const sumarDias = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const fmtFecha = (s: string) => new Date(s.length === 10 ? s + 'T00:00:00' : s).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })
const fmtHora = (s: string) => new Date(s).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : 'Ocurrió un error.')

function wa(telefono: string | null | undefined, mensaje: string) {
  const num = (telefono || '').replace(/\D/g, '')
  return `https://wa.me/${num.length === 9 ? `51${num}` : num}?text=${encodeURIComponent(mensaje)}`
}

function BotonWhatsApp({ href, sinTelefono }: { href: string; sinTelefono: boolean }) {
  return (
    <Tooltip title={sinTelefono ? 'El cliente no tiene teléfono' : 'Recordar por WhatsApp'}>
      <Button size="small" type="primary" icon={<WhatsAppOutlined />} aria-label="Recordar por WhatsApp"
        disabled={sinTelefono} href={sinTelefono ? undefined : href} target="_blank" rel="noopener noreferrer"
        style={sinTelefono ? undefined : { background: '#25a244' }} />
    </Tooltip>
  )
}

const Vacio = ({ texto }: { texto: string }) => <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={texto} style={{ padding: '16px 0' }} />

// Una sola bandeja de "a quién hay que escribirle": citas de hoy y mañana, vacunas y
// desparasitaciones, y tratamientos que terminaron sin que la mascota volviera.
export default function Recordatorios() {
  const toast = useToast()
  const [citas, setCitas] = useState<Cita[]>([])
  const [pendientes, setPendientes] = useState<Pendiente[]>([])
  const [sinControl, setSinControl] = useState<Tratamiento[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const hoy = new Date()
    try {
      const [c, r, t] = await Promise.all([
        api.get(`/api/citas/?desde=${iso(hoy)}&hasta=${iso(sumarDias(hoy, 1))}`),
        api.get('/api/dashboard/resumen'),
        api.get('/api/tratamientos/?estado=terminado'),
      ])
      const limite = iso(sumarDias(hoy, DIAS_ADELANTE))
      // Solo las que aún no pasaron: recordar una cita de hace horas no sirve
      setCitas((c as Cita[]).filter(x => (x.estado === 'pendiente' || x.estado === 'confirmada') && new Date(x.fecha_hora) > hoy))
      setPendientes(((r.vacunas_proximas ?? []) as Pendiente[]).filter(p => p.fecha && p.fecha <= limite))
      setSinControl((t as Tratamiento[]).filter(x => x.sin_control))
      setError(null)
    } catch (e) {
      setError(mensajeDe(e))
    } finally {
      setCargando(false)
    }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const marcarCita = async (c: Cita, recordado: boolean) => {
    const antes = c.recordado_en
    setCitas(prev => prev.map(x => x.id === c.id ? { ...x, recordado_en: recordado ? new Date().toISOString() : null } : x))
    try {
      if (recordado) await api.post(`/api/citas/${c.id}/recordado`, {})
      else await api.del(`/api/citas/${c.id}/recordado`)
    } catch (e) {
      setCitas(prev => prev.map(x => x.id === c.id ? { ...x, recordado_en: antes } : x))
      toast.error(mensajeDe(e))
    }
  }

  const marcarPendiente = async (p: Pendiente) => {
    const igual = (x: Pendiente) => x.paciente_id === p.paciente_id && x.vacuna === p.vacuna && x.proxima_dosis === p.proxima_dosis && x.tipo === p.tipo
    setPendientes(prev => prev.filter(x => !igual(x)))
    try {
      await api.post('/api/dashboard/vacunas/avisar', { paciente_id: p.paciente_id, vacuna: p.vacuna, proxima_dosis: p.proxima_dosis, tipo: p.tipo })
    } catch (e) {
      setPendientes(prev => [...prev, p])
      toast.error(mensajeDe(e))
    }
  }

  const sinAvisar = citas.filter(c => !c.recordado_en).length
  const total = sinAvisar + pendientes.length + sinControl.length
  const hoyIso = iso(new Date())
  const clinica = clinicaActual().nombre

  return (
    <div className="animar" style={{ flex: 1, minWidth: 0, padding: '16px 32px 32px', width: '100%' }}>
      <Flex justify="space-between" align="bottom" gap={16} wrap style={{ marginBottom: 24 }}>
        <div>
          <Text type="secondary">A quién hay que escribirle</Text>
          <Title level={2} style={{ margin: '4px 0 0', fontSize: MEDIDAS.tituloSeccion, fontWeight: 500, lineHeight: '32px' }}>
            Recordatorios{total > 0 ? ` — ${total} por enviar` : ''}
          </Title>
        </div>
        <Button icon={<ReloadOutlined />} onClick={cargar}>Actualizar</Button>
      </Flex>

      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        {error && <Alert type="error" showIcon title={error} action={<Button size="small" onClick={cargar}>Reintentar</Button>} />}
        {cargando ? <Card><Skeleton active paragraph={{ rows: 8 }} /></Card> : (
          <>
            <Panel titulo={`Citas de hoy y mañana (${sinAvisar} sin avisar)`} icono={<CalendarOutlined />}>
              {citas.length === 0 ? <Vacio texto="No hay citas para hoy ni mañana" /> : citas.map(c => (
                <Fila key={c.id}>
                  <Text style={{ flex: 1, minWidth: 0 }} ellipsis>
                    <b>{c.paciente_nombre}</b> · {c.propietario}{' '}
                    <Text type="secondary" style={{ fontSize: 12 }}>{c.motivo}</Text>
                  </Text>
                  <Tag color={iso(new Date(c.fecha_hora)) === hoyIso ? 'warning' : 'blue'} style={{ margin: 0 }}>
                    {iso(new Date(c.fecha_hora)) === hoyIso ? 'Hoy' : 'Mañana'} {fmtHora(c.fecha_hora)}
                  </Tag>
                  {c.recordado_en
                    ? <Tooltip title="Ya se le avisó. Clic para deshacer"><Button size="small" icon={<UndoOutlined />} onClick={() => marcarCita(c, false)}>Avisado</Button></Tooltip>
                    : <Tooltip title="Marcar como avisado"><Button size="small" icon={<CheckOutlined />} aria-label="Marcar como avisado" onClick={() => marcarCita(c, true)} /></Tooltip>}
                  <BotonWhatsApp sinTelefono={!c.telefono} href={waRecordatorio(c.telefono, c.propietario, c.paciente_nombre, c)} />
                </Fila>
              ))}
            </Panel>

            <Panel titulo={`Vacunas y desparasitaciones (${pendientes.length})`} icono={<ExperimentOutlined />}>
              {pendientes.length === 0 ? <Vacio texto="Nada vencido ni por vencer esta semana" /> : pendientes.map(p => (
                <Fila key={`${p.paciente_id}-${p.tipo}-${p.vacuna}-${p.proxima_dosis}`}>
                  <Text style={{ flex: 1, minWidth: 0 }} ellipsis>
                    <b>{p.paciente}</b> · {p.propietario}{' '}
                    <Text type="secondary" style={{ fontSize: 12 }}>{p.tipo === 'antiparasitario' ? 'Desparasitación' : 'Vacuna'} {p.vacuna}</Text>
                  </Text>
                  <Tag color={p.vencida ? 'error' : 'blue'} style={{ margin: 0 }}>{p.vencida ? 'Vencida' : 'Toca'} {p.fecha && fmtFecha(p.fecha)}</Tag>
                  <Tooltip title="Marcar como avisado"><Button size="small" icon={<CheckOutlined />} aria-label="Marcar como avisado" onClick={() => marcarPendiente(p)} /></Tooltip>
                  <BotonWhatsApp sinTelefono={!p.telefono} href={wa(p.telefono,
                    `Hola ${p.propietario || ''}, le recordamos que ${p.paciente || 'su mascota'} tiene pendiente ${p.tipo === 'antiparasitario' ? `la desparasitación (*${p.vacuna}*)` : `la vacuna *${p.vacuna}*`} en ${clinica}. ¡Le esperamos!`)} />
                </Fila>
              ))}
            </Panel>

            <Panel titulo={`Terminaron su tratamiento y no volvieron (${sinControl.length})`} icono={<MedicineBoxOutlined style={{ color: sinControl.length ? ESTADO.atencion : undefined }} />}>
              {sinControl.length === 0 ? <Vacio texto="Todas las mascotas con tratamiento terminado ya volvieron" /> : sinControl.map(t => (
                <Fila key={t.id}>
                  <Text style={{ flex: 1, minWidth: 0 }} ellipsis>
                    <b>{t.paciente}</b> · {t.propietario}{' '}
                    <Text type="secondary" style={{ fontSize: 12 }}>{t.medicamento}</Text>
                  </Text>
                  {t.fin && <Tag style={{ margin: 0 }}>terminó el {fmtFecha(t.fin)}</Tag>}
                  <BotonWhatsApp sinTelefono={!t.telefono} href={wa(t.telefono,
                    `Hola ${t.propietario || ''}, ${t.paciente || 'su mascota'} terminó su tratamiento con *${t.medicamento}*${t.fin ? ` el ${fmtFecha(t.fin)}` : ''}. ¿Cómo sigue? En ${clinica} quedamos atentos para el control.`)} />
                </Fila>
              ))}
            </Panel>
          </>
        )}
      </Space>
    </div>
  )
}
