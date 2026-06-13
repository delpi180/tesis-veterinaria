// Estilos y helpers compartidos para citas/turnos — usados por Turnos y el panel de mascota.

export const ESTADO_CITA = {
  pendiente:  { pill: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-500'   },
  confirmada: { pill: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  atendida:   { pill: 'bg-sky-100 text-sky-700',         dot: 'bg-sky-500'     },
  cancelada:  { pill: 'bg-rose-100 text-rose-700',       dot: 'bg-rose-400'    },
}

export const ESTADOS_CITA = ['pendiente', 'confirmada', 'atendida', 'cancelada']

export const estadoStyle = (estado) =>
  ESTADO_CITA[estado] ?? { pill: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' }

export const estadoLabel = (estado) =>
  estado ? estado.charAt(0).toUpperCase() + estado.slice(1) : '—'

// Construye un enlace de WhatsApp con un recordatorio prellenado.
// Si se pasa `cita` (con fecha_hora), el mensaje la referencia; si no, es genérico.
export function waRecordatorio(telefono, clienteNombre, mascotaNombre, cita) {
  const tel  = (telefono || '').replace(/\D/g, '')
  const intl = tel.length === 9 ? `51${tel}` : tel   // Perú: móvil de 9 dígitos

  let msg
  if (cita?.fecha_hora) {
    const f     = new Date(cita.fecha_hora)
    const fecha = f.toLocaleDateString('es-PE')
    const hora  = f.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
    msg = `Hola ${clienteNombre}, le recordamos que ${mascotaNombre} tiene una cita en ` +
          `Veterinaria Los Pinos el ${fecha} a las ${hora}` +
          `${cita.motivo ? ` (${cita.motivo})` : ''}. ¡Lo esperamos!`
  } else {
    msg = `Hola ${clienteNombre}, le escribimos de Veterinaria Los Pinos para recordarle ` +
          `el control de ${mascotaNombre}. ¿Desea agendar una cita?`
  }
  return `https://wa.me/${intl}?text=${encodeURIComponent(msg)}`
}
