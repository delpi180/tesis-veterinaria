import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Lock, User, Eye, EyeOff } from 'lucide-react'
import { api, setSesion } from '../services/api'
import { useClinica } from '../services/clinica'

const PawIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10">
    <path d="M12 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-5 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM5.5 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm13 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM12 10c-3.3 0-6 2.7-6 6 0 2.2 1.8 4 4 4h4c2.2 0 4-1.8 4-4 0-3.3-2.7-6-6-6z"/>
  </svg>
)

// A dónde entra cada rol. Antes esto se elegía a mano ANTES de escribir las
// credenciales, y equivocarse costaba caro: el error decía que la cuenta no
// correspondía al tipo elegido —se leía como "contraseña incorrecta"— y al
// volver atrás se borraba todo lo escrito. El servidor ya devuelve el rol al
// validar, así que el paso sobraba: solo agregaba un clic y una forma de
// fallar con las credenciales correctas.
const DESTINO_POR_ROL = {
  recepcionista: '/recepcion',
  veterinario:   '/mi-panel',
}

export default function Login() {
  const navigate = useNavigate()
  const { clinica, recargar } = useClinica()

  // Al llegar a la pantalla de acceso no hay sesión: se muestran el nombre y el
  // color genéricos del producto, no los de la última clínica que usó el equipo.
  useEffect(() => { recargar() }, [])   // eslint-disable-line react-hooks/exhaustive-deps
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
      await recargar()   // ya con sesión: nombre y color de SU clínica
      navigate(DESTINO_POR_ROL[r.rol] ?? '/', { replace: true })
    } catch (err) {
      setError(err.message)
      setCargando(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex bg-white">
      {/* Panel de marca: plano, sin degradado ni adornos */}
      <aside className="hidden md:flex w-5/12 max-w-lg bg-brand-900 text-white flex-col justify-between p-10">
        <div className="text-brand-200"><PawIcon /></div>
        <div>
          <h1 className="text-3xl font-semibold leading-tight">{clinica.nombre}</h1>
          <p className="text-brand-200 text-sm mt-3 max-w-xs">
            Historias clínicas, turnos, inventario y caja en un solo lugar.
          </p>
        </div>
        <p className="text-brand-300 text-xs">© {new Date().getFullYear()} {clinica.nombre}</p>
      </aside>

      <main className="flex-1 flex items-center justify-center p-6">
        <form onSubmit={handleSubmit} className="w-full max-w-sm flex flex-col gap-5">
          <div className="md:hidden flex items-center gap-3 text-brand-800 mb-2">
            <PawIcon />
            <span className="font-semibold">{clinica.nombre}</span>
          </div>
          <h2 className="text-2xl font-semibold text-slate-900">Ingresar</h2>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="usuario" className="text-sm font-medium text-slate-700">Usuario</label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="usuario"
                type="text"
                value={usuario}
                onChange={e => setUsuario(e.target.value)}
                autoFocus
                autoComplete="username"
                className="w-full border border-slate-300 rounded-md pl-9 pr-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium text-slate-700">Contraseña</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="password"
                type={verPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full border border-slate-300 rounded-md pl-9 pr-10 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
              />
              <button
                type="button"
                onClick={() => setVerPass(v => !v)}
                aria-label={verPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
              >
                {verPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2 rounded-md">{error}</p>
          )}

          <button
            type="submit"
            disabled={cargando}
            className="w-full py-2.5 bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold rounded-md transition disabled:opacity-60"
          >
            {cargando ? 'Verificando…' : 'Ingresar'}
          </button>

          <p className="text-sm text-slate-600 leading-snug">
            ¿Olvidaste tu contraseña? Pídele a la administradora que la cambie desde Usuarios.
          </p>
          <p className="text-sm text-slate-600 border-t border-slate-200 pt-4">
            ¿Tu clínica aún no usa el sistema?{' '}
            <Link to="/registro" className="font-semibold text-brand-700 hover:underline">Crea su cuenta</Link>
          </p>
        </form>
      </main>
    </div>
  )
}
