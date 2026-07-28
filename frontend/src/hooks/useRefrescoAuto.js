import { useEffect, useRef } from 'react'

/**
 * Refresca datos cada cierto tiempo, pero solo mientras la pestaña está a la vista.
 *
 * En la clínica es normal dejar el panel abierto todo el día en una pestaña de
 * atrás. Sin esta pausa, cada pantalla abierta sigue pidiendo datos aunque
 * nadie la esté mirando: con varias personas conectadas eso es tráfico y
 * consultas a la base que no le sirven a nadie.
 *
 * Al volver a la pestaña se refresca de inmediato, así que quien regresa no ve
 * información vieja esperando el próximo ciclo.
 *
 * @param {() => void} alRefrescar  qué hacer en cada ciclo
 * @param {number} cadaMs           intervalo en milisegundos
 * @param {boolean} activo          permite suspenderlo (ej. con un modal abierto)
 */
export function useRefrescoAuto(alRefrescar, cadaMs, activo = true) {
  // Se guarda en una ref para que cambiar la función no reinicie el temporizador
  // en cada render (si no, el ciclo se reiniciaría constantemente y no dispararía).
  const cbRef = useRef(alRefrescar)
  useEffect(() => { cbRef.current = alRefrescar })

  useEffect(() => {
    if (!activo) return

    let timer = null
    const detener = () => { if (timer) { clearInterval(timer); timer = null } }
    const arrancar = () => { if (!timer) timer = setInterval(() => cbRef.current?.(), cadaMs) }

    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'visible') {
        cbRef.current?.()   // ponerse al día al volver
        arrancar()
      } else {
        detener()
      }
    }

    if (document.visibilityState === 'visible') arrancar()
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    return () => {
      detener()
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
    }
  }, [cadaMs, activo])
}
