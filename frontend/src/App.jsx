import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState } from 'react'
import { Grid } from 'antd'
import MenuLateral, { BarraSuperior } from './components/MenuLateral'
import { ToastProvider } from './components/Toast'
import { ConfirmarProvider } from './components/Confirmar'
import { CargandoPantalla } from './components/Cargando'
import { ClinicaProvider } from './services/clinica'
import Login from './pages/Login'
import { getToken, esVeterinario, esAdmin } from './services/api'
import './App.css'

// Cada pantalla se descarga recién cuando se entra a ella.
//
// Antes toda la aplicación viajaba en un solo archivo de 1,47 MB: la
// recepcionista descargaba los gráficos y el generador de PDF
// aunque nunca los abriera, y no veía nada hasta que terminaba de bajar todo.
// Login queda fuera de esta lista a propósito: es la primera pantalla y
// dividirla solo agregaría una espera extra antes de poder escribir el usuario.
const CarnetPublico     = lazy(() => import('./pages/Carnet'))
const Inicio            = lazy(() => import('./pages/Inicio'))
const MiPanel           = lazy(() => import('./pages/MiPanel'))
const Clientes          = lazy(() => import('./pages/Clientes'))
const DetalleCliente    = lazy(() => import('./pages/DetalleCliente'))
const HistoriasClinicas = lazy(() => import('./pages/HistoriasClinicas'))
const HistorialPaciente = lazy(() => import('./pages/HistorialPaciente'))
const Turnos            = lazy(() => import('./pages/Turnos'))
const Tratamientos      = lazy(() => import('./pages/Tratamientos'))
const Inventario        = lazy(() => import('./pages/Inventario'))
const Servicios         = lazy(() => import('./pages/Servicios'))
const Ventas            = lazy(() => import('./pages/Ventas'))
const Caja              = lazy(() => import('./pages/Caja'))
const Usuarios          = lazy(() => import('./pages/Usuarios'))
const PerfilDoctor      = lazy(() => import('./pages/PerfilDoctor'))
const Asistencia        = lazy(() => import('./pages/Asistencia'))
const Actividad         = lazy(() => import('./pages/Actividad'))
const Reportes          = lazy(() => import('./pages/Reportes'))
const PanelRecepcion    = lazy(() => import('./pages/PanelRecepcion'))
const Vacunacion        = lazy(() => import('./pages/Vacunacion'))
const Recordatorios     = lazy(() => import('./pages/Recordatorios'))
const Errores           = lazy(() => import('./pages/Errores'))

// Ruta solo para veterinarios; recepcionista es redirigida al inicio
function SoloVet({ children }) {
  return esVeterinario() ? children : <Navigate to="/" replace />
}

// Ruta solo para la administradora (recepcionista)
function SoloAdmin({ children }) {
  return esAdmin() ? children : <Navigate to="/" replace />
}

// Home: el panel de control (Inicio) es administrativo. El veterinario no lo ve;
// se le envía a "Mi panel" (evita además un bucle de redirección sobre "/").
function Home() {
  return esVeterinario() ? <Navigate to="/mi-panel" replace /> : <Inicio />
}

function AppProtegida() {
  // Menú abierto o cerrado (botón de la barra superior de escritorio); se recuerda en este navegador
  const [menuCerrado, setMenuCerrado] = useState(() => {
    try { return localStorage.getItem('menu_cerrado') === '1' } catch { return false }
  })
  const alternarMenu = () => setMenuCerrado(c => {
    try { localStorage.setItem('menu_cerrado', c ? '0' : '1') } catch { /* sin almacenamiento */ }
    return !c
  })
  const movil = !Grid.useBreakpoint().md
  if (!getToken()) return <Navigate to="/login" replace />
  return (
    // `min-w-0`: sin esto el contenedor no baja de su ancho de contenido y una
    // tabla o barra de pestañas ancha estira TODA la aplicación de lado en
    // móvil, en vez de desplazarse dentro de su propia caja.
    // `flex-1 w-full`: #root es flex, y sin esto el shell se encoge al ancho de su
    // contenido, así que el ancho de la pantalla (y la columna derecha) cambiaba
    // de una ruta a otra en vez de llegar siempre al borde de la ventana.
    <div className="flex flex-1 w-full min-w-0 min-h-screen">
      <MenuLateral colapsado={menuCerrado} />
      {/* min-w-0 evita que gráficos/tablas anchos rompan el centrado del contenido */}
      <div className="flex-1 min-w-0 flex flex-col pt-12 md:pt-0">
        {!movil && <BarraSuperior onAlternarMenu={alternarMenu} />}
        <Suspense fallback={<CargandoPantalla />}>
        <Routes>
          <Route path="/"                       element={<Home />} />
          <Route path="/mi-panel"               element={<SoloVet><MiPanel /></SoloVet>} />
          <Route path="/clientes"               element={<Clientes />} />
          <Route path="/clientes/:id"           element={<DetalleCliente />} />
          {/* La recepcionista también llena historias cuando el doctor no da
              abasto; adentro se le pide indicar qué veterinario atendió */}
          <Route path="/consultas"              element={<HistoriasClinicas />} />
          <Route path="/consultas/:pacienteId"  element={<HistoriasClinicas />} />
          {/* Ficha del paciente: ambos roles la VEN; las acciones de escritura van gateadas adentro */}
          <Route path="/pacientes/:pacienteId/historial" element={<HistorialPaciente />} />
          <Route path="/turnos"                 element={<Turnos />} />
          {/* Seguimiento de lo indicado: el doctor ve qué está medicado y
              recepción a quién hay que llamar. Ambos roles. */}
          <Route path="/tratamientos"           element={<Tratamientos />} />
          <Route path="/inventario"             element={<SoloAdmin><Inventario /></SoloAdmin>} />
          <Route path="/servicios"              element={<SoloAdmin><Servicios /></SoloAdmin>} />
          <Route path="/ventas"                 element={<SoloAdmin><Ventas /></SoloAdmin>} />
          <Route path="/caja"                   element={<SoloAdmin><Caja /></SoloAdmin>} />
          <Route path="/asistencia"             element={<SoloAdmin><Asistencia /></SoloAdmin>} />
          <Route path="/actividad"              element={<SoloAdmin><Actividad /></SoloAdmin>} />
          <Route path="/reportes"               element={<SoloAdmin><Reportes /></SoloAdmin>} />
          <Route path="/recepcion"              element={<SoloAdmin><PanelRecepcion /></SoloAdmin>} />
          <Route path="/recordatorios"          element={<SoloAdmin><Recordatorios /></SoloAdmin>} />
          <Route path="/vacunacion"            element={<SoloAdmin><Vacunacion /></SoloAdmin>} />
          <Route path="/usuarios"               element={<SoloAdmin><Usuarios /></SoloAdmin>} />
          <Route path="/errores"                element={<SoloAdmin><Errores /></SoloAdmin>} />
          <Route path="/usuarios/:usuarioId/perfil" element={<PerfilDoctor />} />
          <Route path="*"                       element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ClinicaProvider>
        <ToastProvider>
          <ConfirmarProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              {/* Lo abre el dueño desde un enlace, sin sesión: va fuera de la app protegida */}
              <Route path="/carnet/:token" element={<Suspense fallback={<CargandoPantalla />}><CarnetPublico /></Suspense>} />
              <Route path="/*"     element={<AppProtegida />} />
            </Routes>
          </ConfirmarProvider>
        </ToastProvider>
      </ClinicaProvider>
    </BrowserRouter>
  )
}
