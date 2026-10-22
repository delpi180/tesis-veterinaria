/**
 * «Productos aplicados» como en Volki: se busca un producto del inventario, se
 * pone la cantidad y se agrega a una tabla (Item / Cantidad). Por ahora solo
 * queda anotado en la consulta: no descuenta del inventario.
 */
import { useId, useState } from 'react'
import { AutoComplete, Button, Flex, InputNumber, Table, Typography, theme } from 'antd'
import type { TableColumnsType } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import type { ItemProductoAplicado } from '@src/utils/historiaClinica'

export interface ProductoInventario {
  id: number
  nombre: string
  stock?: number | null
  unidad?: string | null
}

interface Props {
  items: ItemProductoAplicado[]
  onChange: (items: ItemProductoAplicado[]) => void
  productos: ProductoInventario[]
}

export default function TablaProductos({ items, onChange, productos }: Props) {
  const { token } = theme.useToken()
  const idBuscar = useId()
  const idCantidad = useId()
  const [texto, setTexto] = useState('')
  const [cantidad, setCantidad] = useState<number>(1)
  const [aviso, setAviso] = useState<string | null>(null)

  const agregar = () => {
    const nombre = texto.trim().toLowerCase()
    const p = productos.find(x => x.nombre.toLowerCase() === nombre)
    if (!p) { setAviso('Elige un producto de la lista.'); return }
    if (!cantidad || cantidad < 1) { setAviso('Pon la cantidad.'); return }
    setAviso(null)
    // El mismo producto dos veces suma la cantidad en vez de repetir la fila
    const i = items.findIndex(x => x.producto_id === p.id)
    if (i > -1) {
      const n = [...items]
      n[i] = { ...n[i], cantidad: n[i].cantidad + cantidad }
      onChange(n)
    } else {
      onChange([...items, { producto_id: p.id, nombre: p.nombre, cantidad }])
    }
    setTexto('')
    setCantidad(1)
  }

  const columnas: TableColumnsType<ItemProductoAplicado & { _i: number }> = [
    { title: 'Item', dataIndex: 'nombre' },
    { title: 'Cantidad', dataIndex: 'cantidad', width: 110, align: 'right' },
    {
      title: '', key: 'quitar', width: 48, align: 'center',
      render: (_v, item) => (
        <Button
          type="text" danger icon={<DeleteOutlined />}
          aria-label={`Quitar ${item.nombre}`}
          onClick={() => onChange(items.filter((_, idx) => idx !== item._i))}
        />
      ),
    },
  ]

  const label = { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, color: token.colorTextSecondary } as const

  return (
    <Flex vertical gap={10}>
      <Flex wrap gap={12} align="flex-end">
        <Flex vertical gap={4} style={{ flex: '1 1 240px', minWidth: 0 }}>
          <label htmlFor={idBuscar} style={label}>Buscar producto</label>
          <AutoComplete
            id={idBuscar} value={texto} onChange={(t: string) => { setTexto(t ?? ''); setAviso(null) }}
            placeholder="Nombre del producto"
            options={productos.map(p => ({ value: p.nombre }))}
            filterOption={(entrada, op) => (op?.value ?? '').toLowerCase().includes(entrada.toLowerCase())}
            style={{ width: '100%' }}
          />
        </Flex>
        <Flex vertical gap={4} style={{ width: 110 }}>
          <label htmlFor={idCantidad} style={label}>Cantidad</label>
          <InputNumber
            id={idCantidad} min={1} max={9999} value={cantidad} onChange={v => setCantidad(Number(v) || 0)}
            style={{ width: '100%' }}
          />
        </Flex>
        <Button icon={<PlusOutlined />} onClick={agregar}>Agregar</Button>
      </Flex>
      {aviso && <Typography.Text type="danger" style={{ fontSize: 12 }}>{aviso}</Typography.Text>}
      <Table
        size="small" pagination={false} rowKey="_i"
        columns={columnas}
        dataSource={items.map((it, _i) => ({ ...it, _i }))}
        locale={{ emptyText: 'No hay elementos para mostrar' }}
      />
    </Flex>
  )
}
