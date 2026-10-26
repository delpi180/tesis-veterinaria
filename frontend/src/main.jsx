import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import esES from 'antd/locale/es_ES'
import dayjs from 'dayjs'
import 'dayjs/locale/es'
import './index.css'
import App from './App.jsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { instalarCapturaGlobal } from './services/reportarError.js'
import { temaClinica } from './core/tema'

// Fechas en español en todo lo que use dayjs (Ant Design, gráficos).
dayjs.locale('es')

// Captura los fallos que no pasan por un ErrorBoundary (errores sueltos de JS
// y promesas rechazadas), para que tampoco queden invisibles.
instalarCapturaGlobal()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      {/* El tema de marca vive en un solo sitio (core/tema.ts), igual que en
          CorAll: los componentes de Ant Design lo heredan sin repetir colores. */}
      <ConfigProvider locale={esES} theme={temaClinica}>
        <App />
      </ConfigProvider>
    </ErrorBoundary>
  </StrictMode>,
)
