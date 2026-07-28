import { useState, useEffect } from 'react'
import { Building2, Save } from 'lucide-react'
import { api } from '../services/api'
import { useClinica } from '../services/clinica'
import { useToast } from './Toast'

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white'
const labelCls = 'text-xs font-semibold text-slate-600'

/**
 * Datos de la clínica: los que salen impresos en las boletas, las historias
 * clínicas en PDF y los recordatorios de WhatsApp.
 */
export default function DatosClinica() {
  const toast = useToast()
  const { clinica, recargar } = useClinica()
  const [form, setForm] = useState(clinica)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  // Cuando llega la configuración del servidor, se refleja en el formulario
  useEffect(() => { setForm(clinica) }, [clinica])

  const set = (campo) => (e) => setForm(f => ({ ...f, [campo]: e.target.value }))

  const guardar = async (e) => {
    e.preventDefault()
    if (!form.nombre?.trim()) { setError('El nombre de la clínica es obligatorio.'); return }
    setGuardando(true); setError(null)
    try {
      await api.put('/api/configuracion/', {
        nombre:          form.nombre.trim(),
        ruc:             form.ruc?.trim() || null,
        direccion:       form.direccion?.trim() || null,
        telefono:        form.telefono?.trim() || null,
        email:           form.email?.trim() || null,
        pie_comprobante: form.pie_comprobante?.trim() || null,
      })
      await recargar()
      toast.success('Datos de la clínica actualizados')
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
        <Building2 className="w-4 h-4 text-purple-500" />
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Datos de la clínica</h2>
      </div>

      <form onSubmit={guardar} className="px-5 py-4 flex flex-col gap-4">
        <p className="text-xs text-slate-500">
          Aparecen en las boletas de venta, las historias clínicas en PDF y los
          recordatorios que se envían por WhatsApp.
        </p>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>Nombre de la clínica <span className="text-rose-500">*</span></label>
          <input type="text" className={inputCls} value={form.nombre ?? ''} onChange={set('nombre')}
            placeholder="Ej. Veterinaria Los Pinos" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className={labelCls}>RUC</label>
            <input type="text" className={inputCls} value={form.ruc ?? ''} onChange={set('ruc')}
              maxLength={11} placeholder="11 dígitos" />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Teléfono</label>
            <input type="text" className={inputCls} value={form.telefono ?? ''} onChange={set('telefono')}
              placeholder="Ej. 044-123456" />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>Dirección</label>
          <input type="text" className={inputCls} value={form.direccion ?? ''} onChange={set('direccion')}
            placeholder="Ej. Av. Los Pinos 123, Trujillo" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Correo</label>
            <input type="text" className={inputCls} value={form.email ?? ''} onChange={set('email')}
              placeholder="contacto@miclinica.pe" />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Pie de comprobante</label>
            <input type="text" className={inputCls} value={form.pie_comprobante ?? ''} onChange={set('pie_comprobante')}
              placeholder="Gracias por su preferencia" />
          </div>
        </div>

        {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">{error}</p>}

        <div className="flex justify-end">
          <button type="submit" disabled={guardando}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-purple-700 rounded-lg hover:bg-purple-800 transition disabled:opacity-50">
            <Save className="w-4 h-4" /> {guardando ? 'Guardando…' : 'Guardar datos'}
          </button>
        </div>
      </form>
    </section>
  )
}
