/**
 * Etiquetas de clientes (como en Volki): lista, alta, cambio de nombre y baja.
 * Crear, editar y borrar solo lo hace la recepcionista; el backend también lo exige.
 */
import { useState } from 'react'
import { Alert, Button, Empty, Flex, Input, List, Modal, Tag, Typography } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { api } from '../../services/api'

export interface Etiqueta { id: number; nombre: string; color?: string | null; clientes?: number }

interface Props {
  abierto: boolean
  etiquetas: Etiqueta[]
  onCerrar: () => void
  /** Se llama después de crear, editar o borrar, para recargar la lista. */
  onCambio: () => void
}

export default function GestorEtiquetas({ abierto, etiquetas, onCerrar, onCambio }: Props) {
  const [nuevo, setNuevo] = useState('')
  const [editando, setEditando] = useState<number | null>(null)
  const [nombreEditado, setNombreEditado] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const ejecutar = async (accion: () => Promise<unknown>) => {
    setOcupado(true); setError(null)
    try { await accion(); onCambio() } catch (e) { setError((e as Error).message) } finally { setOcupado(false) }
  }

  const crear = () => {
    const nombre = nuevo.trim()
    if (!nombre) return
    ejecutar(async () => { await api.post('/api/etiquetas/', { nombre }); setNuevo('') })
  }
  const guardarEdicion = (e: Etiqueta) => {
    const nombre = nombreEditado.trim()
    if (!nombre) return
    ejecutar(async () => { await api.put(`/api/etiquetas/${e.id}`, { nombre, color: e.color ?? null }); setEditando(null) })
  }
  const borrar = (e: Etiqueta) => {
    Modal.confirm({
      title: `¿Borrar la etiqueta «${e.nombre}»?`,
      content: 'Se quita de los clientes que la tienen. Los clientes no se borran.',
      okText: 'Borrar', okButtonProps: { danger: true }, cancelText: 'Cancelar',
      onOk: () => ejecutar(() => api.del(`/api/etiquetas/${e.id}`)),
    })
  }

  return (
    <Modal open={abierto} onCancel={onCerrar} footer={null} title="Etiquetas de clientes" destroyOnHidden>
      <Flex gap={8} style={{ marginBottom: 12 }}>
        <Input
          value={nuevo} onChange={e => setNuevo(e.target.value)} onPressEnter={crear} maxLength={40}
          placeholder="Nombre de la etiqueta…" aria-label="Nombre de la etiqueta nueva" autoComplete="off"
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={crear} loading={ocupado} disabled={!nuevo.trim()}>
          Agregar
        </Button>
      </Flex>
      {error && <Alert style={{ marginBottom: 12 }} type="error" showIcon title={error} />}
      {etiquetas.length === 0
        ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Aún no hay etiquetas." />
        : (
          <List
            size="small" dataSource={etiquetas}
            renderItem={e => (
              <List.Item
                actions={editando === e.id
                  ? [
                      <Button key="g" type="link" onClick={() => guardarEdicion(e)} loading={ocupado}>Guardar</Button>,
                      <Button key="c" type="link" onClick={() => setEditando(null)}>Cancelar</Button>,
                    ]
                  : [
                      <Button
                        key="e" type="text" icon={<EditOutlined />} aria-label={`Cambiar nombre de ${e.nombre}`}
                        onClick={() => { setEditando(e.id); setNombreEditado(e.nombre) }}
                      />,
                      <Button
                        key="b" type="text" danger icon={<DeleteOutlined />} aria-label={`Borrar ${e.nombre}`}
                        onClick={() => borrar(e)}
                      />,
                    ]}
              >
                {editando === e.id
                  ? <Input value={nombreEditado} onChange={ev => setNombreEditado(ev.target.value)} maxLength={40} aria-label="Nuevo nombre" autoComplete="off" />
                  : (
                    <Flex gap={8} align="center">
                      <Tag color={e.color ?? undefined} style={{ margin: 0 }}>{e.nombre}</Tag>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {e.clientes ?? 0} cliente{e.clientes === 1 ? '' : 's'}
                      </Typography.Text>
                    </Flex>
                  )}
              </List.Item>
            )}
          />
        )}
    </Modal>
  )
}
