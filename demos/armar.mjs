/**
 * Arma el video de venta completo.
 *
 * Junta dos cosas que se hacen por separado:
 *   · las grabaciones del sistema real   (grabar.mjs, con Playwright)
 *   · las piezas de diseño               (piezas/, con HyperFrames)
 *
 * y produce un solo MP4:
 *
 *   intro → título → recepción → título → ventas → título → consulta → cierre
 *
 * Todo se ejecuta acá, sin servicios de edición ni subir nada a ningún lado.
 *
 * Requisitos
 * ──────────
 *   1. node grabar.mjs      (deja demos/salida/*.webm)
 *   2. ffmpeg en el PATH    (winget install Gyan.FFmpeg)
 *
 * Uso
 * ───
 *   node armar.mjs
 *   node armar.mjs --contacto "WhatsApp 999 888 777"
 */
import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ejecutar = promisify(execFile)
const AQUI = path.dirname(fileURLToPath(import.meta.url))
const SALIDA = path.join(AQUI, 'salida')
const PIEZAS = path.join(AQUI, 'piezas')
const TRABAJO = path.join(SALIDA, '_piezas')
const CLI_HYPERFRAMES = path.join(AQUI, 'node_modules', 'hyperframes', 'bin', 'hyperframes.mjs')

const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(`--${nombre}`)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : porDefecto
}

const CONTACTO = arg('contacto', 'Escríbenos para una demostración')

/** El orden del video final. Cada grabación va precedida de su cartel. */
const GUION = [
  { tipo: 'intro' },
  {
    tipo: 'titulo', archivo: 'recepcion',
    numero: 'Parte 1', titulo: 'El día de la recepción',
    subtitulo: 'Turnos, alertas y fichas de cliente en una sola pantalla',
  },
  { tipo: 'grabacion', archivo: 'recepcion' },
  {
    tipo: 'titulo', archivo: 'ventas',
    numero: 'Parte 2', titulo: 'Cobrar sin errores',
    subtitulo: 'El stock se descuenta solo y la caja cuadra al cierre',
  },
  { tipo: 'grabacion', archivo: 'ventas' },
  {
    tipo: 'titulo', archivo: 'consulta',
    numero: 'Parte 3', titulo: 'La consulta, dictada',
    subtitulo: 'El veterinario habla; el sistema llena cada campo',
  },
  { tipo: 'grabacion', archivo: 'consulta' },
  { tipo: 'cierre' },
]

async function hayFfmpeg() {
  try {
    const { stdout } = await ejecutar('ffmpeg', ['-hide_banner', '-encoders'])
    return stdout.includes('libx264')
  } catch {
    return false
  }
}

/**
 * Renderiza una composición de HyperFrames a MP4.
 *
 * Los carteles salen de una sola plantilla con marcadores: mantener tres
 * archivos casi idénticos garantiza que se desincronicen en cuanto alguien
 * cambia un color. El HTML resuelto se escribe en un archivo temporal y se
 * renderiza con --composition, sin tocar el index.html del proyecto.
 */
async function renderizarPieza(nombre, htmlOrigen, reemplazos = {}) {
  let html = await readFile(path.join(PIEZAS, htmlOrigen), 'utf8')
  for (const [clave, valor] of Object.entries(reemplazos)) {
    html = html.replaceAll(`__${clave}__`, valor)
  }
  // Busca el patrón exacto __NOMBRE__, no cualquier doble guion bajo: las
  // composiciones usan `window.__timelines`, que no es un marcador.
  const pendiente = html.match(/__[A-Z][A-Z_]*__/)?.[0]
  if (pendiente) {
    throw new Error(`Quedó un marcador sin reemplazar en ${nombre}: ${pendiente}`)
  }

  const temporal = `_generado-${nombre}.html`
  const rutaTemporal = path.join(PIEZAS, temporal)
  try {
    await writeFile(rutaTemporal, html, 'utf8')
    process.stdout.write(`  · pieza "${nombre}" … `)
    // Se invoca el CLI con node directamente, sin `shell: true`: con shell
    // los argumentos se concatenan sin escapar y cualquier ruta con espacios
    // —como "CARLOS FERNANDO"— se parte en dos y el render falla con un
    // "Not a directory" que no dice nada.
    await ejecutar(process.execPath, [
      CLI_HYPERFRAMES, 'render',
      '--composition', temporal,
      '--output', path.join(TRABAJO, `${nombre}.mp4`),
      '--quiet',
    ], {
      cwd: PIEZAS, maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, HYPERFRAMES_SKIP_SKILLS: '1' },
    })
    console.log('ok')
  } finally {
    await rm(rutaTemporal, { force: true })
  }
}


/**
 * Normaliza un clip para poder concatenarlos sin recodificar dos veces.
 *
 * `concat` de ffmpeg exige que todos los trozos compartan códec, resolución,
 * fps y formato de píxel. Las grabaciones son VP8 a 25 fps y las piezas salen
 * de HyperFrames en H.264 a 30: unirlos en crudo produce un archivo que
 * algunos reproductores muestran cortado o en negro a partir del primer
 * empalme. Se pasa todo por el mismo molde.
 */
async function normalizar(entrada, destino) {
  await ejecutar('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-i', entrada,
    '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,'
         + 'pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,format=yuv420p',
    '-c:v', 'libx264', '-crf', '20', '-preset', 'medium',
    '-an',                       // sin audio: no hay pistas de sonido todavía
    destino,
  ])
}

async function main() {
  if (!await hayFfmpeg()) {
    console.error('Falta ffmpeg con H.264.  Instálalo con:  winget install Gyan.FFmpeg')
    process.exit(1)
  }

  const faltantes = GUION
    .filter(p => p.tipo === 'grabacion')
    .map(p => p.archivo)
    .filter(a => !existsSync(path.join(SALIDA, `${a}.webm`)))
  if (faltantes.length) {
    console.error(`Faltan grabaciones: ${faltantes.join(', ')}`)
    console.error('Genera primero con:  node grabar.mjs')
    process.exit(1)
  }

  await rm(TRABAJO, { recursive: true, force: true })
  await mkdir(TRABAJO, { recursive: true })

  console.log('Renderizando las piezas de diseño…')
  await renderizarPieza('00-intro', 'index.html')
  for (const p of GUION.filter(x => x.tipo === 'titulo')) {
    await renderizarPieza(`titulo-${p.archivo}`, 'titulo.html', {
      NUMERO: p.numero, TITULO: p.titulo, SUBTITULO: p.subtitulo,
    })
  }
  await renderizarPieza('99-cierre', 'cierre.html', { CONTACTO })

  console.log('\nUnificando formato de todos los trozos…')
  const trozos = []
  for (const [i, p] of GUION.entries()) {
    const nombre = String(i).padStart(2, '0')
    const destino = path.join(TRABAJO, `n${nombre}.mp4`)
    const origen =
      p.tipo === 'intro'     ? path.join(TRABAJO, '00-intro.mp4')
    : p.tipo === 'cierre'    ? path.join(TRABAJO, '99-cierre.mp4')
    : p.tipo === 'titulo'    ? path.join(TRABAJO, `titulo-${p.archivo}.mp4`)
    :                          path.join(SALIDA, `${p.archivo}.webm`)
    process.stdout.write(`  · ${path.basename(origen)} … `)
    await normalizar(origen, destino)
    trozos.push(destino)
    console.log('ok')
  }

  const lista = path.join(TRABAJO, 'lista.txt')
  await writeFile(lista,
    trozos.map(t => `file '${t.replace(/\\/g, '/')}'`).join('\n'), 'utf8')

  const final = path.join(SALIDA, 'demo-completo.mp4')
  console.log('\nUniendo…')
  await ejecutar('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', lista,
    '-c', 'copy',                    // ya están normalizados: no recodificar
    '-movflags', '+faststart',
    final,
  ])

  const { stdout } = await ejecutar('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1', final,
  ])
  const seg = Math.round(parseFloat(stdout))
  console.log(`\n✓ ${path.relative(process.cwd(), final)}  —  ${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`)
}

main().catch(e => {
  console.error('\n' + (e.stderr || e.message || e))
  process.exit(1)
})
