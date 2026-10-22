/**
 * Lista de clientes (dueños) y de pacientes, con la distribución de Volki:
 * pestañas «Clientes | Pacientes», buscador y filtros arriba, «Nuevo +» a la
 * derecha, tabla en un bloque redondeado con flecha y ✕ al final de cada fila,
 * paginación abajo a la derecha y las exportaciones al pie. Ocupa todo el ancho.
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Divider, Dropdown, Flex, Form, Grid, Input, Modal, Select, Table, Tabs, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  ArrowRightOutlined, CloseOutlined, DownloadOutlined, EllipsisOutlined, PlusOutlined, SearchOutlined, SettingOutlined,
} from '@ant-design/icons'
import { BRAND } from '@src/core/color'
import { api, esAdmin } from '../services/api'
import { exportarCSV, exportarXLSX } from '../utils/exportUtils'
import { useToast } from '../components/Toast'
import Disposicion from '../components/consulta/Disposicion'
import ConfirmarEscribiendo from '../components/cliente/ConfirmarEscribiendo'
import GestorEtiquetas from '../components/cliente/GestorEtiquetas'
import type { Etiqueta } from '../components/cliente/GestorEtiquetas'

interface MascotaDeCliente { id: number; nombre: string }

interface Cliente {
  id: number
  dni?: string | null
  nombre: string
  telefono?: string | null
  direccion?: string | null
  pacientes?: MascotaDeCliente[]
  etiquetas?: Etiqueta[]
}

/** Lo que devuelve /api/pacientes/buscar: la mascota con su dueño al lado. */
interface MascotaBuscada {
  id: number
  nombre: string
  especie?: string | null
  raza?: string | null
  sexo?: string | null
  edad?: number | null
  cliente_id: number
  propietario?: string | null
  propietario_dni?: string | null
  propietario_telefono?: string | null
  ultima_consulta?: string | null
}

/** Una fila de GET /api/pacientes/ (la pestaña «Pacientes»). */
interface FilaPaciente {
  id: number
  nombre: string
  especie?: string | null
  raza?: string | null
  edad?: number | null
  sexo?: string | null
  microchip?: string | null
  activo: boolean
  cliente_id: number
  responsable?: string | null
  proximo_turno?: string | null
}

interface FormCliente { dni: string; nombre: string; telefono: string; direccion: string }

const TAMANO_INICIAL = 10
const OPCIONES_TAMANO = [10, 25, 50]
const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Lima' })
const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima',
  })
const lecturaEdad = (e?: number | null) => (e == null ? null : `${e} año${e !== 1 ? 's' : ''}`)

/** Variables que usa la clase .tabla-pildoras (ver index.css): los colores salen de core/color.ts. */
const estiloPildoras = {
  '--fila-bg': BRAND.panel,
  '--fila-bg-hover': BRAND.border,
} as React.CSSProperties

// ── Alta de cliente ─────────────────────────────────────────────────────────
function ModalNuevoCliente({ abierto, onCerrar, onCreado }: {
  abierto: boolean
  onCerrar: () => void
  onCreado: (nuevo: Cliente) => void
}) {
  const [form] = Form.useForm<FormCliente>()
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (abierto) { form.resetFields(); setError(null); setGuardando(false) }
  }, [abierto, form])

  const guardar = async (valores: FormCliente) => {
    const dni = (valores.dni ?? '').trim()
    const tel = (valores.telefono ?? '').replace(/\D/g, '')
    if (!dni) { setError('El DNI es obligatorio.'); return }
    if (!/^\d{8}$/.test(dni)) { setError('El DNI debe tener exactamente 8 dígitos.'); return }
    if (!(valores.nombre ?? '').trim()) { setError('El nombre es obligatorio.'); return }
    if ((valores.telefono ?? '').trim() && (tel.length < 6 || tel.length > 12)) {
      setError('El teléfono debe tener entre 6 y 12 dígitos.'); return
    }
    setGuardando(true); setError(null)
    try {
      const nuevo = await api.post('/api/clientes/', {
        dni: valores.dni ?? '', nombre: valores.nombre ?? '',
        telefono: valores.telefono ?? '', direccion: valores.direccion ?? '',
      })
      onCreado(nuevo)
    } catch (e) {
      setError((e as Error).message)
      setGuardando(false)
    }
  }

  return (
    <Modal
      open={abierto} onCancel={onCerrar} title="Nuevo dueño / propietario"
      okText="Guardar cliente" cancelText="Cancelar" destroyOnHidden
      onOk={() => form.submit()} confirmLoading={guardando}
    >
      <Form form={form} layout="vertical" onFinish={guardar} requiredMark={false}>
        <Form.Item name="dni" label="DNI *">
          <Input placeholder="Ej: 12345678" inputMode="numeric" autoComplete="off" maxLength={8} />
        </Form.Item>
        <Form.Item name="nombre" label="Nombre completo *">
          <Input placeholder="Ej: María González" autoComplete="off" />
        </Form.Item>
        <Form.Item name="telefono" label="Teléfono">
          <Input placeholder="Ej: +51 987 654 321" inputMode="tel" autoComplete="off" />
        </Form.Item>
        <Form.Item name="direccion" label="Dirección">
          <Input placeholder="Ej: Av. Principal 45" autoComplete="off" />
        </Form.Item>
        {error && <Alert type="error" showIcon title={error} />}
      </Form>
    </Modal>
  )
}

// ── Vista principal ─────────────────────────────────────────────────────────
export default function Clientes() {
  const navigate = useNavigate()
  const toast = useToast()
  const pantallas = Grid.useBreakpoint()
  const esCelular = !pantallas.md
  const admin = esAdmin()

  const [pestana, setPestana] = useState<'clientes' | 'pacientes'>('clientes')

  // ── Clientes
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mostrarAlta, setMostrarAlta] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [etiquetaIds, setEtiquetaIds] = useState<number[]>([])
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([])
  const [gestionando, setGestionando] = useState(false)
  const [tamano, setTamano] = useState(TAMANO_INICIAL)
  const [pagina, setPagina] = useState(1)
  const [total, setTotal] = useState(0)
  const [exportando, setExportando] = useState<'csv' | 'xlsx' | null>(null)

  // Mascotas que coinciden con la búsqueda. En el mostrador se pregunta por el
  // animal ("vengo con Pepita"), no por el dueño: se listan todas las Pepitas
  // con su propietario al lado para poder distinguirlas.
  const [mascotas, setMascotas] = useState<MascotaBuscada[]>([])

  // Borrar un cliente: confirmación escribiendo ELIMINAR; el servidor puede negarse (409)
  const [porBorrar, setPorBorrar] = useState<Cliente | null>(null)
  const [borrando, setBorrando] = useState(false)
  const [errorBorrar, setErrorBorrar] = useState<string | null>(null)

  // ── Pacientes
  const [busquedaPac, setBusquedaPac] = useState('')
  const [estado, setEstado] = useState<'activo' | 'inactivo' | 'todos'>('activo')
  const [especie, setEspecie] = useState<string | undefined>()
  const [raza, setRaza] = useState<string | undefined>()
  const [especies, setEspecies] = useState<string[]>([])
  const [razas, setRazas] = useState<string[]>([])
  const [pacientes, setPacientes] = useState<FilaPaciente[]>([])
  const [totalPac, setTotalPac] = useState(0)
  const [paginaPac, setPaginaPac] = useState(1)
  const [tamanoPac, setTamanoPac] = useState(TAMANO_INICIAL)
  const [cargandoPac, setCargandoPac] = useState(false)
  const [errorPac, setErrorPac] = useState<string | null>(null)
  const [porDesactivar, setPorDesactivar] = useState<FilaPaciente | null>(null)
  const [desactivando, setDesactivando] = useState(false)
  const [errorDesactivar, setErrorDesactivar] = useState<string | null>(null)

  const cargarEtiquetas = useCallback(async () => {
    try {
      const e = await api.get('/api/etiquetas/')
      setEtiquetas(Array.isArray(e) ? e : [])
    } catch { setEtiquetas([]) }
  }, [])
  useEffect(() => { cargarEtiquetas() }, [cargarEtiquetas])

  const paramsClientes = (q: string, ids: number[]) => {
    const p = new URLSearchParams()
    if (q.trim()) p.set('q', q.trim())
    ids.forEach(i => p.append('etiqueta_id', String(i)))
    return p
  }

  const cargar = async (q: string, pag: number, lim: number, ids: number[]) => {
    setLoading(true); setError(null)
    try {
      const p = paramsClientes(q, ids)
      const filtros = p.toString()
      const lista = new URLSearchParams(p)
      lista.set('skip', String((pag - 1) * lim)); lista.set('limit', String(lim))
      const [data, cont] = await Promise.all([
        api.get(`/api/clientes/?${lista.toString()}`),
        api.get(`/api/clientes/contar${filtros ? `?${filtros}` : ''}`),
      ])
      setClientes(Array.isArray(data) ? data : [])
      setTotal(cont?.total ?? 0)
      // Las mascotas se piden aparte y no bloquean la lista de dueños: si ese
      // endpoint falla, la pantalla sigue sirviendo.
      if (q.trim()) {
        try {
          const m = await api.get(`/api/pacientes/buscar?q=${encodeURIComponent(q.trim())}`)
          setMascotas(Array.isArray(m) ? m : [])
        } catch { setMascotas([]) }
      } else {
        setMascotas([])
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // Búsqueda en el servidor con debounce; al cambiar el texto o las etiquetas vuelve a página 1
  useEffect(() => {
    const t = setTimeout(() => { setPagina(1); cargar(busqueda, 1, tamano, etiquetaIds) }, busqueda ? 350 : 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, etiquetaIds])

  const irPagina = (nueva: number, lim: number) => {
    setPagina(nueva); setTamano(lim); cargar(busqueda, nueva, lim, etiquetaIds)
  }

  // ── Pacientes: opciones de los filtros y listado
  useEffect(() => {
    api.get(`/api/pacientes/opciones${especie ? `?especie=${encodeURIComponent(especie)}` : ''}`)
      .then(o => {
        if (!especie) setEspecies(Array.isArray(o?.especies) ? o.especies : [])
        setRazas(especie && Array.isArray(o?.razas) ? o.razas : [])
      })
      .catch(() => { setRazas([]) })
  }, [especie])

  const cargarPacientes = useCallback(async (pag: number, lim: number) => {
    setCargandoPac(true); setErrorPac(null)
    try {
      const p = new URLSearchParams({ estado, skip: String((pag - 1) * lim), limit: String(lim) })
      if (busquedaPac.trim()) p.set('q', busquedaPac.trim())
      if (especie) p.set('especie', especie)
      if (raza) p.set('raza', raza)
      const r = await api.get(`/api/pacientes/?${p.toString()}`)
      setPacientes(Array.isArray(r?.items) ? r.items : [])
      setTotalPac(r?.total ?? 0)
    } catch (e) {
      setErrorPac((e as Error).message); setPacientes([]); setTotalPac(0)
    } finally {
      setCargandoPac(false)
    }
  }, [busquedaPac, estado, especie, raza])

  // Solo se pide al abrir la pestaña y cuando cambia un filtro (con debounce en el texto)
  useEffect(() => {
    if (pestana !== 'pacientes') return
    const t = setTimeout(() => { setPaginaPac(1); cargarPacientes(1, tamanoPac) }, busquedaPac ? 350 : 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pestana, busquedaPac, estado, especie, raza])

  const irPaginaPac = (nueva: number, lim: number) => {
    setPaginaPac(nueva); setTamanoPac(lim); cargarPacientes(nueva, lim)
  }

  // ── Exportar: TODO lo que coincide con los filtros (no solo la página), en
  //    lotes porque el servidor limita a 1000 por petición.
  const traerTodosLosClientes = async () => {
    const LOTE = 1000
    let skip = 0
    let todos: Cliente[] = []
    while (true) {
      const p = paramsClientes(busqueda, etiquetaIds)
      p.set('skip', String(skip)); p.set('limit', String(LOTE))
      const lote = await api.get(`/api/clientes/?${p.toString()}`)
      if (!Array.isArray(lote) || lote.length === 0) break
      todos = todos.concat(lote)
      if (lote.length < LOTE) break
      skip += LOTE
    }
    return todos
  }
  const traerTodosLosPacientes = async () => {
    const LOTE = 200
    let skip = 0
    let todos: FilaPaciente[] = []
    while (true) {
      const p = new URLSearchParams({ estado, skip: String(skip), limit: String(LOTE) })
      if (busquedaPac.trim()) p.set('q', busquedaPac.trim())
      if (especie) p.set('especie', especie)
      if (raza) p.set('raza', raza)
      const r = await api.get(`/api/pacientes/?${p.toString()}`)
      const items: FilaPaciente[] = Array.isArray(r?.items) ? r.items : []
      if (items.length === 0) break
      todos = todos.concat(items)
      if (items.length < LOTE) break
      skip += LOTE
    }
    return todos
  }

  const exportar = async (formato: 'csv' | 'xlsx') => {
    setExportando(formato)
    try {
      const salir = formato === 'csv' ? exportarCSV : exportarXLSX
      if (pestana === 'clientes') {
        const todos = await traerTodosLosClientes()
        if (todos.length === 0) { toast.error('No hay clientes para exportar.'); return }
        await salir(
          'Clientes',
          ['DNI', 'Nombre', 'Teléfono', 'Dirección', 'Mascotas', 'Etiquetas'],
          todos.map(c => [
            c.dni ?? '', c.nombre, c.telefono ?? '', c.direccion ?? '',
            (c.pacientes ?? []).map(p => p.nombre).join(', '), (c.etiquetas ?? []).map(e => e.nombre).join(', '),
          ]),
        )
        toast.success(`${todos.length} cliente(s) exportado(s).`)
      } else {
        const todos = await traerTodosLosPacientes()
        if (todos.length === 0) { toast.error('No hay pacientes para exportar.'); return }
        await salir(
          'Pacientes',
          ['Nombre', 'Especie', 'Raza', 'Edad (años)', 'Sexo', 'Microchip', 'Estado', 'Responsable', 'Próximo turno'],
          todos.map(p => [
            p.nombre, p.especie ?? '', p.raza ?? '', p.edad ?? '', p.sexo ?? '', p.microchip ?? '',
            p.activo ? 'Activo' : 'Inactivo', p.responsable ?? '', p.proximo_turno ? fechaHora(p.proximo_turno) : '',
          ]),
        )
        toast.success(`${todos.length} paciente(s) exportado(s).`)
      }
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setExportando(null)
    }
  }

  // Un dueño nuevo llega con su mascota: encadenar las dos altas. Con 2500
  // clientes paginados, cargarle la mascota obligaba a buscar al dueño recién
  // creado; ahora se abre su ficha con el alta de mascota lista.
  const alCrear = (nuevo: Cliente) => {
    setMostrarAlta(false)
    if (nuevo?.id) navigate(`/clientes/${nuevo.id}`, { state: { nuevaMascota: true } })
    else irPagina(1, tamano)
  }

  const borrarCliente = async () => {
    if (!porBorrar) return
    setBorrando(true); setErrorBorrar(null)
    try {
      await api.del(`/api/clientes/${porBorrar.id}`)
      toast.success(`Cliente «${porBorrar.nombre}» eliminado.`)
      setPorBorrar(null)
      cargar(busqueda, pagina, tamano, etiquetaIds)
      cargarEtiquetas()
    } catch (e) {
      // El servidor se niega si el cliente tiene datos clínicos o ventas: se muestra tal cual
      setErrorBorrar((e as Error).message)
    } finally {
      setBorrando(false)
    }
  }

  const cambiarActivo = async (p: FilaPaciente, activo: boolean) => {
    try {
      await api.put(`/api/pacientes/${p.id}`, { activo })
      toast.success(activo ? `«${p.nombre}» está activo de nuevo.` : `«${p.nombre}» quedó inactivo.`)
      cargarPacientes(paginaPac, tamanoPac)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  const desactivar = async () => {
    if (!porDesactivar) return
    setDesactivando(true); setErrorDesactivar(null)
    try {
      await api.put(`/api/pacientes/${porDesactivar.id}`, { activo: false })
      toast.success(`«${porDesactivar.nombre}» quedó inactivo.`)
      setPorDesactivar(null)
      cargarPacientes(paginaPac, tamanoPac)
    } catch (e) {
      setErrorDesactivar((e as Error).message)
    } finally {
      setDesactivando(false)
    }
  }

  const term = busqueda.trim()

  // ── Columnas
  const botonAbrir = (etiqueta: string, ir: () => void) => (
    <Button
      type="text" aria-label={etiqueta} icon={<ArrowRightOutlined />}
      onClick={e => { e.stopPropagation(); ir() }}
    />
  )

  const columnasClientes: TableColumnsType<Cliente> = [
    {
      title: 'Nombres', dataIndex: 'nombre', key: 'nombre',
      render: (_: unknown, c) => (
        <Flex vertical>
          <Typography.Text>{c.nombre}</Typography.Text>
          {c.dni && <Typography.Text type="secondary" style={{ fontSize: 12 }}>DNI {c.dni}</Typography.Text>}
        </Flex>
      ),
    },
    {
      title: 'Pacientes', key: 'pacientes',
      render: (_: unknown, c) => (
        <Typography.Text ellipsis style={{ maxWidth: 220 }}>
          {(c.pacientes ?? []).map(p => p.nombre).join(', ') || '—'}
        </Typography.Text>
      ),
    },
    { title: 'Teléfono', dataIndex: 'telefono', key: 'telefono', render: (v: string | null) => v || '—' },
    { title: 'Dirección', dataIndex: 'direccion', key: 'direccion', render: (v: string | null) => v || '—' },
    {
      title: 'Etiquetas', key: 'etiquetas',
      render: (_: unknown, c) => (
        <Flex gap={4} wrap>
          {(c.etiquetas ?? []).map(e => <Tag key={e.id} color={e.color ?? undefined} style={{ margin: 0 }}>{e.nombre}</Tag>)}
        </Flex>
      ),
    },
    {
      title: '', key: 'acciones', width: admin ? 104 : 56, align: 'right',
      render: (_: unknown, c) => (
        <Flex justify="flex-end">
          {botonAbrir(`Abrir a ${c.nombre}`, () => navigate(`/clientes/${c.id}`))}
          {admin && (
            <Button
              type="text" aria-label={`Eliminar a ${c.nombre}`} icon={<CloseOutlined />}
              onClick={e => { e.stopPropagation(); setErrorBorrar(null); setPorBorrar(c) }}
            />
          )}
        </Flex>
      ),
    },
  ]
  // En celular se esconden las columnas largas y el nombre lleva el resto debajo
  const columnasClientesVisibles = esCelular
    ? [
        {
          title: 'Cliente', key: 'cliente',
          render: (_: unknown, c: Cliente) => (
            <Flex vertical gap={2}>
              <Typography.Text strong>{c.nombre}</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {[c.dni && `DNI ${c.dni}`, c.telefono].filter(Boolean).join(' · ') || '—'}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {(c.pacientes ?? []).map(p => p.nombre).join(', ') || 'Sin mascotas'}
              </Typography.Text>
              {(c.etiquetas ?? []).length > 0 && (
                <Flex gap={4} wrap>
                  {(c.etiquetas ?? []).map(e => <Tag key={e.id} color={e.color ?? undefined} style={{ margin: 0 }}>{e.nombre}</Tag>)}
                </Flex>
              )}
            </Flex>
          ),
        },
        columnasClientes[columnasClientes.length - 1],
      ] as TableColumnsType<Cliente>
    : columnasClientes

  const columnasMascotasBuscadas: TableColumnsType<MascotaBuscada> = [
    { title: 'Nombre', dataIndex: 'nombre', key: 'nombre', render: (v: string) => <Typography.Text strong>{v}</Typography.Text> },
    {
      title: 'Información', key: 'info',
      render: (_: unknown, m) => [m.especie, m.raza, m.sexo, lecturaEdad(m.edad)].filter(Boolean).join(', ') || '—',
    },
    {
      title: 'Responsable', key: 'resp',
      render: (_: unknown, m) => (
        <Flex vertical>
          <Button
            type="link" style={{ padding: 0, height: 'auto', justifyContent: 'flex-start' }}
            onClick={e => { e.stopPropagation(); navigate(`/clientes/${m.cliente_id}`) }}
          >
            {m.propietario || '—'}
          </Button>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {[m.propietario_dni && `DNI ${m.propietario_dni}`, m.propietario_telefono].filter(Boolean).join(' · ')}
          </Typography.Text>
        </Flex>
      ),
    },
    {
      title: 'Última consulta', key: 'ultima',
      render: (_: unknown, m) => (m.ultima_consulta ? fechaCorta(m.ultima_consulta) : 'Sin consultas'),
    },
    {
      title: '', key: 'abrir', width: 56, align: 'right',
      render: (_: unknown, m) => botonAbrir(`Abrir historial de ${m.nombre}`, () => navigate(`/pacientes/${m.id}/historial`)),
    },
  ]

  const columnasPacientes: TableColumnsType<FilaPaciente> = [
    {
      title: 'Nombre', key: 'nombre',
      render: (_: unknown, p) => (
        <Flex gap={8} align="center" wrap>
          <Typography.Text strong>{p.nombre}</Typography.Text>
          {!p.activo && <Tag style={{ margin: 0 }}>Inactivo</Tag>}
        </Flex>
      ),
    },
    {
      title: 'Información', key: 'info',
      render: (_: unknown, p) => [p.especie, p.raza, lecturaEdad(p.edad)].filter(Boolean).join(', ') || '—',
    },
    {
      title: 'Responsable', key: 'resp',
      render: (_: unknown, p) => (
        <Button
          type="link" style={{ padding: 0, height: 'auto' }}
          onClick={e => { e.stopPropagation(); navigate(`/clientes/${p.cliente_id}`) }}
        >
          {p.responsable || '—'}
        </Button>
      ),
    },
    {
      title: 'Próximo turno', key: 'turno',
      render: (_: unknown, p) => (p.proximo_turno ? fechaHora(p.proximo_turno) : '—'),
    },
    {
      title: '', key: 'acciones', width: 140, align: 'right',
      render: (_: unknown, p) => (
        <Flex justify="flex-end">
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'atender', label: 'Atender / Nueva consulta' },
                ...(p.activo ? [] : [{ key: 'reactivar', label: 'Volver a activar' }]),
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation()
                if (key === 'atender') navigate(`/consultas/${p.id}`)
                if (key === 'reactivar') cambiarActivo(p, true)
              },
            }}
          >
            <Button type="text" aria-label={`Más acciones de ${p.nombre}`} icon={<EllipsisOutlined />} onClick={e => e.stopPropagation()} />
          </Dropdown>
          {botonAbrir(`Abrir historial de ${p.nombre}`, () => navigate(`/pacientes/${p.id}/historial`))}
          {p.activo && (
            <Button
              type="text" aria-label={`Dar de baja a ${p.nombre}`} icon={<CloseOutlined />}
              onClick={e => { e.stopPropagation(); setErrorDesactivar(null); setPorDesactivar(p) }}
            />
          )}
        </Flex>
      ),
    },
  ]
  const columnasPacientesVisibles = esCelular
    ? [
        {
          title: 'Paciente', key: 'paciente',
          render: (_: unknown, p: FilaPaciente) => (
            <Flex vertical gap={2}>
              <Typography.Text strong>{p.nombre}{!p.activo && ' (inactivo)'}</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {[p.especie, p.raza, lecturaEdad(p.edad)].filter(Boolean).join(', ') || '—'}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {p.responsable || '—'}{p.proximo_turno ? ` · turno ${fechaHora(p.proximo_turno)}` : ''}
              </Typography.Text>
            </Flex>
          ),
        },
        columnasPacientes[columnasPacientes.length - 1],
      ] as TableColumnsType<FilaPaciente>
    : columnasPacientes

  const buscador = (valor: string, cambiar: (v: string) => void, texto: string) => (
    <Input
      allowClear value={valor} onChange={e => cambiar(e.target.value)}
      placeholder={texto} suffix={<SearchOutlined />} autoComplete="off"
      style={{ width: esCelular ? '100%' : 248 }} size="large"
      aria-label={texto}
    />
  )

  const paginacion = (actual: number, lim: number, tot: number, cambiar: (p: number, l: number) => void) => ({
    current: actual, pageSize: lim, total: tot, align: 'end' as const,
    showSizeChanger: { options: OPCIONES_TAMANO.map(n => ({ value: n, label: `${n} / pág.` })) },
    showTotal: (t: number, [a, b]: [number, number]) => `${a} – ${b} de ${t}`,
    onChange: (p: number, l: number) => cambiar(l !== lim ? 1 : p, l),
  })

  // Separaciones de Volki: pestañas → filtros 32 px (16 de la pestaña + 16 aquí), filtros → tabla 35 px
  const contenidoClientes = (
    <Flex vertical gap={35} style={{ paddingTop: 16 }}>
      <Flex justify="space-between" align="center" gap={12} wrap>
        <Flex gap={10} wrap style={{ flex: esCelular ? '1 1 100%' : undefined }}>
          {buscador(busqueda, setBusqueda, 'Buscar por mascota, dueño o DNI…')}
          <Select
            mode="multiple" allowClear showSearch={{ optionFilterProp: 'label' }} maxTagCount="responsive"
            placeholder="Etiquetas" aria-label="Filtrar por etiquetas"
            style={{ width: esCelular ? '100%' : 222 }} size="large"
            value={etiquetaIds} onChange={setEtiquetaIds}
            options={etiquetas.map(e => ({ value: e.id, label: e.nombre }))}
            notFoundContent="Aún no hay etiquetas."
            popupRender={menu => (
              <>
                {menu}
                {admin && (
                  <>
                    <Divider style={{ margin: '4px 0' }} />
                    <Button type="link" icon={<SettingOutlined />} onClick={() => setGestionando(true)}>
                      Administrar etiquetas
                    </Button>
                  </>
                )}
              </>
            )}
          />
        </Flex>
        <Button type="link" icon={<PlusOutlined />} iconPlacement="end" onClick={() => setMostrarAlta(true)}>
          Nuevo
        </Button>
      </Flex>

      {error && <Alert type="error" showIcon title={`No se pudo conectar con el servidor: ${error}`} />}

      {/* Mascotas que coinciden con la búsqueda (con su dueño al lado) */}
      {term && mascotas.length > 0 && (
        <div style={estiloPildoras}>
          <Typography.Text strong>Mascotas encontradas ({mascotas.length})</Typography.Text>
          <Table
            className="tabla-pildoras" rowKey="id" size="small" pagination={false}
            columns={columnasMascotasBuscadas} dataSource={mascotas}
            scroll={{ x: 'max-content' }}
            rowClassName="fila-clic"
            onRow={m => ({ onClick: () => navigate(`/pacientes/${m.id}/historial`) })}
          />
        </div>
      )}

      <div style={estiloPildoras}>
        <Table
          className="tabla-pildoras" rowKey="id" size="middle"
          columns={columnasClientesVisibles} dataSource={clientes} loading={loading}
          scroll={{ x: 'max-content' }}
          rowClassName="fila-clic"
          onRow={c => ({ onClick: () => navigate(`/clientes/${c.id}`) })}
          locale={{
            emptyText: term || etiquetaIds.length
              ? 'Sin resultados. Prueba con el nombre de la mascota, del dueño, el DNI u otra etiqueta.'
              : 'Aún no hay clientes registrados. Usa «Nuevo» para comenzar.',
          }}
          pagination={paginacion(pagina, tamano, total, irPagina)}
        />
      </div>
    </Flex>
  )

  const contenidoPacientes = (
    <Flex vertical gap={35} style={{ paddingTop: 16 }}>
      <Flex gap={12} wrap align="center">
        {buscador(busquedaPac, setBusquedaPac, 'Paciente o responsable…')}
        <Select
          value={estado} onChange={setEstado} aria-label="Estado del paciente"
          style={{ width: esCelular ? '100%' : 140 }} size="large"
          options={[
            { value: 'activo', label: 'Activo' },
            { value: 'inactivo', label: 'Inactivo' },
            { value: 'todos', label: 'Todos' },
          ]}
        />
        <Select
          allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="Especie/Grupo" aria-label="Filtrar por especie"
          style={{ width: esCelular ? '100%' : 180 }} size="large"
          value={especie} onChange={v => { setEspecie(v); setRaza(undefined) }}
          options={especies.map(e => ({ value: e, label: e }))}
        />
        <Select
          allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="Raza/Subgrupo" aria-label="Filtrar por raza"
          style={{ width: esCelular ? '100%' : 180 }} size="large"
          disabled={!especie} value={raza} onChange={setRaza}
          options={razas.map(r => ({ value: r, label: r }))}
        />
      </Flex>
      {errorPac && <Alert type="error" showIcon title={`No se pudo cargar los pacientes: ${errorPac}`} />}
      <div style={estiloPildoras}>
        <Table
          className="tabla-pildoras" rowKey="id" size="middle"
          columns={columnasPacientesVisibles} dataSource={pacientes} loading={cargandoPac}
          scroll={{ x: 'max-content' }}
          rowClassName="fila-clic"
          onRow={p => ({ onClick: () => navigate(`/pacientes/${p.id}/historial`) })}
          locale={{ emptyText: busquedaPac.trim() || especie ? 'Sin pacientes para ese filtro.' : 'Aún no hay pacientes.' }}
          pagination={paginacion(paginaPac, tamanoPac, totalPac, irPaginaPac)}
        />
      </div>
    </Flex>
  )

  return (
    <Disposicion>
      <Tabs
        activeKey={pestana}
        onChange={k => setPestana(k as 'clientes' | 'pacientes')}
        items={[
          { key: 'clientes', label: 'Clientes', children: contenidoClientes },
          { key: 'pacientes', label: 'Pacientes', children: contenidoPacientes },
        ]}
      />

      <Divider style={{ margin: '20px 0 14px' }} />
      <Flex gap={8} wrap>
        <Button type="primary" icon={<DownloadOutlined />} loading={exportando === 'csv'} disabled={exportando !== null} onClick={() => exportar('csv')}>
          Exportar .csv
        </Button>
        <Button type="primary" icon={<DownloadOutlined />} loading={exportando === 'xlsx'} disabled={exportando !== null} onClick={() => exportar('xlsx')}>
          Exportar .xlsx
        </Button>
      </Flex>

      <ModalNuevoCliente abierto={mostrarAlta} onCerrar={() => setMostrarAlta(false)} onCreado={alCrear} />
      <GestorEtiquetas
        abierto={gestionando} etiquetas={etiquetas} onCerrar={() => setGestionando(false)}
        onCambio={() => { cargarEtiquetas(); cargar(busqueda, pagina, tamano, etiquetaIds) }}
      />
      <ConfirmarEscribiendo
        abierto={!!porBorrar} onCancelar={() => setPorBorrar(null)} onConfirmar={borrarCliente}
        titulo={`Eliminar a ${porBorrar?.nombre ?? ''}`} cargando={borrando} error={errorBorrar}
        descripcion="Se borra el cliente y sus mascotas. Si tiene historias clínicas, recetas, documentos o ventas, el sistema no lo borra para no perder datos."
      />
      <ConfirmarEscribiendo
        abierto={!!porDesactivar} onCancelar={() => setPorDesactivar(null)} onConfirmar={desactivar}
        titulo={`Dar de baja a ${porDesactivar?.nombre ?? ''}`} cargando={desactivando} error={errorDesactivar}
        palabra="DESACTIVAR" textoBoton="Dar de baja"
        descripcion="La mascota queda inactiva y deja de salir en la lista de activos. Su historial clínico no se borra y se puede volver a activar."
      />
    </Disposicion>
  )
}
