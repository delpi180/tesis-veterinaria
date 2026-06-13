import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, User, Eye, EyeOff } from 'lucide-react'
import { api, setSesion } from '../services/api'

const PawIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10">
    <path d="M12 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-5 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM5.5 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm13 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM12 10c-3.3 0-6 2.7-6 6 0 2.2 1.8 4 4 4h4c2.2 0 4-1.8 4-4 0-3.3-2.7-6-6-6z"/>
  </svg>
)

export default function Login() {
  const navigate = useNavigate()
  const [usuario,  setUsuario]  = useState('')
  const [password, setPassword] = useState('')
  const [verPass,  setVerPass]  = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error,    setError]    = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!usuario.trim() || !password) {
      setError('Ingresa usuario y contraseña.')
      return
    }
    setCargando(true); setError(null)
    try {
      const r = await api.post('/api/auth/login', { usuario: usuario.trim(), password })
      setSesion(r)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-purple-950 via-purple-900 to-violet-800 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="bg-purple-700 rounded-2xl p-4 text-white shadow-lg mb-4">
            <PawIcon />
          </div>
          <h1 className="text-2xl font-bold text-white">Veterinaria Los Pinos</h1>
          <p className="text-purple-300 text-sm mt-1">Sistema de gestión clínica</p>
        </div>

        {/* Tarjeta de login */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl px-7 py-8 flex flex-col gap-5">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Iniciar sesión</h2>
            <p className="text-xs text-slate-400 mt-0.5">Accede con tus credenciales</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600">Usuario</label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={usuario}
                onChange={e => setUsuario(e.target.value)}
                placeholder="Usuario"
                autoFocus
                className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600">Contraseña</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type={verPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-slate-200 rounded-lg pl-9 pr-10 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white"
              />
              <button
                type="button"
                onClick={() => setVerPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {verPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">{error}</p>
          )}

          <button
            type="submit"
            disabled={cargando}
            className="w-full py-2.5 bg-purple-700 hover:bg-purple-600 text-white text-sm font-bold rounded-lg shadow transition disabled:opacity-60"
          >
            {cargando ? 'Verificando…' : 'Ingresar'}
          </button>
        </form>

        <p className="text-center text-purple-400 text-xs mt-6">
          © {new Date().getFullYear()} Veterinaria Los Pinos
        </p>
      </div>
    </div>
  )
}
