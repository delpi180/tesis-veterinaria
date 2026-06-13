import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, User, PawPrint, Calendar } from 'lucide-react';
import { api } from '../services/api';

export default function GlobalSearch() {
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
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults(null);
    }
  }, [open]);

  // Debounced search
  const doSearch = useCallback(async (q) => {
    if (!q || q.trim().length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    try {
      const data = await api.get(`/api/busqueda?q=${encodeURIComponent(q.trim())}`);
      setResults(data);
    } catch {
      setResults({ clientes: [], mascotas: [], citas: [] });
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
    ((results.clientes?.length || 0) + (results.mascotas?.length || 0) + (results.citas?.length || 0)) > 0;

  const showEmpty = results && !hasResults && query.trim().length >= 2;

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm
                   transition-colors cursor-pointer"
        style={{
          backgroundColor: 'var(--hover-bg)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border-color)',
        }}
        title="Búsqueda global (Ctrl+K)"
      >
        <Search size={15} />
        <span className="hidden sm:inline">Buscar...</span>
        <kbd
          className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono"
          style={{
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-secondary)',
          }}
        >
          Ctrl+K
        </kbd>
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          className="fixed inset-0 z-[100] flex justify-center items-start pt-[15vh]"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div
            className="w-full max-w-lg mx-4 rounded-xl shadow-2xl overflow-hidden"
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
            }}
          >
            {/* Search input */}
            <div
              className="flex items-center gap-3 px-4 py-3"
              style={{ borderBottom: '1px solid var(--border-color)' }}
            >
              <Search size={18} style={{ color: 'var(--text-secondary)' }} />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={handleChange}
                placeholder="Buscar clientes, mascotas, citas..."
                className="flex-1 bg-transparent outline-none text-sm"
                style={{ color: 'var(--text-primary)' }}
              />
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:opacity-70 transition-opacity"
                style={{ color: 'var(--text-secondary)' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Results */}
            <div className="max-h-80 overflow-y-auto">
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
                  {results.mascotas?.length > 0 && (
                    <ResultSection
                      title="Mascotas"
                      icon={<PawPrint size={14} />}
                      items={results.mascotas}
                      onSelect={(item) => goTo(item.cliente_id ? `/clientes/${item.cliente_id}` : '/clientes')}
                      renderLabel={(item) => item.nombre || item.name || `Mascota #${item.id}`}
                      renderSub={(item) => item.especie || item.raza || ''}
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
                </div>
              )}

              {!loading && !results && (
                <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Escribe al menos 2 caracteres para buscar
                </div>
              )}
            </div>
          </div>
        </div>
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
      {items.map((item, idx) => (
        <button
          key={item.id ?? idx}
          onClick={() => onSelect(item)}
          className="w-full text-left px-4 py-2 flex items-center gap-3 transition-colors cursor-pointer"
          style={{ color: 'var(--text-primary)' }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--hover-bg)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{renderLabel(item)}</p>
            {renderSub(item) && (
              <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                {renderSub(item)}
              </p>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
