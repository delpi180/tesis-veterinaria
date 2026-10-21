/**
 * Las cinco partes del formulario de consulta (anamnesis, EOG, EOP, diagnóstico
 * y plan). En una consulta nueva (`reducido`) se muestran todas juntas y solo
 * con los campos del formulario de Volki; al corregir una consulta guardada se
 * muestran todos sus campos, una sección a la vez.
 */
import type { CSSProperties, ReactNode } from 'react'
import { Card, Flex, Typography } from 'antd'
import { Campo, AreaTexto, EntradaFecha, EntradaNumero, EntradaTexto, Selector } from './campos'
import type { Resaltado } from './campos'
import ListaTratamientos from './ListaTratamientos'
import type { MedicamentoInventario } from './ListaTratamientos'
import ListaVacunas from './ListaVacunas'
import type { VacunaCatalogo } from './ListaVacunas'
import {
  OPT, SECCIONES, SISTEMAS_EOP, SISTEMA_LABELS, toLocalDatetimeString,
} from '@src/utils/historiaClinica'
import type { CampoTexto, FormConsulta, ItemTratamiento, ItemVacuna } from '@src/utils/historiaClinica'

/** Una celda que se acomoda sola: crece hasta llenar la fila y baja de línea en el celular. */
function Celda({ children, min = 170, grow = 1 }: { children: ReactNode; min?: number; grow?: number }) {
  const estilo: CSSProperties = { flex: `${grow} 1 ${min}px`, minWidth: 0 }
  return <div style={estilo}>{children}</div>
}

function Fila({ children }: { children: ReactNode }) {
  return <Flex wrap gap={12}>{children}</Flex>
}

function Panel({ id, children }: { id: string; children: ReactNode }) {
  const titulo = SECCIONES.find(s => s.id === id)?.titulo
  return (
    <Card size="small" title={titulo}>
      <Flex vertical gap={12}>{children}</Flex>
    </Card>
  )
}

interface Props {
  /** «s1»…«s5», o «todas» para mostrarlas juntas. */
  activa: string
  /** Consulta nueva: solo los campos de Volki. */
  reducido: boolean
  editando: boolean
  form: FormConsulta
  resaltados: Record<string, Resaltado>
  set: (campo: CampoTexto, valor: string) => void
  setEop: (sistema: string, campo: 'estado' | 'detalle', valor: string) => void
  setLista: (campo: 'tratamiento_items' | 'vacunas_items', items: ItemTratamiento[] | ItemVacuna[]) => void
  medicamentos: MedicamentoInventario[]
  catalogoVacunas: VacunaCatalogo[]
  especie?: string
}

export default function SeccionesConsulta({
  activa, reducido, editando, form, resaltados: hl, set, setEop, setLista,
  medicamentos, catalogoVacunas, especie,
}: Props) {
  const ve = (id: string) => activa === 'todas' || activa === id
  // «datetime-local» pide hora local sin zona; no se puede registrar una consulta del futuro
  const maxFecha = toLocalDatetimeString(new Date().toISOString())

  return (
    <Flex vertical gap={12}>
      {/* S1 — Anamnesis */}
      {ve('s1') && (
        <Panel id="s1">
          <Fila>
            <Celda>
              <Campo label="Fecha de la consulta">
                <EntradaFecha
                  value={form.fecha} onChange={v => set('fecha', v)}
                  max={maxFecha}
                />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {editando
                    ? 'Cámbiala solo si la consulta fue otro día; así queda ordenada en su lugar del historial.'
                    : 'Déjala vacía si la atiendes ahora. Si pasas una consulta de papel, pon el día y la hora en que se atendió: así queda en su lugar del historial.'}
                </Typography.Text>
              </Campo>
            </Celda>
            {!reducido && (
              <Celda>
                <Campo label="Tipo de consulta" hl={hl.tipo_consulta}>
                  <Selector value={form.tipo_consulta} onChange={v => set('tipo_consulta', v)} opciones={OPT.tipo_consulta} hl={hl.tipo_consulta} />
                </Campo>
              </Celda>
            )}
            {!reducido && (
              <Celda>
                <Campo label="Tiempo de evolución" hl={hl.tiempo_evolucion}>
                  <EntradaTexto value={form.tiempo_evolucion} onChange={v => set('tiempo_evolucion', v)} placeholder="Ej: 3 días" hl={hl.tiempo_evolucion} />
                </Campo>
              </Celda>
            )}
            <Celda>
              <Campo label="Derivado por" hl={hl.derivado_por}>
                <EntradaTexto value={form.derivado_por} onChange={v => set('derivado_por', v)} placeholder="Colega / clínica" hl={hl.derivado_por} />
              </Campo>
            </Celda>
          </Fila>
          <Campo label="Motivo de consulta" hl={hl.motivo_consulta}>
            <AreaTexto
              value={form.motivo_consulta} onChange={v => set('motivo_consulta', v)} filas={2}
              placeholder="Descripción del motivo principal de la consulta" hl={hl.motivo_consulta}
            />
          </Campo>
          <Campo label={reducido ? 'Anamnesis' : 'Detalle de la enfermedad actual'} hl={hl.detalle}>
            <AreaTexto value={form.detalle} onChange={v => set('detalle', v)} filas={3} hl={hl.detalle} />
          </Campo>
          <Fila>
            <Celda min={220}>
              <Campo label="Tipo de alimentación" hl={hl.alimentacion_tipo}>
                <EntradaTexto value={form.alimentacion_tipo} onChange={v => set('alimentacion_tipo', v)} placeholder="Balanceado / BARF / mixto" hl={hl.alimentacion_tipo} />
              </Campo>
            </Celda>
            <Celda min={220}>
              <Campo label="Cantidad diaria (g)" hl={hl.alimentacion_cantidad_gr}>
                <EntradaNumero value={form.alimentacion_cantidad_gr} onChange={v => set('alimentacion_cantidad_gr', v)} placeholder="200" hl={hl.alimentacion_cantidad_gr} step="1" />
              </Campo>
            </Celda>
          </Fila>
          {!reducido && (
            <Campo label="Antecedentes" hl={hl.antecedentes}>
              <AreaTexto
                value={form.antecedentes} onChange={v => set('antecedentes', v)} filas={3}
                placeholder="Vacunas previas: polivalente (ene-2026), antirrábica (mar-2026). Desparasitaciones, cirugías, enfermedades anteriores…"
                hl={hl.antecedentes}
              />
            </Campo>
          )}
        </Panel>
      )}

      {/* S2 — EOG */}
      {ve('s2') && (
        <Panel id="s2">
          <Fila>
            {([
              ['temperatura_c', 'Temperatura (°C)', '38.5', 'any'],
              ['peso_kg', 'Peso (kg)', '5.0', 'any'],
              ['frecuencia_cardiaca', 'FC (lpm)', '100', '1'],
              ['frecuencia_respiratoria', 'FR (rpm)', '22', '1'],
              ['condicion_corporal', 'CC (1–9)', '5', '1'],
            ] as const)
              .filter(([f]) => !reducido || !['frecuencia_cardiaca', 'frecuencia_respiratoria'].includes(f))
              .map(([f, label, ph, step]) => (
                <Celda key={f} min={130}>
                  <Campo label={label} hl={hl[f]}>
                    <EntradaNumero value={form[f]} onChange={v => set(f, v)} placeholder={ph} hl={hl[f]} step={step} />
                  </Campo>
                </Celda>
              ))}
          </Fila>
          <Fila>
            {([
              ['mucosas', 'Mucosas'],
              ['tllc', 'TLLC'],
              ['estado_sensorio', 'Estado sensorio'],
              ['hidratacion', 'Hidratación'],
              ['pulso', 'Pulso'],
            ] as const)
              .filter(([f]) => !reducido || !['tllc', 'pulso'].includes(f))
              .map(([f, label]) => (
                <Celda key={f}>
                  <Campo label={label} hl={hl[f]}>
                    <Selector value={form[f]} onChange={v => set(f, v)} opciones={OPT[f]} hl={hl[f]} />
                  </Campo>
                </Celda>
              ))}
            {!reducido && (
              <Celda>
                <Campo label="Linfonódulos" hl={hl.linfonodulos}>
                  <EntradaTexto value={form.linfonodulos} onChange={v => set('linfonodulos', v)} placeholder="No reactivos" hl={hl.linfonodulos} />
                </Campo>
              </Celda>
            )}
          </Fila>
        </Panel>
      )}

      {/* S3 — EOP */}
      {ve('s3') && (
        <Panel id="s3">
          <Flex wrap gap="12px 20px">
            {SISTEMAS_EOP.map(s => (
              <div key={s} style={{ flex: '1 1 340px', minWidth: 0 }}>
                <Fila>
                  <Celda min={150}>
                    <Campo label={SISTEMA_LABELS[s]}>
                      <Selector value={form.examen_particular[s].estado} onChange={v => setEop(s, 'estado', v)} opciones={OPT.sistema_estado} />
                    </Campo>
                  </Celda>
                  <Celda min={170} grow={2}>
                    <Campo label="Detalle" fila={SISTEMA_LABELS[s]}>
                      <EntradaTexto value={form.examen_particular[s].detalle} onChange={v => setEop(s, 'detalle', v)} placeholder="Observaciones" />
                    </Campo>
                  </Celda>
                </Fila>
              </div>
            ))}
          </Flex>
        </Panel>
      )}

      {/* S4 — Diagnóstico */}
      {ve('s4') && (
        <Panel id="s4">
          {!reducido && (
            <Campo label="Diagnóstico presuntivo" hl={hl.diagnostico_presuntivo}>
              <AreaTexto value={form.diagnostico_presuntivo} onChange={v => set('diagnostico_presuntivo', v)} filas={2} hl={hl.diagnostico_presuntivo} />
            </Campo>
          )}
          {!reducido && (
            <Campo label="Diagnósticos diferenciales" hl={hl.diagnosticos_diferenciales}>
              <AreaTexto
                value={form.diagnosticos_diferenciales} onChange={v => set('diagnosticos_diferenciales', v)}
                filas={2} placeholder="Separados por coma" hl={hl.diagnosticos_diferenciales}
              />
            </Campo>
          )}
          <Campo label={reducido ? 'Diagnóstico' : 'Diagnóstico definitivo'} hl={hl.diagnostico_definitivo}>
            <AreaTexto value={form.diagnostico_definitivo} onChange={v => set('diagnostico_definitivo', v)} filas={2} hl={hl.diagnostico_definitivo} />
          </Campo>
        </Panel>
      )}

      {/* S5 — Plan */}
      {ve('s5') && (
        <Panel id="s5">
          {!reducido && (
            <Campo label="Exámenes solicitados" hl={hl.examenes_solicitados}>
              <AreaTexto value={form.examenes_solicitados} onChange={v => set('examenes_solicitados', v)} filas={2} hl={hl.examenes_solicitados} />
            </Campo>
          )}
          <Flex vertical gap={6}>
            <Typography.Text strong>Medicamentos</Typography.Text>
            <ListaTratamientos
              items={form.tratamiento_items} desde={form.fecha || undefined}
              medicamentos={medicamentos}
              onChange={v => setLista('tratamiento_items', v)}
            />
          </Flex>
          {!reducido && (
            <Flex vertical gap={6}>
              <Typography.Text strong>Vacunas aplicadas</Typography.Text>
              <ListaVacunas
                items={form.vacunas_items} catalogo={catalogoVacunas}
                especie={especie} desde={form.fecha || undefined}
                onChange={v => setLista('vacunas_items', v)}
              />
            </Flex>
          )}
          <Campo label="Indicaciones al propietario" hl={hl.indicaciones}>
            <AreaTexto
              value={form.indicaciones} onChange={v => set('indicaciones', v)} filas={2}
              placeholder="Vacuna aplicada hoy: antirrábica 1 ml SC. Dieta blanda 3 días…"
              hl={hl.indicaciones}
            />
          </Campo>
          <Fila>
            {!reducido && (
              <Celda>
                <Campo label="Pronóstico" hl={hl.pronostico}>
                  <Selector value={form.pronostico} onChange={v => set('pronostico', v)} opciones={OPT.pronostico} hl={hl.pronostico} />
                </Campo>
              </Celda>
            )}
            <Celda>
              <Campo label={reducido ? 'Próximo control' : 'Próxima cita'}>
                <EntradaFecha value={form.proxima_cita} onChange={v => set('proxima_cita', v)} />
              </Campo>
            </Celda>
          </Fila>
        </Panel>
      )}
    </Flex>
  )
}
