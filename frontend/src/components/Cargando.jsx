/**
 * La espera, en un solo lugar.
 *
 * Había ocho definiciones de `Spinner` repartidas por las pantallas, cada una
 * con su tamaño y su tono de morado, y cada bloque de carga con un `py-16`,
 * `py-20` o `py-24` distinto. El resultado: la ruedita aparecía a distinta
 * altura según la pantalla y nunca en el centro del espacio disponible, sino
 * donde el relleno fijo la dejara.
 *
 * Acá hay una sola ruedita y un solo bloque centrado de verdad — centrado
 * dentro del área que le toca, no empujado desde arriba con relleno.
 *
 * Para listados preferir los esqueletos de `Skeleton.jsx`: muestran la forma
 * del contenido y no hacen saltar la página cuando llegan los datos. Esto es
 * para lo que no tiene forma previsible (un panel, un reporte, un perfil).
 */

/**
 * Ruedita de carga.
 *
 * El color va por prop y no por `className`: dos utilidades de color de
 * Tailwind tienen la misma especificidad, así que cuál gana depende del orden
 * en la hoja generada, no del orden en el atributo. Pasarlo explícito es la
 * única forma de que un botón morado pueda pedir la ruedita en blanco y que
 * salga blanca siempre.
 */
export function Spinner({ size = 20, color = 'text-purple-500', className = '' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label="Cargando"
      style={{ width: size, height: size }}
      className={`shrink-0 animate-spin ${color} ${className}`}
    >
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

/**
 * Bloque de carga centrado en el espacio disponible.
 *
 * `flex-1` toma la altura que haya y `justify-center` la reparte; el
 * `min-h` es el piso para cuando el contenedor no tiene altura propia (una
 * tarjeta que todavía está vacía), para que no quede la ruedita pegada al
 * borde superior.
 */
export function Cargando({ texto = 'Cargando…', alto = 220, className = '' }) {
  return (
    <div
      style={{ minHeight: alto }}
      className={`flex flex-1 flex-col items-center justify-center gap-3 ${className}`}
    >
      <Spinner size={26} />
      <span className="text-sm text-slate-500">{texto}</span>
    </div>
  );
}

/** La misma espera ocupando la pantalla: entre rutas, mientras carga el módulo. */
export function CargandoPantalla({ texto = 'Cargando…' }) {
  return <Cargando texto={texto} alto="60vh" className="w-full" />;
}
