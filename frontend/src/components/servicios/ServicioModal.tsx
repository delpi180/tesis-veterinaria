import { useState } from 'react'
import { Alert, Checkbox, Flex, Input, InputNumber, Modal, Typography } from 'antd'
import { api } from '../../services/api'

const { Text } = Typography

export interface Servicio {
  id: number
  nombre: string
  descripcion?: string | null
  precio?: number | string | null
  precio_variable: boolean
  activo: boolean
}

interface Form { nombre: string; descripcion: string; precio: number | null; precio_variable: boolean; activo: boolean }

const FORM_INICIAL: Form = { nombre: '', descripcion: '', precio: null, precio_variable: false, activo: true }

const desde = (s: Servicio): Form => ({
  nombre: s.nombre, descripcion: s.descripcion ?? '', precio: s.precio != null ? Number(s.precio) : null,
  precio_variable: s.precio_variable, activo: s.activo,
})

/** Crear o editar un servicio. El padre lo monta al abrir, así que arranca siempre limpio. */
export default function ServicioModal({ servicio, onCerrar, onGuardado }: {
  servicio: Servicio | null
  onCerrar: () => void
  onGuardado: () => Promise<void>
}) {
  const [form, setForm] = useState<Form>(servicio ? desde(servicio) : FORM_INICIAL)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const campo = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => ({ ...f, [k]: v }))

  const guardar = async () => {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio.'); return }
    if (!form.precio_variable && !((form.precio ?? 0) > 0)) {
      setError('Un servicio de precio fijo requiere un precio mayor a 0.'); return
    }
    const payload = {
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
      precio: form.precio_variable ? null : form.precio,
      precio_variable: form.precio_variable,
      activo: form.activo,
    }
    setGuardando(true); setError(null)
    try {
      if (servicio) await api.put(`/api/servicios/${servicio.id}`, payload)
      else await api.post('/api/servicios/', payload)
      await onGuardado()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ocurrió un error.')
      setGuardando(false)
    }
  }

  return (
    <Modal open onCancel={onCerrar} destroyOnHidden mask={{ closable: false }}
      title={servicio ? 'Editar servicio' : 'Nuevo servicio'}
      okText={servicio ? 'Guardar cambios' : 'Crear servicio'} cancelText="Cancelar"
      onOk={guardar} confirmLoading={guardando}>
      <Flex vertical gap={14} style={{ paddingTop: 8 }}>
        <Flex vertical gap={6}>
          <label htmlFor="sv-nombre"><Text strong>Nombre *</Text></label>
          <Input id="sv-nombre" size="large" autoFocus placeholder="Ej. Consulta general, Baño, Operación…"
            value={form.nombre} onChange={e => campo('nombre', e.target.value)} />
        </Flex>
        <Flex vertical gap={6}>
          <label htmlFor="sv-desc"><Text strong>Descripción</Text></label>
          <Input.TextArea id="sv-desc" rows={2} placeholder="Detalle opcional del servicio…"
            value={form.descripcion} onChange={e => campo('descripcion', e.target.value)} />
        </Flex>
        <Checkbox checked={form.precio_variable} onChange={e => campo('precio_variable', e.target.checked)}>
          Monto variable (se ingresa al momento de la venta)
        </Checkbox>
        {!form.precio_variable && (
          <Flex vertical gap={6}>
            <label htmlFor="sv-precio"><Text strong>Precio (S/) *</Text></label>
            <InputNumber id="sv-precio" size="large" min={0} step={0.01} precision={2} placeholder="0.00" style={{ width: '100%' }}
              value={form.precio} onChange={v => campo('precio', v)} />
          </Flex>
        )}
        <Checkbox checked={form.activo} onChange={e => campo('activo', e.target.checked)}>Servicio activo</Checkbox>
        {error && <Alert type="error" showIcon title={error} />}
      </Flex>
    </Modal>
  )
}
