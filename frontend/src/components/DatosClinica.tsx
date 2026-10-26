import { useEffect, useState } from 'react'
import { Alert, Button, Col, Form, Input, Row, Typography } from 'antd'
import { SaveOutlined, ShopOutlined } from '@ant-design/icons'
import { api } from '../services/api'
import { useClinica } from '../services/clinica'
import { useToast } from './Toast'
import { Panel } from './PanelLista'

interface Datos {
  nombre?: string | null; ruc?: string | null; direccion?: string | null
  telefono?: string | null; email?: string | null; pie_comprobante?: string | null
}

const limpio = (v?: string | null) => v?.trim() || null

/**
 * Datos de la clínica: los que salen impresos en las boletas, las historias
 * clínicas en PDF y los recordatorios de WhatsApp.
 */
export default function DatosClinica() {
  const toast = useToast()
  const { clinica, recargar } = useClinica() as { clinica: Datos; recargar: () => Promise<void> }
  const [form] = Form.useForm<Datos>()
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Cuando llega la configuración del servidor, se refleja en el formulario
  useEffect(() => { form.setFieldsValue(clinica) }, [clinica, form])

  const guardar = async (v: Datos) => {
    setGuardando(true); setError(null)
    try {
      await api.put('/api/configuracion/', {
        nombre: v.nombre?.trim(), ruc: limpio(v.ruc), direccion: limpio(v.direccion),
        telefono: limpio(v.telefono), email: limpio(v.email), pie_comprobante: limpio(v.pie_comprobante),
      })
      await recargar()
      toast.success('Datos de la clínica actualizados')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Panel titulo="Datos de la clínica" icono={<ShopOutlined />}>
      <Form form={form} layout="vertical" initialValues={clinica} onFinish={guardar} requiredMark style={{ padding: '16px 20px' }}>
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          Aparecen en las boletas de venta, las historias clínicas en PDF y los recordatorios que se envían por WhatsApp.
        </Typography.Paragraph>

        <Form.Item name="nombre" label="Nombre de la clínica" rules={[{ required: true, whitespace: true, message: 'El nombre de la clínica es obligatorio.' }]}>
          <Input placeholder="Ej. Veterinaria Los Pinos" />
        </Form.Item>
        <Row gutter={16}>
          <Col xs={24} sm={12}><Form.Item name="ruc" label="RUC"><Input maxLength={11} inputMode="numeric" placeholder="11 dígitos" /></Form.Item></Col>
          <Col xs={24} sm={12}><Form.Item name="telefono" label="Teléfono"><Input placeholder="Ej. 044-123456" /></Form.Item></Col>
        </Row>
        <Form.Item name="direccion" label="Dirección"><Input placeholder="Ej. Av. Los Pinos 123, Trujillo" /></Form.Item>
        <Row gutter={16}>
          <Col xs={24} sm={12}><Form.Item name="email" label="Correo"><Input placeholder="contacto@miclinica.pe" /></Form.Item></Col>
          <Col xs={24} sm={12}><Form.Item name="pie_comprobante" label="Pie de comprobante"><Input placeholder="Gracias por su preferencia" /></Form.Item></Col>
        </Row>

        {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}
        <div style={{ textAlign: 'right' }}>
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={guardando}>{guardando ? 'Guardando…' : 'Guardar datos'}</Button>
        </div>
      </Form>
    </Panel>
  )
}
