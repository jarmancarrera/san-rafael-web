// Comprobante de reserva de DEMOSTRACIÓN (PLAN-v2 §11.4). comprobante.html?n=SR-DEMO-<AAAAMMDD>-<4 dígitos>
// Los comprobantes viven en sessionStorage («sr-comprobantes», por número): sin servidor, solo en esta pestaña.
// htmlComprobante escapa todo texto que no sea un número; el mismo HTML se ve en la página y va en la descarga (Blob).
// También exporta figuraLote: el polígono del lote (maqueta/lotes-2d.json) con cotas de frente y fondo (datos/lotes.json).
import { fmt } from '../calculadora/calculadora.js'

export const NUMERO_RE = /^SR-DEMO-\d{8}-\d{4}$/
const CLAVE = 'sr-comprobantes'
const MAPA = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => MAPA[c])
const uno = (n) => Number(n).toLocaleString('es-GT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const dinero = (n) => (Number.isFinite(Number(n)) ? fmt(Number(n)) : 'Sin dato')

function todos() {
  try { return JSON.parse(sessionStorage.getItem(CLAVE)) || {} } catch { return {} }
}

export function guardarComprobante(r) {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify({ ...todos(), [r.numero]: r }))
    return true
  } catch { return false }
}

export function leerComprobante(n) {
  if (!NUMERO_RE.test(n)) return null
  const r = todos()[n]
  return r && r.numero === n ? r : null
}

// ---------- Figura del lote con cotas ----------
// Cota de arquitecto: líneas de extensión, línea de cota con marcas a 45° y el texto paralelo al lado.
function cota(a, b, c, texto) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1
  const ux = dx / L, uy = dy / L
  let nx = -uy, ny = ux
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2
  if ((mx - c[0]) * nx + (my - c[1]) * ny < 0) { nx = -nx; ny = -ny } // hacia afuera del lote
  const sep = 20
  const A = [a[0] + nx * sep, a[1] + ny * sep], B = [b[0] + nx * sep, b[1] + ny * sep]
  const k = (p) => [p[0] + (ux + nx) * 4, p[1] + (uy + ny) * 4, p[0] - (ux + nx) * 4, p[1] - (uy + ny) * 4]
  let ang = (Math.atan2(dy, dx) * 180) / Math.PI
  if (ang > 90) ang -= 180
  if (ang < -90) ang += 180
  const tx = mx + nx * (sep + 13), ty = my + ny * (sep + 13)
  const f = (n) => n.toFixed(1)
  const linea = (x1, y1, x2, y2, cls) => `<line class="${cls}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`
  return `<g class="cota">${linea(a[0] + nx * 4, a[1] + ny * 4, A[0] + nx * 5, A[1] + ny * 5, 'cota__ext')}${linea(b[0] + nx * 4, b[1] + ny * 4, B[0] + nx * 5, B[1] + ny * 5, 'cota__ext')}${linea(...A, ...B, 'cota__linea')}${linea(...k(A), 'cota__marca')}${linea(...k(B), 'cota__marca')}<text class="cota__txt" x="${f(tx)}" y="${f(ty)}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${f(ang)} ${f(tx)} ${f(ty)})">${esc(texto)}</text></g>`
}

export function figuraLote(puntos, { id = '', frente_m, fondo_m } = {}) {
  const P = (Array.isArray(puntos) ? puntos : []).map((p) => [Number(p?.[0]), Number(p?.[1])]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
  if (P.length < 3) return ''
  const xs = P.map((p) => p[0]), ys = P.map((p) => p[1])
  const x0 = Math.min(...xs), y0 = Math.min(...ys)
  const w = Math.max(...xs) - x0, h = Math.max(...ys) - y0
  const T = 150 / (Math.max(w, h) || 1)
  const ox = (280 - w * T) / 2, oy = (280 - h * T) / 2
  const Q = P.map(([x, y]) => [ox + (x - x0) * T, oy + (y - y0) * T])
  const c = [Q.reduce((s, p) => s + p[0], 0) / Q.length, Q.reduce((s, p) => s + p[1], 0) / Q.length]
  const F = Number(frente_m), D = Number(fondo_m)
  let cotas = ''
  if (F > 0 && D > 0) {
    // El lado corto del polígono es el frente si el frente es menor que el fondo (en la proyección del render)
    const l01 = Math.hypot(Q[1][0] - Q[0][0], Q[1][1] - Q[0][1]), l12 = Math.hypot(Q[2][0] - Q[1][0], Q[2][1] - Q[1][1])
    const frenteEn01 = (l01 <= l12) === (F <= D)
    cotas = frenteEn01
      ? cota(Q[0], Q[1], c, `${uno(F)} m`) + cota(Q[1], Q[2], c, `${uno(D)} m`)
      : cota(Q[1], Q[2], c, `${uno(F)} m`) + cota(Q[0], Q[1], c, `${uno(D)} m`)
  }
  const nombre = id ? `Lote ${id}` : 'Lote'
  const etiqueta = F > 0 && D > 0 ? `${nombre}: frente ${uno(F)} m, fondo ${uno(D)} m, superficie aproximada` : nombre
  return `<svg class="figura-lote" viewBox="0 0 280 280" role="img" aria-label="${esc(etiqueta)}"><polygon class="figura-lote__poligono" points="${Q.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ')}"/>${cotas}<text class="figura-lote__id" x="${c[0].toFixed(1)}" y="${c[1].toFixed(1)}" text-anchor="middle" dominant-baseline="middle">${esc(id)}</text></svg>`
}

// ---------- Comprobante ----------
const fechaTexto = (iso) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Sin fecha'
  return `${new Intl.DateTimeFormat('es-GT', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Guatemala' }).format(d)}, hora de Guatemala`
}

export function htmlComprobante(r) {
  const l = r.lote || {}
  const p = r.plan || null
  const k = r.cliente || {}
  const fila = (dt, dd) => `<div><dt>${esc(dt)}</dt><dd>${esc(dd)}</dd></div>`
  const plan = p
    ? [
        fila('Precio del lote', dinero(p.precio)),
        fila('Enganche', `${dinero(p.enganche)} (${uno(p.enganche_pct)} %)`),
        fila('Reserva pagada, se descuenta del enganche', dinero(r.pago?.monto)),
        fila('Resto del enganche al firmar', dinero(Number(p.enganche) - Number(r.pago?.monto))),
        fila('Plazo', `${Number(p.plazo)} meses`),
        fila('Modalidad', p.modalidad === 'directo' ? 'Directo sin intereses' : `Crédito al ${uno(p.tasa)} % anual`),
        fila('Cuota mensual', dinero(p.cuota)),
        fila('Total de intereses', dinero(p.intereses)),
        fila('Total pagado', dinero(p.total)),
      ].join('')
    : fila('Plan', 'Sin plan guardado')
  return `<article class="comp" aria-labelledby="comp-t">
  <p class="comp__banda">Comprobante de demostración, sin validez</p>
  <header class="comp__cab">
    <h1 class="comp__titulo" id="comp-t">Comprobante de reserva</h1>
    <dl class="comp__clave">
      <div><dt>Número</dt><dd class="comp__numero" data-numero>${esc(r.numero)}</dd></div>
      <div><dt>Fecha</dt><dd>${esc(fechaTexto(r.fecha))}</dd></div>
      <div><dt>Estado del pago</dt><dd>Aprobado en la pasarela de demostración</dd></div>
    </dl>
  </header>
  <div class="comp__rejilla">
    <section class="comp__bloque comp__lote" aria-labelledby="comp-lote-t">
      <h2 class="comp__sub" id="comp-lote-t">Lote ${esc(l.id)}</h2>
      <div class="comp__figura">${figuraLote(l.puntos, l)}</div>
      <dl class="comp__lista">${fila('Manzana', l.manzana)}${fila('Superficie', `${uno(l.area_m2)} m² aprox.`)}${fila('Frente × fondo', `${uno(l.frente_m)} × ${uno(l.fondo_m)} m`)}</dl>
    </section>
    <section class="comp__bloque" aria-labelledby="comp-plan-t">
      <h2 class="comp__sub" id="comp-plan-t">Plan de pago</h2>
      <dl class="comp__lista">${plan}</dl>
    </section>
    <section class="comp__bloque" aria-labelledby="comp-cliente-t">
      <h2 class="comp__sub" id="comp-cliente-t">Cliente</h2>
      <dl class="comp__lista">${fila('Nombre', k.nombre)}${fila('Correo', k.correo)}${fila('Teléfono', k.telefono)}</dl>
    </section>
  </div>
  <footer class="comp__pie">
    <p>Comprobante de demostración, sin validez. Precio, plan y pago son simulados con valores de demostración: no se cobró ningún monto. Superficie medida sobre el plano, sujeta al plano de lotificación oficial.</p>
    <p>Intento de pago ${esc(r.pago?.intento)} · Condominio San Rafael, Paxcamán.</p>
  </footer>
</article>`
}

// Hoja de estilo del archivo descargado: los mismos valores de los tokens de día (PLAN-v2 §5.1), sin red.
const CSS_DESCARGA = `
*{box-sizing:border-box}body{margin:0;padding:24px;background:#F0EDE3;color:#3F4540;font-family:Barlow,system-ui,sans-serif;font-size:16px;line-height:1.5}
.comp{max-width:880px;margin:0 auto;background:#FFFFFF;border:1px solid rgba(27,46,32,.16);border-radius:2px}
.comp__banda{margin:0;padding:10px 24px;border-bottom:1px dashed #767B74;font-size:12px;font-weight:500;letter-spacing:.18em;text-transform:uppercase}
.comp__cab,.comp__rejilla,.comp__pie{padding:24px}.comp__titulo{margin:0 0 16px;font-weight:300;font-size:32px;letter-spacing:.08em;text-transform:uppercase;color:#1B2E20}
.comp__clave,.comp__lista{margin:0}.comp__clave div,.comp__lista div{display:flex;justify-content:space-between;gap:16px;padding:8px 0;border-bottom:1px solid rgba(27,46,32,.16)}
dt{margin:0}dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}.comp__numero{font-weight:500;color:#1B2E20}
.comp__rejilla{display:grid;gap:32px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));border-top:1px solid rgba(27,46,32,.16)}
.comp__sub{margin:0 0 12px;font-size:12px;font-weight:500;letter-spacing:.18em;text-transform:uppercase}
.figura-lote{display:block;width:100%;max-width:240px;margin:0 auto 12px}.figura-lote__poligono{fill:rgba(185,138,79,.22);stroke:#B98A4F;stroke-width:1.5}
.figura-lote__id{font-size:13px;font-weight:500;fill:#1B2E20}.cota line{stroke:#3F4540;stroke-width:1}.cota__ext{stroke-opacity:.5}.cota__txt{font-size:11px;fill:#3F4540}
.comp__pie{border-top:1px solid rgba(27,46,32,.16);font-size:13px}.comp__pie p{margin:0 0 6px}`

export function descargarComprobante(r) {
  const doc = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Comprobante ${esc(r.numero)} · Condominio San Rafael</title><style>${CSS_DESCARGA}</style></head>
<body>${htmlComprobante(r)}</body></html>`
  const url = URL.createObjectURL(new Blob([doc], { type: 'text/html;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `comprobante-${r.numero}.html`
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

// ---------- Página comprobante.html ----------
function iniciarPagina() {
  const n = new URLSearchParams(location.search).get('n') ?? ''
  const zona = document.querySelector('[data-comprobante]')
  const acciones = document.querySelector('[data-comprobante-acciones]')
  const vacio = document.querySelector('[data-comprobante-vacio]')
  const r = leerComprobante(n)
  zona.removeAttribute('aria-busy')
  if (!r) {
    zona.replaceChildren()
    zona.hidden = true
    vacio.hidden = false
    vacio.querySelector('[data-motivo]').textContent = !n
      ? 'Este enlace no trae número de reserva.'
      : !NUMERO_RE.test(n)
        ? 'El número de este enlace no tiene la forma SR-DEMO seguida de la fecha y cuatro dígitos.'
        : 'No hay un comprobante con ese número en esta pestaña.'
    return
  }
  zona.innerHTML = htmlComprobante(r)
  document.title = `Comprobante ${r.numero} · Condominio San Rafael`
  acciones.hidden = false
  acciones.querySelector('[data-imprimir]').addEventListener('click', () => window.print())
  acciones.querySelector('[data-descargar]').addEventListener('click', () => descargarComprobante(r))
}

if (document.body?.dataset.pagina === 'comprobante') iniciarPagina()
