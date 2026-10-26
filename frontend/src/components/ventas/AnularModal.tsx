import { useState } from 'react'
import { Alert, Flex, Input, Modal, Typography } from 'antd'
import { api } from '../../services/api'
import { useToast } from '../Toast'
import { fmtMoneda, mensajeDe, nroBoleta, type Venta } from './tipos'

const { Text } = Typography

/** Anular una venta. El motivo es obligatorio: la venta no se borra, queda como
 *  constancia de qué pasó, así que el motivo es parte del registro. */
export default function AnularModal({ venta, onCerrar, onAnulada }: {
  venta: Venta
  onCerrar: () => void
  onAnulada: (v: Venta) => void
}) {
  const toast = useToast()
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)

  const confirmar = async () => {
    if (motivo.trim().length < 3) { toast.error('Escribe el motivo de la anulación.'); return }
    setGuardando(true)
    try {
      const actualizada = await api.post(`/api/ventas/${venta.id}/anular`, { motivo: motivo.trim() })
      toast.success('Venta anulada. El stock volvió al inventario.')
      onAnulada(actualizada)
    } catch (e) {
      toast.error(mensajeDe(e))
      setGuardando(false)
    }
  }

  return (
    <Modal open onCancel={onCerrar} destroyOnHidden mask={{ closable: false }}
      title={`Anular ${nroBoleta(venta.id)}`}
      okText="Anular venta" okButtonProps={{ danger: true }} cancelText="Cancelar"
      onOk={confirmar} confirmLoading={guardando}>
      <Flex vertical gap={14} style={{ paddingTop: 8 }}>
        <div>
          <Text type="secondary">Cliente:</Text> {venta.cliente_nombre ?? `#${venta.cliente_id}`}<br />
          <Text type="secondary">Total:</Text> <strong>{fmtMoneda(venta.total)}</strong>
        </div>
        <Alert type="warning" showIcon
          title="La venta no se borra: queda registrada como anulada, deja de sumar en la caja y los productos vuelven al inventario." />
        <Flex vertical gap={6}>
          <label htmlFor="anular-motivo"><Text strong>Motivo *</Text></label>
          <Input id="anular-motivo" size="large" autoFocus placeholder="Ej. cobro duplicado, cliente devolvió el producto"
            value={motivo} onChange={e => setMotivo(e.target.value)} onPressEnter={confirmar} />
        </Flex>
      </Flex>
    </Modal>
  )
}
