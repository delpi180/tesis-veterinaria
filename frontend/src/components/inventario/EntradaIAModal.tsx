import { useState } from 'react'
import { Alert, Button, Empty, Flex, Input, InputNumber, Modal, Select, Table, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { AudioOutlined, DeleteOutlined, PauseCircleOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { api, authHeaders } from '../../services/api'
import { useAudioRecorder } from '../../hooks/useAudioRecorder'
import { useToast } from '../Toast'
import { ESTADO } from '@src/core/color'
import { OPCIONES_CATEGORIA, mensajeDe } from './tipos'

const { Text, Paragraph } = Typography

const BASE_URL = import.meta.env.VITE_API_URL ?? ''

const EJEMPLO_INV = 'Llegaron veinte cajas de amoxicilina a tres soles cada una, diez pipetas de Bravecto a ochenta soles, y agrega un producto nuevo: alimento Royal Canin de tres kilos, comida, a sesenta y cinco soles, cinco bolsas.'

interface ItemIA {
  nombre: string
  categoria?: string | null
  cantidad: number | string
  precio?: number | string | null
  unidad?: string | null
  producto_id?: number | null
  accion: 'nuevo' | 'reponer' | string
  codigo?: string | null
  stock_actual?: number | null
}

/** Entrada de mercadería dictada o escrita: la IA arma la lista, la persona la revisa y confirma. */
export default function EntradaIAModal({ onCerrar, onAplicado }: { onCerrar: () => void; onAplicado: () => void }) {
  const toast = useToast()
  const [texto, setTexto] = useState('')
  const [items, setItems] = useState<ItemIA[] | null>(null)   // null = aún no interpretado
  const [cargando, setCargando] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const { isRecording, seconds, micError, start, stop } = useAudioRecorder()

  const interpretarTexto = async () => {
    if (!texto.trim()) { toast.error('Escribe o dicta qué llegó.'); return }
    setCargando(true)
    try {
      setItems(await api.post('/api/inventario/interpretar', { texto }))
    } catch (e) { toast.error(mensajeDe(e)) } finally { setCargando(false) }
  }

  const grabar = async () => {
    if (!isRecording) { await start(); return }
    setCargando(true)
    try {
      const blob = await stop()
      if (!blob) throw new Error('No se capturó audio.')
      const fd = new FormData()
      fd.append('audio', blob, 'inventario.webm')
      const res = await fetch(`${BASE_URL}/api/inventario/interpretar-audio`, {
        method: 'POST', body: fd, headers: authHeaders(),
      })
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
    const faltaPrecio = items.find(it => it.accion === 'nuevo' && !(Number(it.precio) > 0))
    if (faltaPrecio) { toast.error(`"${faltaPrecio.nombre}" es nuevo y necesita precio.`); return }
    setAplicando(true)
    try {
      const r = await api.post('/api/inventario/aplicar', {
        items: items.map(it => ({
          nombre: it.nombre, categoria: it.categoria || null,
          cantidad: parseInt(String(it.cantidad), 10), precio: it.precio ? Number(it.precio) : null,
          unidad: it.unidad || null, producto_id: it.producto_id || null, accion: it.accion,
        })),
      })
      toast.success(`Inventario actualizado: ${r.creados.length} nuevo(s), ${r.actualizados.length} repuesto(s).`)
      onAplicado()
    } catch (e) { toast.error(mensajeDe(e)) } finally { setAplicando(false) }
  }

  type Fila = ItemIA & { i: number }
  const columnas: TableColumnsType<Fila> = [
    {
      title: 'Producto', key: 'nombre', width: 200,
      render: (_, it) => (
        <Flex vertical gap={2}>
          <Input value={it.nombre} onChange={e => cambiar(it.i, 'nombre', e.target.value)} aria-label="Producto" />
          {it.codigo && <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }}>{it.codigo} · stock {it.stock_actual}</Text>}
        </Flex>
      ),
    },
    {
      title: 'Categoría', key: 'categoria', width: 140,
      render: (_, it) => (
        <Select value={it.categoria ?? undefined} allowClear placeholder="—" style={{ width: '100%' }}
          options={OPCIONES_CATEGORIA} onChange={(v?: string) => cambiar(it.i, 'categoria', v ?? null)} aria-label="Categoría" />
      ),
    },
    {
      title: 'Cant.', key: 'cantidad', width: 90,
      render: (_, it) => <InputNumber min={1} precision={0} value={Number(it.cantidad) || null} style={{ width: 70 }}
        onChange={v => cambiar(it.i, 'cantidad', v ?? '')} aria-label="Cantidad" />,
    },
    {
      title: 'Precio', key: 'precio', width: 110,
      render: (_, it) => (
        <InputNumber min={0} step={0.01} precision={2} value={it.precio === '' || it.precio == null ? null : Number(it.precio)}
          placeholder={it.accion === 'nuevo' ? 'requerido' : '—'} style={{ width: 95 }}
          status={it.accion === 'nuevo' && !(Number(it.precio) > 0) ? 'error' : undefined}
          onChange={v => cambiar(it.i, 'precio', v ?? '')} aria-label="Precio" />
      ),
    },
    {
      title: 'Acción', key: 'accion', align: 'center', width: 90,
      render: (_, it) => <Tag color={it.accion === 'nuevo' ? 'blue' : 'success'} style={{ marginInlineEnd: 0 }}>{it.accion === 'nuevo' ? 'Nuevo' : '+ stock'}</Tag>,
    },
    {
      title: '', key: 'quitar', width: 44,
      render: (_, it) => <Button type="text" danger size="small" icon={<DeleteOutlined />} aria-label="Quitar de la lista" onClick={() => quitar(it.i)} />,
    },
  ]

  return (
    <Modal
      open onCancel={onCerrar} width={760} destroyOnHidden
      title={<><ThunderboltOutlined style={{ color: ESTADO.ok }} /> Entrada de mercadería por voz o texto</>}
      footer={[
        <Button key="c" onClick={onCerrar}>Cancelar</Button>,
        items && items.length > 0 && <Button key="ok" type="primary" loading={aplicando} onClick={aplicar}>Confirmar y guardar</Button>,
      ]}
    >
      <Paragraph type="secondary" style={{ marginBottom: 8 }}>
        Dicta o escribe qué productos llegaron (cantidad y precio). La IA arma la lista; tú la revisas y confirmas.
      </Paragraph>
      <Input.TextArea rows={3} value={texto} onChange={e => setTexto(e.target.value)}
        placeholder={`Ej: ${EJEMPLO_INV}`} aria-label="Qué llegó" />
      <Flex gap={8} align="center" wrap style={{ margin: '12px 0' }}>
        <Button danger={isRecording} icon={isRecording ? <PauseCircleOutlined /> : <AudioOutlined />}
          disabled={cargando} className={isRecording ? 'grabando' : undefined} onClick={grabar}>
          {isRecording ? `Detener (${seconds}s)` : 'Dictar'}
        </Button>
        <Button type="primary" icon={<ThunderboltOutlined />} loading={cargando} disabled={isRecording} onClick={interpretarTexto}>
          {cargando ? 'Interpretando…' : 'Interpretar'}
        </Button>
        {micError && <Text type="danger">{micError}</Text>}
      </Flex>

      {items && (items.length === 0
        ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No se detectaron productos. Reformula el texto." />
        : (
          <>
            <Table<Fila> rowKey="i" size="small" pagination={false} columns={columnas}
              dataSource={items.map((it, i) => ({ ...it, i }))} scroll={{ x: 'max-content' }} />
            <Alert type="info" showIcon style={{ marginTop: 12 }} title="Revisa los nombres, cantidades y precios antes de guardar. Los productos nuevos necesitan precio." />
          </>
        ))}
    </Modal>
  )
}
