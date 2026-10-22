/**
 * Identidad de la clínica, en un solo sitio. Mismo esquema que `core/color.ts`
 * de CorAll: un objeto BRAND que consumen el `ConfigProvider` de Ant Design y
 * cualquier estilo suelto que no pueda usar `theme.useToken()`.
 *
 * Los mismos valores viven en `index.css` como `--color-brand-*` para las
 * pantallas que todavía usan Tailwind; así las dos mitades de la app (la
 * migrada y la que no) se ven de la misma mano durante la transición.
 */
export const BRAND = {
  primary: '#2e6d5a',       // verde bosque — 6.1:1 con texto blanco
  primaryHover: '#37776a',
  primaryActive: '#235646',
  header: '#ffffff',
  sider: '#0d2119',         // menú lateral oscuro
  siderActive: '#143329',
  body: '#f7f5f0',          // crema de fondo
  text: '#1f2a25',
  textSecondary: '#56655d', // ≥ 5.2:1 sobre blanco y crema
  border: '#e4dfd5',
  panel: '#faf8f3',        // crema muy claro: cabeceras de tarjetas y paneles
  accent: '#c8623f',        // arcilla: el "hoy" de un gráfico, un dato destacado
  accentText: '#a94a29',    // 5.0:1 sobre blanco, para texto
} as const

/** Colores con significado clínico (no de marca). */
export const ESTADO = {
  ok: '#2f9e44',
  atencion: '#d9870a',
  peligro: '#c92a2a',
} as const

/**
 * Color de marca para los PDF (jsPDF pide [r, g, b], no un hexadecimal).
 * Es el mismo verde que `BRAND.primary`. Antes cada generador de PDF tenía su
 * propio morado escrito a mano, y al rediseñar la app se habrían quedado atrás.
 */
export const PDF_MARCA: [number, number, number] = [46, 109, 90]
