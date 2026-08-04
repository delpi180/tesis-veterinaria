/**
 * Convierte los videos .webm a .mp4.
 *
 * Cuándo hace falta
 * ─────────────────
 * WebM se ve bien en Chrome, Edge y Firefox, y YouTube lo acepta tal cual.
 * Donde falla es justo en lo que se usa para vender de a uno: WhatsApp,
 * PowerPoint y el reproductor por defecto de Windows no lo abren. Para eso
 * hace falta MP4 con H.264.
 *
 * Requiere ffmpeg instalado
 * ─────────────────────────
 * El ffmpeg que trae Playwright NO sirve acá: es una versión recortada que
 * solo sabe VP8 (lo justo para grabar) y no tiene H.264. Se comprobó:
 *     ffmpeg-win64.exe -encoders  →  solo libvpx y png
 *
 * Instalarlo en Windows:
 *     winget install Gyan.FFmpeg
 * y abrir una terminal nueva para que tome el PATH.
 *
 * Uso
 * ───
 *    cd demos
 *    node convertir.mjs
 */
import { execFile } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { promisify } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ejecutar = promisify(execFile)
const AQUI = path.dirname(fileURLToPath(import.meta.url))
const SALIDA = path.join(AQUI, 'salida')

async function hayFfmpeg() {
  try {
    const { stdout } = await ejecutar('ffmpeg', ['-hide_banner', '-encoders'])
    return stdout.includes('libx264')
  } catch {
    return false
  }
}

async function main() {
  if (!await hayFfmpeg()) {
    console.error('Falta ffmpeg con soporte H.264 (no basta el que trae Playwright).\n')
    console.error('  Instalarlo:   winget install Gyan.FFmpeg')
    console.error('  Después abre una terminal nueva y vuelve a correr esto.\n')
    console.error('Mientras tanto los .webm de salida/ se ven en cualquier navegador')
    console.error('y se pueden subir a YouTube tal cual.')
    process.exit(1)
  }

  let videos = []
  try {
    videos = (await readdir(SALIDA)).filter(f => f.endsWith('.webm'))
  } catch {
    console.error(`No existe ${SALIDA}. Graba primero con:  node grabar.mjs`)
    process.exit(1)
  }
  if (!videos.length) {
    console.error('No hay .webm que convertir. Graba primero con:  node grabar.mjs')
    process.exit(1)
  }

  for (const v of videos) {
    const entrada = path.join(SALIDA, v)
    const destino = entrada.replace(/\.webm$/, '.mp4')
    process.stdout.write(`  ${v} → ${path.basename(destino)} … `)
    await ejecutar('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-i', entrada,
      '-c:v', 'libx264',
      // yuv420p: sin esto QuickTime y algunos reproductores de Windows
      // muestran la pantalla en negro aunque el archivo esté bien.
      '-pix_fmt', 'yuv420p',
      '-crf', '23',                 // buena calidad sin archivos enormes
      '-preset', 'medium',
      '-movflags', '+faststart',    // empieza a verse antes de descargar todo
      destino,
    ])
    console.log('ok')
  }
  console.log(`\nListo. MP4 en ${path.relative(process.cwd(), SALIDA)}/`)
}

main().catch(e => { console.error(e.message ?? e); process.exit(1) })
