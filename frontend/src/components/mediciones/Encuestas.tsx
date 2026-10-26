import { useState } from 'react'
import { Alert, Button, Card, Flex, Form, Input, Radio, Result, Select, Steps, Typography } from 'antd'
import { api } from '../../services/api'
import { mensajeDe } from './comun'

const { Text } = Typography

const PREGUNTAS_SUS = [
  'Creo que me gustaría usar VetIA con frecuencia.',
  'Encuentro VetIA innecesariamente complejo.',
  'Creo que VetIA es fácil de usar.',
  'Creo que necesitaría apoyo técnico para poder usar VetIA.',
  'Encuentro que las distintas funciones de VetIA están bien integradas.',
  'Creo que VetIA presenta demasiada inconsistencia.',
  'Imagino que la mayoría de personas aprendería a usar VetIA muy rápidamente.',
  'Encuentro VetIA muy engorroso de usar.',
  'Me sentí muy seguro y confiado al usar VetIA.',
  'Necesité aprender muchas cosas antes de poder empezar a usar VetIA.',
]

const PREGUNTAS_TAM = [
  'Usar VetIA me permite registrar las historias clínicas más rápido.',
  'VetIA mejora la calidad de la documentación clínica que genero.',
  'Usar VetIA aumenta mi productividad durante la consulta.',
  'VetIA me resulta útil en mi trabajo diario en la clínica.',
  'Usar VetIA me facilita realizar mis tareas de documentación.',
  'Aprender a usar VetIA fue fácil para mí.',
  'Encuentro que VetIA es claro y fácil de entender.',
  'Me resulta fácil llegar a dominar el uso de VetIA.',
  'En general, VetIA es fácil de usar.',
  'Tengo la intención de usar VetIA de forma regular en mis consultas.',
  'Recomendaría VetIA a otros colegas veterinarios.',
  'Si tuviera acceso, usaría VetIA en mi práctica clínica habitual.',
]

type Respuestas = Record<string, number>
const initRespuestas = (n: number): Respuestas => Object.fromEntries(Array.from({ length: n }, (_, i) => [`p${i + 1}`, 0]))

function PreguntaEscala({ numero, texto, valor, onChange, max }: {
  numero: number; texto: string; valor: number; onChange: (v: number) => void; max: number
}) {
  return (
    <div style={{ padding: '16px 0', borderBottom: '1px solid #f0ede6' }}>
      <p style={{ margin: '0 0 8px' }}><strong style={{ color: '#2e6d5a' }}>{numero}.</strong> {texto}</p>
      <Flex gap={12} align="center" wrap>
        <Text type="secondary" style={{ fontSize: 12, minWidth: 140 }}>Totalmente en desacuerdo</Text>
        <Radio.Group optionType="button" buttonStyle="solid" value={valor || undefined} aria-label={`Pregunta ${numero}`}
          onChange={e => onChange(e.target.value)} options={Array.from({ length: max }, (_, i) => ({ label: String(i + 1), value: i + 1 }))} />
        <Text type="secondary" style={{ fontSize: 12, minWidth: 140 }}>Totalmente de acuerdo</Text>
      </Flex>
    </div>
  )
}

/** Flujo de encuestas: evaluador → SUS (10 preguntas, 1–5) → TAM (12 preguntas, 1–7). */
export default function Encuestas() {
  const [paso, setPaso] = useState(1)
  const [evaluadorId, setEvaluadorId] = useState<number | null>(null)
  const [nombre, setNombre] = useState('')
  const [rol, setRol] = useState('veterinario')
  const [susR, setSusR] = useState(() => initRespuestas(10))
  const [tamR, setTamR] = useState(() => initRespuestas(12))
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const enviar = async (fn: () => Promise<void>) => {
    setEnviando(true); setError(null)
    try { await fn() } catch (e) { setError(mensajeDe(e)) } finally { setEnviando(false) }
  }

  const evaluador = () => {
    if (!nombre.trim()) { setError('El nombre es obligatorio.'); return }
    return enviar(async () => {
      const ev = await api.post('/api/evaluadores/', { nombre: nombre.trim(), rol })
      setEvaluadorId(ev.id); setPaso(2)
    })
  }
  const sus = () => {
    if (Object.values(susR).some(v => v === 0)) { setError('Por favor responde todas las preguntas antes de continuar.'); return }
    return enviar(async () => { await api.post('/api/sus/', { evaluador_id: evaluadorId, ...susR }); setPaso(3) })
  }
  const tam = () => {
    if (Object.values(tamR).some(v => v === 0)) { setError('Por favor responde todas las preguntas antes de enviar.'); return }
    return enviar(async () => { await api.post('/api/tam/', { evaluador_id: evaluadorId, ...tamR }); setPaso(4) })
  }
  const reiniciar = () => {
    setPaso(1); setEvaluadorId(null); setNombre(''); setRol('veterinario')
    setSusR(initRespuestas(10)); setTamR(initRespuestas(12)); setError(null)
  }

  const err = error && <Alert type="error" showIcon title={error} style={{ marginTop: 12 }} />
  const cuerpo = (preguntas: string[], r: Respuestas, set: (f: (x: Respuestas) => Respuestas) => void, max: number) =>
    preguntas.map((t, i) => (
      <PreguntaEscala key={i} numero={i + 1} texto={t} max={max} valor={r[`p${i + 1}`]}
        onChange={v => { set(x => ({ ...x, [`p${i + 1}`]: v })); setError(null) }} />
    ))

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      {paso < 4 && (
        <Steps size="small" current={paso - 1} style={{ marginBottom: 24 }}
          items={[{ title: 'Evaluador' }, { title: 'SUS' }, { title: 'TAM' }]} />
      )}

      {paso === 1 && (
        <Card className="animar" title="Datos del evaluador" extra={<Text type="secondary" style={{ fontSize: 12 }}>Antes de comenzar la encuesta</Text>}>
          <Form layout="vertical" onFinish={evaluador}>
            <Form.Item label="Nombre completo" required>
              <Input size="large" autoFocus placeholder="Ej. Dr. Juan Pérez" value={nombre} onChange={e => { setNombre(e.target.value); setError(null) }} />
            </Form.Item>
            <Form.Item label="Rol en la clínica">
              <Select size="large" value={rol} onChange={setRol}
                options={[{ value: 'veterinario', label: 'Veterinario' }, { value: 'asistente', label: 'Asistente' }, { value: 'admin', label: 'Administrador' }]} />
            </Form.Item>
            {err}
            <Flex justify="end" style={{ marginTop: 16 }}>
              <Button type="primary" htmlType="submit" loading={enviando}>{enviando ? 'Registrando…' : 'Continuar →'}</Button>
            </Flex>
          </Form>
        </Card>
      )}

      {paso === 2 && (
        <Card className="animar" title="Encuesta SUS" extra={<Text type="secondary" style={{ fontSize: 12 }}>10 preguntas · 1 (desacuerdo) a 5 (acuerdo)</Text>}>
          {cuerpo(PREGUNTAS_SUS, susR, setSusR, 5)}
          {err}
          <Flex justify="end" style={{ marginTop: 16 }}><Button type="primary" loading={enviando} onClick={sus}>{enviando ? 'Guardando…' : 'Continuar →'}</Button></Flex>
        </Card>
      )}

      {paso === 3 && (
        <Card className="animar" title="Encuesta TAM" extra={<Text type="secondary" style={{ fontSize: 12 }}>12 preguntas · 1 (desacuerdo) a 7 (acuerdo)</Text>}>
          {cuerpo(PREGUNTAS_TAM, tamR, setTamR, 7)}
          {err}
          <Flex justify="end" style={{ marginTop: 16 }}><Button type="primary" loading={enviando} onClick={tam}>{enviando ? 'Enviando…' : 'Enviar respuestas'}</Button></Flex>
        </Card>
      )}

      {paso === 4 && (
        <Card className="animar">
          <Result status="success" title={`¡Gracias, ${nombre}!`}
            subTitle="Tus respuestas fueron registradas correctamente. La información es muy valiosa para esta investigación."
            extra={<Button onClick={reiniciar}>Registrar otro evaluador</Button>}>
            <Flex vertical align="center"><Text type="secondary">✓ Encuesta SUS registrada</Text><Text type="secondary">✓ Encuesta TAM registrada</Text></Flex>
          </Result>
        </Card>
      )}
    </div>
  )
}
