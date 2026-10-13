import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { api, esAdmin } from './api'

/**
 * Suscripción de la clínica (plan, uso contra límites, vencimiento) para toda la app.
 *
 * Solo la administradora la ve y la carga; el resto del equipo no tiene acceso
 * a esos datos (el servidor se lo niega). Así el menú puede ocultar lo que el
 * plan no incluye y la app puede avisar antes de que algo se bloquee.
 */
const Ctx = createContext({ datos: null, cargando: false, recargar: () => {} })

export function SuscripcionProvider({ children }) {
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(esAdmin())

  const recargar = useCallback(async () => {
    if (!esAdmin()) return
    try { setDatos(await api.get('/api/suscripcion/')) }
    catch { /* sin conexión: se conserva lo último; el servidor igual hace cumplir los límites */ }
    finally { setCargando(false) }
  }, [])

  useEffect(() => { recargar() }, [recargar])

  return <Ctx.Provider value={{ datos, cargando, recargar }}>{children}</Ctx.Provider>
}

export const useSuscripcion = () => useContext(Ctx)
