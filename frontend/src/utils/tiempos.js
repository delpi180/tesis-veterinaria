// Medición del tiempo de registro de una consulta (módulo de tesis).
//   manual → segundos desde que se abrió el formulario hasta guardar
//   IA     → segundos grabando + segundos esperando el procesamiento
//            (transcripción y estructuración). Revisar el formulario después
//            no cuenta.

/** Campos de tiempo que se guardan junto con la consulta nueva. */
export function tiemposDeRegistro({ usoIA, ia, inicioMs, ahoraMs }) {
  if (usoIA && ia && (ia.grabacion > 0 || ia.procesamiento > 0)) {
    return {
      metodo_registro: 'ia',
      segundos_grabacion: ia.grabacion,
      segundos_procesamiento: ia.procesamiento,
      segundos_registro: Math.max(1, ia.grabacion + ia.procesamiento),
    }
  }
  return {
    metodo_registro: 'manual',
    segundos_registro: Math.max(1, Math.round((ahoraMs - inicioMs) / 1000)),
  }
}

/** Suma los tiempos de un dictado a lo ya acumulado en la consulta. */
export function sumarDictado(acum, tiempos) {
  return {
    grabacion: acum.grabacion + Math.max(0, Math.round(tiempos?.grabacion_seg ?? 0)),
    procesamiento: acum.procesamiento + Math.max(0, Math.round(tiempos?.procesamiento_seg ?? 0)),
  }
}
