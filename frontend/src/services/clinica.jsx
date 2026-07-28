import { createContext, useContext, useEffect, useState } from 'react'

/**
 * Datos de la clínica (nombre, RUC, dirección, teléfono) disponibles en toda la app.
 *
 * Antes el nombre estaba escrito a mano en el login, el menú, las boletas y los
 * PDF, así que instalar el sistema en otra clínica obligaba a editar el código.
 * Ahora se carga una sola vez desde el backend.
 *
 * Se guarda además en localStorage para que la pantalla de acceso muestre el
 * nombre correcto de inmediato (sin el parpadeo de un valor genérico) mientras
 * llega la respuesta del servidor.
 */

const BASE = import.meta.env.VITE_API_URL ?? ''
const CACHE_KEY = 'vet_clinica'

const POR_DEFECTO = {
  nombre: 'Mi Veterinaria',
  ruc: null,
  direccion: null,
  telefono: null,
  email: null,
  pie_comprobante: 'Gracias por su preferencia',
}

function leerCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? { ...POR_DEFECTO, ...JSON.parse(raw) } : POR_DEFECTO
  } catch {
    return POR_DEFECTO
  }
}

/** Lectura sincrónica para código que no es un componente (generadores de PDF). */
export function clinicaActual() {
  return leerCache()
}

const ClinicaContext = createContext({ clinica: POR_DEFECTO, recargar: () => {} })

export function ClinicaProvider({ children }) {
  const [clinica, setClinica] = useState(leerCache)

  const recargar = async () => {
    try {
      const res = await fetch(`${BASE}/api/configuracion/`)
      if (!res.ok) return
      const datos = await res.json()
      setClinica({ ...POR_DEFECTO, ...datos })
      localStorage.setItem(CACHE_KEY, JSON.stringify(datos))
    } catch {
      // Sin conexión se mantiene lo último conocido: la app sigue usable.
    }
  }

  useEffect(() => { recargar() }, [])

  // El título de la pestaña también lleva el nombre de la clínica
  useEffect(() => {
    if (clinica?.nombre) document.title = clinica.nombre
  }, [clinica.nombre])

  return (
    <ClinicaContext.Provider value={{ clinica, recargar }}>
      {children}
    </ClinicaContext.Provider>
  )
}

export const useClinica = () => useContext(ClinicaContext)
