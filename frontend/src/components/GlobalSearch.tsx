import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Empty, Flex, Input, Modal, Spin, Typography } from 'antd'
import type { InputRef } from 'antd'
import { CalendarOutlined, MedicineBoxOutlined, SearchOutlined, UserOutlined } from '@ant-design/icons'
import { api } from '../services/api'
import { BRAND } from '@src/core/color'

const { Text } = Typography

interface Item { id?: number; nombre?: string; name?: string; telefono?: string; email?: string; especie?: string; raza?: string
  propietario?: string; motivo?: string; titulo?: string; fecha?: string; hora?: string; resumen?: string; paciente?: string; paciente_id?: number }
interface Resultados { clientes?: Item[]; pacientes?: Item[]; citas?: Item[]; historias?: Item[] }

/** Búsqueda global (Ctrl+K): clientes, mascotas, citas e historias clínicas de toda la clínica. */
export default function GlobalSearch({ onAbrir }: { onAbrir?: () => void }) {
  const [abierto, setAbierto] = useState(false)
  const [consulta, setConsulta] = useState('')
  const [resultados, setResultados] = useState<Resultados | null>(null)
  const [cargando, setCargando] = useState(false)
  const inputRef = useRef<InputRef>(null)
  const espera = useRef<ReturnType<typeof setTimeout>>(undefined)
  const peticion = useRef(0)
  const navigate = useNavigate()

  // Atajo Ctrl+K (el Escape lo cierra el propio Modal)
  useEffect(() => {
    const alPresionar = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setAbierto(a => !a) }
    }
    window.addEventListener('keydown', alPresionar)
    return () => window.removeEventListener('keydown', alPresionar)
  }, [])

  const abrir = () => { setAbierto(true); onAbrir?.() }   // onAbrir cierra el menú lateral en el celular
  const cerrar = () => { clearTimeout(espera.current); setAbierto(false); setConsulta(''); setResultados(null) }

  const buscar = useCallback(async (q: string) => {
    const id = ++peticion.current
    if (q.trim().length < 2) { setResultados(null); setCargando(false); return }
    setCargando(true)
    try {
      const data = await api.get(`/api/busqueda/?q=${encodeURIComponent(q.trim())}`)
      if (id === peticion.current) setResultados(data)
    } catch {
      if (id === peticion.current) setResultados({ clientes: [], pacientes: [], citas: [], historias: [] })
    } finally {
      if (id === peticion.current) setCargando(false)
    }
  }, [])

  const alEscribir = (v: string) => {
    setConsulta(v)
    clearTimeout(espera.current)
    espera.current = setTimeout(() => buscar(v), 300)
  }
  const ir = (ruta: string) => { cerrar(); navigate(ruta) }

  const total = (resultados?.clientes?.length ?? 0) + (resultados?.pacientes?.length ?? 0)
    + (resultados?.citas?.length ?? 0) + (resultados?.historias?.length ?? 0)
  const sinResultados = resultados && total === 0 && consulta.trim().length >= 2

  return (
    <>
      {/* Botón del menú lateral oscuro */}
      <Button block onClick={abrir} title="Búsqueda global (Ctrl+K)" aria-label="Búsqueda global"
        style={{ background: BRAND.siderActive, borderColor: 'rgba(255,255,255,.12)', color: 'rgba(255,255,255,.75)', textAlign: 'left', height: 36 }}>
        <Flex align="center" gap={8}>
          <SearchOutlined />
          <span style={{ flex: 1 }}>Buscar…</span>
          <kbd className="hidden md:inline-block" style={{ fontSize: 11, padding: '0 6px', borderRadius: 4, border: '1px solid rgba(255,255,255,.25)' }}>Ctrl+K</kbd>
        </Flex>
      </Button>

      <Modal open={abierto} onCancel={cerrar} footer={null} closable={false} destroyOnHidden width={520}
        afterOpenChange={o => { if (o) inputRef.current?.focus() }} style={{ top: 72 }}
        styles={{ body: { padding: 0 }, container: { padding: 0, overflow: 'hidden' } }}>
        <Flex align="center" gap={8} style={{ padding: '12px 16px', borderBottom: `1px solid ${BRAND.border}` }}>
          <SearchOutlined style={{ color: BRAND.textSecondary }} />
          {/* 16px de fuente: por debajo el navegador del celular hace zoom al enfocar */}
          <Input ref={inputRef} variant="borderless" allowClear value={consulta} onChange={e => alEscribir(e.target.value)}
            placeholder="Mascota, dueño, DNI…" aria-label="Buscar" style={{ fontSize: 16, flex: 1 }} />
        </Flex>

        <div style={{ maxHeight: '60vh', overflowY: 'auto', overscrollBehavior: 'contain' }}>
          {cargando && <Flex justify="center" style={{ padding: 24 }}><Spin /></Flex>}
          {!cargando && sinResultados && <Empty style={{ padding: '24px 0' }} image={Empty.PRESENTED_IMAGE_SIMPLE} description={`Sin resultados para "${consulta}"`} />}
          {!cargando && !resultados && <Text type="secondary" style={{ display: 'block', padding: 24, textAlign: 'center' }}>Escribe al menos 2 caracteres para buscar</Text>}

          {!cargando && total > 0 && resultados && (
            <div style={{ padding: '8px 0' }}>
              <Seccion titulo="Clientes" icono={<UserOutlined />} items={resultados.clientes}
                alElegir={i => ir(i.id ? `/clientes/${i.id}` : '/clientes')}
                etiqueta={i => i.nombre || i.name || `Cliente #${i.id}`} detalle={i => i.telefono || i.email || ''} />
              <Seccion titulo="Mascotas" icono={<MedicineBoxOutlined />} items={resultados.pacientes}
                alElegir={i => ir(i.id ? `/pacientes/${i.id}/historial` : '/clientes')}
                etiqueta={i => i.nombre || i.name || `Mascota #${i.id}`}
                // Con varias mascotas del mismo nombre, el dueño permite elegir la correcta
                // sin abrir las fichas una por una; va en su propia línea para que no se corte en el celular.
                detalle={i => (
                  <>
                    <span style={{ display: 'block' }}>{[i.especie, i.raza].filter(Boolean).join(' · ')}</span>
                    {i.propietario && <span style={{ display: 'block', fontWeight: 500, color: BRAND.text }}>Dueño: {i.propietario}</span>}
                  </>
                )} />
              <Seccion titulo="Citas" icono={<CalendarOutlined />} items={resultados.citas} alElegir={() => ir('/turnos')}
                etiqueta={i => i.motivo || i.titulo || `Cita #${i.id}`} detalle={i => i.fecha || i.hora || ''} />
              {/* Historias clínicas: busca en toda la clínica, no solo un paciente */}
              <Seccion titulo="Historias clínicas" icono={<MedicineBoxOutlined />} items={resultados.historias}
                alElegir={i => ir(i.paciente_id ? `/pacientes/${i.paciente_id}/historial` : '/clientes')}
                etiqueta={i => i.resumen || `Historia de ${i.paciente ?? 'paciente'}`}
                detalle={i => [i.paciente, i.propietario].filter(Boolean).join(' · ')} />
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}

function Seccion({ titulo, icono, items, alElegir, etiqueta, detalle }: {
  titulo: string; icono: ReactNode; items?: Item[]
  alElegir: (i: Item) => void; etiqueta: (i: Item) => string; detalle: (i: Item) => ReactNode
}) {
  if (!items?.length) return null
  return (
    <div>
      <Text type="secondary" strong style={{ display: 'block', padding: '6px 16px', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em' }}>
        {icono} {titulo}
      </Text>
      {items.map((item, idx) => {
        const sub = detalle(item)
        return (
          // Filas altas: con menos de 40 px se erraba el toque entre dos mascotas del mismo nombre.
          <button key={item.id ?? idx} type="button" className="fila-hover" onClick={() => alElegir(item)}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit', color: BRAND.text }}>
            <div style={{ fontWeight: 600 }}>{etiqueta(item)}</div>
            {sub && <div style={{ fontSize: 12, color: BRAND.textSecondary }}>{sub}</div>}
          </button>
        )
      })}
    </div>
  )
}
