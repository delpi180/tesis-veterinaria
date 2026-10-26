/**
 * Asistente para agendar o editar un turno, en tres pasos: paciente, motivo y hora.
 * Reemplaza al formulario largo de la pantalla de Turnos. Avisa si el doctor no
 * trabaja ese día o ya tiene un turno a esa hora, y deja elegir un horario libre
 * con un toque. El componente se monta al abrir (el padre lo pone o lo quita),
 * así que parte siempre de cero sin efectos de reinicio.
 */
import { useEffect, useState } from 'react'
import { Alert, Button, Flex, Input, Modal, Select, Steps, Tag, Typography } from 'antd'
import { CheckCircleFilled, ClockCircleOutlined, FileTextOutlined, SearchOutlined, UserOutlined } from '@ant-design/icons'
import { api } from '../../services/api'
import { BRAND } from '@src/core/color'

export interface Doctor { id: number; nombre: string; dias_laborales?: string | null }
export interface CitaTurno {
  id: number
  paciente_id: number
  veterinario_id?: number | null
  fecha_hora: string
  estado: string
  motivo?: string | null
  notas?: string | null
  paciente_nombre?: string | null
  propietario?: string | null
  creado_por?: string | null
  actualizado_por?: string | null
}

interface Props {
  /** Turno que se corrige; null = turno nuevo. */
  editCita: CitaTurno | null
  /** Día que se preselecciona en un turno nuevo (AAAA-MM-DD). */
  fechaInicial: string
  doctores: Doctor[]
  /** Turnos ya cargados, para avisar de choques de horario. */
  citas: CitaTurno[]
  onCerrar: () => void
  onGuardado: () => void | Promise<void>
  onIrAClientes: () => void
}

interface OpcionPaciente { id: number; label: string }

const pad = (n: number) => String(n).padStart(2, '0')
const aFecha = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const aHora = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

// Horarios de atención que se ofrecen con un toque (cada 30 minutos)
const HORARIOS = Array.from({ length: 21 }, (_, i) => `${pad(8 + Math.floor(i / 2))}:${i % 2 ? '30' : '00'}`)
const MOTIVOS = ['Control', 'Vacunación', 'Desparasitación', 'Consulta', 'Cirugía']
const ESTADOS = [
  { value: 'pendiente', label: 'Pendiente' }, { value: 'confirmada', label: 'Confirmada' },
  { value: 'atendida', label: 'Atendida' }, { value: 'cancelada', label: 'Cancelada' },
]

export default function AsistenteTurno({ editCita, fechaInicial, doctores, citas, onCerrar, onGuardado, onIrAClientes }: Props) {
  const editId = editCita?.id ?? null
  const inicio = editCita ? new Date(editCita.fecha_hora) : null

  const [paso, setPaso] = useState(0)
  const [pacienteId, setPacienteId] = useState(editCita ? String(editCita.paciente_id) : '')
  const [pacLabel, setPacLabel] = useState(
    editCita ? `${editCita.paciente_nombre ?? 'Mascota'}${editCita.propietario ? ' — ' + editCita.propietario : ''}` : '')
  const [busq, setBusq] = useState('')
  const [resultados, setResultados] = useState<OpcionPaciente[]>([])
  const [buscando, setBuscando] = useState(false)
  const [motivo, setMotivo] = useState(editCita?.motivo ?? '')
  const [vetId, setVetId] = useState(editCita?.veterinario_id ? String(editCita.veterinario_id) : '')
  const [estado, setEstado] = useState(editCita?.estado ?? 'pendiente')
  const [notas, setNotas] = useState(editCita?.notas ?? '')
  const [fecha, setFecha] = useState(inicio ? aFecha(inicio) : fechaInicial)
  const [hora, setHora] = useState(inicio ? aHora(inicio) : '09:00')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  // Búsqueda de mascota por nombre, dueño o DNI, en el servidor y con espera de 350 ms
  useEffect(() => {
    const q = busq.trim()
    if (!q) return
    const t = setTimeout(() => {
      api.get(`/api/clientes/?q=${encodeURIComponent(q)}&limit=12`)
        .then((clientes: { nombre: string; dni?: string; pacientes?: { id: number; nombre: string; especie: string }[] }[]) => {
          const ops: OpcionPaciente[] = []
          ;(Array.isArray(clientes) ? clientes : []).forEach(c =>
            (c.pacientes ?? []).forEach(p =>
              ops.push({ id: p.id, label: `${p.nombre} (${p.especie}) — ${c.nombre}${c.dni ? ' · ' + c.dni : ''}` })))
          setResultados(ops)
        })
        .catch(() => setResultados([]))
        .finally(() => setBuscando(false))
    }, 350)
    return () => clearTimeout(t)
  }, [busq])

  const escribirBusqueda = (v: string) => { setBusq(v); setBuscando(!!v.trim()) }
  const elegirPaciente = (op: OpcionPaciente) => {
    setPacienteId(String(op.id)); setPacLabel(op.label); setBusq(''); setResultados([]); setError(null)
  }
  const limpiarPaciente = () => { setPacienteId(''); setPacLabel('') }

  // ── Avisos de horario ──────────────────────────────────────────────────────
  const avisoHorario = (() => {
    if (!vetId || !fecha) return null
    const doc = doctores.find(d => String(d.id) === vetId)
    if (!doc?.dias_laborales) return null
    const codigos = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab']
    const [y, m, d] = fecha.split('-').map(Number)
    return doc.dias_laborales.split(',').includes(codigos[new Date(y, m - 1, d).getDay()])
      ? null : `${doc.nombre} no tiene ese día en su horario laboral.`
  })()

  const citasDelDoctor = citas.filter(c =>
    c.id !== editId && !!vetId && String(c.veterinario_id) === vetId && aFecha(new Date(c.fecha_hora)) === fecha)
  const avisoChoque = vetId && fecha && hora && citasDelDoctor.some(c => aHora(new Date(c.fecha_hora)) === hora)
    ? 'Este doctor ya tiene un turno a esa hora.' : null
  const ocupadas = new Set(citasDelDoctor.filter(c => c.estado !== 'cancelada').map(c => aHora(new Date(c.fecha_hora))))

  // ── Navegación entre pasos ─────────────────────────────────────────────────
  const siguiente = () => {
    if (paso === 0 && !pacienteId) { setError('Elige la mascota para continuar.'); return }
    setError(null); setPaso(p => p + 1)
  }

  const guardar = async () => {
    if (!pacienteId || !fecha || !hora) { setError('Paciente, fecha y hora son obligatorios.'); return }
    if (avisoChoque) { setError(avisoChoque); return }
    setGuardando(true); setError(null)
    const payload = {
      // Fecha y hora locales enviadas como instante UTC correcto: no se corren 5 horas (Perú UTC-5)
      fecha_hora: new Date(`${fecha}T${hora}:00`).toISOString(),
      motivo: motivo.trim() || null,
      estado,
      notas: notas.trim() || null,
      veterinario_id: vetId ? parseInt(vetId, 10) : null,
    }
    try {
      if (editId) await api.put(`/api/citas/${editId}`, payload)
      else await api.post('/api/citas/', { ...payload, paciente_id: parseInt(pacienteId, 10) })
      await onGuardado()
    } catch (e) {
      setError((e as Error).message); setGuardando(false)
    }
  }

  const trazabilidad = editCita && (editCita.creado_por || editCita.actualizado_por)
    ? `Agendado por ${editCita.creado_por ?? '—'}${editCita.actualizado_por && editCita.actualizado_por !== editCita.creado_por ? ` · última edición: ${editCita.actualizado_por}` : ''}`
    : null

  return (
    <Modal
      open onCancel={onCerrar} mask={{ closable: false }} width={560}
      title={
        <Flex vertical>
          <span>{editId ? 'Editar turno' : 'Nuevo turno'}</span>
          {trazabilidad && <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>{trazabilidad}</Typography.Text>}
        </Flex>
      }
      footer={
        <Flex justify="space-between" gap={8}>
          <Button onClick={paso === 0 ? onCerrar : () => { setError(null); setPaso(p => p - 1) }}>
            {paso === 0 ? 'Cancelar' : 'Atrás'}
          </Button>
          {paso < 2
            ? <Button type="primary" onClick={siguiente}>Siguiente</Button>
            : <Button type="primary" loading={guardando} disabled={!!avisoChoque} onClick={guardar}>Guardar turno</Button>}
        </Flex>
      }
    >
      <Steps
        current={paso} size="small" style={{ margin: '8px 0 20px' }}
        items={[
          { title: 'Paciente', icon: <UserOutlined /> },
          { title: 'Motivo', icon: <FileTextOutlined /> },
          { title: 'Hora', icon: <ClockCircleOutlined /> },
        ]}
      />

      {/* `key` reinicia la animación de entrada en cada paso */}
      <Flex vertical gap={16} key={paso} className="animar" style={{ minHeight: 230 }}>
        {paso === 0 && (
          <>
            <Typography.Text strong>¿Para qué mascota es el turno?</Typography.Text>
            {pacienteId ? (
              <Flex align="center" gap={10} style={{ background: BRAND.panel, border: `1px solid ${BRAND.border}`, borderRadius: 8, padding: '10px 14px' }}>
                <CheckCircleFilled style={{ color: BRAND.primary }} />
                <Typography.Text ellipsis style={{ flex: 1 }}>{pacLabel}</Typography.Text>
                {!editId && <Button type="link" size="small" onClick={limpiarPaciente}>Cambiar</Button>}
              </Flex>
            ) : (
              <>
                <Input
                  size="large" autoFocus allowClear autoComplete="off"
                  prefix={<SearchOutlined />} aria-label="Buscar mascota, dueño o DNI"
                  placeholder="Buscar por mascota, dueño o DNI…"
                  value={busq} onChange={e => escribirBusqueda(e.target.value)}
                />
                {busq.trim() && (
                  <Flex vertical style={{ border: `1px solid ${BRAND.border}`, borderRadius: 8, maxHeight: 220, overflowY: 'auto' }}>
                    {buscando ? <Typography.Text type="secondary" style={{ padding: 12 }}>Buscando…</Typography.Text>
                      : resultados.length === 0 ? (
                        <Flex vertical align="flex-start" style={{ padding: 12 }}>
                          <Typography.Text type="secondary">Sin coincidencias.</Typography.Text>
                          <Button type="link" style={{ padding: 0 }} onClick={onIrAClientes}>¿No está registrada? Ir a Clientes →</Button>
                        </Flex>
                      ) : resultados.map(op => (
                        <Button key={op.id} type="text" block onClick={() => elegirPaciente(op)}
                          style={{ height: 'auto', padding: '10px 14px', whiteSpace: 'normal', borderRadius: 0, justifyContent: 'flex-start', textAlign: 'left' }}>
                          {op.label}
                        </Button>
                      ))}
                  </Flex>
                )}
              </>
            )}
          </>
        )}

        {paso === 1 && (
          <>
            <Flex vertical gap={6}>
              <label htmlFor="turno-motivo"><Typography.Text strong>Motivo</Typography.Text></label>
              <Input id="turno-motivo" size="large" placeholder="Ej. Control anual, vacunación…" value={motivo} onChange={e => setMotivo(e.target.value)} />
              <Flex wrap gap={6}>
                {MOTIVOS.map(m => (
                  <Tag.CheckableTag key={m} checked={motivo === m} onChange={() => setMotivo(m)}>{m}</Tag.CheckableTag>
                ))}
              </Flex>
            </Flex>
            <Flex vertical gap={6}>
              <label htmlFor="turno-doctor"><Typography.Text strong>Veterinario</Typography.Text></label>
              <Select
                id="turno-doctor" size="large" allowClear placeholder="Sin asignar"
                value={vetId || undefined} onChange={(v?: string) => setVetId(v ?? '')}
                options={doctores.map(d => ({ value: String(d.id), label: d.nombre }))}
              />
            </Flex>
            {editId && (
              <Flex vertical gap={6}>
                <label htmlFor="turno-estado"><Typography.Text strong>Estado</Typography.Text></label>
                <Select id="turno-estado" size="large" value={estado} onChange={setEstado} options={ESTADOS} />
              </Flex>
            )}
            <Flex vertical gap={6}>
              <label htmlFor="turno-notas"><Typography.Text strong>Notas</Typography.Text></label>
              <Input.TextArea id="turno-notas" rows={2} placeholder="Observaciones opcionales…" value={notas} onChange={e => setNotas(e.target.value)} />
            </Flex>
          </>
        )}

        {paso === 2 && (
          <>
            <Flex gap={12} wrap>
              <Flex vertical gap={6} style={{ flex: '1 1 180px' }}>
                <label htmlFor="turno-fecha"><Typography.Text strong>Fecha</Typography.Text></label>
                <Input id="turno-fecha" size="large" type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
              </Flex>
              <Flex vertical gap={6} style={{ flex: '1 1 140px' }}>
                <label htmlFor="turno-hora"><Typography.Text strong>Hora</Typography.Text></label>
                <Input id="turno-hora" size="large" type="time" value={hora} onChange={e => setHora(e.target.value)} />
              </Flex>
            </Flex>

            <Flex vertical gap={6}>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                {vetId ? 'Toca un horario libre (los tachados ya están ocupados):' : 'Toca un horario:'}
              </Typography.Text>
              <Flex wrap gap={6}>
                {HORARIOS.map(h => (
                  <Button key={h} size="small" disabled={ocupadas.has(h)}
                    type={hora === h ? 'primary' : 'default'} onClick={() => setHora(h)}
                    style={ocupadas.has(h) ? { textDecoration: 'line-through' } : undefined}>
                    {h}
                  </Button>
                ))}
              </Flex>
            </Flex>

            {avisoHorario && <Alert type="warning" showIcon title={avisoHorario} />}
            {avisoChoque && <Alert type="error" showIcon title={avisoChoque} />}
          </>
        )}

        {error && <Alert type="error" showIcon title={error} />}
      </Flex>
    </Modal>
  )
}
