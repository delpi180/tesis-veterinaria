import { useState } from 'react'
import { Alert, Checkbox, Col, Flex, Input, InputNumber, Modal, Row, Select, Typography } from 'antd'
import { api } from '../../services/api'
import { OPCIONES_CATEGORIA, mensajeDe, type Producto } from './tipos'

const { Text } = Typography

interface Form {
  nombre: string; descripcion: string; categoria: string; proveedor: string; unidad: string
  precio: number | null; stock: number | null; stock_minimo: number | null; activo: boolean
  fecha_vencimiento: string; lote: string
}

const FORM_INICIAL: Form = {
  nombre: '', descripcion: '', categoria: 'comida', proveedor: '', unidad: '',
  precio: null, stock: null, stock_minimo: 5, activo: true, fecha_vencimiento: '', lote: '',
}

const desde = (p: Producto): Form => ({
  nombre: p.nombre, descripcion: p.descripcion ?? '', categoria: p.categoria ?? 'comida',
  proveedor: p.proveedor ?? '', unidad: p.unidad ?? '', precio: Number(p.precio),
  stock: p.stock, stock_minimo: p.stock_minimo, activo: p.activo,
  fecha_vencimiento: p.fecha_vencimiento ?? '', lote: p.lote ?? '',
})

/** Crear o editar un producto. El padre lo monta al abrir, así que arranca siempre limpio. */
export default function ProductoModal({ producto, onCerrar, onGuardado }: {
  producto: Producto | null
  onCerrar: () => void
  onGuardado: () => Promise<void>
}) {
  const [form, setForm] = useState<Form>(producto ? desde(producto) : FORM_INICIAL)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const campo = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => ({ ...f, [k]: v }))

  const guardar = async () => {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio.'); return }
    const precio = form.precio ?? 0
    if (!(precio > 0)) { setError('El precio debe ser mayor a 0.'); return }
    const payload = {
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
      categoria: form.categoria,
      proveedor: form.proveedor.trim() || null,
      unidad: form.unidad.trim() || null,
      precio,
      stock: Math.floor(form.stock ?? 0),
      stock_minimo: Math.floor(form.stock_minimo ?? 0),
      activo: form.activo,
      fecha_vencimiento: form.fecha_vencimiento || null,
      lote: form.lote.trim() || null,
    }
    setGuardando(true); setError(null)
    try {
      if (producto) await api.put(`/api/productos/${producto.id}`, payload)
      else await api.post('/api/productos/', payload)
      await onGuardado()
    } catch (e) {
      setError(mensajeDe(e))
      setGuardando(false)
    }
  }

  const etiqueta = (id: string, texto: string, requerido = false) => (
    <label htmlFor={id}><Text strong>{texto}{requerido && ' *'}</Text></label>
  )

  return (
    <Modal
      open onCancel={onCerrar} destroyOnHidden mask={{ closable: false }}
      title={producto ? 'Editar producto' : 'Nuevo producto'}
      okText={producto ? 'Guardar cambios' : 'Crear producto'} cancelText="Cancelar"
      onOk={guardar} confirmLoading={guardando}
    >
      <Flex vertical gap={14} style={{ paddingTop: 8 }}>
        {producto && <Text type="secondary">Código: <Text code>{producto.codigo}</Text></Text>}

        <Flex vertical gap={6}>
          {etiqueta('pr-nombre', 'Nombre', true)}
          <Input id="pr-nombre" size="large" autoFocus placeholder="Ej. Alimento Premium 3 kg"
            value={form.nombre} onChange={e => campo('nombre', e.target.value)} />
        </Flex>
        <Flex vertical gap={6}>
          {etiqueta('pr-desc', 'Descripción')}
          <Input.TextArea id="pr-desc" rows={2} placeholder="Detalle opcional del producto…"
            value={form.descripcion} onChange={e => campo('descripcion', e.target.value)} />
        </Flex>

        <Row gutter={12}>
          <Col xs={24} sm={12}>
            <Flex vertical gap={6}>
              {etiqueta('pr-cat', 'Categoría')}
              <Select id="pr-cat" value={form.categoria} options={OPCIONES_CATEGORIA} onChange={(v: string) => campo('categoria', v)} />
              {!producto && <Text type="secondary" style={{ fontSize: 12 }}>El código se genera según la categoría.</Text>}
            </Flex>
          </Col>
          <Col xs={24} sm={12}>
            <Flex vertical gap={6}>
              {etiqueta('pr-uni', 'Unidad de medida')}
              <Input id="pr-uni" placeholder="Ej. caja, frasco, pipeta" value={form.unidad} onChange={e => campo('unidad', e.target.value)} />
            </Flex>
          </Col>
        </Row>

        <Flex vertical gap={6}>
          {etiqueta('pr-prov', 'Proveedor')}
          <Input id="pr-prov" placeholder="Ej. MedVet S.A." value={form.proveedor} onChange={e => campo('proveedor', e.target.value)} />
        </Flex>

        <Row gutter={12}>
          <Col xs={24} sm={12}>
            <Flex vertical gap={6}>
              {etiqueta('pr-precio', 'Precio (S/)', true)}
              <InputNumber id="pr-precio" min={0} step={0.01} precision={2} placeholder="0.00" style={{ width: '100%' }}
                value={form.precio} onChange={v => campo('precio', v)} />
            </Flex>
          </Col>
          <Col xs={24} sm={12}>
            <Flex vertical gap={6}>
              {etiqueta('pr-stock', 'Stock')}
              <InputNumber id="pr-stock" min={0} precision={0} placeholder="0" style={{ width: '100%' }}
                value={form.stock} onChange={v => campo('stock', v)} />
            </Flex>
          </Col>
        </Row>

        <Row gutter={12} align="bottom">
          <Col xs={24} sm={12}>
            <Flex vertical gap={6}>
              {etiqueta('pr-min', 'Stock mínimo')}
              <InputNumber id="pr-min" min={0} precision={0} placeholder="5" style={{ width: '100%' }}
                value={form.stock_minimo} onChange={v => campo('stock_minimo', v)} />
            </Flex>
          </Col>
          <Col xs={24} sm={12}>
            <Checkbox checked={form.activo} onChange={e => campo('activo', e.target.checked)}>Producto activo</Checkbox>
          </Col>
        </Row>

        {/* Vencimiento: opcional, porque un collar o un plato no vencen */}
        <Row gutter={12}>
          <Col xs={24} sm={12}>
            <Flex vertical gap={6}>
              {etiqueta('pr-venc', 'Vence el')}
              <Input id="pr-venc" type="date" value={form.fecha_vencimiento} onChange={e => campo('fecha_vencimiento', e.target.value)} />
              <Text type="secondary" style={{ fontSize: 12 }}>Déjalo vacío si no aplica</Text>
            </Flex>
          </Col>
          <Col xs={24} sm={12}>
            <Flex vertical gap={6}>
              {etiqueta('pr-lote', 'Lote')}
              <Input id="pr-lote" maxLength={50} placeholder="Ej. L-2451" value={form.lote} onChange={e => campo('lote', e.target.value)} />
            </Flex>
          </Col>
        </Row>

        {error && <Alert type="error" showIcon title={error} />}
      </Flex>
    </Modal>
  )
}
