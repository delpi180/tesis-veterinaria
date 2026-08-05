import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserCog, Plus, Pencil, Trash2, X, ShieldCheck, User, IdCard, Download } from 'lucide-react'
import { api, authHeaders, getUsuario } from '../services/api'

const BASE_URL = import.meta.env.VITE_API_URL ?? ''
import { useToast } from '../components/Toast'
import { useConfirmar } from '../components/Confirmar'
import { useCerrarConEscape } from '../hooks/useCerrarConEscape'
import DatosClinica from '../components/DatosClinica'
import { Cargando } from '../components/Cargando'

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white'
const labelCls = 'text-xs font-semibold text-slate-600'

const ROL_PILL = {
  veterinario:  'bg-purple-100 text-purple-700',
  recepcionista: 'bg-sky-100 text-sky-700',
}

const FORM_INICIAL = {
  usuario: '', nombre: '', password: '', rol: 'recepcionista', activo: true,
  dni: '', telefono: '', especialidad: '', hora_entrada: '', dias_laborales: '',
}

const DIAS = [
  ['lun', 'Lun'], ['mar', 'Mar'], ['mie', 'Mié'], ['jue', 'Jue'],
  ['vie', 'Vie'], ['sab', 'Sáb'], ['dom', 'Dom'],
]

/**
 * Descarga de los datos de la clínica.
 *
 * Railway guarda copias continuas de la base, pero eso protege el servidor,
 * no a la dueña: no puede abrirlas ni llevárselas. Sus clientes y las
 * historias de sus pacientes son suyos, y tiene que poder tenerlos en la mano
 * sin depender de nadie.
 */
function RespaldoDatos() {
  const toast = useToast()
  const [bajando, setBajando] = useState(false)

  const descargar = async () => {
    setBajando(true)
    try {
      // No pasa por `api` porque la respuesta es un ZIP, no JSON.
      const res = await fetch(`${BASE_URL}/api/respaldo/`, { headers: authHeaders() })
      if (!res.ok) throw new Error('No se pudo generar el respaldo.')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `respaldo_${new Date().toISOString().slice(0, 10)}.zip`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Respaldo descargado. Guárdalo en un lugar seguro.')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBajando(false)
    }
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
        <Download className="w-5 h-5 text-emerald-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-800">Copia de tus datos</p>
        <p className="text-xs text-slate-500 mt-0.5 leading-snug">
          Descarga clientes, mascotas, historias clínicas, recetas, inventario y
          ventas en archivos de Excel. Conviene hacerlo de vez en cuando y
          guardarlo fuera del sistema.
        </p>
      </div>
      <button
        onClick={descargar}
        disabled={bajando}
        className="flex items-center justify-center gap-2 px-4 py-2 border border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-sm font-semibold rounded-lg transition disabled:opacity-50 shrink-0"
      >
        <Download className="w-4 h-4" />
        {bajando ? 'Generando…' : 'Descargar'}
      </button>
    </section>
  )
}

export default function Usuarios() {
  const confirmar = useConfirmar()
  const toast = useToast()
  const navigate = useNavigate()
  const yo = getUsuario()
  const [usuarios, setUsuarios] = useState([])
  const [loading,  setLoading]  = useState(true)

  const [modalAbierto, setModalAbierto] = useState(false)
  const [editId,       setEditId]       = useState(null)
  const [form,         setForm]         = useState(FORM_INICIAL)
  const [guardando,    setGuardando]    = useState(false)
  const [errorModal,   setErrorModal]   = useState(null)

  const cargar = async () => {
    setLoading(true)
    try {
      const data = await api.get('/api/usuarios/')
      setUsuarios(Array.isArray(data) ? data : [])
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { cargar() }, [])

  const abrirNuevo = () => { setEditId(null); setForm(FORM_INICIAL); setErrorModal(null); setModalAbierto(true) }
  const abrirEditar = (u) => {
    setEditId(u.id)
    setForm({
      usuario: u.usuario, nombre: u.nombre, password: '', rol: u.rol, activo: u.activo,
      dni: u.dni || '', telefono: u.telefono || '', especialidad: u.especialidad || '',
      hora_entrada: u.hora_entrada || '', dias_laborales: u.dias_laborales || '',
    })
    setErrorModal(null); setModalAbierto(true)
  }

  const toggleDia = (code) => setForm(f => {
    const set = new Set((f.dias_laborales || '').split(',').filter(Boolean))
    set.has(code) ? set.delete(code) : set.add(code)
    const ordenado = DIAS.map(([c]) => c).filter(c => set.has(c))
    return { ...f, dias_laborales: ordenado.join(',') }
  })
  const cerrar = () => { setModalAbierto(false); setEditId(null); setErrorModal(null) }
  useCerrarConEscape(modalAbierto, cerrar)

  const guardar = async (e) => {
    e.preventDefault()
    if (!form.nombre.trim()) { setErrorModal('El nombre es obligatorio.'); return }
    if (!editId) {
      if (form.usuario.trim().length < 3) { setErrorModal('El usuario debe tener al menos 3 caracteres.'); return }
      if (form.password.length < 4) { setErrorModal('La contraseña debe tener al menos 4 caracteres.'); return }
    }
    setGuardando(true); setErrorModal(null)
    try {
      // El horario laboral y la especialidad solo aplican a doctores; para recepción se limpian.
      const esDoctor = form.rol === 'veterinario'
      const horario = {
        hora_entrada:   esDoctor ? (form.hora_entrada || null) : null,
        dias_laborales: esDoctor ? (form.dias_laborales || null) : null,
        especialidad:   esDoctor ? (form.especialidad.trim() || null) : null,
      }
      const contacto = {
        dni:      form.dni.trim() || null,
        telefono: form.telefono.trim() || null,
      }
      if (editId) {
        const payload = { nombre: form.nombre.trim(), rol: form.rol, activo: form.activo, ...contacto, ...horario }
        if (form.password) payload.password = form.password
        await api.put(`/api/usuarios/${editId}`, payload)
        toast.success('Usuario actualizado')
      } else {
        await api.post('/api/usuarios/', {
          usuario: form.usuario.trim(), nombre: form.nombre.trim(),
          password: form.password, rol: form.rol, activo: form.activo, ...contacto, ...horario,
        })
        toast.success('Usuario creado')
      }
      await cargar(); cerrar()
    } catch (err) {
      setErrorModal(err.message)
    } finally {
      setGuardando(false)
    }
  }

  const eliminar = async (u) => {
    // Borrar arrastra cosas que no se ven desde esta pantalla; decirlas antes
    // evita el "no sabía que se perdían las marcaciones".
    if (!await confirmar({
      titulo: `Eliminar a ${u.nombre}`,
      mensaje: 'Se borrarán sus marcaciones de asistencia. Sus turnos quedarán sin doctor asignado, para reasignarlos. Sus historias y recetas no se tocan: conservan su nombre.',
      detalle: 'Si solo quieres quitarle el acceso al sistema, desactívalo en vez de borrarlo.',
      confirmarTexto: 'Eliminar usuario',
    })) return
    try {
      await api.del(`/api/usuarios/${u.id}`)
      setUsuarios(prev => prev.filter(x => x.id !== u.id))
      toast.success('Usuario eliminado')
    } catch (err) {
      toast.error(err.message)
    }
  }

  const today = new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 md:px-8 py-4 flex items-center justify-between flex-wrap gap-3 static md:sticky md:top-0 md:z-10">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Usuarios y Roles</h1>
          <p className="text-xs text-slate-400 mt-0.5 capitalize">{today}</p>
        </div>
        <button onClick={abrirNuevo}
          className="flex items-center gap-2 px-4 py-2 bg-purple-700 hover:bg-purple-600 text-white text-sm font-semibold rounded-lg shadow transition">
          <Plus className="w-4 h-4" /> Nuevo Usuario
        </button>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 md:py-6 flex flex-col gap-5 max-w-4xl w-full mx-auto">
        <div className="bg-sky-50 border border-sky-200 rounded-xl px-4 py-3 text-sm text-sky-800 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
          <p>La <strong>recepcionista</strong> es la administradora: gestiona usuarios, ventas, inventario, turnos y asistencia. El <strong>veterinario</strong> (doctor) atiende y llena las historias clínicas, que quedan firmadas con su nombre.</p>
        </div>

        <DatosClinica />

        <RespaldoDatos />

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <UserCog className="w-4 h-4 text-purple-500" />
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Usuarios</h2>
            <span className="ml-auto text-xs bg-purple-100 text-purple-700 font-semibold px-2 py-0.5 rounded-full">{usuarios.length}</span>
          </div>

          {loading ? (
            <Cargando />
          ) : (
            <>
            {/* Celular: una tarjeta por usuario. La tabla mide 779 px y en un
                teléfono obligaba a arrastrarla de lado para ver el rol o los
                botones — el mismo trato que ya reciben Clientes y Ventas. */}
            <div className="block md:hidden divide-y divide-slate-100">
              {usuarios.map(u => (
                <div key={u.id} className="px-4 py-3 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 text-sm truncate flex items-center gap-1.5">
                        <User className="w-4 h-4 text-slate-300 shrink-0" />
                        {u.usuario}
                        {u.usuario === yo && <span className="text-xs text-purple-500">(tú)</span>}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{u.nombre}</p>
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0 ${u.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize ${ROL_PILL[u.rol] ?? 'bg-slate-100 text-slate-600'}`}>
                      {u.rol}
                    </span>
                    <span className="text-xs text-slate-500">DNI {u.dni || '—'}</span>
                    <div className="ml-auto flex items-center gap-1">
                      <button onClick={() => navigate(`/usuarios/${u.id}/perfil`)} aria-label="Ver perfil"
                        className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition">
                        <IdCard className="w-4 h-4" />
                      </button>
                      <button onClick={() => abrirEditar(u)} aria-label="Editar"
                        className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition">
                        <Pencil className="w-4 h-4" />
                      </button>
                      {u.usuario !== yo && (
                        <button onClick={() => eliminar(u)} aria-label="Eliminar"
                          className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block overflow-x-auto"><table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100">
                  <th className="text-left px-5 py-3 font-semibold">Usuario</th>
                  <th className="text-left px-5 py-3 font-semibold">Nombre</th>
                  <th className="text-left px-5 py-3 font-semibold">DNI</th>
                  <th className="text-left px-5 py-3 font-semibold">Rol</th>
                  <th className="text-center px-5 py-3 font-semibold">Estado</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u, i) => (
                  <tr key={u.id} className={`border-b border-slate-50 ${i % 2 ? 'bg-slate-50/30' : ''}`}>
                    <td className="px-5 py-3.5">
                      <span className="flex items-center gap-2 font-medium text-slate-800">
                        <User className="w-4 h-4 text-slate-300" /> {u.usuario}
                        {u.usuario === yo && <span className="text-xs text-purple-500">(tú)</span>}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">{u.nombre}</td>
                    <td className="px-5 py-3.5 text-slate-500">{u.dni || '—'}</td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize ${ROL_PILL[u.rol] ?? 'bg-slate-100 text-slate-600'}`}>
                        {u.rol}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${u.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                        {u.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => navigate(`/usuarios/${u.id}/perfil`)} title="Ver perfil"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition">
                          <IdCard className="w-4 h-4" />
                        </button>
                        <button onClick={() => abrirEditar(u)} title="Editar"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition">
                          <Pencil className="w-4 h-4" />
                        </button>
                        {u.usuario !== yo && (
                          <button onClick={() => eliminar(u)} title="Eliminar"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            </>
          )}
        </section>
      </main>

      {modalAbierto && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) cerrar() }}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <p className="text-sm font-bold text-slate-800">{editId ? 'Editar Usuario' : 'Nuevo Usuario'}</p>
              <button onClick={cerrar} className="p-1 rounded-lg hover:bg-slate-100 transition text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={guardar} className="flex flex-col flex-1 min-h-0">
              <div className="px-5 py-4 flex flex-col gap-4 overflow-y-auto">
                <div className="flex flex-col gap-1">
                  <label className={labelCls}>Usuario {!editId && <span className="text-rose-500">*</span>}</label>
                  <input type="text" className={inputCls} value={form.usuario} disabled={!!editId}
                    autoFocus
                    placeholder="ej. recepcion1"
                    onChange={e => setForm(f => ({ ...f, usuario: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelCls}>Nombre completo <span className="text-rose-500">*</span></label>
                  <input type="text" className={inputCls} value={form.nombre}
                    onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className={labelCls}>{editId ? 'Nueva contraseña' : 'Contraseña'} {!editId && <span className="text-rose-500">*</span>}</label>
                    <input type="password" className={inputCls} value={form.password}
                      placeholder={editId ? 'Dejar vacío = sin cambio' : '••••'}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className={labelCls}>Rol</label>
                    <select className={inputCls} value={form.rol}
                      onChange={e => setForm(f => ({ ...f, rol: e.target.value }))}>
                      <option value="veterinario">Veterinario</option>
                      <option value="recepcionista">Recepcionista</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className={labelCls}>DNI</label>
                    <input type="text" className={inputCls} value={form.dni} maxLength={8}
                      placeholder="Ej. 12345678"
                      onChange={e => setForm(f => ({ ...f, dni: e.target.value.replace(/\D/g, '') }))} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className={labelCls}>Teléfono</label>
                    <input type="text" className={inputCls} value={form.telefono}
                      placeholder="Ej. 987654321"
                      onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
                  </div>
                </div>
                {form.rol === 'veterinario' && (
                  <div className="flex flex-col gap-3 border border-slate-100 bg-slate-50/60 rounded-lg p-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Datos del doctor</p>
                    <div className="flex flex-col gap-1">
                      <label className={labelCls}>Especialidad</label>
                      <input type="text" className={inputCls} value={form.especialidad}
                        placeholder="Ej. Medicina interna, Cirugía…"
                        onChange={e => setForm(f => ({ ...f, especialidad: e.target.value }))} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className={labelCls}>Hora de ingreso</label>
                      <input type="time" className={inputCls} value={form.hora_entrada}
                        onChange={e => setForm(f => ({ ...f, hora_entrada: e.target.value }))} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className={labelCls}>Días a laborar</label>
                      <div className="flex flex-wrap gap-1.5">
                        {DIAS.map(([code, lbl]) => {
                          const activo = (form.dias_laborales || '').split(',').includes(code)
                          return (
                            <button key={code} type="button" onClick={() => toggleDia(code)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${activo
                                ? 'bg-purple-600 text-white border-purple-600'
                                : 'bg-white text-slate-500 border-slate-200 hover:border-purple-300'}`}>
                              {lbl}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-300"
                    checked={form.activo} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} />
                  Usuario activo
                </label>
                {errorModal && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">{errorModal}</p>}
              </div>
              <div className="px-5 py-4 border-t border-slate-100 flex gap-3 justify-end">
                <button type="button" onClick={cerrar}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition">Cancelar</button>
                <button type="submit" disabled={guardando}
                  className="px-4 py-2 text-sm font-semibold text-white bg-purple-700 rounded-lg hover:bg-purple-800 transition disabled:opacity-50">
                  {guardando ? 'Guardando…' : editId ? 'Guardar' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
