import { useState, useEffect, useRef } from 'react'
import { Building2, Save } from 'lucide-react'
import { api } from '../services/api'
import { useClinica } from '../services/clinica'
import { useToast } from './Toast'
import { aplicarMarca, esHexValido, generarPaleta, COLOR_POR_DEFECTO } from '../utils/paleta'

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-300 bg-white'
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

  // El color se prueba en vivo: toda la app cambia al elegirlo, y solo queda si
  // se guarda. Si se sale sin guardar, vuelve al color guardado.
  const guardadoRef = useRef(clinica.color_marca)
  useEffect(() => { guardadoRef.current = clinica.color_marca }, [clinica.color_marca])
  useEffect(() => () => aplicarMarca(guardadoRef.current), [])
  const elegirColor = (valor) => {
    setForm(f => ({ ...f, color_marca: valor }))
    if (esHexValido(valor) || !valor) aplicarMarca(valor)
  }
  const colorMostrado = esHexValido(form.color_marca) ? form.color_marca : COLOR_POR_DEFECTO
  const ajustado = esHexValido(form.color_marca) && generarPaleta(form.color_marca)[600] !== form.color_marca.toLowerCase()

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
        color_marca:     esHexValido(form.color_marca) ? form.color_marca : null,
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
        <Building2 className="w-4 h-4 text-brand-500" />
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

        <div className="flex flex-col gap-1">
          <label className={labelCls}>Color de tu marca</label>
          <div className="flex flex-wrap items-center gap-3">
            <input type="color" value={colorMostrado} onChange={e => elegirColor(e.target.value)}
              aria-label="Elegir el color de la marca"
              className="h-10 w-14 rounded border border-slate-200 bg-white p-1 cursor-pointer" />
            <input type="text" className={`${inputCls} w-32 font-mono`} value={form.color_marca ?? ''}
              onChange={e => elegirColor(e.target.value)} placeholder={COLOR_POR_DEFECTO} maxLength={7} />
            {form.color_marca && (
              <button type="button" onClick={() => elegirColor('')}
                className="text-xs text-slate-600 hover:text-slate-900 underline">
                Usar el color original
              </button>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Se aplica a todo el sistema, a las boletas y a los PDF.
            {ajustado && ' Lo oscurecimos un poco para que el texto blanco se lea bien.'}
          </p>
        </div>

        {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">{error}</p>}

        <div className="flex justify-end">
          <button type="submit" disabled={guardando}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-700 rounded-lg hover:bg-brand-800 transition disabled:opacity-50">
            <Save className="w-4 h-4" /> {guardando ? 'Guardando…' : 'Guardar datos'}
          </button>
        </div>
      </form>
    </section>
  )
}
