/**
 * Graba videos de demostración del sistema, sin intervención manual.
 *
 * Por qué así y no grabando la pantalla a mano
 * ────────────────────────────────────────────
 * Un video grabado a mano hay que rehacerlo entero cada vez que cambia una
 * pantalla, y sale distinto cada toma: el mouse tiembla, se tarda de más en
 * un campo, aparece una notificación del sistema. Esto es un guion: se
 * ejecuta igual siempre, y cuando la interfaz cambie se regraba con un
 * comando en vez de volver a sentarse a grabar.
 *
 * Requisitos
 * ──────────
 * 1. La base de DEMO sembrada:
 *      cd backend && .venv/Scripts/python.exe scripts/sembrar_demo.py --url <url_demo>
 * 2. El backend apuntando a esa base (NUNCA a producción: el video mostraría
 *    clientes reales) y el frontend levantado.
 *
 * Uso
 * ───
 *    cd demos
 *    node grabar.mjs                 # graba todos los guiones
 *    node grabar.mjs recepcion       # solo uno
 *    node grabar.mjs --lento         # más pausado, para narrar encima
 *
 * Los videos quedan en demos/salida/ en .webm: se abren en cualquier
 * navegador y YouTube los acepta tal cual. Para WhatsApp o PowerPoint hay que
 * pasarlos a mp4 con convertir.mjs, que necesita ffmpeg instalado aparte (el
 * que trae Playwright solo sabe VP8, no sirve para eso).
 */
import { chromium } from 'playwright'
import { mkdir, rm, readdir, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const SALIDA = path.join(AQUI, 'salida')

const URL_APP = process.env.DEMO_URL ?? 'http://localhost:5173'
const CUENTAS = {
  recepcion:   { usuario: 'demo_admin', password: 'demo1234' },
  veterinario: { usuario: 'demo_vet',   password: 'demo1234' },
}

// Ritmo del video. Una demo que va a la velocidad de la máquina es ilegible:
// el ojo necesita alcanzar a leer la pantalla antes del siguiente clic.
const lento = process.argv.includes('--lento')
const RITMO = lento ? 1.8 : 1

const pausa = (ms) => new Promise(r => setTimeout(r, ms * RITMO))

/**
 * Espera a que la pantalla tenga datos de verdad.
 *
 * Una pausa fija no alcanza: la base de demo está en la nube y una consulta
 * tarda cientos de milisegundos. La primera versión salió mostrando los
 * esqueletos de carga — un video de venta enseñando cuadros grises vacíos.
 *
 * La segunda versión tampoco: preguntaba por los esqueletos apenas se hacía
 * clic, cuando React todavía no había montado la pantalla nueva. Como no
 * había ninguno todavía, daba por cargado y seguía de largo.
 *
 * Por eso se exige que la ausencia de esqueletos sea ESTABLE: dos lecturas
 * seguidas sin ninguno, después de darle tiempo a montar.
 */
async function esperarDatos(page, ms = 20000) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await pausa(600)                       // que monte y dispare sus peticiones

  const limite = Date.now() + ms
  let lecturasLimpias = 0
  while (Date.now() < limite) {
    const cargando = await page.locator('.animate-pulse').count()
    lecturasLimpias = cargando === 0 ? lecturasLimpias + 1 : 0
    if (lecturasLimpias >= 2) {
      await pausa(600)
      return
    }
    await page.waitForTimeout(400)
  }
  console.warn('    · la pantalla siguió cargando; se graba igual')
}

/** Escribe como una persona, no de golpe: pegar el texto entero no se lee. */
async function tipear(page, selector, texto, msPorLetra = 55) {
  await page.click(selector)
  await page.type(selector, texto, { delay: msPorLetra * RITMO })
}

/**
 * Rótulo sobreimpreso para explicar qué se está viendo.
 *
 * Va inyectado en la página en vez de agregarse después en un editor: así el
 * texto viaja con el guion y se actualiza junto con él.
 */
async function rotulo(page, texto, ms = 2600) {
  await page.evaluate((t) => {
    document.getElementById('__demo_rotulo__')?.remove()
    const d = document.createElement('div')
    d.id = '__demo_rotulo__'
    d.textContent = t
    Object.assign(d.style, {
      position: 'fixed', left: '50%', bottom: '38px', transform: 'translateX(-50%)',
      background: 'rgba(24,16,43,.94)', color: '#fff', font: '600 19px/1.4 system-ui, sans-serif',
      padding: '13px 26px', borderRadius: '12px', zIndex: '2147483647',
      boxShadow: '0 10px 34px rgba(0,0,0,.4)', maxWidth: '82%', textAlign: 'center',
      opacity: '0', transition: 'opacity .35s ease',
    })
    document.body.appendChild(d)
    requestAnimationFrame(() => { d.style.opacity = '1' })
  }, texto)
  await pausa(ms)
  await page.evaluate(() => {
    const d = document.getElementById('__demo_rotulo__')
    if (d) { d.style.opacity = '0'; setTimeout(() => d.remove(), 400) }
  })
  await pausa(400)
}

async function entrar(page, quien) {
  const { usuario, password } = CUENTAS[quien]
  await page.goto(`${URL_APP}/login`)
  await page.waitForSelector('#usuario')
  await pausa(900)
  await tipear(page, '#usuario', usuario)
  await tipear(page, '#password', password)
  await pausa(500)
  await page.click('button[type=submit]')
  await esperarDatos(page)
  await pausa(900)
}

// ── Guiones ──────────────────────────────────────────────────────────────────

const GUIONES = {
  /** El día a día de recepción: quién viene hoy y qué hay que atender. */
  async recepcion(page) {
    await rotulo(page, 'Recepción abre el sistema y ve el día completo')
    await entrar(page, 'recepcion')
    await rotulo(page, 'Turnos del día, ingresos y alertas de inventario, en una pantalla')
    await pausa(2200)

    await page.click('nav a[href="/turnos"]')
    await esperarDatos(page)
    await rotulo(page, 'La agenda: varios doctores atendiendo en paralelo')
    await pausa(1800)

    await page.click('nav a[href="/clientes"]')
    await esperarDatos(page)
    await rotulo(page, 'Búsqueda de clientes por nombre o DNI, sobre miles de fichas')
    const buscador = 'input[placeholder*="Buscar"]'
    if (await page.locator(buscador).count()) {
      await tipear(page, buscador, 'Valeria')
      // La búsqueda va al servidor con retardo: sin esperarla, el video
      // muestra la lista en esqueletos justo cuando se quiere lucir el
      // resultado.
      await esperarDatos(page)
      await pausa(1400)
    }
    await rotulo(page, 'Cada dueño con sus mascotas y su historial completo')
    await pausa(1500)
  },

  /** Lo que le importa a quien compra: cobrar rápido y sin errores. */
  async ventas(page) {
    await entrar(page, 'recepcion')
    await page.click('nav a[href="/ventas"]')
    await esperarDatos(page)
    await rotulo(page, 'Punto de venta: productos y servicios en el mismo cobro')

    const nueva = page.getByRole('button', { name: /Nueva Venta/i })
    if (await nueva.count()) {
      await nueva.click()
      await pausa(1400)
      await rotulo(page, 'El stock se descuenta solo al cobrar; la boleta sale al instante')
      await pausa(2000)
      await page.keyboard.press('Escape')
      await pausa(900)
    }

    await page.click('nav a[href="/inventario"]')
    await esperarDatos(page)
    await rotulo(page, 'Inventario con aviso de stock bajo y de lo que está por vencer')
    await pausa(2400)

    await page.click('nav a[href="/caja"]')
    await esperarDatos(page)
    await rotulo(page, 'Cierre de caja: se cuenta el efectivo y queda la constancia del día')
    await pausa(2400)
  },

  /** El diferencial: la consulta se llena dictando. */
  async consulta(page) {
    await entrar(page, 'veterinario')
    await rotulo(page, 'El veterinario ve solo lo suyo: su agenda y sus pacientes')
    await pausa(2000)

    await page.click('nav a[href="/clientes"]')
    await esperarDatos(page)

    const primerCliente = page.locator('a[href^="/clientes/"], tbody tr').first()
    if (await primerCliente.count()) {
      await primerCliente.click()
      await esperarDatos(page)
      await rotulo(page, 'Ficha de la mascota: antecedentes, alergias y consultas previas')
      await pausa(2200)
    }

    const atender = page.getByRole('button', { name: /Atender/i }).first()
    if (await atender.count()) {
      await atender.click()
      await esperarDatos(page)
      await rotulo(page, 'La consulta se llena dictando: el sistema reparte cada dato en su campo')
      await pausa(2600)
      await rotulo(page, 'Cinco secciones en pestañas, marcando lo que ya está completo')
      await pausa(2400)
    }
  },
}

// ── Motor ────────────────────────────────────────────────────────────────────

async function grabar(nombre, guion) {
  const dir = path.join(SALIDA, nombre)
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })

  const navegador = await chromium.launch({ headless: true })
  const contexto = await navegador.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir, size: { width: 1920, height: 1080 } },
    locale: 'es-PE',
    timezoneId: 'America/Lima',
    // Sin esto el cursor no aparece en el video y los clics se ven mágicos.
    hasTouch: false,
  })
  // Puntero visible: Playwright no dibuja el mouse en el video, así que se
  // pinta uno. Sin él, quien mira no entiende de dónde salen los clics.
  //
  // Va ANTES de newPage(): un initScript solo alcanza a las páginas creadas
  // después de registrarlo. En la primera versión estaba abajo y el cursor
  // nunca apareció.
  await contexto.addInitScript(() => {
    window.addEventListener('DOMContentLoaded', () => {
      const c = document.createElement('div')
      Object.assign(c.style, {
        position: 'fixed', width: '22px', height: '22px', borderRadius: '50%',
        background: 'rgba(126,34,206,.35)', border: '2px solid rgba(126,34,206,.9)',
        zIndex: '2147483646', pointerEvents: 'none', transform: 'translate(-50%,-50%)',
        transition: 'left .08s linear, top .08s linear', left: '-50px', top: '-50px',
      })
      document.body.appendChild(c)
      document.addEventListener('mousemove', (e) => {
        c.style.left = e.clientX + 'px'
        c.style.top = e.clientY + 'px'
      })
      document.addEventListener('mousedown', () => { c.style.background = 'rgba(126,34,206,.75)' })
      document.addEventListener('mouseup', () => { c.style.background = 'rgba(126,34,206,.35)' })
    })
  })

  const page = await contexto.newPage()

  let error = null
  try {
    console.log(`  ▶ grabando "${nombre}"…`)
    await guion(page)
    await pausa(1200)
  } catch (e) {
    error = e
  } finally {
    await contexto.close()   // el video se escribe recién al cerrar el contexto
    await navegador.close()
  }

  // Playwright nombra el archivo con un hash; se renombra a algo usable.
  const archivos = (await readdir(dir)).filter(f => f.endsWith('.webm'))
  if (archivos.length) {
    const destino = path.join(SALIDA, `${nombre}.webm`)
    await rm(destino, { force: true })
    await rename(path.join(dir, archivos[0]), destino)
    await rm(dir, { recursive: true, force: true })
    console.log(`  ✓ ${path.relative(process.cwd(), destino)}`)
  } else {
    console.log(`  ✗ ${nombre}: no se generó video`)
  }
  if (error) throw error
}

async function main() {
  const pedidos = process.argv.slice(2).filter(a => !a.startsWith('--'))
  const aGrabar = pedidos.length ? pedidos : Object.keys(GUIONES)

  const desconocidos = aGrabar.filter(n => !GUIONES[n])
  if (desconocidos.length) {
    console.error(`Guion desconocido: ${desconocidos.join(', ')}`)
    console.error(`Disponibles: ${Object.keys(GUIONES).join(', ')}`)
    process.exit(1)
  }

  // Comprobar que la app responde antes de abrir el navegador: si no, se
  // grabarían tres videos de una pantalla de error.
  try {
    const r = await fetch(URL_APP, { signal: AbortSignal.timeout(5000) })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
  } catch (e) {
    console.error(`No responde ${URL_APP} — ${e.message}`)
    console.error('Levanta el frontend y el backend (apuntando a la base de DEMO) antes de grabar.')
    process.exit(1)
  }

  if (!existsSync(SALIDA)) await mkdir(SALIDA, { recursive: true })
  console.log(`Grabando desde ${URL_APP}${lento ? ' (ritmo lento)' : ''}\n`)
  for (const nombre of aGrabar) {
    await grabar(nombre, GUIONES[nombre])
  }
  console.log(`\nListo. Videos en ${path.relative(process.cwd(), SALIDA)}/`)
}

main().catch(e => { console.error(e); process.exit(1) })
