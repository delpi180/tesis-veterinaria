const BASE = import.meta.env.VITE_API_URL ?? ''

const TOKEN_KEY = 'vet_token'
const USER_KEY  = 'vet_usuario'
const NAME_KEY  = 'vet_nombre'
const ROL_KEY   = 'vet_rol'

export const getToken   = () => localStorage.getItem(TOKEN_KEY)
export const getUsuario = () => localStorage.getItem(USER_KEY)
export const getNombre  = () => localStorage.getItem(NAME_KEY)
export const getRol     = () => localStorage.getItem(ROL_KEY)
export const esVeterinario = () => getRol() === 'veterinario'

export function setSesion({ token, usuario, nombre, rol }) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, usuario)
  localStorage.setItem(NAME_KEY, nombre ?? usuario)
  localStorage.setItem(ROL_KEY, rol ?? 'veterinario')
}

export function cerrarSesion() {
  [TOKEN_KEY, USER_KEY, NAME_KEY, ROL_KEY].forEach(k => localStorage.removeItem(k))
}

/** Cabeceras de autorización para usar también en fetch directos (p. ej. /api/transcribe). */
export function authHeaders() {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function request(path, options = {}) {
  let res
  try {
    res = await fetch(BASE + path, {
      ...options,
      headers: { ...authHeaders(), ...(options.headers ?? {}) },
    })
  } catch {
    throw new Error('Sin conexión con el servidor. ¿Está el backend corriendo?')
  }

  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    // Sesión expirada o sin login → volver a la pantalla de acceso
    cerrarSesion()
    window.location.href = '/login'
    throw new Error('Sesión expirada. Inicia sesión nuevamente.')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    let detail = body?.detail
    if (Array.isArray(detail)) {
      // Errores de validación de FastAPI → mensaje legible
      detail = detail.map(e => e?.msg ?? '').filter(Boolean).join('; ')
    }
    throw new Error(detail || `Error del servidor: HTTP ${res.status}`)
  }

  return res.status === 204 ? null : res.json()
}

const get  = (path)       => request(path)
const post = (path, body) => request(path, {
  method:  'POST',
  headers: { 'Content-Type': 'application/json' },
  body:    JSON.stringify(body),
})
const put  = (path, body) => request(path, {
  method:  'PUT',
  headers: { 'Content-Type': 'application/json' },
  body:    JSON.stringify(body),
})
const del  = (path)       => request(path, { method: 'DELETE' })

export const api = { get, post, put, del }
