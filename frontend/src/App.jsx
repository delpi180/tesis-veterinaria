import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import { ToastProvider } from './components/Toast'
import Login from './pages/Login'
import Inicio from './pages/Inicio'
import MiPanel from './pages/MiPanel'
import Clientes from './pages/Clientes'
import DetalleCliente from './pages/DetalleCliente'
import HistoriasClinicas from './pages/HistoriasClinicas'
import HistorialPaciente from './pages/HistorialPaciente'
import Turnos from './pages/Turnos'
import Inventario from './pages/Inventario'
import Servicios from './pages/Servicios'
import Ventas from './pages/Ventas'
import Caja from './pages/Caja'
import Usuarios from './pages/Usuarios'
import Asistencia from './pages/Asistencia'
import Actividad from './pages/Actividad'
import Reportes from './pages/Reportes'
import PanelRecepcion from './pages/PanelRecepcion'
import Vacunacion from './pages/Vacunacion'
import Mediciones from './pages/Mediciones'
import { getToken, esVeterinario, esAdmin } from './services/api'
import './App.css'

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
  if (!getToken()) return <Navigate to="/login" replace />
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      {/* min-w-0 evita que gráficos/tablas anchos rompan el centrado del contenido */}
      <div className="flex-1 min-w-0 flex flex-col pt-12 md:pt-0">
        <Routes>
          <Route path="/"                       element={<Home />} />
          <Route path="/mi-panel"               element={<SoloVet><MiPanel /></SoloVet>} />
          <Route path="/clientes"               element={<Clientes />} />
          <Route path="/clientes/:id"           element={<DetalleCliente />} />
          <Route path="/consultas"              element={<SoloVet><HistoriasClinicas /></SoloVet>} />
          <Route path="/consultas/:pacienteId"  element={<SoloVet><HistoriasClinicas /></SoloVet>} />
          <Route path="/pacientes/:pacienteId/historial" element={<SoloVet><HistorialPaciente /></SoloVet>} />
          <Route path="/turnos"                 element={<Turnos />} />
          <Route path="/inventario"             element={<SoloAdmin><Inventario /></SoloAdmin>} />
          <Route path="/servicios"              element={<SoloAdmin><Servicios /></SoloAdmin>} />
          <Route path="/ventas"                 element={<SoloAdmin><Ventas /></SoloAdmin>} />
          <Route path="/caja"                   element={<SoloAdmin><Caja /></SoloAdmin>} />
          <Route path="/asistencia"             element={<SoloAdmin><Asistencia /></SoloAdmin>} />
          <Route path="/actividad"              element={<SoloAdmin><Actividad /></SoloAdmin>} />
          <Route path="/reportes"               element={<SoloAdmin><Reportes /></SoloAdmin>} />
          <Route path="/recepcion"              element={<SoloAdmin><PanelRecepcion /></SoloAdmin>} />
          <Route path="/vacunacion"             element={<SoloAdmin><Vacunacion /></SoloAdmin>} />
          <Route path="/usuarios"               element={<SoloAdmin><Usuarios /></SoloAdmin>} />
          <Route path="/mediciones"             element={<Mediciones />} />
          <Route path="*"                       element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*"     element={<AppProtegida />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  )
}
