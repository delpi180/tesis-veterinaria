const BASE = import.meta.env.VITE_API_URL ?? ''

async function request(path, options = {}) {
  let res
  try {
    res = await fetch(BASE + path, options)
  } catch {
    throw new Error('Sin conexión con el servidor. ¿Está el backend corriendo?')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.detail ?? `Error del servidor: HTTP ${res.status}`)
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
