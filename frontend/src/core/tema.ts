import type { ThemeConfig } from 'antd'
import { theme } from 'antd'
import { BRAND } from './color'

/**
 * Tema de Ant Design para toda la app. Los componentes de antd (botón, tabla,
 * formulario, tabs…) heredan de aquí; las pantallas no repiten colores.
 *
 * Tamaño de letra base 15 px: es un sistema que se lee ocho horas al día para
 * ver dosis y diagnósticos, y los 14 px por defecto de antd cansan.
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
    fontFamily: "'Nunito Variable', 'Nunito', system-ui, sans-serif",
    fontSize: 15,
    borderRadius: 10,
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
      itemBorderRadius: 8,
    },
    Card: { borderRadiusLG: 14 },
    Table: { headerBg: '#efece5', headerColor: BRAND.textSecondary },
  },
}
