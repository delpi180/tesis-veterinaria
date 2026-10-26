import { useState } from 'react'
import { Flex, Input, Modal, Typography } from 'antd'

const { Text } = Typography

/** Pide el motivo para suspender un tratamiento. El motivo del corte es información
 *  clínica: por qué se suspendió (reacción adversa, no lo toleró, el dueño lo dejó)
 *  importa más que el hecho de suspenderlo. */
export default function SuspenderModal({ medicamento, paciente, onCerrar, onConfirmar }: {
  medicamento: string
  paciente: string
  onCerrar: () => void
  onConfirmar: (motivo: string) => Promise<void>
}) {
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const confirmar = async () => {
    if (!motivo.trim()) { setError('Hace falta el motivo para suspenderlo.'); return }
    setGuardando(true)
    await onConfirmar(motivo.trim())
    setGuardando(false)
  }

  return (
    <Modal open onCancel={onCerrar} destroyOnHidden mask={{ closable: false }}
      title="Suspender tratamiento" okText="Suspender" okButtonProps={{ danger: true }} cancelText="Cancelar"
      onOk={confirmar} confirmLoading={guardando}>
      <Flex vertical gap={8} style={{ paddingTop: 8 }}>
        <label htmlFor="trat-motivo"><Text strong>¿Por qué se suspende {medicamento} en {paciente}? *</Text></label>
        <Input id="trat-motivo" size="large" autoFocus placeholder="Ej. reacción adversa, no lo toleró, el dueño lo dejó"
          value={motivo} status={error ? 'error' : undefined}
          onChange={e => { setMotivo(e.target.value); setError(null) }} onPressEnter={confirmar} />
        {error && <Text type="danger">{error}</Text>}
      </Flex>
    </Modal>
  )
}
