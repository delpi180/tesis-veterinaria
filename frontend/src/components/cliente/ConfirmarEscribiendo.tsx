/**
 * Confirmación fuerte para borrar: hay que escribir la palabra pedida para
 * activar el botón. Se usa donde un clic de más puede costar datos (eliminar un
 * cliente o dar de baja una mascota).
 */
import { useEffect, useState } from 'react'
import { Alert, Input, Modal, Typography } from 'antd'

interface Props {
  abierto: boolean
  titulo: string
  /** Qué va a pasar, en palabras simples. */
  descripcion: string
  /** Palabra que hay que escribir. */
  palabra?: string
  textoBoton?: string
  cargando?: boolean
  error?: string | null
  onConfirmar: () => void
  onCancelar: () => void
}

export default function ConfirmarEscribiendo({
  abierto, titulo, descripcion, palabra = 'ELIMINAR', textoBoton = 'Eliminar',
  cargando = false, error = null, onConfirmar, onCancelar,
}: Props) {
  const [escrito, setEscrito] = useState('')
  useEffect(() => { if (abierto) setEscrito('') }, [abierto])
  const coincide = escrito.trim().toUpperCase() === palabra.toUpperCase()

  return (
    <Modal
      open={abierto} title={titulo} onCancel={onCancelar} destroyOnHidden
      okText={textoBoton} cancelText="Cancelar"
      okButtonProps={{ danger: true, disabled: !coincide, loading: cargando }}
      onOk={onConfirmar}
    >
      <Typography.Paragraph>{descripcion}</Typography.Paragraph>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
        Para confirmar, escribe <Typography.Text strong>{palabra}</Typography.Text>:
      </Typography.Paragraph>
      <Input
        value={escrito} onChange={e => setEscrito(e.target.value)} autoFocus autoComplete="off"
        aria-label={`Escribe ${palabra} para confirmar`} onPressEnter={() => { if (coincide) onConfirmar() }}
      />
      {error && <Alert style={{ marginTop: 12 }} type="error" showIcon title={error} />}
    </Modal>
  )
}
