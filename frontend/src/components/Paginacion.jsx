/**
 * Barra de paginación reutilizable (estilo ya usado en Clientes.jsx).
 * Props:
 *  - pagina: número de página actual (1-based)
 *  - total: total de elementos que cumplen el filtro vigente
 *  - porPagina: elementos por página
 *  - onCambiar: (nuevaPagina) => void
 *  - etiqueta: sustantivo plural para el texto ("clientes", "turnos", "eventos"…)
 */
export default function Paginacion({ pagina, total, porPagina, onCambiar, etiqueta = 'elementos' }) {
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina))
  if (total <= porPagina) return null

  return (
    <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
      <span className="text-xs text-slate-500">
        Página {pagina} de {totalPaginas} · {total} {etiqueta}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onCambiar(pagina - 1)}
          disabled={pagina <= 1}
          className="px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ← Anterior
        </button>
        <button
          onClick={() => onCambiar(pagina + 1)}
          disabled={pagina >= totalPaginas}
          className="px-3 py-1.5 text-xs font-semibold text-white bg-purple-700 rounded-lg hover:bg-purple-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Siguiente →
        </button>
      </div>
    </div>
  )
}
