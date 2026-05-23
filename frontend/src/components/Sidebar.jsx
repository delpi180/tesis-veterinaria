import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Users, Calendar, ClipboardList,
  Package, BarChart2,
} from 'lucide-react'

const PawIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
    <path d="M12 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-5 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM5.5 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm13 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM12 10c-3.3 0-6 2.7-6 6 0 2.2 1.8 4 4 4h4c2.2 0 4-1.8 4-4 0-3.3-2.7-6-6-6z"/>
  </svg>
)

const SECCION_CLINICA = [
  { label: 'Inicio',            to: '/',           Icon: LayoutDashboard },
  { label: 'Clientes',          to: '/clientes',   Icon: Users            },
  { label: 'Turnos',            to: '/turnos',     Icon: Calendar         },
  { label: 'Historias Clínicas', to: '/consultas', Icon: ClipboardList    },
]

const SECCION_ADMIN = [
  { label: 'Inventario',        to: '/inventario', Icon: Package   },
  { label: 'Ventas y Reportes', to: '/ventas',     Icon: BarChart2 },
]

function NavItem({ label, to, Icon }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
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
  return (
    <aside className="w-64 min-h-screen bg-purple-950 flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-6 py-6 flex items-center gap-3 border-b border-purple-800">
        <div className="bg-purple-700 rounded-xl p-2 text-white">
          <PawIcon />
        </div>
        <div>
          <p className="text-white font-bold text-sm leading-tight">Veterinaria</p>
          <p className="text-purple-300 text-xs font-medium">Los Pinos</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-5 flex flex-col gap-1 overflow-y-auto">

        <p className="text-purple-400 text-xs font-semibold uppercase tracking-widest px-3 mb-2">
          Clínica
        </p>
        {SECCION_CLINICA.map(item => <NavItem key={item.to} {...item} />)}

        <p className="text-purple-400 text-xs font-semibold uppercase tracking-widest px-3 mt-5 mb-2">
          Administración
        </p>
        {SECCION_ADMIN.map(item => <NavItem key={item.to} {...item} />)}

      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-purple-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-purple-700 flex items-center justify-center text-white text-xs font-bold">
            V
          </div>
          <div>
            <p className="text-white text-xs font-medium">Veterinario</p>
            <p className="text-purple-400 text-xs">Los Pinos</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
