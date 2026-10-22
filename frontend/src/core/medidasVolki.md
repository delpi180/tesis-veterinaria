# Medidas de Volki (geometría y estilos)

Medido en el navegador a 1917×930 px. Solo cajas, tamaños y estilos: no hay datos de clientes ni de pacientes.
Volki usa Angular Material con tipografía Roboto. Los colores de Volki (morado, grises) **no** se copian:
aquí valen los de `core/color.ts`.

## Esqueleto de toda pantalla
| Pieza | Medida |
|---|---|
| Menú lateral | 196 px de ancho, alto completo, fondo blanco, borde derecho 0.8 px gris claro |
| Logo del menú | 194×91, relleno 16 px 32 px |
| Ítem del menú | texto 14/20, relleno 14.4 px 16 px, separación entre ítems ≈ 44 px |
| Barra superior | alto 50 px, fondo blanco, borde inferior 0.8 px (#e0e0e0), relleno izquierdo 16 px |
| Contenido | empieza en x=196, y=50; relleno lateral **32 px** (0 32px 32px) |
| Texto base | Roboto 14 px / 20 px, color #333 |

## Pantallas con columna derecha (cliente, paciente, historial, consulta, turnos)
| Pieza | Medida |
|---|---|
| Fondo de la página | gris #f7f7f7 |
| Panel izquierdo | fondo blanco, relleno 0 32px 32px, **esquinas derechas 22 px** (0 22 22 0) |
| Panel derecho | ancho ≈ 421–430 px (≈ 24 % del contenido), fondo = el gris de la página, relleno 8px 24px, a todo el alto |
| Migas de pan | caja gris #f7f7f7, relleno 4.8px 16px 8px, esquinas inferiores 16 px (0 0 16 16), pegada arriba del panel; texto 15.2 px, peso 300/400 |
| Encabezado (header) | relleno 16px 0; contiene pestañas (izquierda) y botón de texto «Nuevo +» (derecha) |
| Título del panel derecho | 22 px / 500 / 30 px |
| Título de sección derecha («Recordatorios») | 20 px / 500 / 32 px |
| Tarjeta derecha | blanca, relleno 16 px, esquinas **16 px**, margen superior 16 px, sin sombra |
| Fila de ícono de la tarjeta | alto ≈ 22 px, ícono 21 px con 3.2 px de espacio |
| Barra inferior de la tarjeta | alto 36 px, botón de texto a la derecha |

## Pestañas
- Alto 49 px, separación entre pestañas 32 px, texto 14 px, peso 500, subrayado de color bajo la activa.
- Las pestañas están en la parte superior del panel, a 50 px del borde superior (miga de pan arriba, pestañas a 100 px).

## Tabla (grilla)
| Pieza | Medida |
|---|---|
| Contenedor | esquinas 16 px, fondo gris #f7f7f7, ancho completo del panel |
| Cabecera | alto 35 px, 14 px / 500, relleno de celda 8px 16px 0 24px (primera) / 8px 16px 0 8px (demás) |
| Fila | alto **49 px**, 14 px / 400, línea inferior 0.8 px rgba(173,173,173,.12) |
| Celda | relleno 0 16px 0 24px (primera) y 0 16px 0 8px (demás) |
| Acciones de fila | botones de ícono 48×48, ícono 24 px, redondos |
| Paginador | alto 56 px, texto 12 px, color 54 % de opacidad, fondo blanco |

## Filtros y botones
- Campo de búsqueda: 248 px de ancho, caja de 56 px de alto (con 19 px de zona de ayuda debajo = 75 px), esquinas 4 px, contorno fino.
- Selector «Etiquetas»: 222 px. Separación entre campos 10 px.
- Botón de texto («Nuevo +»): 83×36, 14 px / 500, esquinas 8 px, sin fondo.
- Botón relleno («Exportar», «Guardar»): alto 36 px, relleno 0 16px, 14 px / 500, esquinas 8 px, espaciado de letra 1.25 px.
- Barra de exportar: al pie, separada por una línea.

## Formulario de consulta
- Campos en contorno de 56 px de alto, 4 filas de campos 75 px de paso; mitades y cuartos del ancho con 8 px de separación.
- Paneles desplegables (Alimentación, Examen…): fondo blanco, encabezado de 48 px (relleno 0 24px), línea inferior 0.8 px #e0e0e0, cuerpo con relleno 16 px.
- Área de texto grande: 96 px de alto.
- El formulario ocupa todo el ancho del panel izquierdo (≈1337 px a 1917).

## Inicio (dashboard)
- Relleno 16px 32px 32px. Título 20/500. Tarjetas grises #fafafa con esquinas 16 px, relleno 16 px.
- Fila de totales: 5 ítems de 303×143 con 16 px de separación.

## Turnos
- Panel izquierdo (calendario semanal) ≈ 1239 px; panel derecho ≈ 469 px con mini-calendario de 300 px.

## Ventas / Productos / Inventario / Reportes
- Esqueleto simple de una columna: cabecera (pestañas) → fila de filtros (75 px) → tabla de ancho completo (esquinas 16 px) → paginador. Relleno lateral 32 px.
