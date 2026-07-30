/**
 * Esqueletos de carga.
 *
 * Antes cada pantalla resolvía la espera con un "Cargando…" centrado. El
 * problema no era la estética: el texto ocupa una línea y el contenido real
 * ocupa media pantalla, así que al llegar los datos todo saltaba de golpe y
 * el clic que la recepcionista ya estaba haciendo caía en otro botón.
 *
 * Un esqueleto con la forma del contenido final reserva ese espacio desde el
 * principio. Además comunica qué va a aparecer, no solo que hay que esperar.
 *
 * `prefers-reduced-motion` desactiva el pulso (está en index.css); acá no hay
 * que hacer nada extra.
 */

/** Bloque gris básico. `className` define el tamaño. */
export function Skeleton({ className = '', style }) {
  return (
    <div
      aria-hidden="true"
      style={style}
      className={`bg-slate-200/70 rounded animate-pulse ${className}`}
    />
  );
}

/** Varias líneas de texto, la última más corta como en un párrafo real. */
export function SkeletonTexto({ lineas = 3, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lineas }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lineas - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  );
}

/**
 * Filas de una lista o tabla: círculo o cuadro a la izquierda, dos líneas de
 * texto y un valor a la derecha. Es la forma que tienen casi todos los
 * listados de la aplicación (turnos, clientes, productos, ventas).
 */
export function SkeletonFilas({ filas = 5, conAvatar = true, conValor = true }) {
  return (
    <div className="divide-y divide-slate-50" role="status" aria-label="Cargando…">
      {Array.from({ length: filas }).map((_, i) => (
        <div key={i} className="px-5 py-3.5 flex items-center gap-3">
          {conAvatar && <Skeleton className="w-8 h-8 rounded-full shrink-0" />}
          <div className="flex-1 min-w-0 space-y-1.5">
            {/* Anchos distintos por fila: uniformes se ven como una tabla vacía */}
            <Skeleton className={`h-3.5 ${['w-1/3', 'w-1/2', 'w-2/5'][i % 3]}`} />
            <Skeleton className="h-2.5 w-1/4" />
          </div>
          {conValor && <Skeleton className="h-3.5 w-16 shrink-0" />}
        </div>
      ))}
    </div>
  );
}

/** Tarjetas de indicadores (los KPI de los paneles). */
export function SkeletonTarjetas({ cantidad = 4, className = '' }) {
  return (
    <div className={className} role="status" aria-label="Cargando…">
      {Array.from({ length: cantidad }).map((_, i) => (
        <div key={i} className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex items-center gap-4 shadow-sm">
          <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <Skeleton className="h-2.5 w-2/3" />
            <Skeleton className="h-5 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
