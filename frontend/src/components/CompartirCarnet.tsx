import { useState } from 'react'
import { Alert, Button, Flex, Input, Modal, Typography } from 'antd'
import { CopyOutlined, DeleteOutlined, ShareAltOutlined, WhatsAppOutlined } from '@ant-design/icons'
import { api } from '../services/api'
import { clinicaActual } from '../services/clinica'
import { useConfirmar } from './Confirmar'
import { useToast } from './Toast'

const { Text } = Typography

interface Props {
  pacienteId: number | string
  mascota?: string | null
  propietario?: string | null
  telefono?: string | null
}

const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : 'Ocurrió un error.')

// El dueño abre el enlace sin sesión y ve el carnet de vacunas. Recepción lo manda por
// WhatsApp o lo copia; si se mandó a quien no era, lo revoca y deja de funcionar.
export default function CompartirCarnet({ pacienteId, mascota, propietario, telefono }: Props) {
  const toast = useToast()
  const confirmar = useConfirmar()
  const [abierto, setAbierto] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  const abrir = async () => {
    setAbierto(true)
    setCargando(true)
    try {
      const r = await api.post(`/api/carnet/paciente/${pacienteId}`, {})
      setUrl(`${window.location.origin}${r.ruta}`)
    } catch (e) {
      toast.error(mensajeDe(e))
      setAbierto(false)
    } finally {
      setCargando(false)
    }
  }

  const copiar = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Enlace copiado')
    } catch {
      toast.error('No se pudo copiar. Selecciónalo y cópialo a mano.')
    }
  }

  const num = (telefono || '').replace(/\D/g, '')
  const wa = url
    ? `https://wa.me/${num.length === 9 ? `51${num}` : num}?text=${encodeURIComponent(
        `Hola ${propietario || ''}, este es el carnet de vacunas de ${mascota || 'su mascota'} en ${clinicaActual().nombre}. Ahí verá cuándo toca la próxima dosis: ${url}`)}`
    : undefined

  const revocar = async () => {
    if (!await confirmar({
      titulo: 'Revocar enlace',
      mensaje: `El enlace del carnet de ${mascota ?? 'la mascota'} dejará de funcionar.`,
      detalle: 'Si ya se lo mandaste al dueño correcto, no hace falta. Después puedes crear uno nuevo.',
      confirmarTexto: 'Revocar',
    })) return
    try {
      await api.del(`/api/carnet/paciente/${pacienteId}`)
      setUrl(null)
      setAbierto(false)
      toast.success('Enlace revocado')
    } catch (e) {
      toast.error(mensajeDe(e))
    }
  }

  return (
    <>
      <Button icon={<ShareAltOutlined />} onClick={abrir}>Compartir carnet</Button>
      <Modal open={abierto} onCancel={() => setAbierto(false)} footer={null} title={`Carnet de ${mascota ?? 'la mascota'}`}>
        <Flex vertical gap={12}>
          <Text type="secondary">
            El dueño lo abre desde su celular, sin usuario ni clave. Solo ve las vacunas, las desparasitaciones y la próxima cita:
            nada del diagnóstico ni de sus datos.
          </Text>
          <Input readOnly value={cargando ? 'Generando…' : url ?? ''} onFocus={e => e.target.select()} aria-label="Enlace del carnet" />
          {!telefono && url && <Alert type="warning" showIcon title="El cliente no tiene teléfono: copia el enlace y mándalo por otro medio." />}
          <Flex gap={8} wrap>
            <Button icon={<CopyOutlined />} onClick={copiar} disabled={!url}>Copiar</Button>
            <Button type="primary" icon={<WhatsAppOutlined />} href={telefono ? wa : undefined} target="_blank" rel="noopener noreferrer"
              disabled={!url || !telefono} style={url && telefono ? { background: '#25a244' } : undefined}>
              Mandar por WhatsApp
            </Button>
            <Button danger icon={<DeleteOutlined />} onClick={revocar} disabled={!url} style={{ marginLeft: 'auto' }}>Revocar</Button>
          </Flex>
        </Flex>
      </Modal>
    </>
  )
}
