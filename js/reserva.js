// Reserva en 5 pasos (PLAN-v2 §11; PLAN.md fase 4 y enmiendas 1 y 2): reservar.html?lote=<id>
//   1 lote · 2 plan (calculadora) · 3 datos · 4 pago (pasarela de demostración) · 5 comprobante
// Estado en sessionStorage («sr-reserva»): volver atrás o recargar no pierde datos. El paso va en el hash (#paso-N),
// así también funciona el botón Atrás del navegador. Seguridad: lo que escribe la persona entra al DOM solo con
// textContent (o escapado en comprobante.js); no hay llaves, ni endpoints, ni campos de tarjeta.
import { montarCalculadora, fmt, MARCADORES } from './calculadora/calculadora.js'
import * as adaptador from './pagos/demo.js'
import { montarPasarela } from './pagos/pasarela.js'
import { figuraLote, guardarComprobante, leerComprobante, descargarComprobante } from './pagos/comprobante.js'

const LOTE_RE = /^[A-K]-\d{2}$/
const CLAVE = 'sr-reserva'
const leer = (k) => { try { return JSON.parse(sessionStorage.getItem(k)) } catch { return null } }
const guardar = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)) } catch { /* sin almacenamiento: dura la visita */ } }
const uno = (n) => Number(n).toLocaleString('es-GT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const quieto = matchMedia('(prefers-reduced-motion: reduce)')
const $ = (s, el = document) => el.querySelector(s)
const $$ = (s, el = document) => [...el.querySelectorAll(s)]

// ---------- Validación de los datos (cada regla devuelve '' o el mensaje) ----------
export const REGLAS = {
  nombre(v) {
    const t = String(v).trim().replace(/\s+/g, ' ')
    if (!t) return 'Escriba su nombre completo.'
    if (t.length > 80) return 'El nombre es muy largo: use 80 caracteres o menos.'
    if (!/^\p{L}[\p{L}'. -]*$/u.test(t)) return 'Use solo letras, espacios, punto, apóstrofo o guion.'
    if (t.split(' ').length < 2) return 'Escriba nombre y apellido.'
    return ''
  },
  correo(v) {
    const t = String(v).trim()
    if (!t) return 'Escriba su correo electrónico.'
    if (t.length > 120 || !/^[\p{L}\p{N}._%+'-]+@[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)+$/u.test(t)) return 'Revise el correo: debe tener la forma nombre@dominio.com.'
    return ''
  },
  telefono(v) {
    if (!String(v).trim()) return 'Escriba su teléfono.'
    return telefonoGT(v) ? '' : 'Escriba un teléfono de Guatemala de 8 dígitos (empieza en 2 a 7), con o sin +502.'
  },
  privacidad: (v) => (v === true ? '' : 'Para reservar, acepte el aviso de privacidad.'),
}

// 8 dígitos que empiezan en 2 a 7, con o sin +502; devuelve los 8 dígitos o null
export function telefonoGT(v) {
  const m = String(v).replace(/[\s().-]/g, '').match(/^(?:\+?502)?([2-7]\d{7})$/)
  return m ? m[1] : null
}

// ---------- Arranque ----------
const raiz = new URL('../', import.meta.url)
async function cargar(ruta) {
  const r = await fetch(new URL(ruta, raiz))
  if (!r.ok) throw new Error(`${ruta}: HTTP ${r.status}`)
  return r.json()
}

const vacioEstado = (cliente) => ({
  lote: null,
  alcanzado: 1,
  plan: null,
  cliente: { nombre: '', correo: '', telefono: '', privacidad: false, ...(cliente || {}) },
  numero: null,
})

async function iniciar() {
  const main = $('[data-reserva]')
  let lotes, plano, precios
  try {
    [lotes, plano, precios] = await Promise.all([cargar('datos/lotes.json'), cargar('maqueta/lotes-2d.json'), cargar('datos/precios.json')])
  } catch {
    main.removeAttribute('aria-busy')
    $('[data-carga]').hidden = true
    const e = $('[data-error-carga]')
    e.hidden = false
    $('button', e).addEventListener('click', () => location.reload(), { once: true })
    return
  }
  main.removeAttribute('aria-busy')
  $('[data-carga]').hidden = true
  $('[data-flujo]').hidden = false

  const puntos = new Map(plano.lotes.map((l) => [l.id, l.puntos]))
  const info = new Map(lotes.lotes.filter((l) => LOTE_RE.test(l.id) && Number(l.area_m2) > 0).map((l) => [l.id, { ...l, puntos: puntos.get(l.id) }]))
  const estados = precios.estados || {}
  const estadoDe = (id) => (['reservado', 'vendido'].includes(estados[id]) ? estados[id] : 'disponible')
  const m = { ...MARCADORES, ...(precios.marcadores || {}) }

  // Estado guardado, saneado
  const g = leer(CLAVE)
  let st = vacioEstado(g?.cliente)
  if (g && typeof g === 'object') {
    if (info.has(g.lote)) st.lote = g.lote
    st.alcanzado = Math.min(Math.max(Number(g.alcanzado) || 1, 1), 4)
    st.plan = g.plan && g.plan.lote === st.lote ? g.plan : null
    st.numero = typeof g.numero === 'string' && leerComprobante(g.numero) ? g.numero : null
    for (const k of ['nombre', 'correo', 'telefono']) st.cliente[k] = typeof st.cliente[k] === 'string' ? st.cliente[k].slice(0, 120) : ''
    st.cliente.privacidad = st.cliente.privacidad === true
  }
  const persistir = () => guardar(CLAVE, st)

  // ---------- Lote de la URL ----------
  const aviso = $('[data-aviso-lote]')
  const pedido = new URLSearchParams(location.search).get('lote')
  function cambiarLote(id) {
    if (id === st.lote) return
    if (st.numero) st = vacioEstado(st.cliente) // reserva cerrada: empieza otra con los mismos datos de contacto
    st.lote = id
    st.plan = null
    st.alcanzado = Math.min(st.alcanzado, 2)
    history.replaceState(null, '', `?lote=${encodeURIComponent(id)}${location.hash}`)
    persistir()
  }
  if (pedido !== null) {
    const id = pedido.trim().toUpperCase()
    if (!LOTE_RE.test(id) || !info.has(id)) aviso.textContent = `No encontramos el lote «${pedido.slice(0, 16)}». Elija uno de la lista.`
    else if (estadoDe(id) !== 'disponible') aviso.textContent = `El lote ${id} está ${estadoDe(id)}. Elija otro de la lista.`
    else cambiarLote(id)
  }

  // ---------- Resumen persistente (a un lado en escritorio, abajo en móvil) ----------
  const resumen = $('[data-resumen]')
  const abrir = $('[data-resumen-abrir]')
  function pintarResumen() {
    const l = info.get(st.lote)
    const p = st.plan
    const r = (k, v) => { $(`[data-r="${k}"]`, resumen).textContent = v }
    r('lote', l ? l.id : 'Sin elegir')
    r('area', l ? `${uno(l.area_m2)} m² aprox.` : 'Sin elegir')
    r('precio', p ? fmt(p.precio) : m.lote)
    r('enganche', p ? `${fmt(p.enganche)} (${uno(p.enganche_pct)} %)` : m.enganche)
    r('plazo', p ? `${p.plazo} meses, ${p.modalidad === 'directo' ? 'sin intereses' : `al ${uno(p.tasa)} %`}` : 'Sin plan')
    r('cuota', p ? `${fmt(p.cuota)}/mes` : m.cuota)
    r('reserva', p ? fmt(precios.monto_reserva) : m.reserva)
    $('[data-resumen-figura]', resumen).innerHTML = l ? figuraLote(l.puntos, l) : ''
    $('[data-resumen-corto]').textContent = l ? `Lote ${l.id}${p ? ` · ${fmt(p.cuota)}/mes` : ''}` : 'Su reserva'
  }
  abrir.addEventListener('click', () => {
    const si = abrir.getAttribute('aria-expanded') !== 'true'
    abrir.setAttribute('aria-expanded', String(si))
    resumen.classList.toggle('es-abierto', si)
  })
  // El plan vivo de la calculadora (paso 2) se refleja en el resumen al instante
  addEventListener('calculadora:plan', (e) => {
    const d = e.detail
    if (!d || d.lote !== st.lote) return
    st.plan = d
    persistir()
    pintarResumen()
  })

  // ---------- Pasos ----------
  const secciones = $$('[data-paso]')
  const chips = $$('[data-ir]')
  let actual = 0
  // Un paso se abre si ya se llegó a él y sus datos previos son válidos (lote → plan → datos)
  const permitido = () => (st.numero ? 5 : !st.lote ? 1 : !st.plan ? Math.min(st.alcanzado, 2) : !clienteValido() ? Math.min(st.alcanzado, 3) : st.alcanzado)
  const habilitado = (n) => (st.numero ? n === 5 : n >= 1 && n <= permitido())
  const pasoDeHash = () => Number((location.hash.match(/^#paso-([1-5])$/) || [])[1]) || 0

  function pintarIndicador() {
    chips.forEach((b) => {
      const n = Number(b.dataset.ir)
      if (n === actual) b.setAttribute('aria-current', 'step')
      else b.removeAttribute('aria-current')
      if (habilitado(n)) b.removeAttribute('aria-disabled')
      else b.setAttribute('aria-disabled', 'true')
      const hecho = n !== actual && (st.numero ? n < 5 : n < permitido())
      b.toggleAttribute('data-hecho', hecho)
      $('.pasos__sr', b).textContent = n === actual ? '' : hecho ? ', completado' : habilitado(n) ? '' : ', bloqueado'
    })
    // En móvil los pasos se desplazan en horizontal: centra el actual sin mover la página
    const activo = chips.find((b) => Number(b.dataset.ir) === actual)
    const fila = activo?.closest('.pasos')
    if (fila && fila.scrollWidth > fila.clientWidth) fila.scrollLeft = activo.parentElement.offsetLeft - (fila.clientWidth - activo.parentElement.offsetWidth) / 2
  }

  function ir(n, { historia = 'push', foco = true } = {}) {
    if (!habilitado(n)) n = st.numero ? 5 : Math.min(Math.max(n, 1), permitido())
    actual = n
    secciones.forEach((s) => (s.hidden = Number(s.dataset.paso) !== n))
    preparar[n]()
    pintarIndicador()
    const hash = `#paso-${n}`
    if (historia === 'push' && location.hash !== hash) history.pushState(null, '', hash)
    else if (location.hash !== hash) history.replaceState(null, '', hash)
    persistir()
    if (foco) {
      const t = $(`[data-paso="${n}"] .paso__t`)
      $('[data-flujo]').scrollIntoView({ behavior: quieto.matches ? 'auto' : 'smooth', block: 'start' })
      t.focus({ preventScroll: true })
    }
  }
  const avanzar = (n) => {
    st.alcanzado = Math.max(st.alcanzado, n)
    ir(n)
  }

  chips.forEach((b) => b.addEventListener('click', () => {
    if (b.getAttribute('aria-disabled') === 'true') return
    ir(Number(b.dataset.ir))
  }))
  $$('[data-atras]').forEach((b) => b.addEventListener('click', () => ir(actual - 1)))
  addEventListener('popstate', () => ir(pasoDeHash() || 1, { historia: 'none', foco: true }))

  // ---------- Paso 1 · Lote ----------
  const select = $('#r-lote')
  // Grupos por la letra del código, rotulados con su rango de lotes («Lotes C-01 a C-14»)
  const grupos = new Map()
  for (const l of [...info.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    const letra = l.id[0]
    if (!grupos.has(letra)) {
      const og = document.createElement('optgroup')
      grupos.set(letra, { og, ids: [] })
      select.append(og)
    }
    const g = grupos.get(letra)
    const o = document.createElement('option')
    o.value = l.id
    const e = estadoDe(l.id)
    o.textContent = `${l.id} · ${uno(l.area_m2)} m² aprox.${e === 'disponible' ? '' : ` · ${e}`}`
    o.disabled = e !== 'disponible'
    g.og.append(o)
    g.ids.push(l.id)
  }
  for (const { og, ids } of grupos.values()) og.label = ids.length > 1 ? `Lotes ${ids[0]} a ${ids.at(-1)}` : `Lote ${ids[0]}`
  const errorLote = $('[data-error="lote"]')
  function pintarLote() {
    const l = info.get(st.lote)
    select.value = l ? l.id : ''
    $('[data-ficha-lote]').hidden = !l
    if (!l) return
    $('[data-l="id"]').textContent = `Lote ${l.id}`
    $('[data-l="area"]').textContent = `${uno(l.area_m2)} m²`
    $('[data-l="medidas"]').textContent = `${uno(l.frente_m)} × ${uno(l.fondo_m)} m`
    $('[data-figura]').innerHTML = figuraLote(l.puntos, l)
  }
  select.addEventListener('change', () => {
    if (!select.value) return
    cambiarLote(select.value)
    aviso.textContent = ''
    errorLote.textContent = ''
    select.removeAttribute('aria-invalid')
    pintarLote()
    pintarResumen()
    pintarIndicador()
  })
  $('[data-siguiente="2"]').addEventListener('click', () => {
    if (!st.lote) {
      errorLote.textContent = 'Elija un lote para continuar.'
      select.setAttribute('aria-invalid', 'true')
      select.focus()
      return
    }
    avanzar(2)
  })

  // ---------- Paso 2 · Plan ----------
  let calPara = null
  function prepararPlan() {
    const l = info.get(st.lote)
    if (!l || calPara === l.id) return
    calPara = l.id
    const previo = st.plan || leer('sr-plan')
    montarCalculadora($('[data-calculadora]'), {
      precios,
      lote: { id: l.id, area_m2: l.area_m2 },
      inicial: previo,
      precioFijo: true,
      accion: 'Continuar con este plan',
      alEnviar: (plan) => {
        st.plan = plan
        avanzar(3)
      },
    })
  }

  // ---------- Paso 3 · Datos ----------
  const form = $('[data-form-datos]')
  const campos = ['nombre', 'correo', 'telefono', 'privacidad']
  const valor = (k) => (k === 'privacidad' ? form.elements[k].checked : form.elements[k].value)
  for (const k of campos) {
    if (k === 'privacidad') form.elements[k].checked = st.cliente.privacidad
    else form.elements[k].value = st.cliente[k]
  }
  function revisar(k, mostrar) {
    const msg = REGLAS[k](valor(k))
    const el = form.elements[k]
    if (mostrar || el.getAttribute('aria-invalid') === 'true') {
      $(`[data-error="${k}"]`, form).textContent = msg
      el.setAttribute('aria-invalid', msg ? 'true' : 'false')
    }
    return msg
  }
  form.addEventListener('input', (e) => {
    const k = e.target.name
    if (!campos.includes(k)) return
    st.cliente[k] = valor(k)
    persistir()
    if (e.target.getAttribute('aria-invalid') === 'true') revisar(k, false) // borra el error en cuanto se corrige
  })
  form.addEventListener('change', (e) => {
    if (e.target.name === 'privacidad') {
      st.cliente.privacidad = e.target.checked
      persistir()
      revisar('privacidad', true)
    }
  })
  // Validación en línea al salir de cada campo
  form.addEventListener('focusout', (e) => {
    const k = e.target.name
    if (!campos.includes(k) || k === 'privacidad') return
    if (!revisar(k, true) && k === 'telefono') {
      const d = telefonoGT(e.target.value)
      e.target.value = `+502 ${d.slice(0, 4)} ${d.slice(4)}`
      st.cliente.telefono = e.target.value
    }
    if (k === 'nombre') st.cliente.nombre = e.target.value = e.target.value.trim().replace(/\s+/g, ' ')
    if (k === 'correo') st.cliente.correo = e.target.value = e.target.value.trim()
    persistir()
  })
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const malos = campos.filter((k) => revisar(k, true))
    const estado = $('[data-estado-datos]')
    if (malos.length) {
      estado.textContent = malos.length === 1 ? 'Revise el campo marcado.' : `Revise los ${malos.length} campos marcados.`
      form.elements[malos[0]].focus()
      return
    }
    estado.textContent = ''
    for (const k of campos) st.cliente[k] = valor(k)
    avanzar(4)
  })
  const clienteValido = () => campos.every((k) => !REGLAS[k](st.cliente[k]))

  // ---------- Paso 4 · Pago ----------
  function prepararPago() {
    const l = info.get(st.lote)
    $('[data-pago-lote]').textContent = l.id
    montarPasarela($('[data-pasarela]'), {
      adaptador,
      lote: l.id,
      monto: precios.monto_reserva,
      cliente: { nombre: st.cliente.nombre, correo: st.cliente.correo, telefono: st.cliente.telefono },
      alAprobar: (r) => {
        guardarComprobante({
          numero: r.numero,
          fecha: new Date().toISOString(),
          demo: true,
          lote: { id: l.id, area_m2: l.area_m2, frente_m: l.frente_m, fondo_m: l.fondo_m, puntos: l.puntos },
          plan: st.plan,
          cliente: { nombre: st.cliente.nombre, correo: st.cliente.correo, telefono: st.cliente.telefono },
          pago: { intento: r.id, monto: precios.monto_reserva, estado: r.estado },
        })
        st.numero = r.numero
        ir(5)
      },
    })
  }

  // ---------- Paso 5 · Comprobante ----------
  function prepararFin() {
    const r = leerComprobante(st.numero)
    $('[data-numero-reserva]').textContent = st.numero || ''
    $('[data-ver-comprobante]').href = `comprobante.html?n=${encodeURIComponent(st.numero || '')}`
    $('[data-sin-copia]').hidden = Boolean(r)
  }
  $('[data-descargar]').addEventListener('click', () => {
    const r = leerComprobante(st.numero)
    if (r) descargarComprobante(r)
  })
  $('[data-otra]').addEventListener('click', () => {
    st = vacioEstado(st.cliente)
    history.replaceState(null, '', 'reservar.html#paso-1')
    pintarLote()
    pintarResumen()
    ir(1, { historia: 'replace' })
  })

  const preparar = { 1: pintarLote, 2: prepararPlan, 3: () => {}, 4: prepararPago, 5: prepararFin }

  pintarLote()
  pintarResumen()
  ir(aviso.textContent ? 1 : pasoDeHash() || (st.numero ? 5 : 1), { historia: 'replace', foco: false })
}

if (document.body?.dataset.pagina === 'reservar') iniciar()
