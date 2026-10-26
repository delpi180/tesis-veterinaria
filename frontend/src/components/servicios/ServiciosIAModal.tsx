import { useState } from 'react'
import { Button, Checkbox, Empty, Flex, Input, InputNumber, Modal, Table, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { AudioOutlined, DeleteOutlined, PauseCircleOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { api, authHeaders } from '../../services/api'
import { useAudioRecorder } from '../../hooks/useAudioRecorder'
import { useToast } from '../Toast'
import { ESTADO } from '@src/core/color'

const { Text, Paragraph } = Typography

const BASE_URL = import.meta.env.VITE_API_URL ?? ''
const EJEMPLO_SERV = 'consulta general 50 soles, baño y corte 40, vacunación 35, cirugía precio variable'

interface ItemIA {
  nombre: string
  descripcion?: string | null
  precio?: number | string | null
  precio_variable?: boolean
  accion: 'nuevo' | 'actualizar' | string
  servicio_id?: number | null
}

const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : 'Ocurrió un error.')

/** Alta de servicios dictada o escrita: la IA arma la lista, la persona la revisa y confirma. */
export default function ServiciosIAModal({ onCerrar, onAplicado }: { onCerrar: () => void; onAplicado: () => void }) {
  const toast = useToast()
  const [texto, setTexto] = useState('')
  const [items, setItems] = useState<ItemIA[] | null>(null)   // null = aún no interpretado
  const [cargando, setCargando] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const { isRecording, seconds, micError, start, stop } = useAudioRecorder()

  const interpretarTexto = async () => {
    if (!texto.trim()) { toast.error('Escribe o dicta los servicios.'); return }
    setCargando(true)
    try {
      setItems(await api.post('/api/servicios/interpretar', { texto }))
    } catch (e) { toast.error(mensajeDe(e)) } finally { setCargando(false) }
  }

  const grabar = async () => {
    if (!isRecording) { await start(); return }
    setCargando(true)
    try {
      const blob = await stop()
      if (!blob) throw new Error('No se capturó audio.')
      const fd = new FormData()
      fd.append('audio', blob, 'servicios.webm')
      const res = await fetch(`${BASE_URL}/api/servicios/interpretar-audio`, { method: 'POST', body: fd, headers: authHeaders() })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b?.detail ?? `Error (HTTP ${res.status})`)
      }
      setItems(await res.json())
    } catch (e) { toast.error(mensajeDe(e)) } finally { setCargando(false) }
  }

  const cambiar = (i: number, campo: keyof ItemIA, valor: unknown) =>
    setItems(its => its && its.map((it, idx) => idx === i ? { ...it, [campo]: valor } : it))
  const quitar = (i: number) => setItems(its => its && its.filter((_, idx) => idx !== i))

  const aplicar = async () => {
    if (!items) return
    const faltaPrecio = items.find(it => !it.precio_variable && !(Number(it.precio) > 0))
    if (faltaPrecio) { toast.error(`"${faltaPrecio.nombre}" necesita precio o marcarlo como variable.`); return }
    setAplicando(true)
    try {
      const r = await api.post('/api/servicios/aplicar', {
        items: items.map(it => ({
          nombre: it.nombre,
          descripcion: it.descripcion || null,
          precio: it.precio_variable ? null : Number(it.precio),
          precio_variable: !!it.precio_variable,
          accion: it.accion,
          servicio_id: it.servicio_id || null,
        })),
      })
      toast.success(`Servicios: ${r.creados.length} nuevo(s), ${r.actualizados.length} actualizado(s).`)
      onAplicado()
    } catch (e) { toast.error(mensajeDe(e)) } finally { setAplicando(false) }
  }

  type Fila = ItemIA & { i: number }
  const columnas: TableColumnsType<Fila> = [
    {
      title: 'Servicio', key: 'nombre', width: 220,
      render: (_, it) => (
        <Flex vertical gap={2}>
          <Input value={it.nombre} onChange={e => cambiar(it.i, 'nombre', e.target.value)} aria-label="Servicio" />
          {it.descripcion && <Text type="secondary" style={{ fontSize: 12 }}>{it.descripcion}</Text>}
        </Flex>
      ),
    },
    {
      title: 'Precio', key: 'precio', width: 120,
      render: (_, it) => (
        <InputNumber min={0} step={0.01} precision={2} style={{ width: 105 }} disabled={it.precio_variable}
          value={it.precio === '' || it.precio == null ? null : Number(it.precio)}
          status={!it.precio_variable && !(Number(it.precio) > 0) ? 'error' : undefined}
          onChange={v => cambiar(it.i, 'precio', v ?? '')} aria-label="Precio" />
      ),
    },
    {
      title: 'Variable', key: 'variable', align: 'center', width: 80,
      render: (_, it) => <Checkbox checked={!!it.precio_variable} onChange={e => cambiar(it.i, 'precio_variable', e.target.checked)} aria-label="Monto variable" />,
    },
    {
      title: 'Acción', key: 'accion', align: 'center', width: 100,
      render: (_, it) => <Tag color={it.accion === 'nuevo' ? 'success' : 'blue'} style={{ marginInlineEnd: 0 }}>{it.accion === 'nuevo' ? 'Nuevo' : 'Actualizar'}</Tag>,
    },
    { title: '', key: 'quitar', width: 44, render: (_, it) => <Button type="text" danger size="small" icon={<DeleteOutlined />} aria-label="Quitar de la lista" onClick={() => quitar(it.i)} /> },
  ]

  return (
    <Modal open onCancel={onCerrar} width={720} destroyOnHidden
      title={<><ThunderboltOutlined style={{ color: ESTADO.ok }} /> Agregar servicios por voz o texto</>}
      footer={[
        <Button key="c" onClick={onCerrar}>Cancelar</Button>,
        <Button key="ok" type="primary" loading={aplicando} disabled={!items || items.length === 0} onClick={aplicar}>Confirmar y guardar</Button>,
      ]}>
      <Paragraph type="secondary" style={{ marginBottom: 8 }}>
        Dicta o escribe los servicios y sus precios. La IA arma la lista; tú la revisas y confirmas.
      </Paragraph>
      <Input.TextArea rows={3} value={texto} onChange={e => setTexto(e.target.value)} placeholder={`Ej: ${EJEMPLO_SERV}`} aria-label="Servicios" />
      <Flex gap={8} align="center" wrap style={{ margin: '12px 0' }}>
        <Button danger={isRecording} icon={isRecording ? <PauseCircleOutlined /> : <AudioOutlined />} disabled={cargando}
          className={isRecording ? 'grabando' : undefined} onClick={grabar}>
          {isRecording ? `Detener (${seconds}s)` : 'Dictar'}
        </Button>
        <Button type="primary" icon={<ThunderboltOutlined />} loading={cargando} disabled={isRecording} onClick={interpretarTexto}>
          {cargando ? 'Interpretando…' : 'Interpretar'}
        </Button>
        {micError && <Text type="danger">{micError}</Text>}
      </Flex>

      {items && (items.length === 0
        ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No se detectaron servicios. Reformula el texto." />
        : <Table<Fila> rowKey="i" size="small" pagination={false} columns={columnas}
            dataSource={items.map((it, i) => ({ ...it, i }))} scroll={{ x: 'max-content' }} />)}
    </Modal>
  )
}
