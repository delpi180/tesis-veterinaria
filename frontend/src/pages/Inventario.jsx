import { useState, useEffect } from 'react'
import { Package, AlertTriangle, DollarSign, Search, Pencil, Trash2, X, Filter, History, ArrowDownUp } from 'lucide-react'
import { api } from '../services/api'
import { useToast } from '../components/Toast'

// Categorías admitidas por el backend (schemas.ProductoCreate)
const CATEGORIAS = ['comida', 'accesorio', 'medicamento']

const CAT_LABEL = {
  comida:      'Comida',
  accesorio:   'Accesorio',
  medicamento: 'Medicamento',
}

const CAT_COLORS = {
  comida:      'bg-amber-100 text-amber-700',
  accesorio:   'bg-slate-100 text-slate-600',
  medicamento: 'bg-purple-100 text-purple-700',
}

const FORM_INICIAL = {
  nombre:       '',
  descripcion:  '',
  categoria:    'comida',
  proveedor:    '',
  unidad:       '',
  precio:       '',
  stock:        '',
  stock_minimo: '5',
  activo:       true,
}

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white'
const labelCls = 'text-xs font-semibold text-slate-600'

const fmtMoneda = (n) => `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const Spinner = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 animate-spin text-purple-500">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
)

// ── Modal de kardex (movimientos + ajuste de stock) ──────────────────────────
function KardexModal({ producto, onClose, onStockCambiado }) {
  const toast = useToast()
  const [movs, setMovs]   = useState([])
  const [cargando, setCargando] = useState(true)
  const [cant, setCant]   = useState('')
  const [motivo, setMotivo] = useState('')
  const [signo, setSigno] = useState(1)   // +1 entrada, -1 salida
  const [guardando, setGuardando] = useState(false)

  const cargar = async () => {
    setCargando(true)
    try {
      setMovs(await api.get(`/api/productos/${producto.id}/movimientos`))
    } catch (e) { toast.error(e.message) } finally { setCargando(false) }
  }
  useEffect(() => { cargar() }, [producto.id])

  const aplicar = async (e) => {
    e.preventDefault()
    const n = parseInt(cant, 10)
    if (!n || n <= 0) { toast.error('Ingresa una cantidad mayor a 0.'); return }
    setGuardando(true)
    try {
      const actualizado = await api.post(`/api/productos/${producto.id}/ajuste-stock`, {
        cantidad: signo * n, motivo: motivo.trim() || null,
      })
      toast.success(`Stock actualizado: ${actualizado.stock}`)
      setCant(''); setMotivo('')
      onStockCambiado(actualizado)
      await cargar()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setGuardando(false)
    }
  }

  const TIPO_PILL = {
    entrada: 'bg-emerald-100 text-emerald-700',
    salida:  'bg-rose-100 text-rose-700',
    ajuste:  'bg-amber-100 text-amber-700',
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <History className="w-4 h-4 text-purple-500" /> Kardex — {producto.nombre}
            </p>
            <p className="text-xs text-slate-400 font-mono">{producto.codigo} · stock actual: {producto.stock}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 transition text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Ajuste rápido */}
        <form onSubmit={aplicar} className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-end gap-2 flex-wrap">
          <div className="flex rounded-lg overflow-hidden border border-slate-200">
            <button type="button" onClick={() => setSigno(1)}
              className={`px-3 py-2 text-xs font-semibold ${signo === 1 ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500'}`}>Entrada</button>
            <button type="button" onClick={() => setSigno(-1)}
              className={`px-3 py-2 text-xs font-semibold ${signo === -1 ? 'bg-rose-600 text-white' : 'bg-white text-slate-500'}`}>Salida</button>
          </div>
          <input type="number" min="1" value={cant} onChange={e => setCant(e.target.value)} placeholder="Cant."
            className="w-20 text-sm border border-slate-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-purple-300" />
          <input type="text" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo (ej. compra, merma)"
            className="flex-1 min-w-[140px] text-sm border border-slate-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-purple-300" />
          <button type="submit" disabled={guardando}
            className="px-4 py-2 text-sm font-semibold text-white bg-purple-700 rounded-lg hover:bg-purple-800 transition disabled:opacity-50">
            {guardando ? '…' : 'Aplicar'}
          </button>
        </form>

        {/* Lista de movimientos */}
        <div className="flex-1 overflow-y-auto">
          {cargando ? (
            <p className="text-xs text-slate-400 text-center py-10">Cargando movimientos…</p>
          ) : movs.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-10">Sin movimientos registrados</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100 sticky top-0 bg-white">
                  <th className="text-left px-5 py-2.5 font-semibold">Fecha</th>
                  <th className="text-left px-5 py-2.5 font-semibold">Tipo</th>
                  <th className="text-right px-5 py-2.5 font-semibold">Cant.</th>
                  <th className="text-right px-5 py-2.5 font-semibold">Stock</th>
                  <th className="text-left px-5 py-2.5 font-semibold">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {movs.map(m => (
                  <tr key={m.id} className="border-b border-slate-50">
                    <td className="px-5 py-2.5 text-xs text-slate-500">
                      {new Date(m.fecha).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </td>
                    <td className="px-5 py-2.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${TIPO_PILL[m.tipo] ?? 'bg-slate-100 text-slate-600'}`}>{m.tipo}</span>
                    </td>
                    <td className={`px-5 py-2.5 text-right font-semibold ${m.cantidad >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {m.cantidad >= 0 ? `+${m.cantidad}` : m.cantidad}
                    </td>
                    <td className="px-5 py-2.5 text-right text-slate-700">{m.stock_resultante}</td>
                    <td className="px-5 py-2.5 text-xs text-slate-500">{[m.motivo, m.referencia].filter(Boolean).join(' · ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Inventario() {
  const toast = useToast()
  const [productos, setProductos] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [kardexProd, setKardexProd] = useState(null)

  // ── Filtros ────────────────────────────────────────────────────────────────
  const [busqueda,    setBusqueda]    = useState('')
  const [fCategoria,  setFCategoria]  = useState('')   // '' = todas
  const [fEstado,     setFEstado]     = useState('')   // '' | en_stock | bajo_stock | inactivo

  // ── Modal crear/editar ────────────────────────────────────────────────────
  const [modalAbierto, setModalAbierto] = useState(false)
  const [editId,       setEditId]       = useState(null)
  const [form,         setForm]         = useState(FORM_INICIAL)
  const [guardando,    setGuardando]    = useState(false)
  const [errorModal,   setErrorModal]   = useState(null)

  const cargar = async () => {
    setLoading(true); setError(null)
    try {
      // solo_activos=false → mostramos también los desactivados en el catálogo
      const data = await api.get('/api/productos/?solo_activos=false')
      setProductos(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [])

  // ── Filtrado en memoria ─────────────────────────────────────────────────────
  const term = busqueda.trim().toLowerCase()
  const filtrados = productos.filter(p => {
    if (term &&
        !p.nombre.toLowerCase().includes(term) &&
        !(p.codigo ?? '').toLowerCase().includes(term) &&
        !(p.proveedor ?? '').toLowerCase().includes(term)) return false
    if (fCategoria && p.categoria !== fCategoria) return false
    if (fEstado === 'en_stock'   && (!p.activo || p.stock_bajo)) return false
    if (fEstado === 'bajo_stock' && !(p.activo && p.stock_bajo)) return false
    if (fEstado === 'inactivo'   && p.activo) return false
    return true
  })

  const hayFiltros = term || fCategoria || fEstado
  const limpiarFiltros = () => { setBusqueda(''); setFCategoria(''); setFEstado('') }

  // ── KPIs (datos reales) ────────────────────────────────────────────────────
  const totalProductos = productos.length
  const bajoStock      = productos.filter(p => p.activo && p.stock_bajo).length
  const valorTotal     = productos.reduce((s, p) => s + p.stock * Number(p.precio), 0)

  const today = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  // ── Handlers del modal ──────────────────────────────────────────────────────
  const abrirNuevo = () => {
    setEditId(null)
    setForm(FORM_INICIAL)
    setErrorModal(null)
    setModalAbierto(true)
  }

  const abrirEditar = (p) => {
    setEditId(p.id)
    setForm({
      nombre:       p.nombre,
      descripcion:  p.descripcion ?? '',
      categoria:    p.categoria ?? 'comida',
      proveedor:    p.proveedor ?? '',
      unidad:       p.unidad ?? '',
      precio:       String(p.precio),
      stock:        String(p.stock),
      stock_minimo: String(p.stock_minimo),
      activo:       p.activo,
    })
    setErrorModal(null)
    setModalAbierto(true)
  }

  const cerrarModal = () => {
    setModalAbierto(false)
    setEditId(null)
    setForm(FORM_INICIAL)
    setErrorModal(null)
  }

  const handleGuardar = async (e) => {
    e.preventDefault()
    if (!form.nombre.trim()) { setErrorModal('El nombre es obligatorio.'); return }
    const precio = parseFloat(form.precio)
    if (!(precio > 0)) { setErrorModal('El precio debe ser mayor a 0.'); return }

    const payload = {
      nombre:       form.nombre.trim(),
      descripcion:  form.descripcion.trim() || null,
      categoria:    form.categoria,
      proveedor:    form.proveedor.trim() || null,
      unidad:       form.unidad.trim() || null,
      precio,
      stock:        parseInt(form.stock || '0', 10),
      stock_minimo: parseInt(form.stock_minimo || '0', 10),
      activo:       form.activo,
    }

    setGuardando(true); setErrorModal(null)
    try {
      if (editId) {
        await api.put(`/api/productos/${editId}`, payload)
      } else {
        await api.post('/api/productos/', payload)
      }
      await cargar()
      cerrarModal()
    } catch (err) {
      setErrorModal(err.message)
    } finally {
      setGuardando(false)
    }
  }

  const handleEliminar = async (p) => {
    if (!window.confirm(`¿Eliminar "${p.nombre}" (${p.codigo}) del inventario?`)) return
    try {
      await api.del(`/api/productos/${p.id}`)
      setProductos(prev => prev.filter(x => x.id !== p.id))
      toast.success('Producto eliminado')
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Inventario y Productos</h1>
          <p className="text-xs text-slate-400 mt-0.5 capitalize">{today}</p>
        </div>
        <button
          onClick={abrirNuevo}
          className="flex items-center gap-2 px-4 py-2 bg-purple-700 hover:bg-purple-600 text-white text-sm font-semibold rounded-lg shadow transition"
        >
          + Nuevo Producto
        </button>
      </header>

      <main className="flex-1 px-6 py-6 flex flex-col gap-5 max-w-6xl w-full mx-auto">

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">
            ⚠ No se pudo conectar con el servidor: {error}
          </div>
        )}

        {/* Tarjetas resumen */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex items-center gap-4 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
              <Package className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Total productos</p>
              <p className="text-2xl font-bold text-slate-800">{totalProductos}</p>
            </div>
          </div>
          <div className="bg-white border border-red-200 rounded-xl px-5 py-4 flex items-center gap-4 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Bajo stock</p>
              <p className="text-2xl font-bold text-red-600">{bajoStock}</p>
              <p className="text-xs text-red-400">Requieren reposición</p>
            </div>
          </div>
          <div className="bg-white border border-emerald-200 rounded-xl px-5 py-4 flex items-center gap-4 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Valor en inventario</p>
              <p className="text-2xl font-bold text-slate-800">{fmtMoneda(valorTotal)}</p>
            </div>
          </div>
        </div>

        {/* Barra de filtros */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Filter className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">Filtros</span>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar nombre, código o proveedor…"
              className="text-xs pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white w-64"
            />
          </div>

          <select
            value={fCategoria}
            onChange={e => setFCategoria(e.target.value)}
            className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white text-slate-600"
          >
            <option value="">Todas las categorías</option>
            {CATEGORIAS.map(c => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
          </select>

          <select
            value={fEstado}
            onChange={e => setFEstado(e.target.value)}
            className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white text-slate-600"
          >
            <option value="">Cualquier estado</option>
            <option value="en_stock">En stock</option>
            <option value="bajo_stock">Bajo stock</option>
            <option value="inactivo">Inactivos</option>
          </select>

          {hayFiltros && (
            <button
              onClick={limpiarFiltros}
              className="text-xs text-purple-600 hover:text-purple-800 font-medium ml-auto"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {/* Tabla de productos */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <Package className="w-4 h-4 text-purple-500" />
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
              Catálogo
            </h2>
            <span className="text-xs bg-purple-100 text-purple-700 font-semibold px-2 py-0.5 rounded-full">
              {filtrados.length}{hayFiltros ? ` de ${productos.length}` : ''}
            </span>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
              <Spinner /> <span className="text-sm">Cargando inventario…</span>
            </div>
          )}

          {!loading && !error && productos.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Package className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm font-medium">Aún no hay productos registrados</p>
              <p className="text-xs mt-1">Usa el botón "Nuevo Producto" para comenzar</p>
            </div>
          )}

          {!loading && productos.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100">
                    <th className="text-left px-5 py-3 font-semibold">Código</th>
                    <th className="text-left px-5 py-3 font-semibold">Producto</th>
                    <th className="text-left px-5 py-3 font-semibold">Categoría</th>
                    <th className="text-left px-5 py-3 font-semibold">Proveedor</th>
                    <th className="text-center px-5 py-3 font-semibold">Stock</th>
                    <th className="text-right px-5 py-3 font-semibold">Precio</th>
                    <th className="text-right px-5 py-3 font-semibold">Valor</th>
                    <th className="text-center px-5 py-3 font-semibold">Estado</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((p, i) => (
                    <tr key={p.id} className={`border-b border-slate-50 hover:bg-slate-50/60 transition ${i % 2 ? 'bg-slate-50/30' : ''} ${!p.activo ? 'opacity-50' : ''}`}>
                      <td className="px-5 py-3.5">
                        <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                          {p.codigo ?? '—'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-slate-800">{p.nombre}</p>
                        <p className="text-xs text-slate-400">
                          {[p.unidad, `Mín: ${p.stock_minimo}`].filter(Boolean).join(' · ')}
                        </p>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${CAT_COLORS[p.categoria] ?? 'bg-slate-100 text-slate-600'}`}>
                          {CAT_LABEL[p.categoria] ?? p.categoria ?? '—'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-500 text-xs">{p.proveedor || '—'}</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={`font-bold text-sm ${p.stock_bajo ? 'text-red-600' : 'text-slate-700'}`}>
                          {p.stock}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-semibold text-slate-700">
                        {fmtMoneda(p.precio)}
                      </td>
                      <td className="px-5 py-3.5 text-right text-slate-500 text-xs">
                        {fmtMoneda(p.valor_stock ?? p.stock * Number(p.precio))}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        {!p.activo ? (
                          <span className="inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-500">
                            Inactivo
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full ${p.stock_bajo ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {p.stock_bajo && <AlertTriangle className="w-3 h-3" />}
                            {p.stock_bajo ? 'Bajo stock' : 'En stock'}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setKardexProd(p)}
                            title="Kardex / ajustar stock"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition"
                          >
                            <ArrowDownUp className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => abrirEditar(p)}
                            title="Editar"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleEliminar(p)}
                            title="Eliminar"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && productos.length > 0 && filtrados.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Search className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">Ningún producto coincide con los filtros</p>
              <button onClick={limpiarFiltros} className="text-xs text-purple-600 hover:text-purple-800 font-medium mt-2">
                Limpiar filtros
              </button>
            </div>
          )}
        </section>

      </main>

      {/* ── Modal crear/editar producto ──────────────────────────────────────── */}
      {modalAbierto && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) cerrarModal() }}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <p className="text-sm font-bold text-slate-800">
                {editId ? 'Editar Producto' : 'Nuevo Producto'}
              </p>
              <button onClick={cerrarModal} className="p-1 rounded-lg hover:bg-slate-100 transition text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleGuardar} className="flex flex-col flex-1 min-h-0">
              <div className="px-5 py-4 flex flex-col gap-4 overflow-y-auto">
                {editId && (
                  <p className="text-xs text-slate-400">
                    Código: <span className="font-mono text-slate-600">{productos.find(p => p.id === editId)?.codigo}</span>
                  </p>
                )}

                <div className="flex flex-col gap-1">
                  <label className={labelCls}>Nombre <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    className={inputCls}
                    placeholder="Ej. Alimento Premium 3 kg"
                    value={form.nombre}
                    onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className={labelCls}>Descripción</label>
                  <textarea
                    className={`${inputCls} resize-none`}
                    rows={2}
                    placeholder="Detalle opcional del producto…"
                    value={form.descripcion}
                    onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className={labelCls}>Categoría</label>
                    <select
                      className={inputCls}
                      value={form.categoria}
                      onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                    >
                      {CATEGORIAS.map(c => (
                        <option key={c} value={c}>{CAT_LABEL[c]}</option>
                      ))}
                    </select>
                    {!editId && (
                      <p className="text-xs text-slate-400">El código se genera automáticamente según la categoría.</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className={labelCls}>Unidad de medida</label>
                    <input
                      type="text"
                      className={inputCls}
                      placeholder="Ej. caja, frasco, pipeta"
                      value={form.unidad}
                      onChange={e => setForm(f => ({ ...f, unidad: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className={labelCls}>Proveedor</label>
                  <input
                    type="text"
                    className={inputCls}
                    placeholder="Ej. MedVet S.A."
                    value={form.proveedor}
                    onChange={e => setForm(f => ({ ...f, proveedor: e.target.value }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className={labelCls}>Precio <span className="text-rose-500">*</span></label>
                    <input
                      type="number" min="0" step="0.01"
                      className={inputCls}
                      placeholder="0.00"
                      value={form.precio}
                      onChange={e => setForm(f => ({ ...f, precio: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className={labelCls}>Stock</label>
                    <input
                      type="number" min="0" step="1"
                      className={inputCls}
                      placeholder="0"
                      value={form.stock}
                      onChange={e => setForm(f => ({ ...f, stock: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 items-end">
                  <div className="flex flex-col gap-1">
                    <label className={labelCls}>Stock mínimo</label>
                    <input
                      type="number" min="0" step="1"
                      className={inputCls}
                      placeholder="5"
                      value={form.stock_minimo}
                      onChange={e => setForm(f => ({ ...f, stock_minimo: e.target.value }))}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-700 py-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-300"
                      checked={form.activo}
                      onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))}
                    />
                    Producto activo
                  </label>
                </div>

                {errorModal && (
                  <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">
                    {errorModal}
                  </p>
                )}
              </div>

              <div className="px-5 py-4 border-t border-slate-100 flex gap-3 justify-end">
                <button
                  type="button" onClick={cerrarModal}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit" disabled={guardando}
                  className="px-4 py-2 text-sm font-semibold text-white bg-purple-700 rounded-lg hover:bg-purple-800 transition disabled:opacity-50"
                >
                  {guardando ? 'Guardando…' : editId ? 'Guardar Cambios' : 'Crear Producto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal kardex */}
      {kardexProd && (
        <KardexModal
          producto={kardexProd}
          onClose={() => setKardexProd(null)}
          onStockCambiado={(actualizado) => {
            setProductos(prev => prev.map(x => x.id === actualizado.id ? actualizado : x))
            setKardexProd(actualizado)
          }}
        />
      )}

    </div>
  )
}
