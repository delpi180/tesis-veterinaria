import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import { instalarCapturaGlobal } from './services/reportarError.js'

// Captura los fallos que no pasan por un ErrorBoundary (errores sueltos de JS
// y promesas rechazadas), para que tampoco queden invisibles.
instalarCapturaGlobal()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
