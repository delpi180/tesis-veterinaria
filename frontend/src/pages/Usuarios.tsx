import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Checkbox, Col, Empty, Flex, Input, Modal, Row, Select, Skeleton, Space, Table, Tag, Tooltip, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  DeleteOutlined, DownloadOutlined, EditOutlined, IdcardOutlined, PlusOutlined,
  SafetyCertificateOutlined, TeamOutlined, UserOutlined,
} from '@ant-design/icons'
import { api, authHeaders, getUsuario } from '../services/api'
import { useToast } from '../components/Toast'
import { useConfirmar } from '../components/Confirmar'
import DatosClinica from '../components/DatosClinica'
import { Panel } from '../components/PanelLista'
import { BRAND } from '@src/core/color'
import { MEDIDAS } from '@src/core/medidas'

const { Title, Text } = Typography

const BASE_URL = import.meta.env.VITE_API_URL ?? ''

interface UsuarioFila {
  id: number
  usuario: string
  nombre: string
  rol: string
  activo: boolean
  dni?: string | null
  telefono?: string | null
  especialidad?: string | null
  hora_entrada?: string | null
  dias_laborales?: string | null
}

interface FormUsuario {
  usuario: string; nombre: string; password: string; rol: string; activo: boolean
  dni: string; telefono: string; especialidad: string; hora_entrada: string; dias_laborales: string
}

const FORM_INICIAL: FormUsuario = {
  usuario: '', nombre: '', password: '', rol: 'recepcionista', activo: true,
  dni: '', telefono: '', especialidad: '', hora_entrada: '', dias_laborales: '',
}

const DIAS: [string, string][] = [
  ['lun', 'Lun'], ['mar', 'Mar'], ['mie', 'Mié'], ['jue', 'Jue'], ['vie', 'Vie'], ['sab', 'Sáb'], ['dom', 'Dom'],
]

const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : 'Ocurrió un error.')

/**
 * Descarga de los datos de la clínica.
 *
 * Railway guarda copias continuas de la base, pero eso protege el servidor,
 * no a la dueña: no puede abrirlas ni llevárselas. Sus clientes y las
 * historias de sus pacientes son suyos, y tiene que poder tenerlos en la mano
 * sin depender de nadie.
 */
function RespaldoDatos() {
  const toast = useToast()
  const [bajando, setBajando] = useState(false)

  const descargar = async () => {
    setBajando(true)
    try {
      // No pasa por `api` porque la respuesta es un ZIP, no JSON.
      const res = await fetch(`${BASE_URL}/api/respaldo/`, { headers: authHeaders() })
      if (!res.ok) throw new Error('No se pudo generar el respaldo.')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `respaldo_${new Date().toISOString().slice(0, 10)}.zip`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Respaldo descargado. Guárdalo en un lugar seguro.')
    } catch (e) {
      toast.error(mensajeDe(e))
    } finally {
      setBajando(false)
    }
  }

  return (
    <Alert
      type="success" showIcon icon={<DownloadOutlined />} className="tarjeta-viva animar"
      title={<Text strong>Copia de tus datos</Text>}
      description="Descarga clientes, mascotas, historias clínicas, recetas, inventario y ventas en archivos de Excel. Conviene hacerlo de vez en cuando y guardarlo fuera del sistema."
      action={<Button icon={<DownloadOutlined />} loading={bajando} onClick={descargar}>{bajando ? 'Generando…' : 'Descargar'}</Button>}
    />
  )
}

export default function Usuarios() {
  const confirmar = useConfirmar()
  const toast = useToast()
  const navigate = useNavigate()
  const yo = getUsuario()
  const [usuarios, setUsuarios] = useState<UsuarioFila[]>([])
  const [cargando, setCargando] = useState(true)

  const [modalAbierto, setModalAbierto] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<FormUsuario>(FORM_INICIAL)
  const [guardando, setGuardando] = useState(false)
  const [errorModal, setErrorModal] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const data = await api.get('/api/usuarios/')
      setUsuarios(Array.isArray(data) ? data : [])
    } catch (e) {
      toast.error(mensajeDe(e))
    } finally {
      setCargando(false)
    }
  }, [toast])

  useEffect(() => { cargar() }, [cargar])

  const campo = <K extends keyof FormUsuario>(k: K, v: FormUsuario[K]) => setForm(f => ({ ...f, [k]: v }))

  const abrirNuevo = () => { setEditId(null); setForm(FORM_INICIAL); setErrorModal(null); setModalAbierto(true) }
  const abrirEditar = (u: UsuarioFila) => {
    setEditId(u.id)
    setForm({
      usuario: u.usuario, nombre: u.nombre, password: '', rol: u.rol, activo: u.activo,
      dni: u.dni || '', telefono: u.telefono || '', especialidad: u.especialidad || '',
      hora_entrada: u.hora_entrada || '', dias_laborales: u.dias_laborales || '',
    })
    setErrorModal(null); setModalAbierto(true)
  }
  const cerrar = () => { setModalAbierto(false); setEditId(null); setErrorModal(null) }

  const alternarDia = (code: string) => setForm(f => {
    const set = new Set((f.dias_laborales || '').split(',').filter(Boolean))
    if (set.has(code)) set.delete(code); else set.add(code)
    return { ...f, dias_laborales: DIAS.map(([c]) => c).filter(c => set.has(c)).join(',') }
  })

  const guardar = async () => {
    if (!form.nombre.trim()) { setErrorModal('El nombre es obligatorio.'); return }
    if (!editId) {
      if (form.usuario.trim().length < 3) { setErrorModal('El usuario debe tener al menos 3 caracteres.'); return }
      if (form.password.length < 4) { setErrorModal('La contraseña debe tener al menos 4 caracteres.'); return }
    }
    setGuardando(true); setErrorModal(null)
    try {
      // El horario laboral y la especialidad solo aplican a doctores; para recepción se limpian.
      const esDoctor = form.rol === 'veterinario'
      const horario = {
        hora_entrada: esDoctor ? (form.hora_entrada || null) : null,
        dias_laborales: esDoctor ? (form.dias_laborales || null) : null,
        especialidad: esDoctor ? (form.especialidad.trim() || null) : null,
      }
      const contacto = { dni: form.dni.trim() || null, telefono: form.telefono.trim() || null }
      if (editId) {
        const payload: Record<string, unknown> = { nombre: form.nombre.trim(), rol: form.rol, activo: form.activo, ...contacto, ...horario }
        if (form.password) payload.password = form.password
        await api.put(`/api/usuarios/${editId}`, payload)
        toast.success('Usuario actualizado')
      } else {
        await api.post('/api/usuarios/', {
          usuario: form.usuario.trim(), nombre: form.nombre.trim(),
          password: form.password, rol: form.rol, activo: form.activo, ...contacto, ...horario,
        })
        toast.success('Usuario creado')
      }
      await cargar(); cerrar()
    } catch (e) {
      setErrorModal(mensajeDe(e))
    } finally {
      setGuardando(false)
    }
  }

  const eliminar = async (u: UsuarioFila) => {
    // Borrar arrastra cosas que no se ven desde esta pantalla; decirlas antes
    // evita el "no sabía que se perdían las marcaciones".
    if (!await confirmar({
      titulo: `Eliminar a ${u.nombre}`,
      mensaje: 'Se borrarán sus marcaciones de asistencia. Sus turnos quedarán sin doctor asignado, para reasignarlos. Sus historias y recetas no se tocan: conservan su nombre.',
      detalle: 'Si solo quieres quitarle el acceso al sistema, desactívalo en vez de borrarlo.',
      confirmarTexto: 'Eliminar usuario',
    })) return
    try {
      await api.del(`/api/usuarios/${u.id}`)
      setUsuarios(prev => prev.filter(x => x.id !== u.id))
      toast.success('Usuario eliminado')
    } catch (e) {
      toast.error(mensajeDe(e))
    }
  }

  const hoyTexto = new Date().toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const hoy = hoyTexto.charAt(0).toUpperCase() + hoyTexto.slice(1)

  const columnas: TableColumnsType<UsuarioFila> = [
    {
      title: 'Usuario', key: 'usuario',
      render: (_, u) => (
        <Space size={8}>
          <UserOutlined style={{ color: BRAND.textSecondary }} />
          <Text strong>{u.usuario}</Text>
          {u.usuario === yo && <Text style={{ color: BRAND.primary, fontSize: 13 }}>(tú)</Text>}
        </Space>
      ),
    },
    { title: 'Nombre', dataIndex: 'nombre' },
    { title: 'DNI', dataIndex: 'dni', render: (d?: string | null) => d || '—' },
    {
      title: 'Rol', dataIndex: 'rol',
      render: (r: string) => <Tag color={r === 'veterinario' ? 'green' : 'blue'} style={{ marginInlineEnd: 0 }}>{r === 'veterinario' ? 'Veterinario' : 'Recepcionista'}</Tag>,
    },
    {
      title: 'Estado', dataIndex: 'activo', align: 'center',
      render: (a: boolean) => <Tag color={a ? 'success' : 'default'} style={{ marginInlineEnd: 0 }}>{a ? 'Activo' : 'Inactivo'}</Tag>,
    },
    {
      title: '', key: 'acciones', align: 'right', width: 130,
      render: (_, u) => (
        <Space size={4}>
          <Tooltip title="Ver perfil">
            <Button type="text" icon={<IdcardOutlined />} aria-label="Ver perfil" onClick={() => navigate(`/usuarios/${u.id}/perfil`)} />
          </Tooltip>
          <Tooltip title="Editar">
            <Button type="text" icon={<EditOutlined />} aria-label="Editar usuario" onClick={() => abrirEditar(u)} />
          </Tooltip>
          {u.usuario !== yo && (
            <Tooltip title="Eliminar">
              <Button type="text" danger icon={<DeleteOutlined />} aria-label="Eliminar usuario" onClick={() => eliminar(u)} />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div className="animar" style={{ flex: 1, minWidth: 0, padding: '16px 32px 32px', width: '100%' }}>
      <Row justify="space-between" align="bottom" gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col flex="auto">
          <Text type="secondary">{hoy}</Text>
          <Title level={2} style={{ margin: '4px 0 0', fontSize: MEDIDAS.tituloSeccion, fontWeight: 500, lineHeight: '32px' }}>
            Usuarios y roles
          </Title>
        </Col>
        <Col>
          <Button type="primary" icon={<PlusOutlined />} onClick={abrirNuevo}>Nuevo usuario</Button>
        </Col>
      </Row>

      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        <Alert
          type="info" showIcon icon={<SafetyCertificateOutlined />}
          title={<>La <strong>recepcionista</strong> es la administradora: gestiona usuarios, ventas, inventario, turnos y asistencia. El <strong>veterinario</strong> (doctor) atiende y llena las historias clínicas, que quedan firmadas con su nombre.</>}
        />

        <DatosClinica />

        <RespaldoDatos />

        <Panel titulo="Usuarios" icono={<TeamOutlined />} accion={<Tag>{usuarios.length}</Tag>}>
          {cargando ? <div style={{ padding: 20 }}><Skeleton active paragraph={{ rows: 4 }} /></div> : (
            <Table<UsuarioFila> rowKey="id" size="middle" columns={columnas} dataSource={usuarios}
              pagination={{ pageSize: 15, hideOnSinglePage: true, showSizeChanger: false }}
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Todavía no hay usuarios." /> }} />
          )}
        </Panel>
      </Space>

      <Modal
        open={modalAbierto} onCancel={cerrar} destroyOnHidden
        title={editId ? 'Editar usuario' : 'Nuevo usuario'}
        okText={editId ? 'Guardar' : 'Crear usuario'} cancelText="Cancelar"
        onOk={guardar} confirmLoading={guardando}
      >
        <Flex vertical gap={14} style={{ paddingTop: 8 }}>
          <Flex vertical gap={6}>
            <label htmlFor="usr-usuario"><Text strong>Usuario{!editId && ' *'}</Text></label>
            <Input id="usr-usuario" size="large" autoFocus disabled={!!editId} placeholder="ej. recepcion1"
              value={form.usuario} onChange={e => campo('usuario', e.target.value)} />
          </Flex>
          <Flex vertical gap={6}>
            <label htmlFor="usr-nombre"><Text strong>Nombre completo *</Text></label>
            <Input id="usr-nombre" size="large" value={form.nombre} onChange={e => campo('nombre', e.target.value)} />
          </Flex>
          <Flex gap={12} wrap>
            <Flex vertical gap={6} style={{ flex: '1 1 200px' }}>
              <label htmlFor="usr-clave"><Text strong>{editId ? 'Nueva contraseña' : 'Contraseña *'}</Text></label>
              <Input.Password id="usr-clave" size="large" autoComplete="new-password"
                placeholder={editId ? 'Vacío = sin cambio' : '••••'}
                value={form.password} onChange={e => campo('password', e.target.value)} />
            </Flex>
            <Flex vertical gap={6} style={{ flex: '1 1 200px' }}>
              <label htmlFor="usr-rol"><Text strong>Rol</Text></label>
              <Select id="usr-rol" size="large" value={form.rol} onChange={(v: string) => campo('rol', v)}
                options={[{ value: 'veterinario', label: 'Veterinario' }, { value: 'recepcionista', label: 'Recepcionista' }]} />
            </Flex>
          </Flex>
          <Flex gap={12} wrap>
            <Flex vertical gap={6} style={{ flex: '1 1 200px' }}>
              <label htmlFor="usr-dni"><Text strong>DNI</Text></label>
              <Input id="usr-dni" size="large" maxLength={8} inputMode="numeric" placeholder="Ej. 12345678"
                value={form.dni} onChange={e => campo('dni', e.target.value.replace(/\D/g, ''))} />
            </Flex>
            <Flex vertical gap={6} style={{ flex: '1 1 200px' }}>
              <label htmlFor="usr-tel"><Text strong>Teléfono</Text></label>
              <Input id="usr-tel" size="large" inputMode="tel" placeholder="Ej. 987654321"
                value={form.telefono} onChange={e => campo('telefono', e.target.value)} />
            </Flex>
          </Flex>

          {form.rol === 'veterinario' && (
            <Flex vertical gap={12} style={{ background: BRAND.panel, border: `1px solid ${BRAND.border}`, borderRadius: 8, padding: 14 }}>
              <Text type="secondary" strong style={{ fontSize: 12, textTransform: 'uppercase' }}>Datos del doctor</Text>
              <Flex vertical gap={6}>
                <label htmlFor="usr-esp"><Text strong>Especialidad</Text></label>
                <Input id="usr-esp" size="large" placeholder="Ej. Medicina interna, Cirugía…"
                  value={form.especialidad} onChange={e => campo('especialidad', e.target.value)} />
              </Flex>
              <Flex vertical gap={6}>
                <label htmlFor="usr-hora"><Text strong>Hora de ingreso</Text></label>
                <Input id="usr-hora" size="large" type="time" value={form.hora_entrada}
                  onChange={e => campo('hora_entrada', e.target.value)} />
              </Flex>
              <Flex vertical gap={6}>
                <Text strong>Días a laborar</Text>
                <Flex wrap gap={6}>
                  {DIAS.map(([code, lbl]) => (
                    <Tag.CheckableTag key={code} checked={(form.dias_laborales || '').split(',').includes(code)}
                      onChange={() => alternarDia(code)}
                      style={{ minWidth: 48, textAlign: 'center', padding: '4px 10px', border: `1px solid ${BRAND.border}` }}>
                      {lbl}
                    </Tag.CheckableTag>
                  ))}
                </Flex>
              </Flex>
            </Flex>
          )}

          <Checkbox checked={form.activo} onChange={e => campo('activo', e.target.checked)}>Usuario activo</Checkbox>
          {errorModal && <Alert type="error" showIcon title={errorModal} />}
        </Flex>
      </Modal>
    </div>
  )
}
