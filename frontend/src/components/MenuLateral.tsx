import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Avatar, Badge, Button, Drawer, Grid, Layout, Menu, Tooltip, Typography } from 'antd'
import type { MenuProps } from 'antd'
import {
  HomeOutlined, CustomerServiceOutlined, ProfileOutlined, TeamOutlined, CalendarOutlined,
  MedicineBoxOutlined, InboxOutlined, ToolOutlined, ShoppingCartOutlined, WalletOutlined,
  ExperimentOutlined, PieChartOutlined, ClockCircleOutlined, HistoryOutlined,
  UserSwitchOutlined, BugOutlined, LogoutOutlined, MenuOutlined,
} from '@ant-design/icons'
import { api, getNombre, getRol, cerrarSesion, esVeterinario, esAdmin } from '../services/api'
import GlobalSearch from './GlobalSearch'
import { useClinica } from '../services/clinica'
import { useRefrescoAuto } from '../hooks/useRefrescoAuto'
import { BRAND } from '@src/core/color'

const { Sider, Header } = Layout
const { Text } = Typography

const Huella = ({ size = 22 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size} aria-hidden="true">
    <path d="M12 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-5 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM5.5 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm13 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM12 10c-3.3 0-6 2.7-6 6 0 2.2 1.8 4 4 4h4c2.2 0 4-1.8 4-4 0-3.3-2.7-6-6-6z" />
  </svg>
)

interface Item {
  label: string
  to: string
  icon: React.ReactNode
  /** solo veterinario */
  vet?: boolean
  /** solo recepcionista (administradora) */
  admin?: boolean
}

const SECCION_CLINICA: Item[] = [
  { label: 'Inicio',       to: '/',             icon: <HomeOutlined />,            admin: true },
  { label: 'Recepción',    to: '/recepcion',    icon: <CustomerServiceOutlined />, admin: true },
  { label: 'Mi panel',     to: '/mi-panel',     icon: <ProfileOutlined />,         vet: true },
  { label: 'Clientes',     to: '/clientes',     icon: <TeamOutlined /> },
  { label: 'Turnos',       to: '/turnos',       icon: <CalendarOutlined /> },
  // La ve el doctor (qué está medicado) y también recepción (a quién llamar).
  { label: 'Tratamientos', to: '/tratamientos', icon: <MedicineBoxOutlined /> },
]

const SECCION_ADMIN: Item[] = [
  { label: 'Inventario', to: '/inventario', icon: <InboxOutlined />,        admin: true },
  { label: 'Servicios',  to: '/servicios',  icon: <ToolOutlined />,         admin: true },
  { label: 'Ventas',     to: '/ventas',     icon: <ShoppingCartOutlined />, admin: true },
  { label: 'Caja',       to: '/caja',       icon: <WalletOutlined />,       admin: true },
  { label: 'Vacunación', to: '/vacunacion', icon: <ExperimentOutlined />,   admin: true },
  { label: 'Reportes',   to: '/reportes',   icon: <PieChartOutlined />,     admin: true },
  { label: 'Asistencia', to: '/asistencia', icon: <ClockCircleOutlined />,  admin: true },
  { label: 'Actividad',  to: '/actividad',  icon: <HistoryOutlined />,      admin: true },
  { label: 'Usuarios',   to: '/usuarios',   icon: <UserSwitchOutlined />,   admin: true },
  { label: 'Errores',    to: '/errores',    icon: <BugOutlined />,          admin: true },
]

const visibles = (items: Item[]) =>
  items.filter(i => (!i.vet || esVeterinario()) && (!i.admin || esAdmin()))

/** Qué ítem del menú corresponde a la ruta actual (el más específico gana). */
function claveActiva(pathname: string, items: Item[]): string[] {
  const coincide = items
    .filter(i => i.to === '/' ? pathname === '/' : pathname === i.to || pathname.startsWith(`${i.to}/`))
    .sort((a, b) => b.to.length - a.to.length)
  return coincide[0] ? [coincide[0].to] : []
}

/** Lo que va dentro del menú, igual en escritorio (Sider) y móvil (Drawer). */
function Contenido({ onNavegar }: { onNavegar: () => void }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { clinica } = useClinica()
  const nombre = getNombre() || 'Veterinario'
  const rol = getRol() || 'veterinario'

  // Errores sin revisar. El sistema ya los registraba, pero había que
  // acordarse de entrar a la pantalla para verlos: un fallo podía repetirse
  // semanas sin que nadie se enterara. Solo la administradora los ve.
  const [erroresPendientes, setErroresPendientes] = useState(0)
  const cargarPendientes = () => {
    if (!esAdmin()) return Promise.resolve()
    return api.get('/api/errores/pendientes')
      .then((r: { pendientes?: number }) => setErroresPendientes(r?.pendientes ?? 0))
      .catch(() => {})   // el menú no puede romperse por esto
  }
  // El hook solo programa el ciclo; la primera consulta va aparte.
  useEffect(() => { cargarPendientes() }, [])
  useRefrescoAuto(cargarPendientes, 60000)

  const clinica_ = visibles(SECCION_CLINICA)
  const admin_ = visibles(SECCION_ADMIN)

  const items: MenuProps['items'] = useMemo(() => {
    const aItem = (i: Item) => ({
      key: i.to,
      icon: i.icon,
      label: i.to === '/errores' && erroresPendientes > 0
        ? (
          <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {i.label}
            <Badge count={erroresPendientes} overflowCount={99} size="small" title={`${erroresPendientes} sin revisar`} />
          </span>
        )
        : i.label,
    })
    const grupos: MenuProps['items'] = []
    if (clinica_.length) grupos.push({ type: 'group', label: 'Clínica', children: clinica_.map(aItem) })
    if (admin_.length) grupos.push({ type: 'group', label: 'Administración', children: admin_.map(aItem) })
    return grupos
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [erroresPendientes, clinica_.length, admin_.length])

  const salir = () => {
    cerrarSesion()
    navigate('/login', { replace: true })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '22px 20px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${BRAND.siderActive}` }}>
        <span style={{ background: BRAND.primary, color: '#fff', borderRadius: 12, padding: 8, display: 'flex' }}>
          <Huella />
        </span>
        <Text strong style={{ color: '#fff', fontSize: 16, lineHeight: 1.2 }}>{clinica.nombre}</Text>
      </div>

      <div style={{ padding: '16px 12px 4px' }}>
        {/* Al abrir el buscador se cierra el menú: en el celular el cajón
            tapaba media pantalla detrás del modal. */}
        <GlobalSearch onAbrir={onNavegar} />
      </div>

      <div className="scroll-fino scroll-fino-oscuro" style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={claveActiva(pathname, [...clinica_, ...admin_])}
          items={items}
          onClick={({ key }) => { navigate(key); onNavegar() }}
          style={{ background: 'transparent', borderInlineEnd: 0 }}
        />
      </div>

      <div style={{ padding: 16, borderTop: `1px solid ${BRAND.siderActive}`, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Avatar style={{ background: BRAND.primary, textTransform: 'uppercase' }}>{nombre.charAt(0)}</Avatar>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: '#fff', display: 'block', textTransform: 'capitalize' }} ellipsis>{nombre}</Text>
          <Text style={{ color: '#5a9d88', fontSize: 13, textTransform: 'capitalize' }}>{rol}</Text>
        </div>
        <Tooltip title="Cerrar sesión">
          <Button type="text" onClick={salir} aria-label="Cerrar sesión"
            icon={<LogoutOutlined style={{ color: '#b3d6c9' }} />} />
        </Tooltip>
      </div>
    </div>
  )
}

/**
 * Menú lateral. Reemplazo directo de `Sidebar.jsx`: mismas secciones, mismos
 * permisos, mismo aviso de errores; cambia que ahora es `Layout.Sider` + `Menu`
 * de Ant Design (como en CorAll) y en móvil un `Drawer` en lugar de un cajón
 * hecho a mano.
 */
export default function MenuLateral() {
  const { clinica } = useClinica()
  const pantallas = Grid.useBreakpoint()
  const movil = !pantallas.md
  const [abierto, setAbierto] = useState(false)
  const cerrar = () => setAbierto(false)

  // Al pasar a escritorio, el cajón móvil no puede quedar abierto por debajo
  // (si no, reaparecería abierto al volver a un ancho de celular). Se ajusta
  // durante el render, que es lo que React recomienda en vez de un efecto.
  const [eraMovil, setEraMovil] = useState(movil)
  if (movil !== eraMovil) {
    setEraMovil(movil)
    if (!movil) setAbierto(false)
  }

  if (movil) {
    return (
      <>
        <Header style={{
          position: 'fixed', top: 0, insetInline: 0, zIndex: 30, height: 48,
          padding: '0 12px', display: 'flex', alignItems: 'center', gap: 8,
          background: BRAND.sider,
        }}>
          <Button type="text" onClick={() => setAbierto(true)} aria-label="Abrir menú"
            icon={<MenuOutlined style={{ color: '#fff' }} />} />
          <Text strong style={{ color: '#fff' }}>{clinica.nombre}</Text>
        </Header>
        <Drawer
          open={abierto}
          onClose={cerrar}
          placement="left"
          size={280}
          closable={false}
          styles={{ body: { padding: 0, background: BRAND.sider } }}
        >
          <Contenido onNavegar={cerrar} />
        </Drawer>
      </>
    )
  }

  return (
    <Sider width={256} style={{ position: 'sticky', top: 0, height: '100vh', flex: '0 0 256px' }}>
      <Contenido onNavegar={cerrar} />
    </Sider>
  )
}
