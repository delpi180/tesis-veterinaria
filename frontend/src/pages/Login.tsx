import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Col, Form, Grid, Input, Row, Typography } from 'antd'
import {
  LockOutlined, UserOutlined, ScheduleOutlined, FileTextOutlined, MedicineBoxOutlined,
} from '@ant-design/icons'
import { api, setSesion } from '../services/api'
import { useClinica } from '../services/clinica'
import { BRAND } from '@src/core/color'

const { Title, Text, Paragraph } = Typography

const Huella = ({ size = 32 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size} aria-hidden="true">
    <path d="M12 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-5 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM5.5 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm13 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM12 10c-3.3 0-6 2.7-6 6 0 2.2 1.8 4 4 4h4c2.2 0 4-1.8 4-4 0-3.3-2.7-6-6-6z" />
  </svg>
)

// A dónde entra cada rol. Antes esto se elegía a mano ANTES de escribir las
// credenciales, y equivocarse costaba caro: el error decía que la cuenta no
// correspondía al tipo elegido —se leía como "contraseña incorrecta"— y al
// volver atrás se borraba todo lo escrito. El servidor ya devuelve el rol al
// validar, así que el paso sobraba: solo agregaba un clic y una forma de
// fallar con las credenciales correctas.
const DESTINO_POR_ROL: Record<string, string> = {
  recepcionista: '/recepcion',
  veterinario: '/mi-panel',
}

// Lo que la clínica hace con el sistema, dicho en su idioma.
const PUNTOS = [
  { icono: <FileTextOutlined />, texto: 'Historia clínica de cada paciente, con su evolución' },
  { icono: <MedicineBoxOutlined />, texto: 'Vacunas y tratamientos con aviso al dueño' },
  { icono: <ScheduleOutlined />, texto: 'Turnos del día y caja, sin papeles' },
]

interface Credenciales {
  usuario: string
  password: string
}

export default function Login() {
  const navigate = useNavigate()
  const { clinica } = useClinica()
  const pantallas = Grid.useBreakpoint()
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Ant Design solo llama a onFinish cuando el formulario ya validó, así que
  // aquí no hay que revisar campos vacíos a mano.
  const ingresar = async ({ usuario, password }: Credenciales) => {
    setCargando(true)
    setError(null)
    try {
      const r = await api.post('/api/auth/login', { usuario: usuario.trim(), password })
      setSesion(r)
      navigate(DESTINO_POR_ROL[r.rol] ?? '/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.')
      setCargando(false)
    }
  }

  return (
    <Row style={{ minHeight: '100vh', width: '100%', margin: 0 }}>
      {/* Panel de marca: solo en pantallas anchas. En el celular el formulario
          es lo único que importa y el nombre de la clínica va arriba de él. */}
      <Col xs={0} md={11} style={{
        background: BRAND.sider, color: '#fff', position: 'relative', overflow: 'hidden',
        display: pantallas.md ? 'flex' : 'none', flexDirection: 'column',
        justifyContent: 'space-between', padding: 48,
      }}>
        {/* Huella grande de fondo: reconocible, sin competir con el texto */}
        <span style={{ position: 'absolute', right: -60, bottom: -60, color: BRAND.siderActive, opacity: 0.8 }}>
          <Huella size={420} />
        </span>

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ background: BRAND.primary, borderRadius: 12, padding: 10, display: 'flex' }}>
            <Huella size={22} />
          </span>
          <Text strong style={{ color: '#fff', fontSize: 16 }}>{clinica.nombre}</Text>
        </div>

        <div style={{ position: 'relative', maxWidth: 440 }}>
          <Title level={1} style={{ color: '#fff', fontSize: 38, lineHeight: 1.15, marginTop: 0 }}>
            Cada paciente, su historia completa.
          </Title>
          <ul style={{ listStyle: 'none', padding: 0, margin: '36px 0 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {PUNTOS.map(({ icono, texto }) => (
              <li key={texto} style={{ display: 'flex', gap: 12, color: '#b3d6c9' }}>
                <span style={{ color: '#5a9d88', fontSize: 18 }}>{icono}</span>
                <span>{texto}</span>
              </li>
            ))}
          </ul>
        </div>

        <Text style={{ position: 'relative', color: '#5a9d88', fontSize: 13 }}>
          © {new Date().getFullYear()} {clinica.nombre}
        </Text>
      </Col>

      {/* Formulario */}
      <Col xs={24} md={13} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, background: BRAND.body,
      }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          {/* Marca solo en móvil (en escritorio ya está en el panel) */}
          {!pantallas.md && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40 }}>
              <span style={{ background: BRAND.primary, color: '#fff', borderRadius: 12, padding: 10, display: 'flex' }}>
                <Huella size={22} />
              </span>
              <Text strong style={{ fontSize: 18 }}>{clinica.nombre}</Text>
            </div>
          )}

          <Title level={2} style={{ marginTop: 0, marginBottom: 4 }}>Ingresar</Title>
          <Paragraph type="secondary" style={{ marginBottom: 28 }}>
            El sistema te lleva a tu pantalla según tu cuenta.
          </Paragraph>

          <Form<Credenciales> layout="vertical" onFinish={ingresar} requiredMark={false} autoComplete="on">
            <Form.Item
              label="Usuario"
              name="usuario"
              rules={[{ required: true, whitespace: true, message: 'Ingresa tu usuario.' }]}
            >
              <Input size="large" prefix={<UserOutlined />} autoFocus autoComplete="username" />
            </Form.Item>

            <Form.Item
              label="Contraseña"
              name="password"
              rules={[{ required: true, message: 'Ingresa tu contraseña.' }]}
            >
              <Input.Password size="large" prefix={<LockOutlined />} autoComplete="current-password" />
            </Form.Item>

            {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}

            <Button type="primary" htmlType="submit" size="large" block loading={cargando}>
              {cargando ? 'Verificando…' : 'Ingresar'}
            </Button>
          </Form>

          <Paragraph type="secondary" style={{ marginTop: 28, fontSize: 14 }}>
            ¿Olvidaste tu contraseña? Pídele a la administradora que te la
            cambie desde Usuarios.
          </Paragraph>
        </div>
      </Col>
    </Row>
  )
}
