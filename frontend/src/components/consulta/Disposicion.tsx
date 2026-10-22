/**
 * Disposición ÚNICA de las pantallas de cliente y paciente (como en Volki):
 * panel blanco a todo el ancho y, si la pantalla trae una, una columna lateral
 * de ≈24 % PEGADA al borde derecho de la ventana, a todo el alto. La usan
 * Clientes, Ficha del dueño, Historial y Consulta, en todos sus estados, para
 * que al pasar de una a otra nada se mueva. Las medidas están en `medidasDisposicion.ts`
 * (y salen de `core/medidas.ts`). En pantallas chicas todo pasa a una sola columna.
 */
import type { ReactNode } from 'react'
import { Breadcrumb, Grid } from 'antd'
import type { BreadcrumbProps } from 'antd'
import { estilosDisposicion } from './medidasDisposicion'

interface Props {
  /** Migas de pan: caja gris pegada arriba del panel blanco (como en Volki). */
  migas?: BreadcrumbProps['items']
  /** Título, pestañas y acciones: va debajo de las migas. */
  encabezado?: ReactNode
  /** Columna derecha (ficha, responsable, recordatorios…). */
  lateral?: ReactNode
  children: ReactNode
}

export default function Disposicion({ migas, encabezado, lateral, children }: Props) {
  const pantallas = Grid.useBreakpoint()
  const dosColumnas = !!pantallas.xl
  const relleno = pantallas.md ? 20 : 12
  const estilos = estilosDisposicion(dosColumnas, relleno, !!lateral)

  return (
    <div data-disposicion="raiz" style={estilos.raiz}>
      <main data-disposicion="central" className="scroll-fino" style={estilos.central}>
        {migas ? (
          <div data-disposicion="migas" style={estilos.migas}><Breadcrumb items={migas} /></div>
        ) : (
          // sin migas (lista de clientes) el contenido empieza 16 px más abajo, como en Volki
          <div style={{ height: 16 }} />
        )}
        {encabezado
          ? <div style={{ padding: '16px 0' }}>{encabezado}</div>
          : migas && <div style={{ height: 16 }} />}
        {children}
      </main>
      {lateral && (
        <aside data-disposicion="lateral" className="scroll-fino" style={estilos.lateral}>
          {lateral}
        </aside>
      )}
    </div>
  )
}
