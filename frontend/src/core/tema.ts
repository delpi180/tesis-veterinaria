import type { ThemeConfig } from 'antd'
import { theme } from 'antd'
import { BRAND } from './color'
import { MEDIDAS } from './medidas'

/**
 * Tema de Ant Design para toda la app. Los componentes de antd (botón, tabla,
 * formulario, tabs…) heredan de aquí; las pantallas no repiten colores ni medidas.
 *
 * Las medidas (letra 14 px, botones de 36 px, filas de 49 px…) salen de
 * `core/medidas.ts`, que a su vez las toma de Volki. Los colores son los de la marca.
 */
export const temaClinica: ThemeConfig = {
  algorithm: [theme.defaultAlgorithm],
  token: {
    colorPrimary: BRAND.primary,
    colorPrimaryHover: BRAND.primaryHover,
    colorPrimaryActive: BRAND.primaryActive,
    colorInfo: BRAND.primary,
    colorText: BRAND.text,
    colorTextSecondary: BRAND.textSecondary,
    colorBorder: BRAND.border,
    colorBorderSecondary: BRAND.border,
    colorBgLayout: BRAND.body,
    fontFamily: "'Roboto', system-ui, sans-serif",
    fontSize: MEDIDAS.letra,
    fontSizeLG: MEDIDAS.letra,
    lineHeight: MEDIDAS.interlinea / MEDIDAS.letra,
    borderRadius: MEDIDAS.botonRadio,
    controlHeight: MEDIDAS.botonAlto,
    controlHeightLG: MEDIDAS.campoAlto,
  },
  components: {
    Layout: {
      headerBg: BRAND.header,
      siderBg: BRAND.sider,
      bodyBg: BRAND.body,
    },
    Menu: {
      darkItemBg: BRAND.sider,
      darkSubMenuItemBg: BRAND.sider,
      darkItemSelectedBg: BRAND.siderActive,
      darkItemHoverBg: BRAND.siderActive,
      darkItemColor: '#b3d6c9',
      itemBorderRadius: MEDIDAS.botonRadio,
      itemHeight: 44,
    },
    Button: { fontWeight: 500, borderRadius: MEDIDAS.botonRadio, borderRadiusLG: MEDIDAS.botonRadio, contentFontSizeLG: MEDIDAS.letra },
    // Tarjetas planas: sin sombra ni borde, esquinas de 16 px y relleno de 16 px
    Card: {
      borderRadiusLG: MEDIDAS.tarjetaRadio, headerBg: BRAND.panel, headerFontSize: MEDIDAS.letra, headerFontSizeSM: 13,
      bodyPadding: MEDIDAS.tarjetaRelleno, boxShadowTertiary: 'none',
    },
    // Paneles desplegables de la consulta: encabezado de 48 px (14 + 20 + 14) con 24 px a los lados, cuerpo con 16 px
    Collapse: {
      borderRadiusLG: MEDIDAS.botonRadio, headerBg: BRAND.panel,
      headerPadding: '14px 24px', contentPadding: MEDIDAS.tarjetaRelleno,
    },
    // Tablas: cabecera de 35 px, fila de 49 px (20 px de línea + 14.5 px arriba y abajo), esquinas de 16 px
    Table: {
      headerBg: BRAND.panel, headerColor: BRAND.text,
      borderRadiusLG: MEDIDAS.tarjetaRadio,
      cellPaddingBlock: 14.5, cellPaddingInline: 16,
      cellFontSize: MEDIDAS.letra,
      borderColor: 'rgba(173, 173, 173, 0.25)',
    },
    // Pestañas: 49 px de alto, 32 px entre ellas, texto de 14 px
    Tabs: {
      horizontalItemGutter: MEDIDAS.pestanaSeparacion,
      horizontalItemPadding: '14.5px 0',
      horizontalMargin: '0 0 16px 0',
      titleFontSize: MEDIDAS.letra,
    },
    Pagination: { itemSize: 32, fontSize: 12 },
  },
}
