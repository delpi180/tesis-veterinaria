/**
 * «Cambiar» el responsable de una mascota: se busca al nuevo dueño por nombre,
 * DNI o teléfono y se confirma. Las ventas ya hechas se quedan con quien pagó;
 * las citas, historias y recetas siguen con la mascota.
 */
import { useEffect, useRef, useState } from 'react'
import { Alert, Modal, Select, Typography } from 'antd'
import { api } from '../../services/api'

interface ClienteBusqueda { id: number; nombre: string; dni?: string | null; telefono?: string | null }

interface Props {
  abierto: boolean
  pacienteId: number
  pacienteNombre: string
  /** Dueño actual, para no ofrecerlo como opción. */
  clienteActualId?: number
  onCerrar: () => void
  /** Devuelve al dueño nuevo ya guardado. */
  onCambiado: (nuevo: ClienteBusqueda) => void
}

export default function CambiarResponsable({
  abierto, pacienteId, pacienteNombre, clienteActualId, onCerrar, onCambiado,
}: Props) {
  const [opciones, setOpciones] = useState<ClienteBusqueda[]>([])
  const [elegido, setElegido] = useState<number | undefined>()
  const [buscando, setBuscando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (abierto) { setOpciones([]); setElegido(undefined); setError(null); setGuardando(false) }
  }, [abierto])
  useEffect(() => () => clearTimeout(temporizador.current), [])

  const buscar = (texto: string) => {
    clearTimeout(temporizador.current)
    if (texto.trim().length < 2) { setOpciones([]); return }
    temporizador.current = setTimeout(async () => {
      setBuscando(true)
      try {
        const r = await api.get(`/api/clientes/?q=${encodeURIComponent(texto.trim())}&limit=20`)
        setOpciones((Array.isArray(r) ? r : []).filter((c: ClienteBusqueda) => c.id !== clienteActualId))
      } catch { setOpciones([]) } finally { setBuscando(false) }
    }, 300)
  }

  const guardar = async () => {
    const nuevo = opciones.find(c => c.id === elegido)
    if (!nuevo) return
    setGuardando(true); setError(null)
    try {
      await api.put(`/api/pacientes/${pacienteId}/responsable`, { cliente_id: nuevo.id })
      onCambiado(nuevo)
    } catch (e) {
      setError((e as Error).message); setGuardando(false)
    }
  }

  return (
    <Modal
      open={abierto} onCancel={onCerrar} destroyOnHidden title={`Cambiar el responsable de ${pacienteNombre}`}
      okText="Cambiar responsable" cancelText="Cancelar" onOk={guardar}
      okButtonProps={{ disabled: !elegido }} confirmLoading={guardando}
    >
      <Typography.Paragraph type="secondary">
        Busca al nuevo dueño por nombre, DNI o teléfono. Las ventas ya hechas se quedan con quien pagó.
      </Typography.Paragraph>
      <Select
        showSearch={{ filterOption: false, onSearch: buscar }}
        style={{ width: '100%' }} placeholder="Nombre, DNI o teléfono del nuevo dueño…"
        aria-label="Buscar al nuevo dueño" loading={buscando} value={elegido} onChange={setElegido}
        notFoundContent={buscando ? 'Buscando…' : 'Escribe al menos 2 letras.'}
        options={opciones.map(c => ({
          value: c.id,
          label: `${c.nombre}${c.dni ? ` · DNI ${c.dni}` : ''}${c.telefono ? ` · ${c.telefono}` : ''}`,
        }))}
      />
      {error && <Alert style={{ marginTop: 12 }} type="error" showIcon title={error} />}
    </Modal>
  )
}
