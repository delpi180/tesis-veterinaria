import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Inicio from './pages/Inicio'
import Clientes from './pages/Clientes'
import DetalleCliente from './pages/DetalleCliente'
import HistoriasClinicas from './pages/HistoriasClinicas'
import Turnos from './pages/Turnos'
import Inventario from './pages/Inventario'
import Ventas from './pages/Ventas'
import './App.css'

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen">
        <Sidebar />
        <Routes>
          <Route path="/"                       element={<Inicio />} />
          <Route path="/clientes"               element={<Clientes />} />
          <Route path="/clientes/:id"           element={<DetalleCliente />} />
          <Route path="/consultas"              element={<HistoriasClinicas />} />
          <Route path="/consultas/:pacienteId"  element={<HistoriasClinicas />} />
          <Route path="/turnos"                 element={<Turnos />} />
          <Route path="/inventario"             element={<Inventario />} />
          <Route path="/ventas"                 element={<Ventas />} />
          <Route path="*"                       element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
