// Avisos que la clínica debe ver sobre su plan, sin esperar a toparse con un bloqueo.

export const NOMBRE_RECURSO = {
  usuarios: 'usuarios',
  mascotas: 'mascotas',
  almacenamiento: 'almacenamiento de documentos',
  ia: 'usos de IA de este mes',
}

const GRAVEDAD = { urgente: 0, aviso: 1 }

/**
 * Lista de avisos ordenada de más a menos grave.
 * `s` es la respuesta de GET /api/suscripcion/.
 */
export function avisosDeSuscripcion(s) {
  if (!s) return []
  const avisos = []

  if (s.dias_restantes != null && s.estado === 'activa' && s.dias_restantes <= 7) {
    const d = s.dias_restantes
    avisos.push({
      nivel: d <= 2 ? 'urgente' : 'aviso',
      clave: 'vence',
      texto: d <= 0 ? 'Tu plan vence hoy.' : `Tu plan vence en ${d} día${d === 1 ? '' : 's'}.`,
    })
  }

  for (const [recurso, r] of Object.entries(s.limites ?? {})) {
    if (r.limite == null || r.porcentaje == null) continue
    const nombre = NOMBRE_RECURSO[recurso] ?? recurso
    if (r.porcentaje >= 100) {
      avisos.push({ nivel: 'urgente', clave: recurso, texto: `Llegaste al tope de ${nombre} de tu plan.` })
    } else if (r.porcentaje >= 90) {
      avisos.push({ nivel: 'aviso', clave: recurso, texto: `Estás cerca del tope de ${nombre} (${r.porcentaje}%).` })
    }
  }
  return avisos.sort((a, b) => GRAVEDAD[a.nivel] - GRAVEDAD[b.nivel])
}

/** "S/ 79.00" */
export const soles = (n) =>
  `S/ ${(Number(n) || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Un tope en palabras: null = "Sin límite". */
export function textoTope(valor, unidad = '') {
  if (valor == null) return 'Sin límite'
  return `${Number(valor).toLocaleString('es-PE')}${unidad ? ` ${unidad}` : ''}`
}
