/**
 * Alta y edición de una mascota en un solo formulario (antes eran dos con los
 * mismos campos copiados). Sirve desde la ficha del dueño y desde la ficha del
 * paciente («Editar ficha»).
 */
import { useEffect, useState } from 'react'
import { Alert, Checkbox, Col, Form, Input, InputNumber, Modal, Row, Select } from 'antd'
import { api } from '../../services/api'

export interface Mascota {
  id: number
  nombre: string
  especie: string
  raza?: string | null
  edad?: number | null
  sexo?: 'macho' | 'hembra' | null
  esterilizado?: boolean | null
  fecha_nacimiento?: string | null
  microchip?: string | null
  color?: string | null
  alergias?: string | null
  condiciones_cronicas?: string | null
  cliente_id?: number
}

interface FormMascota {
  nombre: string
  especie: string
  raza: string
  edad: number | null
  sexo: string
  esterilizado: boolean
  fecha_nacimiento: string
  microchip: string
  color: string
  alergias: string
  condiciones_cronicas: string
}

const VACIO: FormMascota = {
  nombre: '', especie: 'Canino', raza: '', edad: null, sexo: '', esterilizado: false,
  fecha_nacimiento: '', microchip: '', color: '', alergias: '', condiciones_cronicas: '',
}

const aFormulario = (m: Mascota): FormMascota => ({
  nombre: m.nombre,
  especie: m.especie,
  raza: m.raza ?? '',
  edad: m.edad ?? null,
  sexo: m.sexo ?? '',
  esterilizado: !!m.esterilizado,
  fecha_nacimiento: m.fecha_nacimiento ?? '',
  microchip: m.microchip ?? '',
  color: m.color ?? '',
  alergias: m.alergias ?? '',
  condiciones_cronicas: m.condiciones_cronicas ?? '',
})

// Convierte el formulario a un payload limpio (campos vacíos → null)
function aPayload(f: FormMascota) {
  const limpio = (v: string) => (v ?? '').trim() || null
  return {
    nombre: (f.nombre ?? '').trim(),
    especie: (f.especie ?? '').trim() || 'Canino',
    raza: limpio(f.raza),
    edad: f.edad != null ? Math.trunc(f.edad) : null,
    sexo: f.sexo || null,
    esterilizado: !!f.esterilizado,
    fecha_nacimiento: f.fecha_nacimiento || null,
    microchip: limpio(f.microchip),
    color: limpio(f.color),
    alergias: limpio(f.alergias),
    condiciones_cronicas: limpio(f.condiciones_cronicas),
  }
}

interface Props {
  abierto: boolean
  /** Dueño al que se le agrega la mascota (solo para el alta). */
  clienteId?: number | string
  /** Si viene, se edita esa mascota; si no, se registra una nueva. */
  mascota?: Mascota | null
  onCerrar: () => void
  onGuardado: (m: Mascota) => void
}

export default function MascotaModal({ abierto, clienteId, mascota, onCerrar, onGuardado }: Props) {
  const [form] = Form.useForm<FormMascota>()
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editando = !!mascota

  useEffect(() => {
    if (!abierto) return
    form.setFieldsValue(mascota ? aFormulario(mascota) : VACIO)
    setError(null); setGuardando(false)
  }, [abierto, mascota, form])

  const guardar = async (valores: FormMascota) => {
    if (!(valores.nombre ?? '').trim()) { setError('El nombre es obligatorio.'); return }
    setGuardando(true); setError(null)
    try {
      const guardada = editando
        ? await api.put(`/api/pacientes/${mascota!.id}`, aPayload(valores))
        : await api.post(`/api/clientes/${clienteId}/pacientes/`, aPayload(valores))
      onGuardado(guardada)
    } catch (e) {
      setError((e as Error).message)
      setGuardando(false)
    }
  }

  return (
    <Modal
      open={abierto} onCancel={onCerrar} width={680} destroyOnHidden
      title={editando ? 'Editar mascota' : 'Nueva mascota'}
      okText={editando ? 'Guardar cambios' : 'Registrar mascota'} cancelText="Cancelar"
      onOk={() => form.submit()} confirmLoading={guardando}
    >
      <Form form={form} layout="vertical" onFinish={guardar} requiredMark={false} initialValues={VACIO}>
        <Row gutter={12}>
          <Col xs={24} sm={12}><Form.Item name="nombre" label="Nombre *"><Input placeholder="Ej: Rex" /></Form.Item></Col>
          <Col xs={12} sm={6}><Form.Item name="especie" label="Especie"><Input placeholder="Canino" /></Form.Item></Col>
          <Col xs={12} sm={6}><Form.Item name="raza" label="Raza"><Input placeholder="Ej: Labrador" /></Form.Item></Col>
        </Row>
        <Row gutter={12}>
          <Col xs={12} sm={6}>
            <Form.Item name="sexo" label="Sexo">
              <Select
                options={[{ value: '', label: '—' }, { value: 'macho', label: 'Macho' }, { value: 'hembra', label: 'Hembra' }]}
              />
            </Form.Item>
          </Col>
          <Col xs={12} sm={6}>
            <Form.Item name="fecha_nacimiento" label="Fecha de nacimiento"><Input type="date" /></Form.Item>
          </Col>
          <Col xs={12} sm={6}>
            <Form.Item name="edad" label="Edad (años)"><InputNumber min={0} style={{ width: '100%' }} placeholder="3" /></Form.Item>
          </Col>
          <Col xs={12} sm={6}><Form.Item name="color" label="Color"><Input placeholder="Ej: Marrón" /></Form.Item></Col>
        </Row>
        <Row gutter={12}>
          <Col xs={24} sm={16}><Form.Item name="microchip" label="Microchip"><Input placeholder="N° de microchip (opcional)" /></Form.Item></Col>
          <Col xs={24} sm={8}>
            <Form.Item name="esterilizado" valuePropName="checked" label=" ">
              <Checkbox>Esterilizado</Checkbox>
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="alergias" label="Alergias (se mostrarán como alerta)">
          <Input.TextArea rows={2} placeholder="Ej: Penicilina, picadura de pulga…" />
        </Form.Item>
        <Form.Item name="condiciones_cronicas" label="Condiciones crónicas">
          <Input.TextArea rows={2} placeholder="Ej: Diabetes, insuficiencia renal…" />
        </Form.Item>
        {error && <Alert type="error" showIcon title={error} />}
      </Form>
    </Modal>
  )
}
