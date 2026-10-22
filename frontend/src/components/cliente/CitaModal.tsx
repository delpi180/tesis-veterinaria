/**
 * Agendar un turno para una mascota desde la ficha del dueño. Avisa si el
 * doctor no trabaja ese día o si ya tiene otro turno a esa hora (misma lógica
 * que la pantalla de Turnos).
 */
import { useEffect, useState } from 'react'
import { Alert, Col, Form, Input, Modal, Row, Select } from 'antd'
import { api } from '../../services/api'
import { hoyISOPeru } from '@src/utils/historiaClinica'

interface Doctor { id: number; nombre: string; dias_laborales?: string | null }
interface CitaExistente { veterinario_id: number; fecha_hora: string }
interface FormCita { fecha: string; hora: string; motivo: string; notas: string; veterinario_id: number | null }

interface Props {
  abierto: boolean
  paciente: { id: number; nombre: string } | null
  onCerrar: () => void
  onCreada: () => void
}

const pad = (n: number) => String(n).padStart(2, '0')

export default function CitaModal({ abierto, paciente, onCerrar, onCreada }: Props) {
  const [form] = Form.useForm<FormCita>()
  const [doctores, setDoctores] = useState<Doctor[]>([])
  const [citas, setCitas] = useState<CitaExistente[]>([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fecha = Form.useWatch('fecha', form)
  const hora = Form.useWatch('hora', form)
  const vetId = Form.useWatch('veterinario_id', form)

  useEffect(() => {
    if (!abierto) return
    form.setFieldsValue({ fecha: hoyISOPeru(), hora: '09:00', motivo: '', notas: '', veterinario_id: null })
    setError(null); setGuardando(false)
    api.get('/api/usuarios/doctores').then(setDoctores).catch(err => console.error('Error al obtener doctores:', err))
  }, [abierto, form])

  // Se necesitan las citas de ESE día para avisar de un choque de horario
  useEffect(() => {
    if (!abierto || !fecha) { setCitas([]); return }
    api.get(`/api/citas/?desde=${fecha}&hasta=${fecha}`)
      .then(setCitas)
      .catch(err => console.error('Error al obtener citas:', err))
  }, [abierto, fecha])

  // Aviso si el doctor asignado no labora ese día (según su perfil)
  const avisoHorario = (() => {
    if (!vetId || !fecha) return null
    const doc = doctores.find(d => d.id === vetId)
    if (!doc || !doc.dias_laborales) return null
    const codigos = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab']
    const [y, m, d] = fecha.split('-').map(Number)
    const code = codigos[new Date(y, m - 1, d).getDay()]
    return doc.dias_laborales.split(',').includes(code) ? null : `${doc.nombre} no tiene ese día en su horario laboral.`
  })()

  // Aviso si el doctor ya tiene otro turno a esa misma fecha y hora
  const avisoChoque = (() => {
    if (!vetId || !fecha || !hora) return null
    const choca = citas.some(c => {
      if (c.veterinario_id !== vetId) return false
      const d = new Date(c.fecha_hora)
      const fechaC = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      const horaC = `${pad(d.getHours())}:${pad(d.getMinutes())}`
      return fechaC === fecha && horaC === hora
    })
    return choca ? 'Este doctor ya tiene un turno a esa hora.' : null
  })()

  const guardar = async (v: FormCita) => {
    if (!v.fecha || !v.hora || !v.veterinario_id) {
      setError('Fecha, hora y veterinario son obligatorios.'); return
    }
    setGuardando(true); setError(null)
    try {
      await api.post('/api/citas/', {
        paciente_id: paciente!.id,
        fecha_hora: `${v.fecha}T${v.hora}:00`,
        motivo: (v.motivo ?? '').trim() || null,
        estado: 'pendiente',
        notas: (v.notas ?? '').trim() || null,
        veterinario_id: v.veterinario_id,
      })
      onCreada()
    } catch (e) {
      setError((e as Error).message); setGuardando(false)
    }
  }

  return (
    <Modal
      open={abierto} onCancel={onCerrar} destroyOnHidden
      title={`Agendar cita — ${paciente?.nombre ?? ''}`}
      okText="Agendar cita" cancelText="Cancelar" onOk={() => form.submit()} confirmLoading={guardando}
    >
      <Form form={form} layout="vertical" onFinish={guardar} requiredMark={false}>
        <Row gutter={12}>
          <Col xs={24} sm={12}><Form.Item name="fecha" label="Fecha *"><Input type="date" autoFocus /></Form.Item></Col>
          <Col xs={24} sm={12}><Form.Item name="hora" label="Hora *"><Input type="time" /></Form.Item></Col>
        </Row>
        <Form.Item name="motivo" label="Motivo"><Input placeholder="Ej. Control, Vacunación…" /></Form.Item>
        <Form.Item name="veterinario_id" label="Veterinario asignado *">
          <Select
            placeholder="Seleccione un veterinario"
            options={doctores.map(d => ({ value: d.id, label: d.nombre }))}
          />
        </Form.Item>
        {avisoHorario && <Alert type="warning" showIcon title={avisoHorario} style={{ marginBottom: 12 }} />}
        {avisoChoque && <Alert type="error" showIcon title={avisoChoque} style={{ marginBottom: 12 }} />}
        <Form.Item name="notas" label="Notas"><Input.TextArea rows={2} placeholder="Observaciones opcionales…" /></Form.Item>
        {error && <Alert type="error" showIcon title={error} />}
      </Form>
    </Modal>
  )
}
