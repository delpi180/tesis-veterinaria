import { useEffect } from 'react'

/**
 * Cierra un modal con la tecla Escape.
 *
 * Antes solo el buscador global respondía a Escape; en el resto de los
 * formularios había que apuntarle a la X de la esquina. Con el teclado ya en
 * las manos —que es como se cargan datos todo el día— soltar el mouse para
 * cerrar un cuadro es una interrupción tonta y constante.
 *
 * Se registra en `keydown` de la ventana con `capture`, para que responda
 * aunque el foco esté dentro de un campo del formulario.
 *
 * @param {boolean}  activo   Si el modal está abierto (no escucha si no lo está).
 * @param {Function} onCerrar Qué hacer al presionar Escape.
 */
export function useCerrarConEscape(activo, onCerrar) {
  useEffect(() => {
    if (!activo) return
    const alPresionar = (e) => {
      if (e.key !== 'Escape') return
      // Si hay una lista de sugerencias abierta (buscador de paciente, de
      // cliente…), Escape debería cerrar ESA primero. Ese caso lo maneja el
      // propio componente y detiene la propagación antes de llegar acá.
      e.stopPropagation()
      onCerrar()
    }
    window.addEventListener('keydown', alPresionar, true)
    return () => window.removeEventListener('keydown', alPresionar, true)
  }, [activo, onCerrar])
}
