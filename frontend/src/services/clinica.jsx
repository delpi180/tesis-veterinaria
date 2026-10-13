import { createContext, useContext, useEffect, useState } from 'react'
import { aplicarMarca } from '../utils/paleta'

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
export const CACHE_KEY = 'vet_clinica'
const TOKEN_KEY = 'vet_token'

const POR_DEFECTO = {
  nombre: 'Gestión Veterinaria',
  ruc: null,
  direccion: null,
  telefono: null,
  email: null,
  pie_comprobante: 'Gracias por su preferencia',
  color_marca: null,
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

  // Con sesión, el servidor responde con los datos de LA clínica de quien
  // pregunta; sin sesión, con los genéricos del producto.
  const recargar = async () => {
    try {
      const token = localStorage.getItem(TOKEN_KEY)
      const res = await fetch(`${BASE}/api/configuracion/`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) return
      const datos = await res.json()
      setClinica({ ...POR_DEFECTO, ...datos })
      if (token) localStorage.setItem(CACHE_KEY, JSON.stringify(datos))
      else localStorage.removeItem(CACHE_KEY)
    } catch {
      // Sin conexión se mantiene lo último conocido: la app sigue usable.
    }
  }

  useEffect(() => { recargar() }, [])

  // El color de marca de la clínica reemplaza al del producto en toda la app
  useEffect(() => { aplicarMarca(clinica.color_marca) }, [clinica.color_marca])

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
