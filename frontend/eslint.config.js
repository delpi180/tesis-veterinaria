import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // ── Qué frena un despliegue y qué solo avisa ─────────────────────────────
    //
    // El lint ahora corre en CI, así que la severidad decide qué bloquea. El
    // criterio es: bloquea lo que rompe la aplicación en producción, avisa lo
    // que es deuda de estilo.
    //
    // `no-undef` y `no-unused-vars` se quedan como error (vienen de
    // js.configs.recommended). Son los que habrían atrapado el import faltante
    // que reventó la pantalla de Ventas: se usaba `useToast` sin importarlo y
    // el fallo recién apareció al abrir el diálogo de anular, ya en producción.
    //
    // Las de abajo son advertencias del compilador de React sobre patrones que
    // funcionan pero podrían escribirse mejor. Son 45 y arreglarlas implica
    // rehacer la carga de datos de todas las pantallas: es un trabajo aparte,
    // no algo que deba frenar una corrección urgente. Quedan visibles como
    // warning para no perderlas de vista.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'react-refresh/only-export-components': 'warn',
    },
  },
])
