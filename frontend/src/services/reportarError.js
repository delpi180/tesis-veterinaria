const BASE = import.meta.env.VITE_API_URL ?? ''

/**
 * Avisa al servidor que algo falló en el navegador.
 *
 * Antes, un error del navegador moría en la consola del usuario y a quien da
 * soporte no le llegaba nada: la clínica llamaba diciendo "no funciona" y no
 * había forma de saber qué pasó ni en qué pantalla.
 *
 * Nunca lanza ni interrumpe: reportar un fallo no puede provocar otro. Si el
 * reporte no sale (sin internet, servidor caído), se pierde en silencio — el
 * usuario nunca debe ver un error causado por la telemetría.
 */
export function reportarError(error, detalleExtra = null) {
  try {
    const mensaje = String(error?.message ?? error ?? 'Error desconocido').slice(0, 500)
    const detalle = [error?.stack, detalleExtra].filter(Boolean).join('\n\n') || null

    // Se manda el token si lo hay, para saber a quién le pasó (sin él el
    // reporte igual se acepta: un fallo en la pantalla de acceso no tiene
    // sesión y es justamente uno de los que hay que poder ver). Se lee de
    // localStorage y no desde services/api para no arrastrar dependencias:
    // esto tiene que funcionar aunque la app esté a medio romper.
    const cabeceras = { 'Content-Type': 'application/json' }
    try {
      const token = localStorage.getItem('vet_token')
      if (token) cabeceras.Authorization = `Bearer ${token}`
    } catch { /* modo privado sin acceso a localStorage: se reporta anónimo */ }

    // keepalive: permite que el reporte llegue aunque la página se esté
    // cerrando o recargando justo después del fallo.
    fetch(`${BASE}/api/errores/`, {
      method: 'POST',
      headers: cabeceras,
      body: JSON.stringify({ mensaje, detalle, ruta: window.location.pathname }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    // ni siquiera armar el reporte debe romper nada
  }
}

/**
 * Captura los fallos que NO pasan por un ErrorBoundary de React: errores
 * sueltos de JavaScript y promesas rechazadas sin manejar (una llamada al
 * servidor que falla dentro de un `onClick`, por ejemplo).
 */
export function instalarCapturaGlobal() {
  window.addEventListener('error', (e) => {
    reportarError(e.error ?? e.message, e.filename ? `${e.filename}:${e.lineno}` : null)
  })
  window.addEventListener('unhandledrejection', (e) => {
    reportarError(e.reason, 'Promesa rechazada sin manejar')
  })
}
