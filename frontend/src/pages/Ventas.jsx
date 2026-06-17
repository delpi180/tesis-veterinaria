import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  TrendingUp, ShoppingCart, Package, CreditCard,
  Receipt, Plus, Minus, Trash2, X, FileText, Search, Stethoscope, Tag,
} from 'lucide-react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { api } from '../services/api'

const fmtMoneda = (n) => `S/ ${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtFecha = (iso) =>
  new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
const fmtHora = (iso) =>
  new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

const nroBoleta = (id) => `B-${String(id).padStart(6, '0')}`

const METODOS_PAGO = [
  { v: 'efectivo', l: 'Efectivo' },
  { v: 'tarjeta',  l: 'Tarjeta'  },
  { v: 'yape',     l: 'Yape'     },
  { v: 'plin',     l: 'Plin'     },
]
const metodoLabel = (m) => METODOS_PAGO.find(x => x.v === m)?.l ?? m

const CAT_LABEL = { comida: 'Comida', accesorio: 'Accesorio', medicamento: 'Medicamento' }
const CATEGORIAS = ['comida', 'accesorio', 'medicamento']

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white'
const labelCls = 'text-xs font-semibold text-slate-600'

const Spinner = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 animate-spin text-purple-500">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
)

const mismoMes = (iso, ref) => {
  const d = new Date(iso)
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth()
}

// ── Reporte de ventas por rango (PDF) ─────────────────────────────────────────
function reporteVentasPDF(ventas, rango, clienteMap) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210
  const morado = [88, 28, 135]

  doc.setFillColor(...morado)
  doc.rect(0, 0, W, 24, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(15); doc.setFont(undefined, 'bold')
  doc.text('Veterinaria Los Pinos', 14, 11)
  doc.setFontSize(9); doc.setFont(undefined, 'normal')
  const periodo = rango.desde || rango.hasta
    ? `Período: ${rango.desde || 'inicio'} al ${rango.hasta || 'hoy'}`
    : 'Todas las ventas registradas'
  doc.text(`Reporte de Ventas — ${periodo}`, 14, 18)

  const totalGeneral = ventas.reduce((s, v) => s + Number(v.total), 0)
  const totalItems   = ventas.reduce((s, v) => s + v.items.reduce((si, it) => si + it.cantidad, 0), 0)

  autoTable(doc, {
    startY: 30,
    head: [['Ventas', 'Ítems vendidos', 'Ingreso total', 'Ticket promedio']],
    body: [[
      ventas.length,
      totalItems,
      fmtMoneda(totalGeneral),
      ventas.length ? fmtMoneda(totalGeneral / ventas.length) : fmtMoneda(0),
    ]],
    headStyles: { fillColor: morado, fontSize: 9, halign: 'center' },
    styles: { fontSize: 10, halign: 'center' },
    margin: { left: 14, right: 14 },
  })

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 5,
    head: [['Boleta', 'Fecha', 'Cliente', 'Detalle', 'Total']],
    body: ventas.map(v => [
      nroBoleta(v.id),
      `${fmtFecha(v.fecha)} ${fmtHora(v.fecha)}`,
      clienteMap[v.cliente_id]?.nombre ?? `Cliente #${v.cliente_id}`,
      v.items.map(it => `${it.descripcion} ×${it.cantidad}`).join(', '),
      fmtMoneda(v.total),
    ]),
    headStyles: { fillColor: morado, fontSize: 8.5 },
    columnStyles: {
      0: { cellWidth: 22 }, 1: { cellWidth: 30 }, 2: { cellWidth: 35 },
      4: { cellWidth: 24, halign: 'right' },
    },
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
    margin: { left: 14, right: 14 },
  })

  const sufijo = rango.desde || rango.hasta ? `_${rango.desde || 'inicio'}_${rango.hasta || 'hoy'}` : ''
  doc.save(`ReporteVentas${sufijo}.pdf`)
}

// ── Boleta PDF ────────────────────────────────────────────────────────────────
function generarBoleta(venta, cliente) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210
  const morado = [88, 28, 135]

  doc.setFillColor(...morado)
  doc.rect(0, 0, W, 28, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16); doc.setFont(undefined, 'bold')
  doc.text('Veterinaria Los Pinos', 14, 13)
  doc.setFontSize(9); doc.setFont(undefined, 'normal')
  doc.text('Boleta de Venta', 14, 20)

  doc.setDrawColor(...morado); doc.setLineWidth(0.4)
  doc.roundedRect(W - 70, 6, 56, 16, 2, 2)
  doc.setTextColor(...morado)
  doc.setFontSize(8); doc.setFont(undefined, 'bold')
  doc.text('BOLETA N°', W - 66, 12)
  doc.setFontSize(13)
  doc.text(nroBoleta(venta.id), W - 66, 19)

  doc.setTextColor(60, 60, 60)
  doc.setFontSize(9); doc.setFont(undefined, 'normal')
  const fecha = new Date(venta.fecha)
  let y = 40
  doc.setFont(undefined, 'bold'); doc.text('Cliente:', 14, y)
  doc.setFont(undefined, 'normal'); doc.text(cliente?.nombre ?? `Cliente #${venta.cliente_id}`, 36, y)
  doc.setFont(undefined, 'bold'); doc.text('Fecha:', W - 70, y)
  doc.setFont(undefined, 'normal')
  doc.text(`${fecha.toLocaleDateString('es-MX')} ${fmtHora(venta.fecha)}`, W - 56, y)
  y += 6
  if (venta.metodo_pago) {
    doc.setFont(undefined, 'bold'); doc.text('Pago:', W - 70, y)
    doc.setFont(undefined, 'normal'); doc.text(metodoLabel(venta.metodo_pago), W - 56, y)
  }
  if (cliente?.dni) {
    doc.setFont(undefined, 'bold'); doc.text('DNI:', 14, y)
    doc.setFont(undefined, 'normal'); doc.text(String(cliente.dni), 36, y)
  }
  if (cliente?.telefono) {
    doc.setFont(undefined, 'bold'); doc.text('Teléfono:', W - 70, y)
    doc.setFont(undefined, 'normal'); doc.text(String(cliente.telefono), W - 50, y)
  }

  autoTable(doc, {
    startY: y + 6,
    head: [['#', 'Descripción', 'Tipo', 'Cant.', 'P. Unit.', 'Subtotal']],
    body: venta.items.map((it, i) => [
      i + 1,
      it.descripcion,
      it.tipo === 'servicio' ? 'Servicio' : 'Producto',
      it.cantidad,
      fmtMoneda(it.precio_unitario),
      fmtMoneda(it.subtotal),
    ]),
    headStyles: { fillColor: morado, fontSize: 9, halign: 'center' },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      2: { cellWidth: 22, halign: 'center' },
      3: { cellWidth: 16, halign: 'center' },
      4: { cellWidth: 28, halign: 'right' },
      5: { cellWidth: 28, halign: 'right' },
    },
    styles: { fontSize: 9, cellPadding: 2.5 },
    margin: { left: 14, right: 14 },
  })

  const finY = doc.lastAutoTable.finalY + 4
  doc.setFillColor(243, 240, 250)
  doc.roundedRect(W - 84, finY, 70, 12, 2, 2, 'F')
  doc.setTextColor(...morado)
  doc.setFontSize(11); doc.setFont(undefined, 'bold')
  doc.text('TOTAL:', W - 80, finY + 8)
  doc.text(fmtMoneda(venta.total), W - 18, finY + 8, { align: 'right' })

  doc.setTextColor(150, 150, 150)
  doc.setFontSize(8); doc.setFont(undefined, 'normal')
  doc.text('Gracias por su preferencia — Veterinaria Los Pinos', W / 2, 285, { align: 'center' })

  doc.save(`Boleta_${nroBoleta(venta.id)}.pdf`)
}

export default function Ventas() {
  const { state } = useLocation()
  const navigate  = useNavigate()
  const [ventas,    setVentas]    = useState([])
  const [clientes,  setClientes]  = useState([])
  const [productos, setProductos] = useState([])
  const [servicios, setServicios] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)

  // ── Modal nueva venta (POS) ────────────────────────────────────────────────
  const [modalAbierto, setModalAbierto] = useState(false)
  const [clienteId,    setClienteId]    = useState('')
  const [metodoPago,   setMetodoPago]   = useState('efectivo')
  const [carrito,      setCarrito]      = useState([])  // [{ tipo, id, nombre, precio, cantidad, precio_variable, stock }]
  const [tab,          setTab]          = useState('producto')  // 'producto' | 'servicio'
  const [catBusqueda,  setCatBusqueda]  = useState('')
  const [catCategoria, setCatCategoria] = useState('')
  const [guardando,    setGuardando]    = useState(false)
  const [errorModal,   setErrorModal]   = useState(null)

  const cargar = async () => {
    setLoading(true); setError(null)
    try {
      const [ventasData, clientesData, productosData, serviciosData] = await Promise.all([
        api.get('/api/ventas/'),
        api.get('/api/clientes/'),
        api.get('/api/productos/'),  // solo activos
        api.get('/api/servicios/'),  // solo activos
      ])
      setVentas(Array.isArray(ventasData) ? ventasData : [])
      setClientes(Array.isArray(clientesData) ? clientesData : [])
      setProductos(Array.isArray(productosData) ? productosData : [])
      setServicios(Array.isArray(serviciosData) ? serviciosData : [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [])

  // ── Reporte por rango de fechas ────────────────────────────────────────────
  const [rango, setRango] = useState({ desde: '', hasta: '' })

  useEffect(() => {
    if (!rango.desde && !rango.hasta) return
    const params = new URLSearchParams({ limit: '500' })
    if (rango.desde) params.set('desde', rango.desde)
    if (rango.hasta) params.set('hasta', rango.hasta)
    api.get(`/api/ventas/?${params}`)
      .then(v => setVentas(Array.isArray(v) ? v : []))
      .catch(e => setError(e.message))
  }, [rango])

  const limpiarRango = async () => {
    setRango({ desde: '', hasta: '' })
    try {
      const v = await api.get('/api/ventas/')
      setVentas(Array.isArray(v) ? v : [])
    } catch { /* mantener lista actual */ }
  }

  // Cobro integrado: si llegamos desde el panel de la mascota, abrir el POS
  // con el cliente ya seleccionado.
  useEffect(() => {
    if (state?.abrirVenta) {
      setClienteId(state.clienteId ? String(state.clienteId) : '')
      setCarrito([]); setTab('servicio'); setCatBusqueda(''); setCatCategoria('')
      setErrorModal(null)
      setModalAbierto(true)
      navigate('.', { replace: true, state: null })  // limpia el state para no reabrir
    }
  }, [state])

  const clienteMap = Object.fromEntries(clientes.map(c => [c.id, c]))

  // ── KPIs del mes actual ─────────────────────────────────────────────────────
  const ahora = new Date()
  const ventasMes = ventas.filter(v => mismoMes(v.fecha, ahora))
  const ingresosMes = ventasMes.reduce((s, v) => s + Number(v.total), 0)
  const unidadesMes = ventasMes.reduce(
    (s, v) => s + v.items.reduce((si, it) => si + it.cantidad, 0), 0)
  const ticketPromedio = ventasMes.length ? ingresosMes / ventasMes.length : 0

  // Top ítems del mes por monto (productos y servicios)
  const acum = {}
  ventasMes.forEach(v => v.items.forEach(it => {
    const key = `${it.tipo}:${it.descripcion}`
    const cur = acum[key] ?? { nombre: it.descripcion, tipo: it.tipo, cantidad: 0, monto: 0 }
    cur.cantidad += it.cantidad
    cur.monto    += it.subtotal
    acum[key] = cur
  }))
  const topItems = Object.values(acum).sort((a, b) => b.monto - a.monto).slice(0, 5)
  const maxMonto = topItems.length ? topItems[0].monto : 1

  const today = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
  const mesLabel = ahora.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })

  const STATS = [
    { label: 'Ingresos del mes', value: fmtMoneda(ingresosMes), Icon: TrendingUp, bg: 'bg-emerald-50', border: 'border-emerald-200', icon: 'text-emerald-600' },
    { label: 'Ventas del mes', value: String(ventasMes.length), Icon: ShoppingCart, bg: 'bg-purple-50', border: 'border-purple-200', icon: 'text-purple-600' },
    { label: 'Ítems vendidos', value: String(unidadesMes), Icon: Package, bg: 'bg-amber-50', border: 'border-amber-200', icon: 'text-amber-600' },
    { label: 'Ticket promedio', value: fmtMoneda(ticketPromedio), Icon: CreditCard, bg: 'bg-sky-50', border: 'border-sky-200', icon: 'text-sky-600' },
  ]

  // ── Carrito (POS) ──────────────────────────────────────────────────────────
  const abrirModal = () => {
    setClienteId(''); setMetodoPago('efectivo'); setCarrito([]); setTab('producto')
    setCatBusqueda(''); setCatCategoria(''); setErrorModal(null)
    setModalAbierto(true)
  }
  const cerrarModal = () => { setModalAbierto(false); setErrorModal(null) }

  const lineaKey = (tipo, id) => `${tipo}-${id}`

  const agregarProducto = (p) => {
    if (p.stock <= 0) return
    setCarrito(c => {
      const k = lineaKey('producto', p.id)
      const ex = c.find(l => l.key === k)
      if (ex) {
        if (ex.cantidad >= p.stock) return c   // no superar stock
        return c.map(l => l.key === k ? { ...l, cantidad: l.cantidad + 1 } : l)
      }
      return [...c, { key: k, tipo: 'producto', id: p.id, nombre: p.nombre, precio: Number(p.precio), cantidad: 1, precio_variable: false, stock: p.stock }]
    })
  }

  const agregarServicio = (s) => {
    setCarrito(c => {
      const k = lineaKey('servicio', s.id)
      const ex = c.find(l => l.key === k)
      if (ex) return c.map(l => l.key === k ? { ...l, cantidad: l.cantidad + 1 } : l)
      return [...c, {
        key: k, tipo: 'servicio', id: s.id, nombre: s.nombre,
        precio: s.precio_variable ? '' : Number(s.precio),
        cantidad: 1, precio_variable: s.precio_variable, stock: null,
      }]
    })
  }

  const cambiarCantidad = (key, delta) => setCarrito(c => c.map(l => {
    if (l.key !== key) return l
    let nueva = l.cantidad + delta
    if (nueva < 1) nueva = 1
    if (l.tipo === 'producto' && l.stock != null && nueva > l.stock) nueva = l.stock
    return { ...l, cantidad: nueva }
  }))
  const cambiarPrecio = (key, valor) => setCarrito(c => c.map(l =>
    l.key === key ? { ...l, precio: valor } : l))
  const quitarLinea = (key) => setCarrito(c => c.filter(l => l.key !== key))

  const totalCarrito = carrito.reduce((s, l) => s + (Number(l.precio) || 0) * l.cantidad, 0)

  // Catálogo filtrado para el panel izquierdo
  const term = catBusqueda.trim().toLowerCase()
  const productosFiltrados = productos.filter(p => {
    if (term && !p.nombre.toLowerCase().includes(term) && !(p.codigo ?? '').toLowerCase().includes(term)) return false
    if (catCategoria && p.categoria !== catCategoria) return false
    return true
  })
  const serviciosFiltrados = servicios.filter(s =>
    !term || s.nombre.toLowerCase().includes(term))

  const handleGuardar = async (e) => {
    e.preventDefault()
    if (!clienteId) { setErrorModal('Selecciona un cliente.'); return }
    if (carrito.length === 0) { setErrorModal('Agrega al menos un producto o servicio.'); return }
    const variableSinMonto = carrito.find(l => l.precio_variable && !(Number(l.precio) > 0))
    if (variableSinMonto) { setErrorModal(`Ingresa el monto para "${variableSinMonto.nombre}".`); return }

    setGuardando(true); setErrorModal(null)
    try {
      const venta = await api.post('/api/ventas/', {
        cliente_id:  parseInt(clienteId, 10),
        metodo_pago: metodoPago,
        items: carrito.map(l => l.tipo === 'producto'
          ? { producto_id: l.id, cantidad: l.cantidad }
          : { servicio_id: l.id, cantidad: l.cantidad, ...(l.precio_variable ? { precio: Number(l.precio) } : {}) }
        ),
      })
      cerrarModal()
      if (venta) generarBoleta(venta, clienteMap[venta.cliente_id])
      await cargar()
    } catch (err) {
      setErrorModal(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Ventas y Reportes</h1>
          <p className="text-xs text-slate-400 mt-0.5 capitalize">{today}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-purple-100 text-purple-700 font-semibold px-3 py-1.5 rounded-lg border border-purple-200 capitalize">
            {mesLabel}
          </span>
          <button
            onClick={abrirModal}
            className="flex items-center gap-2 px-4 py-2 bg-purple-700 hover:bg-purple-600 text-white text-sm font-semibold rounded-lg shadow transition"
          >
            <Plus className="w-4 h-4" /> Nueva Venta
          </button>
        </div>
      </header>

      <main className="flex-1 px-6 py-6 flex flex-col gap-6 max-w-5xl w-full mx-auto">

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">
            ⚠ No se pudo conectar con el servidor: {error}
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {STATS.map(({ label, value, Icon, bg, border, icon }) => (
            <div key={label} className={`${bg} border ${border} rounded-xl px-5 py-4 flex flex-col gap-2 shadow-sm`}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-500">{label}</p>
                <Icon className={`w-4 h-4 ${icon}`} />
              </div>
              <p className="text-2xl font-bold text-slate-800">{value}</p>
            </div>
          ))}
        </div>

        {/* Top ítems del mes */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Más vendidos — <span className="capitalize">{mesLabel}</span></h3>
          {topItems.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">Sin ventas registradas este mes</p>
          ) : (
            <div className="flex flex-col gap-3.5">
              {topItems.map(({ nombre, tipo, cantidad, monto }) => (
                <div key={`${tipo}:${nombre}`}>
                  <div className="flex justify-between items-center mb-1">
                    <p className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                      {tipo === 'servicio'
                        ? <Stethoscope className="w-3 h-3 text-sky-500" />
                        : <Package className="w-3 h-3 text-amber-500" />}
                      {nombre}
                    </p>
                    <p className="text-xs font-bold text-slate-600">{fmtMoneda(monto)}</p>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full transition-all ${tipo === 'servicio' ? 'bg-sky-500' : 'bg-purple-500'}`}
                      style={{ width: `${Math.round((monto / maxMonto) * 100)}%` }} />
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{cantidad} {tipo === 'servicio' ? 'atenciones' : 'unidades'}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Historial */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2 flex-wrap">
            <Receipt className="w-4 h-4 text-purple-500" />
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Historial de Ventas</h2>
            <span className="text-xs bg-purple-100 text-purple-700 font-semibold px-2 py-0.5 rounded-full">
              {ventas.length}
            </span>

            {/* Filtro por rango de fechas + reporte */}
            <div className="ml-auto flex items-center gap-2 flex-wrap">
              <label className="text-xs text-slate-400">Del</label>
              <input
                type="date" value={rango.desde}
                onChange={e => setRango(r => ({ ...r, desde: e.target.value }))}
                className="text-xs px-2 py-1 border border-slate-200 rounded-lg bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-300"
              />
              <label className="text-xs text-slate-400">al</label>
              <input
                type="date" value={rango.hasta}
                onChange={e => setRango(r => ({ ...r, hasta: e.target.value }))}
                className="text-xs px-2 py-1 border border-slate-200 rounded-lg bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-300"
              />
              {(rango.desde || rango.hasta) && (
                <button onClick={limpiarRango}
                  className="text-xs text-purple-600 hover:text-purple-800 font-medium">
                  Limpiar
                </button>
              )}
              <button
                onClick={() => reporteVentasPDF(ventas, rango, clienteMap)}
                disabled={ventas.length === 0}
                className="flex items-center gap-1 text-xs font-semibold text-purple-700 border border-purple-200 rounded-lg px-2.5 py-1 hover:bg-purple-50 transition disabled:opacity-40"
              >
                <FileText className="w-3.5 h-3.5" /> Reporte PDF
              </button>
            </div>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
              <Spinner /> <span className="text-sm">Cargando ventas…</span>
            </div>
          )}

          {!loading && !error && ventas.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Receipt className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm font-medium">Aún no hay ventas registradas</p>
              <p className="text-xs mt-1">Usa el botón "Nueva Venta" para comenzar</p>
            </div>
          )}

          {!loading && ventas.length > 0 && (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100">
                  <th className="text-left px-5 py-3 font-semibold">Boleta</th>
                  <th className="text-left px-5 py-3 font-semibold">Fecha</th>
                  <th className="text-left px-5 py-3 font-semibold">Cliente</th>
                  <th className="text-left px-5 py-3 font-semibold">Detalle</th>
                  <th className="text-center px-5 py-3 font-semibold">Pago</th>
                  <th className="text-right px-5 py-3 font-semibold">Total</th>
                  <th className="text-center px-5 py-3 font-semibold">Boleta</th>
                </tr>
              </thead>
              <tbody>
                {ventas.map((v, i) => (
                  <tr key={v.id} className={`border-b border-slate-50 hover:bg-slate-50/60 transition ${i % 2 ? 'bg-slate-50/30' : ''}`}>
                    <td className="px-5 py-3.5">
                      <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{nroBoleta(v.id)}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-xs font-medium text-slate-700">{fmtFecha(v.fecha)}</p>
                      <p className="text-xs text-slate-400">{fmtHora(v.fecha)}</p>
                    </td>
                    <td className="px-5 py-3.5 font-medium text-slate-800">
                      {clienteMap[v.cliente_id]?.nombre ?? `Cliente #${v.cliente_id}`}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 text-xs">
                      {v.items.map(it => `${it.descripcion} ×${it.cantidad}`).join(', ')}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full capitalize">
                        {metodoLabel(v.metodo_pago)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-bold text-slate-800">{fmtMoneda(v.total)}</td>
                    <td className="px-5 py-3.5 text-center">
                      <button
                        onClick={() => generarBoleta(v, clienteMap[v.cliente_id])}
                        title="Generar boleta PDF"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700 border border-purple-200 rounded-lg px-2.5 py-1 hover:bg-purple-50 transition"
                      >
                        <FileText className="w-3.5 h-3.5" /> PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </section>

      </main>

      {/* ── Modal POS: Nueva Venta ────────────────────────────────────────────── */}
      {modalAbierto && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) cerrarModal() }}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[92vh] flex flex-col">
            {/* Cabecera */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
              <p className="text-sm font-bold text-slate-800 whitespace-nowrap">Nueva Venta</p>
              <div className="flex-1 max-w-xs">
                <select className={inputCls} value={clienteId} onChange={e => setClienteId(e.target.value)}>
                  <option value="">— Seleccionar cliente * —</option>
                  {clientes.map(c => (
                    <option key={c.id} value={c.id}>{c.nombre}{c.dni ? ` (${c.dni})` : ''}</option>
                  ))}
                </select>
              </div>
              <button onClick={cerrarModal} className="p-1 rounded-lg hover:bg-slate-100 transition text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Cuerpo: catálogo (izq) + carrito (der) */}
            <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 divide-x divide-slate-100">

              {/* ── Catálogo ─────────────────────────────────────────────── */}
              <div className="flex flex-col min-h-0">
                {/* Tabs */}
                <div className="px-4 pt-3 flex gap-2">
                  <button
                    onClick={() => { setTab('producto'); setCatBusqueda('') }}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition ${tab === 'producto' ? 'bg-purple-100 text-purple-700' : 'text-slate-500 hover:bg-slate-100'}`}
                  >
                    <Package className="w-3.5 h-3.5" /> Productos
                  </button>
                  <button
                    onClick={() => { setTab('servicio'); setCatBusqueda('') }}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition ${tab === 'servicio' ? 'bg-sky-100 text-sky-700' : 'text-slate-500 hover:bg-slate-100'}`}
                  >
                    <Stethoscope className="w-3.5 h-3.5" /> Servicios
                  </button>
                </div>

                {/* Buscador + filtro */}
                <div className="px-4 py-3 flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="text" value={catBusqueda} onChange={e => setCatBusqueda(e.target.value)}
                      placeholder={tab === 'producto' ? 'Buscar producto o código…' : 'Buscar servicio…'}
                      className="text-xs pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white w-full"
                    />
                  </div>
                  {tab === 'producto' && (
                    <select
                      value={catCategoria} onChange={e => setCatCategoria(e.target.value)}
                      className="text-xs px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white text-slate-600"
                    >
                      <option value="">Todas</option>
                      {CATEGORIAS.map(c => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
                    </select>
                  )}
                </div>

                {/* Lista clicable */}
                <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-1.5 min-h-[240px]">
                  {tab === 'producto' && productosFiltrados.map(p => {
                    const enCarrito = carrito.find(l => l.key === lineaKey('producto', p.id))
                    const agotado = p.stock <= 0
                    const tope = enCarrito && enCarrito.cantidad >= p.stock
                    return (
                      <button
                        key={p.id} type="button" onClick={() => agregarProducto(p)} disabled={agotado || tope}
                        className="text-left border border-slate-200 rounded-lg px-3 py-2 hover:border-purple-300 hover:bg-purple-50/40 transition flex items-center justify-between gap-2 disabled:opacity-40 disabled:hover:bg-white disabled:cursor-not-allowed"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{p.nombre}</p>
                          <p className="text-xs text-slate-400 flex items-center gap-1.5">
                            <span className="font-mono">{p.codigo}</span>
                            <span className={`${p.stock_bajo ? 'text-red-500' : 'text-slate-400'}`}>· stock {p.stock}</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-semibold text-slate-700">{fmtMoneda(p.precio)}</span>
                          <Plus className="w-4 h-4 text-purple-500" />
                        </div>
                      </button>
                    )
                  })}

                  {tab === 'producto' && productosFiltrados.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-8">Sin productos que coincidan</p>
                  )}

                  {tab === 'servicio' && serviciosFiltrados.map(s => (
                    <button
                      key={s.id} type="button" onClick={() => agregarServicio(s)}
                      className="text-left border border-slate-200 rounded-lg px-3 py-2 hover:border-sky-300 hover:bg-sky-50/40 transition flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{s.nombre}</p>
                        {s.descripcion && <p className="text-xs text-slate-400 truncate">{s.descripcion}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-semibold text-slate-700">
                          {s.precio_variable ? <span className="text-xs text-sky-600 inline-flex items-center gap-1"><Tag className="w-3 h-3" /> Monto variable</span> : fmtMoneda(s.precio)}
                        </span>
                        <Plus className="w-4 h-4 text-sky-500" />
                      </div>
                    </button>
                  ))}

                  {tab === 'servicio' && serviciosFiltrados.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-8">Sin servicios que coincidan</p>
                  )}
                </div>
              </div>

              {/* ── Carrito ──────────────────────────────────────────────── */}
              <div className="flex flex-col min-h-0">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-purple-500" />
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Carrito</span>
                  <span className="text-xs bg-purple-100 text-purple-700 font-semibold px-2 py-0.5 rounded-full">{carrito.length}</span>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2 min-h-[200px]">
                  {carrito.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-2 py-10">
                      <ShoppingCart className="w-8 h-8" />
                      <p className="text-xs text-slate-400">Agrega productos o servicios desde la izquierda</p>
                    </div>
                  )}
                  {carrito.map(l => (
                    <div key={l.key} className="border border-slate-200 rounded-lg px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{l.nombre}</p>
                          <span className={`text-xs font-semibold ${l.tipo === 'servicio' ? 'text-sky-600' : 'text-amber-600'}`}>
                            {l.tipo === 'servicio' ? 'Servicio' : 'Producto'}
                          </span>
                        </div>
                        <button type="button" onClick={() => quitarLinea(l.key)}
                          className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition shrink-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-2">
                        {/* Stepper cantidad */}
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => cambiarCantidad(l.key, -1)}
                            className="w-6 h-6 rounded border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100">
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-7 text-center text-sm font-semibold text-slate-700">{l.cantidad}</span>
                          <button type="button" onClick={() => cambiarCantidad(l.key, +1)}
                            className="w-6 h-6 rounded border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100">
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        {/* Precio */}
                        {l.precio_variable ? (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-slate-400">$</span>
                            <input
                              type="number" min="0" step="0.01" placeholder="Monto"
                              value={l.precio}
                              onChange={e => cambiarPrecio(l.key, e.target.value)}
                              className="w-20 text-right text-sm border border-sky-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-sky-300"
                            />
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">{fmtMoneda(l.precio)} c/u</span>
                        )}
                        {/* Subtotal */}
                        <span className="w-20 text-right text-sm font-bold text-slate-700">
                          {fmtMoneda((Number(l.precio) || 0) * l.cantidad)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pie del carrito */}
                <div className="px-4 py-3 border-t border-slate-100">
                  {errorModal && (
                    <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg mb-3">{errorModal}</p>
                  )}
                  {/* Método de pago */}
                  <div className="mb-3">
                    <p className="text-xs font-semibold text-slate-500 mb-1.5">Método de pago</p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {METODOS_PAGO.map(({ v, l }) => (
                        <button
                          key={v} type="button" onClick={() => setMetodoPago(v)}
                          className={`text-xs font-semibold py-1.5 rounded-lg border transition ${
                            metodoPago === v
                              ? 'bg-purple-700 text-white border-purple-700'
                              : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-slate-500">Total</span>
                    <span className="text-xl font-bold text-slate-800">{fmtMoneda(totalCarrito)}</span>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={cerrarModal}
                      className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition">
                      Cancelar
                    </button>
                    <button type="button" onClick={handleGuardar} disabled={guardando}
                      className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-purple-700 rounded-lg hover:bg-purple-800 transition disabled:opacity-50 flex items-center justify-center gap-2">
                      <FileText className="w-4 h-4" />
                      {guardando ? 'Registrando…' : 'Registrar y Generar Boleta'}
                    </button>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  )
}
