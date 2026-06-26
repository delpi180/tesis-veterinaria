import { useState, useEffect } from 'react'
import {
  Paperclip, Upload, Trash2, FileText, Image as ImageIcon, Eye, Loader2,
} from 'lucide-react'
import { api, authHeaders } from '../services/api'
import { useToast } from './Toast'

const BASE_URL = import.meta.env.VITE_API_URL ?? ''

const CATEGORIAS = [
  { v: 'radiografia', l: 'Radiografía', cls: 'bg-sky-100 text-sky-700' },
  { v: 'analisis',    l: 'Análisis',    cls: 'bg-purple-100 text-purple-700' },
  { v: 'receta',      l: 'Receta',      cls: 'bg-emerald-100 text-emerald-700' },
  { v: 'otro',        l: 'Otro',        cls: 'bg-slate-100 text-slate-600' },
]
const catInfo = (v) => CATEGORIAS.find(c => c.v === v) ?? CATEGORIAS[3]

const fmtTam = (b) => b >= 1024 * 1024
  ? `${(b / 1024 / 1024).toFixed(1)} MB`
  : `${Math.max(1, Math.round(b / 1024))} KB`

const fmtFecha = (iso) => new Date(iso).toLocaleDateString('es-PE', {
  day: '2-digit', month: 'short', year: 'numeric',
})

const esImagen = (mime) => (mime || '').startsWith('image/')

export default function DocumentosPaciente({ pacienteId }) {
  const toast = useToast()
  const [docs, setDocs]       = useState([])
  const [cargando, setCargando] = useState(true)
  const [archivo, setArchivo] = useState(null)
  const [categoria, setCategoria] = useState('radiografia')
  const [descripcion, setDescripcion] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [abriendoId, setAbriendoId] = useState(null)

  const cargar = async () => {
    setCargando(true)
    try {
      setDocs(await api.get(`/api/pacientes/${pacienteId}/documentos/`))
    } catch (e) {
      toast.error(e.message)
    } finally {
      setCargando(false)
    }
  }
  useEffect(() => { if (pacienteId) cargar() }, [pacienteId])

  const subir = async (e) => {
    e.preventDefault()
    if (!archivo) { toast.error('Elige un archivo.'); return }
    setSubiendo(true)
    try {
      const fd = new FormData()
      fd.append('archivo', archivo)
      fd.append('categoria', categoria)
      fd.append('descripcion', descripcion)
      const res = await fetch(`${BASE_URL}/api/pacientes/${pacienteId}/documentos/`, {
        method: 'POST', body: fd, headers: authHeaders(),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b?.detail ?? `Error al subir (HTTP ${res.status})`)
      }
      const nuevo = await res.json()
      setDocs(d => [nuevo, ...d])
      setArchivo(null); setDescripcion('')
      e.target.reset?.()
      toast.success('Documento subido.')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubiendo(false)
    }
  }

  // Descarga con el token y abre el archivo en una pestaña nueva (un <a href> no
  // llevaría el header de autorización, por eso lo bajamos como blob).
  const abrir = async (doc) => {
    setAbriendoId(doc.id)
    try {
      const res = await fetch(`${BASE_URL}/api/pacientes/${pacienteId}/documentos/${doc.id}/descargar`, {
        headers: authHeaders(),
      })
      if (!res.ok) throw new Error(`No se pudo abrir (HTTP ${res.status})`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setAbriendoId(null)
    }
  }

  const eliminar = async (doc) => {
    if (!window.confirm(`¿Eliminar "${doc.nombre}"? Esta acción no se puede deshacer.`)) return
    try {
      await api.del(`/api/pacientes/${pacienteId}/documentos/${doc.id}`)
      setDocs(d => d.filter(x => x.id !== doc.id))
      toast.success('Documento eliminado.')
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
        <Paperclip className="w-4 h-4 text-purple-500" />
        <h2 className="text-sm font-semibold text-slate-700">Documentos complementarios</h2>
        <span className="text-xs bg-purple-100 text-purple-700 font-semibold px-2 py-0.5 rounded-full">
          {docs.length}
        </span>
      </div>

      {/* Formulario de subida */}
      <form onSubmit={subir} className="px-4 py-3 border-b border-slate-100 flex flex-col gap-2">
        <p className="text-xs text-slate-500">
          Radiografías, análisis de sangre, recetas y cualquier documento (imágenes, PDF u Office). Máx. 10 MB.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            onChange={e => setArchivo(e.target.files?.[0] ?? null)}
            className="text-xs file:mr-2 file:rounded-md file:border-0 file:bg-purple-100 file:text-purple-700 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:cursor-pointer flex-1 min-w-[180px]"
          />
          <select
            value={categoria}
            onChange={e => setCategoria(e.target.value)}
            className="text-xs px-2 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-300"
          >
            {CATEGORIAS.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
            placeholder="Descripción (opcional)"
            className="flex-1 min-w-[180px] text-xs px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white"
          />
          <button
            type="submit"
            disabled={subiendo || !archivo}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-purple-700 hover:bg-purple-600 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50"
          >
            {subiendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {subiendo ? 'Subiendo…' : 'Subir'}
          </button>
        </div>
      </form>

      {/* Lista */}
      {cargando ? (
        <p className="text-xs text-slate-400 text-center py-8">Cargando documentos…</p>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-slate-400">
          <Paperclip className="w-7 h-7 mb-2 opacity-40" />
          <p className="text-sm">Aún no hay documentos para esta mascota</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-50">
          {docs.map(doc => {
            const ci = catInfo(doc.categoria)
            const Icon = esImagen(doc.mime_type) ? ImageIcon : FileText
            return (
              <li key={doc.id} className="px-4 py-3 flex items-center gap-3">
                <Icon className="w-5 h-5 text-slate-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-800 truncate">{doc.nombre}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ci.cls}`}>{ci.l}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {fmtTam(doc.tamano_bytes)} · {fmtFecha(doc.creado_en)}
                    {doc.subido_por ? ` · ${doc.subido_por}` : ''}
                    {doc.descripcion ? ` · ${doc.descripcion}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => abrir(doc)}
                  disabled={abriendoId === doc.id}
                  title="Ver / descargar"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition disabled:opacity-50"
                >
                  {abriendoId === doc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => eliminar(doc)}
                  title="Eliminar"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
