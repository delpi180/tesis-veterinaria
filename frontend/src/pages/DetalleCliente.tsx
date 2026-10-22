/**
 * Ficha del dueño, con la distribución de Volki: migas «Clientes › nombre»,
 * pestañas «Pacientes | Ventas» con «Nuevo +», la tabla de mascotas en
 * píldoras y, a la derecha pegada al borde, el nombre del cliente con sus
 * datos de contacto. Los atajos que antes tenía el panel de la mascota
 * (atender, agendar, WhatsApp, cobrar, antecedentes, documentos) siguen en el
 * menú «⋯» de cada fila.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  Alert, Button, Card, Dropdown, Empty, Flex, Form, Input, Modal, Result, Select, Skeleton, Table, Tabs, Tag, Typography,
} from 'antd'
import type { MenuProps, TableColumnsType } from 'antd'
import {
  ArrowRightOutlined, CalendarOutlined, CloseOutlined, EditOutlined, EllipsisOutlined, EnvironmentOutlined,
  IdcardOutlined, MedicineBoxOutlined, PhoneOutlined, PlusOutlined, SearchOutlined, WhatsAppOutlined,
} from '@ant-design/icons'
import { BRAND } from '@src/core/color'
import { MEDIDAS } from '@src/core/medidas'
import { edadLegible, hoyISOPeru } from '@src/utils/historiaClinica'
import { api, esAdmin } from '../services/api'
import { useConfirmar } from '../components/Confirmar'
import { useToast } from '../components/Toast'
import Disposicion from '../components/consulta/Disposicion'
import MascotaModal from '../components/cliente/MascotaModal'
import type { Mascota } from '../components/cliente/MascotaModal'
import CitaModal from '../components/cliente/CitaModal'
import DrawerMascota from '../components/cliente/DrawerMascota'
import type { Etiqueta } from '../components/cliente/GestorEtiquetas'

interface Cliente {
  id: number
  dni?: string | null
  nombre: string
  telefono?: string | null
  direccion?: string | null
  etiquetas?: Etiqueta[]
}

interface Cita { id: number; paciente_id: number; fecha_hora: string; estado: string }

interface VentaCliente {
  id: number
  fecha: string
  total: number
  metodo_pago?: string | null
  anulada?: boolean
  paciente_nombre?: string | null
  items: { descripcion: string; cantidad: number }[]
}

interface FormCliente { dni: string; nombre: string; telefono: string; direccion: string }

/** Variables de la clase .tabla-pildoras (index.css); los colores salen de core/color.ts. */
const estiloPildoras = {
  '--fila-bg': BRAND.panel,
  '--fila-bg-hover': BRAND.border,
} as React.CSSProperties

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Lima' })
const soles = (n: number) => `S/ ${Number(n).toFixed(2)}`

/** Enlace de WhatsApp al número del dueño (móvil peruano de 9 dígitos → +51). */
function enlaceWhatsApp(telefono?: string | null) {
  const tel = (telefono || '').replace(/\D/g, '')
  if (!tel) return null
  return `https://wa.me/${tel.length === 9 ? `51${tel}` : tel}`
}

// ── Edición del dueño ───────────────────────────────────────────────────────
function ModalEditarCliente({ cliente, onCerrar, onGuardado }: {
  cliente: Cliente | null
  onCerrar: () => void
  onGuardado: (c: Cliente) => void
}) {
  const [form] = Form.useForm<FormCliente>()
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!cliente) return
    form.setFieldsValue({
      dni: cliente.dni ?? '', nombre: cliente.nombre,
      telefono: cliente.telefono ?? '', direccion: cliente.direccion ?? '',
    })
    setError(null); setGuardando(false)
  }, [cliente, form])

  const guardar = async (v: FormCliente) => {
    const dni = (v.dni ?? '').trim()
    const tel = (v.telefono ?? '').replace(/\D/g, '')
    if (!dni) { setError('El DNI es obligatorio.'); return }
    if (!/^\d{8}$/.test(dni)) { setError('El DNI debe tener exactamente 8 dígitos.'); return }
    if (!(v.nombre ?? '').trim()) { setError('El nombre es obligatorio.'); return }
    if ((v.telefono ?? '').trim() && (tel.length < 6 || tel.length > 12)) {
      setError('El teléfono debe tener entre 6 y 12 dígitos.'); return
    }
    setGuardando(true); setError(null)
    try {
      const actualizado = await api.put(`/api/clientes/${cliente!.id}`, {
        dni: v.dni ?? '', nombre: v.nombre ?? '', telefono: v.telefono ?? '', direccion: v.direccion ?? '',
      })
      onGuardado(actualizado)
    } catch (e) {
      setError((e as Error).message); setGuardando(false)
    }
  }

  return (
    <Modal
      open={!!cliente} onCancel={onCerrar} title="Editar dueño" destroyOnHidden
      okText="Guardar cambios" cancelText="Cancelar" onOk={() => form.submit()} confirmLoading={guardando}
    >
      <Form form={form} layout="vertical" onFinish={guardar} requiredMark={false}>
        <Form.Item name="dni" label="DNI *"><Input inputMode="numeric" autoComplete="off" maxLength={8} /></Form.Item>
        <Form.Item name="nombre" label="Nombre completo *"><Input autoComplete="off" /></Form.Item>
        <Form.Item name="telefono" label="Teléfono"><Input inputMode="tel" autoComplete="off" placeholder="Ej: +51 987 654 321" /></Form.Item>
        <Form.Item name="direccion" label="Dirección"><Input autoComplete="off" /></Form.Item>
        {error && <Alert type="error" showIcon title={error} />}
      </Form>
    </Modal>
  )
}

// ── Columna derecha: datos del cliente ──────────────────────────────────────
function FichaCliente({ cliente, totalMascotas, etiquetas, onEditar, onEtiquetas }: {
  cliente: Cliente
  totalMascotas: number
  /** Todas las etiquetas que existen, para poder asignarlas. */
  etiquetas: Etiqueta[]
  onEditar: () => void
  onEtiquetas: (ids: number[]) => Promise<void>
}) {
  const [guardandoEtiquetas, setGuardandoEtiquetas] = useState(false)
  const wa = enlaceWhatsApp(cliente.telefono)
  const fila = (icono: React.ReactNode, texto: React.ReactNode) => (
    <Flex gap={10} align="flex-start">
      <span style={{ color: BRAND.textSecondary, marginTop: 2 }}>{icono}</span>
      <span style={{ minWidth: 0, wordBreak: 'break-word' }}>{texto}</span>
    </Flex>
  )
  return (
    <Flex vertical gap={MEDIDAS.tarjetaSeparacion}>
      <Flex justify="space-between" align="center" gap={8} style={{ paddingTop: 16 }}>
        <Typography.Title
          level={4}
          style={{ margin: 0, wordBreak: 'break-word', fontWeight: 500, fontSize: MEDIDAS.tituloLateral, lineHeight: '30px' }}
        >
          {cliente.nombre}
        </Typography.Title>
        <Button type="link" icon={<EditOutlined />} onClick={onEditar}>Editar</Button>
      </Flex>
      <Card variant="borderless" styles={{ body: { borderLeft: `4px solid ${BRAND.primary}`, borderRadius: MEDIDAS.tarjetaRadio } }}>
        <Flex vertical gap={8}>
          {fila(<IdcardOutlined />, cliente.dni ? `DNI ${cliente.dni}` : <Typography.Text type="secondary">Sin DNI</Typography.Text>)}
          {fila(<EnvironmentOutlined />, cliente.direccion || <Typography.Text type="secondary">Sin dirección</Typography.Text>)}
          {fila(<PhoneOutlined />, cliente.telefono || <Typography.Text type="secondary">Sin teléfono</Typography.Text>)}
          {fila(<WhatsAppOutlined />, wa ? cliente.telefono : <Typography.Text type="secondary">Sin WhatsApp</Typography.Text>)}
          <Flex justify="space-between" align="center">
            <Typography.Text type="secondary">{totalMascotas} {totalMascotas === 1 ? 'mascota' : 'mascotas'}</Typography.Text>
            {wa ? (
              <Button type="link" icon={<WhatsAppOutlined />} href={wa} target="_blank" rel="noopener noreferrer">Contactar</Button>
            ) : (
              <Button type="link" icon={<WhatsAppOutlined />} disabled title="El cliente no tiene teléfono registrado">Contactar</Button>
            )}
          </Flex>
        </Flex>
      </Card>
      <Flex vertical gap={4}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>Etiquetas</Typography.Text>
        <Select
          mode="multiple" allowClear placeholder="Sin etiquetas" aria-label="Etiquetas del cliente"
          maxTagCount="responsive" loading={guardandoEtiquetas}
          value={(cliente.etiquetas ?? []).map(e => e.id)}
          options={etiquetas.map(e => ({ value: e.id, label: e.nombre }))}
          notFoundContent="Aún no hay etiquetas. La recepcionista las crea desde la lista de clientes."
          onChange={async ids => {
            setGuardandoEtiquetas(true)
            try { await onEtiquetas(ids) } finally { setGuardandoEtiquetas(false) }
          }}
        />
      </Flex>
    </Flex>
  )
}

// ── Vista principal ─────────────────────────────────────────────────────────
export default function DetalleCliente() {
  const confirmar = useConfirmar()
  const toast = useToast()
  const { id } = useParams()
  const navigate = useNavigate()
  const { state: estadoNav } = useLocation()

  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [pacientes, setPacientes] = useState<Mascota[]>([])
  const [citas, setCitas] = useState<Cita[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pestana, setPestana] = useState<'pacientes' | 'ventas'>('pacientes')
  const [busqueda, setBusqueda] = useState('')
  const [todasEtiquetas, setTodasEtiquetas] = useState<Etiqueta[]>([])

  // Si venimos de registrar al dueño, el alta de mascota ya viene abierta:
  // es el mismo trámite de mostrador, no dos cosas separadas.
  const [altaAbierta, setAltaAbierta] = useState(() => !!estadoNav?.nuevaMascota)
  const [editarMascota, setEditarMascota] = useState<Mascota | null>(null)
  const [editarCliente, setEditarCliente] = useState<Cliente | null>(null)
  const [agendar, setAgendar] = useState<Mascota | null>(null)
  const [resumen, setResumen] = useState<Mascota | null>(null)

  // Ventas del cliente: solo la administradora las ve (la ruta de Ventas es suya)
  const [ventas, setVentas] = useState<VentaCliente[] | null>(null)
  const [cargandoVentas, setCargandoVentas] = useState(false)
  const [errorVentas, setErrorVentas] = useState<string | null>(null)

  useEffect(() => {
    const cargar = async () => {
      setLoading(true); setError(null)
      try {
        const [c, p] = await Promise.all([
          api.get(`/api/clientes/${id}`),
          api.get(`/api/clientes/${id}/pacientes/`),
        ])
        setCliente(c ?? null)
        setPacientes(Array.isArray(p) ? p : [])
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setLoading(false)
      }
    }
    cargar()
  }, [id])

  useEffect(() => {
    api.get('/api/etiquetas/').then(e => setTodasEtiquetas(Array.isArray(e) ? e : [])).catch(() => setTodasEtiquetas([]))
  }, [])

  const fijarEtiquetas = async (ids: number[]) => {
    try {
      const actualizado = await api.put(`/api/clientes/${id}/etiquetas`, { etiqueta_ids: ids })
      setCliente(prev => (prev ? { ...prev, etiquetas: actualizado?.etiquetas ?? [] } : prev))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  // Próximos turnos: una sola consulta para todas las mascotas del dueño
  const cargarCitas = () => {
    api.get(`/api/citas/?desde=${hoyISOPeru()}`)
      .then(c => setCitas(Array.isArray(c) ? c : []))
      .catch(() => setCitas([]))
  }
  useEffect(cargarCitas, [id])

  useEffect(() => {
    if (pestana !== 'ventas' || ventas !== null || !esAdmin()) return
    setCargandoVentas(true); setErrorVentas(null)
    api.get(`/api/ventas/cliente/${id}`)
      .then(v => setVentas(Array.isArray(v) ? v : []))
      .catch(e => setErrorVentas((e as Error).message))
      .finally(() => setCargandoVentas(false))
  }, [pestana, ventas, id])

  const proximoTurno = useMemo(() => {
    const ids = new Set(pacientes.map(p => p.id))
    const mapa = new Map<number, string>()
    for (const c of citas) {
      if (!ids.has(c.paciente_id) || c.estado === 'cancelada' || c.estado === 'atendida') continue
      const previa = mapa.get(c.paciente_id)
      if (!previa || new Date(c.fecha_hora) < new Date(previa)) mapa.set(c.paciente_id, c.fecha_hora)
    }
    return mapa
  }, [citas, pacientes])

  const term = busqueda.trim().toLowerCase()
  const filtrados = term ? pacientes.filter(p => p.nombre.toLowerCase().includes(term)) : pacientes

  // «Atender» lleva directo a la consulta nueva (la elección Escribir / Dictar); al guardar vuelve al Historial
  const irAConsulta = (p: Mascota) => navigate(`/consultas/${p.id}`, { state: { paciente: p, cliente } })
  const abrirHistorial = (p: Mascota) => navigate(`/pacientes/${p.id}/historial`, { state: { paciente: p, cliente } })

  const eliminarMascota = async (p: Mascota) => {
    if (!await confirmar({
      titulo: `Eliminar a ${p.nombre}`,
      mensaje: 'Se borrarán también todas sus historias clínicas y sus turnos agendados.',
      detalle: 'No se puede deshacer. El historial médico de esta mascota se pierde para siempre.',
      confirmarTexto: 'Eliminar mascota',
    })) return
    try {
      await api.del(`/api/pacientes/${p.id}`)
      setPacientes(prev => prev.filter(x => x.id !== p.id))
      if (resumen?.id === p.id) setResumen(null)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const menuFila = (): MenuProps["items"] => {
    const wa = enlaceWhatsApp(cliente?.telefono)
    return [
      { key: 'atender', icon: <MedicineBoxOutlined />, label: 'Atender / Iniciar consulta' },
      { key: 'resumen', icon: <SearchOutlined />, label: 'Resumen, antecedentes y documentos' },
      { key: 'agendar', icon: <CalendarOutlined />, label: 'Agendar cita' },
      { key: 'editar', icon: <EditOutlined />, label: 'Editar mascota' },
      { key: 'wa', icon: <WhatsAppOutlined />, label: wa ? 'WhatsApp al dueño' : 'WhatsApp (sin teléfono)', disabled: !wa },
    ]
  }

  const alElegirMenu = (p: Mascota, clave: string) => {
    if (clave === 'atender') irAConsulta(p)
    else if (clave === 'resumen') setResumen(p)
    else if (clave === 'agendar') setAgendar(p)
    else if (clave === 'editar') setEditarMascota(p)
    else if (clave === 'wa') {
      const wa = enlaceWhatsApp(cliente?.telefono)
      if (wa) window.open(wa, '_blank', 'noopener,noreferrer')
    }
  }

  const columnas: TableColumnsType<Mascota> = [
    { title: 'Nombre', dataIndex: 'nombre', key: 'nombre', render: (v: string) => <Typography.Text strong>{v}</Typography.Text> },
    { title: 'Especie/Grupo', dataIndex: 'especie', key: 'especie' },
    { title: 'Raza/Subgrupo', dataIndex: 'raza', key: 'raza', render: (v: string | null) => v || '—' },
    { title: 'Edad', key: 'edad', render: (_: unknown, p) => edadLegible(p) || '—' },
    {
      title: 'Próximo turno', key: 'turno',
      render: (_: unknown, p) => (proximoTurno.get(p.id) ? fechaCorta(proximoTurno.get(p.id)!) : '—'),
    },
    {
      title: '', key: 'acciones', width: 130, align: 'right',
      render: (_: unknown, p) => (
        <Flex justify="flex-end" gap={2} onClick={e => e.stopPropagation()}>
          <Button type="text" aria-label={`Abrir historial de ${p.nombre}`} icon={<ArrowRightOutlined />} onClick={() => abrirHistorial(p)} />
          <Dropdown
            trigger={['click']}
            menu={{ items: menuFila(), onClick: ({ key }) => alElegirMenu(p, key) }}
          >
            <Button type="text" aria-label={`Más acciones de ${p.nombre}`} icon={<EllipsisOutlined />} />
          </Dropdown>
          <Button type="text" danger aria-label={`Eliminar a ${p.nombre}`} icon={<CloseOutlined />} onClick={() => eliminarMascota(p)} />
        </Flex>
      ),
    },
  ]

  const columnasVentas: TableColumnsType<VentaCliente> = [
    { title: 'Fecha', dataIndex: 'fecha', key: 'fecha', render: (v: string) => fechaCorta(v) },
    {
      title: 'Detalle', key: 'detalle',
      render: (_: unknown, v) => (
        <Typography.Text ellipsis style={{ maxWidth: 320 }}>
          {v.items.map(i => `${i.cantidad} × ${i.descripcion}`).join(', ') || '—'}
        </Typography.Text>
      ),
    },
    { title: 'Mascota', dataIndex: 'paciente_nombre', key: 'mascota', render: (v: string | null) => v || '—' },
    { title: 'Pago', dataIndex: 'metodo_pago', key: 'pago', render: (v: string | null) => v || '—' },
    {
      title: 'Total', dataIndex: 'total', key: 'total', align: 'right',
      render: (t: number, v) => (v.anulada ? <Tag color="red">Anulada</Tag> : soles(t)),
    },
  ]

  const migas = [
    { title: <Link to="/clientes">Clientes</Link> },
    { title: cliente?.nombre ?? '…' },
  ]

  if (loading) {
    return (
      <Disposicion migas={migas} lateral={<Skeleton active paragraph={{ rows: 6 }} />}>
        <Skeleton active paragraph={{ rows: 6 }} />
      </Disposicion>
    )
  }

  if (error || !cliente) {
    return (
      <Disposicion migas={migas} lateral={<span />}>
        <Result
          status="error" title="No se pudo abrir al cliente"
          subTitle={error ?? 'No se encontró al cliente.'}
          extra={<Button onClick={() => navigate('/clientes')}>Volver a clientes</Button>}
        />
      </Disposicion>
    )
  }

  const tabPacientes = (
    <Flex vertical gap={14}>
      {/* Como en Volki, la ficha del dueño no trae buscador: solo aparece cuando hay muchas mascotas */}
      {pacientes.length > 8 && (
        <Input
          allowClear value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar mascota…" suffix={<SearchOutlined />} style={{ width: 248 }} size="large" aria-label="Buscar mascota"
        />
      )}
      <div style={estiloPildoras}>
        <Table
          className="tabla-pildoras" rowKey="id" size="middle" pagination={false}
          columns={columnas} dataSource={filtrados} scroll={{ x: 'max-content' }}
          rowClassName="fila-clic" onRow={p => ({ onClick: () => abrirHistorial(p) })}
          locale={{
            emptyText: pacientes.length === 0
              ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Sin mascotas registradas. Usa «Nuevo» para registrar la primera." />
              : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`Sin resultados para «${busqueda}»`} />,
          }}
        />
      </div>
    </Flex>
  )

  const tabVentas = (
    <Flex vertical gap={14}>
      {errorVentas && <Alert type="error" showIcon title={`No se pudieron cargar las ventas: ${errorVentas}`} />}
      <div style={estiloPildoras}>
        <Table
          className="tabla-pildoras" rowKey="id" size="middle" pagination={{ pageSize: 10, hideOnSinglePage: true, align: 'end' }}
          columns={columnasVentas} dataSource={ventas ?? []} loading={cargandoVentas} scroll={{ x: 'max-content' }}
          locale={{ emptyText: 'Este cliente aún no tiene ventas.' }}
        />
      </div>
    </Flex>
  )

  return (
    <>
      <Disposicion
        migas={migas}
        lateral={(
          <FichaCliente
            cliente={cliente} totalMascotas={pacientes.length} etiquetas={todasEtiquetas}
            onEditar={() => setEditarCliente(cliente)} onEtiquetas={fijarEtiquetas}
          />
        )}
      >
        <Tabs
          activeKey={pestana}
          onChange={k => setPestana(k as 'pacientes' | 'ventas')}
          // «Nuevo +» va en la misma fila de las pestañas, a la derecha, como en Volki
          tabBarExtraContent={pestana === 'pacientes' && (
            <Button type="link" icon={<PlusOutlined />} iconPlacement="end" onClick={() => setAltaAbierta(true)}>
              Nuevo
            </Button>
          )}
          items={[
            { key: 'pacientes', label: 'Pacientes', children: tabPacientes },
            ...(esAdmin() ? [{ key: 'ventas', label: 'Ventas', children: tabVentas }] : []),
          ]}
        />
      </Disposicion>

      <MascotaModal
        abierto={altaAbierta} clienteId={id}
        onCerrar={() => setAltaAbierta(false)}
        onGuardado={nueva => { setAltaAbierta(false); setPacientes(prev => [...prev, nueva]) }}
      />
      <MascotaModal
        abierto={!!editarMascota} mascota={editarMascota}
        onCerrar={() => setEditarMascota(null)}
        onGuardado={act => {
          setPacientes(prev => prev.map(p => (p.id === act.id ? { ...p, ...act } : p)))
          setEditarMascota(null)
        }}
      />
      <ModalEditarCliente
        cliente={editarCliente} onCerrar={() => setEditarCliente(null)}
        onGuardado={act => { setCliente(act); setEditarCliente(null) }}
      />
      <CitaModal
        abierto={!!agendar} paciente={agendar} onCerrar={() => setAgendar(null)}
        onCreada={() => { setAgendar(null); cargarCitas() }}
      />
      <DrawerMascota
        paciente={resumen} cliente={cliente} onCerrar={() => setResumen(null)}
        onAtender={irAConsulta}
        onAgendar={p => setAgendar(p)}
      />
    </>
  )
}
