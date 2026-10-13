import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Lock, User, Building2, Eye, EyeOff } from 'lucide-react'
import { api, setSesion } from '../services/api'
import { useClinica } from '../services/clinica'

const campo = 'w-full border border-slate-300 rounded-md pl-9 pr-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white'

/** Alta de una clínica nueva: se crea la clínica y su administradora de una vez. */
export default function Registro() {
  const navigate = useNavigate()
  const { recargar } = useClinica()
  const [form, setForm] = useState({ clinica: '', nombre: '', usuario: '', password: '' })
  const [verPass, setVerPass] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { recargar() }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const enviar = async (e) => {
    e.preventDefault()
    if (form.password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return }
    setCargando(true); setError(null)
    try {
      const r = await api.post('/api/registro/', form)
      setSesion(r)
      await recargar()
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
      setCargando(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6 bg-white">
      <form onSubmit={enviar} className="w-full max-w-sm flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Crear la cuenta de tu clínica</h1>
          <p className="text-sm text-slate-600 mt-1">
            Tú serás la administradora. Después podrás agregar a tu equipo y elegir el color de tu marca.
          </p>
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
          Nombre de la clínica
          <div className="relative font-normal">
            <Building2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={campo} value={form.clinica} onChange={set('clinica')} autoFocus />
          </div>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
          Tu nombre
          <div className="relative font-normal">
            <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={campo} value={form.nombre} onChange={set('nombre')} autoComplete="name" />
          </div>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
          Usuario para ingresar
          <div className="relative font-normal">
            <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={campo} value={form.usuario} onChange={set('usuario')} autoComplete="username" />
          </div>
          <span className="text-xs font-normal text-slate-500">Letras, números, punto o guion. Mínimo 3.</span>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
          Contraseña
          <div className="relative font-normal">
            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={`${campo} pr-10`} type={verPass ? 'text' : 'password'}
              value={form.password} onChange={set('password')} autoComplete="new-password" />
            <button type="button" onClick={() => setVerPass(v => !v)}
              aria-label={verPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700">
              {verPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <span className="text-xs font-normal text-slate-500">Mínimo 8 caracteres.</span>
        </label>

        {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2 rounded-md">{error}</p>}

        <button type="submit" disabled={cargando}
          className="w-full py-2.5 bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold rounded-md transition disabled:opacity-60">
          {cargando ? 'Creando…' : 'Crear cuenta'}
        </button>

        <p className="text-sm text-slate-600">
          ¿Ya tienes cuenta? <Link to="/login" className="font-semibold text-brand-700 hover:underline">Ingresar</Link>
        </p>
      </form>
    </div>
  )
}
