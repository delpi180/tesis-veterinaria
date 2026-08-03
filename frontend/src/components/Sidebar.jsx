import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, Calendar,
  Package, Stethoscope, BarChart2, LogOut, Wallet, UserCog,
  Clock, ClipboardList, History, PieChart, ConciergeBell, Syringe, Menu, X, Bug,
} from 'lucide-react'
import { api, getNombre, getRol, cerrarSesion, esVeterinario, esAdmin } from '../services/api'
import GlobalSearch from './GlobalSearch'
import { useClinica } from '../services/clinica'
import { useRefrescoAuto } from '../hooks/useRefrescoAuto'

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
  { label: 'Errores',           to: '/errores',    Icon: Bug,      admin: true },
]
/** Una sección del menú. Vive fuera del componente a propósito: declarada
 *  adentro, React la trataba como un componente nuevo en cada render. */
function Seccion({ titulo, items, onNavegar, avisos }) {
  if (items.length === 0) return null
  return (
    <>
      <p className="text-purple-400 text-xs font-semibold uppercase tracking-widest px-3 mt-5 mb-2 first:mt-0">{titulo}</p>
      {items.map(item => (
        <NavItem key={item.to} {...item} onClick={onNavegar} aviso={avisos?.[item.to] ?? 0} />
      ))}
    </>
  )
}

function NavItem({ label, to, Icon, onClick, aviso = 0 }) {
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
          {aviso > 0 && (
            <span
              title={`${aviso} sin revisar`}
              className="shrink-0 min-w-[1.25rem] px-1.5 h-5 rounded-full bg-rose-500 text-white text-[11px] font-bold flex items-center justify-center"
            >
              {aviso > 99 ? '99+' : aviso}
            </span>
          )}
          {isActive && aviso === 0 && <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />}
        </>
      )}
    </NavLink>
  )
}

export default function Sidebar() {
  const navigate = useNavigate()
  const { clinica } = useClinica()
  const [abierto, setAbierto] = useState(false)
  const nombre = getNombre() || 'Veterinario'
  const rol = getRol() || 'veterinario'
  const visible = (items) => items.filter(i =>
    (!i.vet   || esVeterinario()) &&
    (!i.admin || esAdmin())
  )

  // Errores sin revisar. El sistema ya los registraba, pero había que
  // acordarse de entrar a la pantalla para verlos: un fallo podía repetirse
  // semanas sin que nadie se enterara. Solo la administradora los ve.
  const [erroresPendientes, setErroresPendientes] = useState(0)
  const cargarPendientes = () => {
    if (!esAdmin()) return Promise.resolve()
    return api.get('/api/errores/pendientes')
      .then(r => setErroresPendientes(r?.pendientes ?? 0))
      .catch(() => {})   // el menú no puede romperse por esto
  }
  // El hook solo programa el ciclo; la primera consulta va aparte.
  useEffect(() => { cargarPendientes() }, [])
  useRefrescoAuto(cargarPendientes, 60000)

  const handleLogout = () => {
    cerrarSesion()
    navigate('/login', { replace: true })
  }
  const cerrar = () => setAbierto(false)

  return (
    <>
      {/* Barra superior móvil */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 bg-purple-950 text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => setAbierto(true)} className="p-1.5 rounded-lg hover:bg-purple-800">
          <Menu className="w-5 h-5" />
        </button>
        <span className="font-bold text-sm">{clinica.nombre}</span>
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
            <p className="text-white font-bold text-sm leading-tight">{clinica.nombre}</p>
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
          <Seccion titulo="Clínica" items={visible(SECCION_CLINICA)} onNavegar={cerrar} />
          <Seccion titulo="Administración" items={visible(SECCION_ADMIN)} onNavegar={cerrar}
            avisos={{ '/errores': erroresPendientes }} />
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
