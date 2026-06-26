import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, Calendar,
  Package, Stethoscope, BarChart2, Activity, LogOut, Wallet, UserCog,
  Clock, ClipboardList, History, PieChart, ConciergeBell, Syringe, Menu, X,
} from 'lucide-react'
import { getNombre, getRol, cerrarSesion, esVeterinario, esAdmin } from '../services/api'
import GlobalSearch from './GlobalSearch'

const PawIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
    <path d="M12 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-5 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM5.5 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm13 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM12 10c-3.3 0-6 2.7-6 6 0 2.2 1.8 4 4 4h4c2.2 0 4-1.8 4-4 0-3.3-2.7-6-6-6z"/>
  </svg>
)

// `vet` => solo veterinario · `admin` => solo recepcionista (administradora)
const SECCION_CLINICA = [
  { label: 'Inicio',     to: '/',           Icon: LayoutDashboard, admin: true },
  { label: 'Recepción',  to: '/recepcion',  Icon: ConciergeBell, admin: true },
  { label: 'Mi panel',   to: '/mi-panel',   Icon: ClipboardList, vet: true },
  { label: 'Clientes',   to: '/clientes',   Icon: Users },
  { label: 'Turnos',     to: '/turnos',     Icon: Calendar },
]
const SECCION_ADMIN = [
  { label: 'Inventario',        to: '/inventario', Icon: Package,     admin: true },
  { label: 'Servicios',         to: '/servicios',  Icon: Stethoscope, admin: true },
  { label: 'Ventas',            to: '/ventas',     Icon: BarChart2,   admin: true },
  { label: 'Caja',              to: '/caja',       Icon: Wallet,      admin: true },
  { label: 'Vacunación',        to: '/vacunacion', Icon: Syringe,  admin: true },
  { label: 'Reportes',          to: '/reportes',   Icon: PieChart, admin: true },
  { label: 'Asistencia',        to: '/asistencia', Icon: Clock,    admin: true },
  { label: 'Actividad',         to: '/actividad',  Icon: History,  admin: true },
  { label: 'Usuarios',          to: '/usuarios',   Icon: UserCog,  admin: true },
]
const SECCION_TESIS = [
  { label: 'Mediciones', to: '/mediciones', Icon: Activity },
]

function NavItem({ label, to, Icon, onClick }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      onClick={onClick}
      className={({ isActive }) => [
        'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
        isActive
          ? 'bg-white text-purple-900 shadow-sm'
          : 'text-purple-200 hover:bg-purple-800 hover:text-white',
      ].join(' ')}
    >
      {({ isActive }) => (
        <>
          <Icon className="w-5 h-5 shrink-0" strokeWidth={1.8} />
          <span className="flex-1">{label}</span>
          {isActive && <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />}
        </>
      )}
    </NavLink>
  )
}

export default function Sidebar() {
  const navigate = useNavigate()
  const [abierto, setAbierto] = useState(false)
  const nombre = getNombre() || 'Veterinario'
  const rol = getRol() || 'veterinario'
  const visible = (items) => items.filter(i =>
    (!i.vet   || esVeterinario()) &&
    (!i.admin || esAdmin())
  )

  const handleLogout = () => {
    cerrarSesion()
    navigate('/login', { replace: true })
  }
  const cerrar = () => setAbierto(false)

  const Seccion = ({ titulo, items }) => {
    const vis = visible(items)
    if (vis.length === 0) return null
    return (
      <>
        <p className="text-purple-400 text-xs font-semibold uppercase tracking-widest px-3 mt-5 mb-2 first:mt-0">{titulo}</p>
        {vis.map(item => <NavItem key={item.to} {...item} onClick={cerrar} />)}
      </>
    )
  }

  return (
    <>
      {/* Barra superior móvil */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 bg-purple-950 text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => setAbierto(true)} className="p-1.5 rounded-lg hover:bg-purple-800">
          <Menu className="w-5 h-5" />
        </button>
        <span className="font-bold text-sm">Veterinaria Los Pinos</span>
      </div>

      {/* Overlay móvil */}
      {abierto && <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={cerrar} />}

      {/* Sidebar */}
      <aside className={[
        'w-64 bg-purple-950 flex flex-col shrink-0 z-50',
        'fixed inset-y-0 left-0 transform transition-transform md:transform-none md:static md:min-h-screen',
        abierto ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      ].join(' ')}>
        {/* Logo */}
        <div className="px-6 py-6 flex items-center gap-3 border-b border-purple-800">
          <div className="bg-purple-700 rounded-xl p-2 text-white">
            <PawIcon />
          </div>
          <div className="flex-1">
            <p className="text-white font-bold text-sm leading-tight">Veterinaria</p>
            <p className="text-purple-300 text-xs font-medium">Los Pinos</p>
          </div>
          <button onClick={cerrar} className="md:hidden p-1 text-purple-300 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-5 flex flex-col gap-1 overflow-y-auto">
          <div className="mb-2">
            <GlobalSearch />
          </div>
          <Seccion titulo="Clínica" items={SECCION_CLINICA} />
          <Seccion titulo="Administración" items={SECCION_ADMIN} />
          <Seccion titulo="Tesis" items={SECCION_TESIS} />
        </nav>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-purple-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-purple-700 flex items-center justify-center text-white text-xs font-bold uppercase">
              {nombre.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-medium capitalize truncate">{nombre}</p>
              <p className="text-purple-400 text-xs capitalize">{rol}</p>
            </div>
            <button onClick={handleLogout} title="Cerrar sesión"
              className="p-2 rounded-lg text-purple-300 hover:text-white hover:bg-purple-800 transition">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
