import { useCallback, useEffect, useState } from 'react'
import { Button, Flex, InputNumber, Input, Modal, Segmented, Table, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { HistoryOutlined } from '@ant-design/icons'
import { api } from '../../services/api'
import { useToast } from '../Toast'
import { ESTADO } from '@src/core/color'
import { mensajeDe, type Producto } from './tipos'

const { Text } = Typography

interface Movimiento {
  id: number
  fecha: string
  tipo: string
  cantidad: number
  stock_resultante: number
  motivo?: string | null
  referencia?: string | null
}

const COLOR_TIPO: Record<string, string> = { entrada: 'success', salida: 'error', ajuste: 'warning' }

/** Historial de movimientos de un producto y ajuste rápido de stock (entrada o salida). */
export default function KardexModal({ producto, onCerrar, onStockCambiado }: {
  producto: Producto
  onCerrar: () => void
  onStockCambiado: (p: Producto) => void
}) {
  const toast = useToast()
  const [movs, setMovs] = useState<Movimiento[]>([])
  const [cargando, setCargando] = useState(true)
  const [cant, setCant] = useState<number | null>(null)
  const [motivo, setMotivo] = useState('')
  const [signo, setSigno] = useState<1 | -1>(1)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      setMovs(await api.get(`/api/productos/${producto.id}/movimientos`))
    } catch (e) { toast.error(mensajeDe(e)) } finally { setCargando(false) }
  }, [producto.id, toast])

  useEffect(() => { cargar() }, [cargar])

  const aplicar = async () => {
    const n = Math.floor(cant ?? 0)
    if (n <= 0) { toast.error('Ingresa una cantidad mayor a 0.'); return }
    setGuardando(true)
    try {
      const actualizado = await api.post(`/api/productos/${producto.id}/ajuste-stock`, {
        cantidad: signo * n, motivo: motivo.trim() || null,
      })
      toast.success(`Stock actualizado: ${actualizado.stock}`)
      setCant(null); setMotivo('')
      onStockCambiado(actualizado)
      await cargar()
    } catch (e) {
      toast.error(mensajeDe(e))
    } finally {
      setGuardando(false)
    }
  }

  const columnas: TableColumnsType<Movimiento> = [
    { title: 'Fecha', dataIndex: 'fecha', render: (f: string) => new Date(f).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: '2-digit' }) },
    { title: 'Tipo', dataIndex: 'tipo', render: (t: string) => <Tag color={COLOR_TIPO[t]} style={{ marginInlineEnd: 0, textTransform: 'capitalize' }}>{t}</Tag> },
    {
      title: 'Cant.', dataIndex: 'cantidad', align: 'right',
      render: (c: number) => <Text strong style={{ color: c >= 0 ? ESTADO.ok : ESTADO.peligro }}>{c >= 0 ? `+${c}` : c}</Text>,
    },
    { title: 'Stock', dataIndex: 'stock_resultante', align: 'right' },
    { title: 'Motivo', key: 'motivo', render: (_, m) => [m.motivo, m.referencia].filter(Boolean).join(' · ') || '—' },
  ]

  return (
    <Modal
      open onCancel={onCerrar} footer={null} width={640} destroyOnHidden
      title={<><HistoryOutlined /> Kardex — {producto.nombre}</>}
    >
      <Text type="secondary" style={{ fontFamily: 'monospace' }}>{producto.codigo} · stock actual: {producto.stock}</Text>

      <Flex gap={8} wrap align="center" style={{ margin: '14px 0' }}>
        <Segmented<1 | -1> value={signo} onChange={v => setSigno(v === -1 ? -1 : 1)}
          options={[{ value: 1, label: 'Entrada' }, { value: -1, label: 'Salida' }]} />
        <InputNumber min={1} precision={0} value={cant} onChange={v => setCant(v == null ? null : Number(v))} placeholder="Cant." style={{ width: 90 }} aria-label="Cantidad" />
        <Input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo (ej. compra, merma)"
          style={{ flex: '1 1 160px' }} aria-label="Motivo" onPressEnter={aplicar} />
        <Button type="primary" loading={guardando} onClick={aplicar}>Aplicar</Button>
      </Flex>

      <Table<Movimiento> rowKey="id" size="small" columns={columnas} dataSource={movs} loading={cargando}
        pagination={{ pageSize: 8, hideOnSinglePage: true, showSizeChanger: false }}
        scroll={{ x: 'max-content' }} locale={{ emptyText: 'Sin movimientos registrados' }} />
    </Modal>
  )
}
