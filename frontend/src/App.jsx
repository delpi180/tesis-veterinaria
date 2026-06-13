import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import GlobalSearch from './components/GlobalSearch'
import { ToastProvider } from './components/Toast'
import Login from './pages/Login'
import Inicio from './pages/Inicio'
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
import Mediciones from './pages/Mediciones'
import { getToken, esVeterinario } from './services/api'
import './App.css'

// Ruta solo para veterinarios; recepcionista es redirigido al inicio
function SoloVet({ children }) {
  return esVeterinario() ? children : <Navigate to="/" replace />
}

function AppProtegida() {
  if (!getToken()) return <Navigate to="/login" replace />
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <GlobalSearch />
      <Routes>
        <Route path="/"                       element={<Inicio />} />
        <Route path="/clientes"               element={<Clientes />} />
        <Route path="/clientes/:id"           element={<DetalleCliente />} />
        <Route path="/consultas"              element={<SoloVet><HistoriasClinicas /></SoloVet>} />
        <Route path="/consultas/:pacienteId"  element={<SoloVet><HistoriasClinicas /></SoloVet>} />
        <Route path="/pacientes/:pacienteId/historial" element={<SoloVet><HistorialPaciente /></SoloVet>} />
        <Route path="/turnos"                 element={<Turnos />} />
        <Route path="/inventario"             element={<Inventario />} />
        <Route path="/servicios"              element={<Servicios />} />
        <Route path="/ventas"                 element={<Ventas />} />
        <Route path="/caja"                   element={<Caja />} />
        <Route path="/usuarios"               element={<SoloVet><Usuarios /></SoloVet>} />
        <Route path="/mediciones"             element={<Mediciones />} />
        <Route path="*"                       element={<Navigate to="/" replace />} />
      </Routes>
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
