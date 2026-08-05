import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Search, X, User, PawPrint, Calendar, Stethoscope } from 'lucide-react';
import { api } from '../services/api';

export default function GlobalSearch({ onAbrir }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const navigate = useNavigate();

  // Ctrl+K shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Focus input when modal opens
  useEffect(() => {
    if (open) {
      onAbrir?.();                       // cierra el menú lateral en el celular
      setTimeout(() => inputRef.current?.focus(), 50);
      // Sin esto, al desplazar la lista de resultados se desplaza la página de
      // atrás y el modal queda flotando sobre contenido movido.
      const previo = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = previo; };
    }
    setQuery('');
    setResults(null);
  }, [open]);      // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search
  const doSearch = useCallback(async (q) => {
    if (!q || q.trim().length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    try {
      const data = await api.get(`/api/busqueda/?q=${encodeURIComponent(q.trim())}`);
      setResults(data);
    } catch {
      setResults({ clientes: [], pacientes: [], citas: [], historias: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 300);
  };

  const goTo = (path) => {
    setOpen(false);
    navigate(path);
  };

  const hasResults = results &&
    ((results.clientes?.length || 0) + (results.pacientes?.length || 0)
      + (results.citas?.length || 0) + (results.historias?.length || 0)) > 0;

  const showEmpty = results && !hasResults && query.trim().length >= 2;

  return (
    <>
      {/* Trigger button (estilizado para el sidebar morado) */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm
                   text-purple-200 bg-purple-900/50 hover:bg-purple-800 border border-purple-800
                   transition-colors cursor-pointer"
        title="Búsqueda global (Ctrl+K)"
      >
        <Search size={15} className="shrink-0" />
        <span className="flex-1 text-left">Buscar...</span>
        {/* El atajo solo tiene sentido con teclado */}
        <kbd className="hidden md:inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono
                        bg-purple-950 border border-purple-700 text-purple-300">
          Ctrl+K
        </kbd>
      </button>

      {/* Modal.
          Va por un portal al <body>: el menú lateral se desplaza con
          `transform`, y eso hace que un hijo `fixed` se posicione respecto al
          menú y no a la pantalla — en el celular el modal salía cortado por la
          izquierda, medio tapado por el cajón. */}
      {open && createPortal(
        <div
          className="fixed inset-0 z-[100] flex justify-center items-start p-3 pt-16 md:pt-[15vh]"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div
            className="w-full max-w-lg rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
            }}
          >
            {/* Search input */}
            <div
              className="flex items-center gap-3 px-4 py-3 shrink-0"
              style={{ borderBottom: '1px solid var(--border-color)' }}
            >
              <Search size={18} className="shrink-0" style={{ color: 'var(--text-secondary)' }} />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={handleChange}
                placeholder="Mascota, dueño, DNI…"
                // 16px de fuente: por debajo de eso el navegador del celular
                // hace zoom al enfocar el campo y descuadra la pantalla.
                className="flex-1 min-w-0 bg-transparent outline-none text-base md:text-sm"
                style={{ color: 'var(--text-primary)' }}
              />
              <button
                onClick={() => setOpen(false)}
                aria-label="Cerrar búsqueda"
                className="p-2 -mr-1 rounded shrink-0 hover:opacity-70 transition-opacity"
                style={{ color: 'var(--text-secondary)' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {loading && (
                <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Buscando...
                </div>
              )}

              {!loading && showEmpty && (
                <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Sin resultados para "{query}"
                </div>
              )}

              {!loading && hasResults && (
                <div className="py-2">
                  {/* Clientes */}
                  {results.clientes?.length > 0 && (
                    <ResultSection
                      title="Clientes"
                      icon={<User size={14} />}
                      items={results.clientes}
                      onSelect={(item) => goTo(item.id ? `/clientes/${item.id}` : '/clientes')}
                      renderLabel={(item) => item.nombre || item.name || `Cliente #${item.id}`}
                      renderSub={(item) => item.telefono || item.email || ''}
                    />
                  )}

                  {/* Mascotas */}
                  {results.pacientes?.length > 0 && (
                    <ResultSection
                      title="Mascotas"
                      icon={<PawPrint size={14} />}
                      items={results.pacientes}
                      onSelect={(item) => goTo(item.id ? `/pacientes/${item.id}/historial` : '/clientes')}
                      renderLabel={(item) => item.nombre || item.name || `Mascota #${item.id}`}
                      // Con varias mascotas del mismo nombre, el dueño es lo que
                      // permite elegir la correcta sin abrir las fichas una por
                      // una. Va en su propia línea: en el celular, todo junto se
                      // cortaba justo antes del nombre del dueño.
                      renderSub={(item) => (
                        <>
                          <span className="block truncate">
                            {[item.especie, item.raza].filter(Boolean).join(' · ')}
                          </span>
                          {item.propietario && (
                            <span className="block truncate font-medium" style={{ color: 'var(--text-primary)' }}>
                              Dueño: {item.propietario}
                            </span>
                          )}
                        </>
                      )}
                    />
                  )}

                  {/* Citas */}
                  {results.citas?.length > 0 && (
                    <ResultSection
                      title="Citas"
                      icon={<Calendar size={14} />}
                      items={results.citas}
                      onSelect={() => goTo('/turnos')}
                      renderLabel={(item) => item.motivo || item.titulo || `Cita #${item.id}`}
                      renderSub={(item) => item.fecha || item.hora || ''}
                    />
                  )}

                  {/* Historias clínicas — busca en toda la clínica, no solo un paciente */}
                  {results.historias?.length > 0 && (
                    <ResultSection
                      title="Historias clínicas"
                      icon={<Stethoscope size={14} />}
                      items={results.historias}
                      onSelect={(item) => goTo(item.paciente_id ? `/pacientes/${item.paciente_id}/historial` : '/clientes')}
                      renderLabel={(item) => item.resumen || `Historia de ${item.paciente ?? 'paciente'}`}
                      renderSub={(item) => [item.paciente, item.propietario].filter(Boolean).join(' · ')}
                    />
                  )}
                </div>
              )}

              {!loading && !results && (
                <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Escribe al menos 2 caracteres para buscar
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function ResultSection({ title, icon, items, onSelect, renderLabel, renderSub }) {
  return (
    <div>
      <div
        className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider flex items-center gap-2"
        style={{ color: 'var(--text-secondary)' }}
      >
        {icon} {title}
      </div>
      {items.map((item, idx) => {
        const sub = renderSub(item);
        return (
          // py-3 en el celular: con py-2 las filas quedaban a menos de 40 px y
          // se erraba el toque entre dos mascotas del mismo nombre.
          <button
            key={item.id ?? idx}
            onClick={() => onSelect(item)}
            className="w-full text-left px-4 py-3 md:py-2 flex items-center gap-3 transition-colors cursor-pointer"
            style={{ color: 'var(--text-primary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--hover-bg)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{renderLabel(item)}</p>
              {sub && (
                <div className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                  {sub}
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
