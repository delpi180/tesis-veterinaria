import { useState } from 'react'
import { Package, AlertTriangle, DollarSign, Search } from 'lucide-react'

const PRODUCTOS = [
  {
    id: 1, nombre: 'Antiparasitario Frontline Plus',
    categoria: 'Medicamentos', stock: 45, precio: 280,
    unidad: 'Pipeta', proveedor: 'MedVet S.A.',
  },
  {
    id: 2, nombre: 'Vacuna Antirrábica Nobivac',
    categoria: 'Vacunas', stock: 12, precio: 450,
    unidad: 'Dosis', proveedor: 'BioLab S.A.',
  },
  {
    id: 3, nombre: 'Alimento Premium Royal Canin 3 kg',
    categoria: 'Alimentos', stock: 3, precio: 650,
    unidad: 'Bolsa', proveedor: 'Distribuidora Pet',
  },
  {
    id: 4, nombre: 'Collar Antipulgas Seresto',
    categoria: 'Accesorios', stock: 28, precio: 380,
    unidad: 'Unidad', proveedor: 'PetWorld MX',
  },
  {
    id: 5, nombre: 'Amoxicilina 250 mg x 20 cáps.',
    categoria: 'Medicamentos', stock: 2, precio: 120,
    unidad: 'Caja', proveedor: 'FarmaVet',
  },
  {
    id: 6, nombre: 'Shampoo Dermatológico Neutro',
    categoria: 'Higiene', stock: 18, precio: 210,
    unidad: 'Frasco', proveedor: 'DermaVet',
  },
  {
    id: 7, nombre: 'Vacuna Quíntuple Canina',
    categoria: 'Vacunas', stock: 8, precio: 520,
    unidad: 'Dosis', proveedor: 'BioLab S.A.',
  },
]

const STOCK_MIN = 5

const estadoPill = (stock) =>
  stock <= STOCK_MIN
    ? 'bg-red-100 text-red-700'
    : 'bg-emerald-100 text-emerald-700'

const estadoLabel = (stock) => stock <= STOCK_MIN ? 'Bajo stock' : 'En stock'

const CAT_COLORS = {
  'Medicamentos': 'bg-purple-100 text-purple-700',
  'Vacunas':      'bg-sky-100 text-sky-700',
  'Alimentos':    'bg-amber-100 text-amber-700',
  'Accesorios':   'bg-slate-100 text-slate-600',
  'Higiene':      'bg-teal-100 text-teal-700',
}

export default function Inventario() {
  const [busqueda, setBusqueda] = useState('')

  const filtrados = PRODUCTOS.filter(p =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.categoria.toLowerCase().includes(busqueda.toLowerCase())
  )

  const totalProductos = PRODUCTOS.length
  const bajoStock      = PRODUCTOS.filter(p => p.stock <= STOCK_MIN).length
  const valorTotal     = PRODUCTOS.reduce((s, p) => s + p.stock * p.precio, 0)

  const today = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Inventario y Productos</h1>
          <p className="text-xs text-slate-400 mt-0.5 capitalize">{today}</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-purple-700 hover:bg-purple-600 text-white text-sm font-semibold rounded-lg shadow transition">
          + Nuevo Producto
        </button>
      </header>

      <main className="flex-1 px-6 py-6 flex flex-col gap-5 max-w-5xl w-full mx-auto">

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
              <p className="text-2xl font-bold text-slate-800">
                ${valorTotal.toLocaleString('es-MX')}
              </p>
            </div>
          </div>
        </div>

        {/* Tabla de productos */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-purple-500" />
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                Catálogo
              </h2>
              <span className="text-xs bg-purple-100 text-purple-700 font-semibold px-2 py-0.5 rounded-full">
                {filtrados.length}
              </span>
            </div>
            {/* Búsqueda */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar producto…"
                className="text-xs pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white w-48"
              />
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100">
                <th className="text-left px-5 py-3 font-semibold">Producto</th>
                <th className="text-left px-5 py-3 font-semibold">Categoría</th>
                <th className="text-center px-5 py-3 font-semibold">Stock</th>
                <th className="text-right px-5 py-3 font-semibold">Precio</th>
                <th className="text-left px-5 py-3 font-semibold">Proveedor</th>
                <th className="text-center px-5 py-3 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p, i) => (
                <tr key={p.id} className={`border-b border-slate-50 hover:bg-slate-50/60 transition ${i % 2 ? 'bg-slate-50/30' : ''}`}>
                  <td className="px-5 py-3.5">
                    <p className="font-semibold text-slate-800">{p.nombre}</p>
                    <p className="text-xs text-slate-400">{p.unidad}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${CAT_COLORS[p.categoria] ?? 'bg-slate-100 text-slate-600'}`}>
                      {p.categoria}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={`font-bold text-sm ${p.stock <= STOCK_MIN ? 'text-red-600' : 'text-slate-700'}`}>
                      {p.stock}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right font-semibold text-slate-700">
                    ${p.precio.toLocaleString('es-MX')}
                  </td>
                  <td className="px-5 py-3.5 text-slate-500 text-xs">{p.proveedor}</td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full ${estadoPill(p.stock)}`}>
                      {p.stock <= STOCK_MIN && <AlertTriangle className="w-3 h-3" />}
                      {estadoLabel(p.stock)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtrados.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Package className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">No se encontraron productos</p>
            </div>
          )}
        </section>

      </main>
    </div>
  )
}
