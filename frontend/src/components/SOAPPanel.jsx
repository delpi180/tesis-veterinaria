const SECTIONS = [
  {
    key: 'subjetivo',
    label: 'S — Subjetivo',
    description: 'Lo que el dueño reporta: síntomas, historia, comportamiento.',
    color: {
      header: 'bg-sky-600',
      border: 'border-sky-200',
      badge: 'bg-sky-100 text-sky-700',
      ring: 'focus:ring-sky-300',
    },
    entityKeys: ['sintomas_reportados', 'historia'],
    entityLabels: { sintomas_reportados: 'Síntomas', historia: 'Historia' },
  },
  {
    key: 'objetivo',
    label: 'O — Objetivo',
    description: 'Hallazgos clínicos: signos vitales, examen físico.',
    color: {
      header: 'bg-emerald-600',
      border: 'border-emerald-200',
      badge: 'bg-emerald-100 text-emerald-700',
      ring: 'focus:ring-emerald-300',
    },
    entityKeys: ['signos_vitales', 'hallazgos_examen_fisico'],
    entityLabels: { signos_vitales: 'Signos vitales', hallazgos_examen_fisico: 'Examen físico' },
  },
  {
    key: 'analisis',
    label: 'A — Análisis',
    description: 'Diagnóstico presuntivo y diferencial.',
    color: {
      header: 'bg-amber-500',
      border: 'border-amber-200',
      badge: 'bg-amber-100 text-amber-700',
      ring: 'focus:ring-amber-300',
    },
    entityKeys: ['diagnostico_presuntivo', 'diagnostico_diferencial'],
    entityLabels: { diagnostico_presuntivo: 'Dx presuntivo', diagnostico_diferencial: 'Dx diferencial' },
  },
  {
    key: 'plan',
    label: 'P — Plan',
    description: 'Tratamiento, procedimientos y seguimiento.',
    color: {
      header: 'bg-violet-600',
      border: 'border-violet-200',
      badge: 'bg-violet-100 text-violet-700',
      ring: 'focus:ring-violet-300',
    },
    entityKeys: ['farmacos', 'procedimientos', 'seguimiento'],
    entityLabels: { farmacos: 'Fármacos', procedimientos: 'Procedimientos', seguimiento: 'Seguimiento' },
  },
]

function EntityTags({ tags, badge }) {
  if (!tags?.length) return null
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {tags.map((t) => (
        <span key={t} className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge}`}>
          {t}
        </span>
      ))}
    </div>
  )
}

export default function SOAPPanel({ soap, onChange, disabled }) {
  if (!soap) return null

  const gettext = (section) =>
    soap[section.key]?.oraciones?.join('\n') ?? ''

  const getEntities = (section, eKey) =>
    soap[section.key]?.[eKey] ?? []

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {SECTIONS.map((section) => (
        <div
          key={section.key}
          className={`rounded-xl border ${section.color.border} overflow-hidden shadow-sm`}
        >
          {/* Header */}
          <div className={`${section.color.header} px-4 py-3`}>
            <h3 className="text-white font-bold text-sm">{section.label}</h3>
            <p className="text-white/70 text-xs mt-0.5">{section.description}</p>
          </div>

          {/* Textarea */}
          <div className="bg-white px-4 pt-3 pb-2">
            <textarea
              value={gettext(section)}
              onChange={(e) => onChange?.(section.key, e.target.value)}
              disabled={disabled}
              placeholder={`Información ${section.label.split('—')[1]?.trim() ?? ''} aparecerá aquí…`}
              rows={4}
              className={[
                'w-full resize-none text-sm text-slate-700 placeholder-slate-300',
                'border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2',
                `${section.color.ring} focus:border-transparent transition`,
                disabled ? 'bg-slate-50 cursor-not-allowed' : 'bg-white',
              ].join(' ')}
            />
          </div>

          {/* Entidades extraídas */}
          <div className="bg-white px-4 pb-3 flex flex-col gap-1">
            {section.entityKeys.map((eKey) => {
              const tags = getEntities(section, eKey)
              if (!tags.length) return null
              return (
                <div key={eKey}>
                  <p className="text-xs text-slate-400 font-medium mb-1">
                    {section.entityLabels[eKey]}
                  </p>
                  <EntityTags tags={tags} badge={section.color.badge} />
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
