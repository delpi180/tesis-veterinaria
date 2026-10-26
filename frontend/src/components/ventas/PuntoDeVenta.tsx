import { useEffect, useState } from 'react'
import { Alert, Badge, Button, Col, Empty, Flex, Grid, Input, InputNumber, Modal, Row, Segmented, Select, Space, Tag, Typography } from 'antd'
import {
  DeleteOutlined, FileTextOutlined, MedicineBoxOutlined, MinusOutlined, PlusOutlined,
  SearchOutlined, ShoppingCartOutlined, ShoppingOutlined,
} from '@ant-design/icons'
import { api } from '../../services/api'
import { calcularTotales } from '../../utils/dinero'
import { BRAND, ESTADO } from '@src/core/color'
import {
  CAT_LABEL, METODOS_PAGO, OPCIONES_CATEGORIA, fmtMoneda, mensajeDe, type ClienteInfo, type Venta,
} from './tipos'

const { Text } = Typography

export interface ProductoVenta { id: number; nombre: string; codigo?: string | null; precio: number | string; stock: number; stock_bajo?: boolean; categoria?: string | null }
export interface ServicioVenta { id: number; nombre: string; descripcion?: string | null; precio: number | string; precio_variable: boolean }
interface Mascota { id: number; nombre: string; especie: string }
interface ClienteBusqueda { id: number; nombre: string; dni?: string | null; telefono?: string | null }
interface Linea {
  key: string; tipo: 'producto' | 'servicio'; id: number; nombre: string
  precio: number | ''; cantidad: number; precio_variable: boolean; stock: number | null
}

const etiquetaCliente = (c: { nombre: string; dni?: string | null }) => `${c.nombre}${c.dni ? ` (${c.dni})` : ''}`

/**
 * Punto de venta. El padre lo monta al abrir (así arranca siempre limpio) y le
 * pasa, si hay, el cliente con el que llegó desde la ficha de una mascota.
 */
export default function PuntoDeVenta({ productos, servicios, clienteInicialId, onCerrar, onRegistrada }: {
  productos: ProductoVenta[]
  servicios: ServicioVenta[]
  clienteInicialId?: string
  onCerrar: () => void
  onRegistrada: (venta: Venta, cliente: ClienteInfo | null) => Promise<void>
}) {
  const pantallas = Grid.useBreakpoint()
  const ancho = pantallas.md !== false   // false solo en celular
  const [cliente, setCliente] = useState<ClienteBusqueda | null>(null)
  const [clienteCargando, setClienteCargando] = useState(!!clienteInicialId)
  // Para cuál de sus mascotas. Opcional: la comida y los accesorios son del dueño.
  // Cuando se indica, la entrega del medicamento queda atada al tratamiento.
  const [pacienteId, setPacienteId] = useState<number | undefined>()
  const [mascotas, setMascotas] = useState<Mascota[]>([])
  const [busqCli, setBusqCli] = useState('')
  const [resultados, setResultados] = useState<ClienteBusqueda[]>([])
  const [buscando, setBuscando] = useState(false)

  const [metodoPago, setMetodoPago] = useState('efectivo')
  const [descuento, setDescuento] = useState<number | null>(null)
  const [carrito, setCarrito] = useState<Linea[]>([])
  const [tab, setTab] = useState<'producto' | 'servicio'>(clienteInicialId ? 'servicio' : 'producto')
  const [busqueda, setBusqueda] = useState('')
  const [categoria, setCategoria] = useState<string | undefined>()
  const [vista, setVista] = useState<'catalogo' | 'carrito'>('catalogo')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargarMascotas = (id: number) => {
    api.get(`/api/clientes/${id}/pacientes/`)
      .then((m: unknown) => {
        const lista = Array.isArray(m) ? m as Mascota[] : []
        setMascotas(lista)
        if (lista.length === 1) setPacienteId(lista[0].id)   // con una sola no se pregunta
      })
      .catch(() => setMascotas([]))
  }

  // Cliente que viene desde la ficha de la mascota
  useEffect(() => {
    if (!clienteInicialId) return
    api.get(`/api/clientes/${clienteInicialId}`)
      .then((c: ClienteBusqueda) => { setCliente(c); cargarMascotas(c.id) })
      .catch(() => setCliente({ id: Number(clienteInicialId), nombre: `Cliente #${clienteInicialId}` }))
      .finally(() => setClienteCargando(false))
  }, [clienteInicialId])

  // Búsqueda de cliente por nombre o DNI (en el servidor, con espera)
  useEffect(() => {
    const q = busqCli.trim()
    if (!q) return
    const t = setTimeout(() => {
      setBuscando(true)
      api.get(`/api/clientes/?q=${encodeURIComponent(q)}&limit=12`)
        .then((res: unknown) => setResultados(Array.isArray(res) ? res as ClienteBusqueda[] : []))
        .catch(() => setResultados([]))
        .finally(() => setBuscando(false))
    }, 350)
    return () => clearTimeout(t)
  }, [busqCli])

  const elegirCliente = (id: number) => {
    const c = resultados.find(x => x.id === id)
    if (!c) return
    setCliente(c); setBusqCli(''); setResultados([]); setPacienteId(undefined); setMascotas([])
    cargarMascotas(c.id)
  }
  const limpiarCliente = () => { setCliente(null); setPacienteId(undefined); setMascotas([]) }

  // ── Carrito ──
  const agregarProducto = (p: ProductoVenta) => {
    if (p.stock <= 0) return
    setCarrito(c => {
      const k = `producto-${p.id}`
      const ex = c.find(l => l.key === k)
      if (ex) {
        if (ex.cantidad >= p.stock) return c   // no superar el stock
        return c.map(l => l.key === k ? { ...l, cantidad: l.cantidad + 1 } : l)
      }
      return [...c, { key: k, tipo: 'producto', id: p.id, nombre: p.nombre, precio: Number(p.precio), cantidad: 1, precio_variable: false, stock: p.stock }]
    })
  }
  const agregarServicio = (s: ServicioVenta) => {
    setCarrito(c => {
      const k = `servicio-${s.id}`
      const ex = c.find(l => l.key === k)
      if (ex) return c.map(l => l.key === k ? { ...l, cantidad: l.cantidad + 1 } : l)
      return [...c, {
        key: k, tipo: 'servicio', id: s.id, nombre: s.nombre,
        precio: s.precio_variable ? '' : Number(s.precio),
        cantidad: 1, precio_variable: s.precio_variable, stock: null,
      }]
    })
  }
  const cambiarCantidad = (key: string, delta: number) => setCarrito(c => c.map(l => {
    if (l.key !== key) return l
    let nueva = Math.max(1, l.cantidad + delta)
    if (l.tipo === 'producto' && l.stock != null && nueva > l.stock) nueva = l.stock
    return { ...l, cantidad: nueva }
  }))
  const cambiarPrecio = (key: string, valor: number | null) =>
    setCarrito(c => c.map(l => l.key === key ? { ...l, precio: valor ?? '' } : l))
  const quitarLinea = (key: string) => setCarrito(c => c.filter(l => l.key !== key))

  const { subtotal, pct, descuento: descuentoMonto, total } = calcularTotales(carrito, descuento ?? '')

  const term = busqueda.trim().toLowerCase()
  const productosFiltrados = productos.filter(p => {
    if (term && !p.nombre.toLowerCase().includes(term) && !(p.codigo ?? '').toLowerCase().includes(term)) return false
    if (categoria && p.categoria !== categoria) return false
    return true
  })
  const serviciosFiltrados = servicios.filter(s => !term || s.nombre.toLowerCase().includes(term))

  const registrar = async () => {
    if (!cliente) { setError('Selecciona un cliente.'); return }
    if (carrito.length === 0) { setError('Agrega al menos un producto o servicio.'); return }
    const sinMonto = carrito.find(l => l.precio_variable && !(Number(l.precio) > 0))
    if (sinMonto) { setError(`Ingresa el monto para "${sinMonto.nombre}".`); return }

    setGuardando(true); setError(null)
    try {
      const venta: Venta = await api.post('/api/ventas/', {
        cliente_id: cliente.id,
        paciente_id: pacienteId ?? null,
        metodo_pago: metodoPago,
        descuento_pct: pct,
        items: carrito.map(l => l.tipo === 'producto'
          ? { producto_id: l.id, cantidad: l.cantidad }
          : { servicio_id: l.id, cantidad: l.cantidad, ...(l.precio_variable ? { precio: Number(l.precio) } : {}) }),
      })
      // Si por algo falta el cliente completo, se arma uno mínimo con lo que la venta ya trae.
      const info: ClienteInfo | null = cliente ?? (venta.cliente_nombre ? { nombre: venta.cliente_nombre, dni: venta.cliente_dni } : null)
      await onRegistrada(venta, info)
    } catch (e) {
      setError(mensajeDe(e))
      setGuardando(false)
    }
  }

  // ── Piezas ──
  const selectorCliente = cliente ? (
    <Flex gap={8} wrap align="center">
      <Tag color="green" style={{ margin: 0, padding: '4px 10px', fontSize: 14 }}>{etiquetaCliente(cliente)}</Tag>
      <Button type="link" size="small" onClick={limpiarCliente}>Cambiar</Button>
      {mascotas.length > 1 && (
        <Select allowClear placeholder="¿Para qué mascota? (opcional)" value={pacienteId} onChange={setPacienteId}
          style={{ minWidth: 230 }} aria-label="Mascota"
          options={mascotas.map(m => ({ value: m.id, label: `${m.nombre} · ${m.especie}` }))} />
      )}
    </Flex>
  ) : (
    <Select showSearch filterOption={false} placeholder="Buscar cliente por DNI o nombre…" aria-label="Cliente"
      style={{ width: '100%', maxWidth: 420 }} loading={buscando || clienteCargando} suffixIcon={<SearchOutlined />}
      value={null} searchValue={busqCli} onSearch={setBusqCli} onChange={elegirCliente}
      notFoundContent={busqCli.trim() ? (buscando ? 'Buscando…' : 'Sin coincidencias') : 'Escribe para buscar'}
      options={busqCli.trim() ? resultados.map(c => ({ value: c.id, label: etiquetaCliente(c) })) : []} />
  )

  const catalogo = (
    <Flex vertical gap={10} style={{ minHeight: 0 }}>
      <Segmented<'producto' | 'servicio'> block value={tab} onChange={v => { setTab(v); setBusqueda('') }}
        options={[
          { value: 'producto', label: <><ShoppingOutlined /> Productos</> },
          { value: 'servicio', label: <><MedicineBoxOutlined /> Servicios</> },
        ]} />
      <Flex gap={8}>
        <Input allowClear prefix={<SearchOutlined />} value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder={tab === 'producto' ? 'Buscar producto o código…' : 'Buscar servicio…'} aria-label="Buscar en el catálogo" />
        {tab === 'producto' && (
          <Select allowClear placeholder="Todas" value={categoria} onChange={setCategoria} options={OPCIONES_CATEGORIA}
            style={{ width: 150 }} aria-label="Categoría" />
        )}
      </Flex>
      <Flex vertical gap={6} style={{ maxHeight: ancho ? 380 : undefined, overflowY: 'auto', paddingRight: 2 }}>
        {tab === 'producto' && productosFiltrados.map(p => {
          const enCarrito = carrito.find(l => l.key === `producto-${p.id}`)
          const bloqueado = p.stock <= 0 || (!!enCarrito && enCarrito.cantidad >= p.stock)
          return (
            <Button key={p.id} block disabled={bloqueado} onClick={() => agregarProducto(p)}
              style={{ height: 'auto', padding: '8px 12px', textAlign: 'left', justifyContent: 'flex-start' }}>
              <Flex justify="space-between" align="center" gap={8} style={{ width: '100%' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nombre}</div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {p.codigo} · <span style={{ color: p.stock_bajo ? ESTADO.peligro : undefined }}>stock {p.stock}</span>
                    {p.categoria ? ` · ${CAT_LABEL[p.categoria] ?? p.categoria}` : ''}
                  </Text>
                </div>
                <Space size={8}><Text strong>{fmtMoneda(p.precio)}</Text><PlusOutlined style={{ color: BRAND.primary }} /></Space>
              </Flex>
            </Button>
          )
        })}
        {tab === 'servicio' && serviciosFiltrados.map(s => (
          <Button key={s.id} block onClick={() => agregarServicio(s)} style={{ height: 'auto', padding: '8px 12px', textAlign: 'left', justifyContent: 'flex-start' }}>
            <Flex justify="space-between" align="center" gap={8} style={{ width: '100%' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 500 }}>{s.nombre}</div>
                {s.descripcion && <Text type="secondary" style={{ fontSize: 12 }}>{s.descripcion}</Text>}
              </div>
              <Space size={8}>
                {s.precio_variable ? <Tag color="blue" style={{ margin: 0 }}>Monto variable</Tag> : <Text strong>{fmtMoneda(s.precio)}</Text>}
                <PlusOutlined style={{ color: BRAND.primary }} />
              </Space>
            </Flex>
          </Button>
        ))}
        {((tab === 'producto' && productosFiltrados.length === 0) || (tab === 'servicio' && serviciosFiltrados.length === 0)) && (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={tab === 'producto' ? 'Sin productos que coincidan' : 'Sin servicios que coincidan'} />
        )}
      </Flex>
    </Flex>
  )

  const panelCarrito = (
    <Flex vertical gap={10}>
      <Flex vertical gap={8} style={{ maxHeight: ancho ? 220 : undefined, overflowY: 'auto' }}>
        {carrito.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Agrega productos o servicios desde el catálogo" />}
        {carrito.map(l => (
          <div key={l.key} style={{ border: `1px solid ${BRAND.border}`, borderRadius: 8, padding: '8px 12px' }}>
            <Flex justify="space-between" align="start" gap={8}>
              <div style={{ minWidth: 0 }}>
                <Text strong>{l.nombre}</Text><br />
                <Tag color={l.tipo === 'servicio' ? 'blue' : 'gold'} style={{ margin: 0 }}>{l.tipo === 'servicio' ? 'Servicio' : 'Producto'}</Tag>
              </div>
              <Button type="text" danger size="small" icon={<DeleteOutlined />} aria-label={`Quitar ${l.nombre}`} onClick={() => quitarLinea(l.key)} />
            </Flex>
            <Flex justify="space-between" align="center" gap={8} wrap style={{ marginTop: 8 }}>
              <Space.Compact>
                <Button size="small" icon={<MinusOutlined />} aria-label="Menos" onClick={() => cambiarCantidad(l.key, -1)} />
                <Button size="small" style={{ minWidth: 36, pointerEvents: 'none' }}>{l.cantidad}</Button>
                <Button size="small" icon={<PlusOutlined />} aria-label="Más" onClick={() => cambiarCantidad(l.key, 1)} />
              </Space.Compact>
              {l.precio_variable
                ? <InputNumber size="small" min={0} step={0.01} precision={2} prefix="S/" placeholder="Monto" style={{ width: 110 }}
                    value={l.precio === '' ? null : l.precio} onChange={v => cambiarPrecio(l.key, v)} aria-label="Monto" />
                : <Text type="secondary" style={{ fontSize: 12 }}>{fmtMoneda(l.precio)} c/u</Text>}
              <Text strong>{fmtMoneda((Number(l.precio) || 0) * l.cantidad)}</Text>
            </Flex>
          </div>
        ))}
      </Flex>

      <div>
        <Text type="secondary" strong style={{ fontSize: 12 }}>Método de pago</Text>
        <Segmented block value={metodoPago} onChange={v => setMetodoPago(String(v))} options={METODOS_PAGO} style={{ marginTop: 4 }} />
      </div>
      <Flex justify="space-between" align="center">
        <Text type="secondary" strong style={{ fontSize: 12 }}>Descuento (%)</Text>
        <InputNumber min={0} max={100} step={0.5} placeholder="0" value={descuento} onChange={v => setDescuento(v)} style={{ width: 90 }} aria-label="Descuento en porcentaje" />
      </Flex>
      <div>
        <Flex justify="space-between"><Text type="secondary">Subtotal</Text><Text type="secondary">{fmtMoneda(subtotal)}</Text></Flex>
        {pct > 0 && <Flex justify="space-between" style={{ color: ESTADO.peligro }}><span>Descuento ({pct}%)</span><span>− {fmtMoneda(descuentoMonto)}</span></Flex>}
        <Flex justify="space-between" align="baseline" style={{ borderTop: `1px solid ${BRAND.border}`, marginTop: 4, paddingTop: 4 }}>
          <Text strong>Total</Text><span style={{ fontSize: 22, fontWeight: 500 }}>{fmtMoneda(total)}</span>
        </Flex>
      </div>
    </Flex>
  )

  return (
    <Modal open onCancel={onCerrar} destroyOnHidden width={ancho ? 980 : undefined} mask={{ closable: false }}
      title="Nueva venta"
      footer={[
        <Button key="c" onClick={onCerrar}>Cancelar</Button>,
        <Button key="ok" type="primary" icon={<FileTextOutlined />} loading={guardando} onClick={registrar}>
          {guardando ? 'Registrando…' : 'Registrar boleta'}
        </Button>,
      ]}>
      <Flex vertical gap={14} style={{ paddingTop: 8 }}>
        {selectorCliente}

        {!ancho && (
          <Segmented<'catalogo' | 'carrito'> block value={vista} onChange={setVista} options={[
            { value: 'catalogo', label: <><ShoppingOutlined /> Catálogo</> },
            { value: 'carrito', label: <Badge count={carrito.length} size="small" offset={[10, -2]}><span><ShoppingCartOutlined /> Carrito</span></Badge>, },
          ]} />
        )}

        <Row gutter={[24, 16]}>
          {(ancho || vista === 'catalogo') && <Col xs={24} md={12}>{catalogo}</Col>}
          {(ancho || vista === 'carrito') && (
            <Col xs={24} md={12}>
              {ancho && <Flex gap={8} align="center" style={{ marginBottom: 8 }}><ShoppingCartOutlined /> <Text strong>Carrito</Text> <Tag style={{ margin: 0 }}>{carrito.length}</Tag></Flex>}
              {panelCarrito}
            </Col>
          )}
        </Row>

        {error && <Alert type="error" showIcon title={error} />}
      </Flex>
    </Modal>
  )
}
