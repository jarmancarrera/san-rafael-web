// Calculadora de pagos a crédito · Condominio San Rafael (PLAN-v2 §11 y §12; bitácora, «Pendiente para C»).
// Módulo ES sin dependencias. La lógica financiera (cuota, calcular, validar) no toca el DOM y se prueba con
// `node 05-pruebas/calculadora.mjs` (8 comprobaciones). montarCalculadora pinta PLANTILLA y la conecta.
// Montos: mientras nadie mueve un control ni elige un lote, la vista muestra los marcadores de precios.json
// (Q XXX,XXX · Q Y,YYY · Q Z,ZZZ/mes). Todo monto calculado va junto a la etiqueta «Valores de demostración».
// Eventos en window: escucha lote:seleccionado y calculadora:lote {id, area_m2}; emite calculadora:plan (LEEME.md).

const TASA_MAX = 30 // % anual aceptado en el campo de tasa
const moneda = new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' })
export const fmt = (n) => moneda.format(n)
const num = new Intl.NumberFormat('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format
const pctTexto = (n) => `${n.toLocaleString('es-GT', { maximumFractionDigits: 1 })} %`
const cent = (n) => Math.round(n * 100)
const campoNum = (n) => String(Math.round(n * 100) / 100) // valor de un input numérico: 321800 o 67578.5, sin ceros de sobra

// Respaldo literal de los marcadores (contrato de la bitácora); precios.json manda si los trae.
export const MARCADORES = { lote: 'Q XXX,XXX', m2: 'Q X,XXX/m²', reserva: 'Q Y,YYY', enganche: 'XX %', cuota: 'Q Z,ZZZ/mes' }

// Cuota francesa: P·r / (1 − (1 + r)^−n), con r = tasa anual / 12. Si r = 0, P / n.
export function cuota(P, tasaAnualPct, n) {
  const r = tasaAnualPct / 100 / 12
  return r === 0 ? P / n : (P * r) / (1 - (1 + r) ** -n)
}

// Plan completo. Trabaja en centavos enteros: la última cuota absorbe el redondeo
// para que la suma de capital iguale el monto financiado y el saldo cierre en 0.00.
export function calcular({ precio, enganche, plazo, tasa }) {
  const r = tasa / 100 / 12
  const fija = cent(cuota(precio - enganche, tasa, plazo))
  let saldo = cent(precio) - cent(enganche)
  const financiado = saldo / 100
  const filas = []
  let intereses = 0
  let pagado = 0
  for (let mes = 1; mes <= plazo; mes++) {
    const interes = Math.round(saldo * r)
    const capital = mes === plazo ? saldo : Math.min(fija - interes, saldo)
    saldo -= capital
    intereses += interes
    pagado += capital + interes
    filas.push({ mes, cuota: (capital + interes) / 100, interes: interes / 100, capital: capital / 100, saldo: saldo / 100 })
  }
  return { financiado, cuota: fija / 100, intereses: intereses / 100, total: (cent(enganche) + pagado) / 100, filas }
}

// Devuelve { campo: mensaje } solo con los campos que fallan.
export function validar({ precio, enganche, plazo, tasa, modalidad }, c) {
  const e = {}
  const { minimo, maximo = 90 } = c.enganche_pct
  if (!(precio > 0)) e.precio = Number.isNaN(precio) ? 'Escribe el precio del lote.' : 'El precio debe ser mayor que cero.'
  if (Number.isNaN(enganche)) e.enganche = 'Escribe el monto del enganche.'
  else if (precio > 0) {
    if (cent(enganche) < Math.round(precio * minimo)) e.enganche = `El enganche mínimo es ${pctTexto(minimo)} del precio (${fmt((precio * minimo) / 100)}).`
    else if (cent(enganche) > Math.round(precio * maximo)) e.enganche = `El enganche máximo es ${pctTexto(maximo)} del precio (${fmt((precio * maximo) / 100)}).`
    else if (enganche < c.monto_reserva) e.enganche = `El enganche no puede ser menor que la reserva (${fmt(c.monto_reserva)}).`
  }
  if (modalidad === 'credito' && !(tasa >= 0 && tasa <= TASA_MAX)) {
    e.tasa = Number.isNaN(tasa) ? 'Escribe la tasa anual.' : `La tasa debe estar entre 0 % y ${TASA_MAX} %.`
  }
  const max = modalidad === 'directo' ? c.sin_intereses.plazo_max_meses : Infinity
  if (!c.plazos_meses.includes(plazo) || plazo > max) e.plazo = 'Elige un plazo de la lista.'
  return e
}

const nombreModalidad = (d) => (d.modalidad === 'directo' ? 'directo sin intereses' : `crédito al ${pctTexto(d.tasa)} anual`)

function guardar(clave, valor) {
  try { sessionStorage.setItem(clave, JSON.stringify(valor)) } catch { /* sin almacenamiento: el plan vive solo en esta vista */ }
}

// Plantilla fija: no lleva datos de nadie. Los textos variables se ponen después con textContent.
const PLANTILLA = `
<form class="cal" novalidate aria-label="Calculadora de crédito" data-simulado="no">
  <div class="cal-panel cal-entradas">
    <div class="cal-campo">
      <div class="cal-fila"><label for="cal-precio" class="cal-etq">Precio del lote</label><span class="cal-lote" data-cal="lote">Lote de ejemplo</span></div>
      <div class="cal-caja"><span class="cal-unidad" aria-hidden="true">Q</span><input id="cal-precio" name="precio" type="number" inputmode="decimal" min="0.01" step="0.01" placeholder="XXX,XXX" autocomplete="off" aria-describedby="cal-precio-nota cal-precio-error"></div>
      <p id="cal-precio-nota" class="cal-nota" data-cal="precio-nota"></p>
      <p id="cal-precio-error" class="cal-error" data-error="precio"></p>
    </div>

    <div class="cal-campo">
      <div class="cal-fila"><label for="cal-enganche-pct" class="cal-etq">Enganche</label><output for="cal-enganche-pct" class="cal-valor" data-cal="pct"></output></div>
      <div class="cal-rango"><input id="cal-enganche-pct" name="enganche_pct" type="range" step="1" aria-describedby="cal-enganche-error"></div>
      <div class="cal-extremos" aria-hidden="true"><span data-cal="pct-min"></span><span data-cal="pct-max"></span></div>
      <label for="cal-enganche" class="cal-sub">Monto del enganche</label>
      <div class="cal-caja"><span class="cal-unidad" aria-hidden="true">Q</span><input id="cal-enganche" name="enganche" type="number" inputmode="decimal" min="0" step="0.01" placeholder="XX,XXX" autocomplete="off" aria-describedby="cal-enganche-nota cal-enganche-error"></div>
      <p id="cal-enganche-nota" class="cal-nota">Mueva la barra o escriba el monto: los dos se sincronizan.</p>
      <p id="cal-enganche-error" class="cal-error" data-error="enganche"></p>
    </div>

    <div class="cal-campo">
      <div class="cal-fila"><label for="cal-plazo" class="cal-etq">Plazo</label><output for="cal-plazo" class="cal-valor" data-cal="plazo"></output></div>
      <div class="cal-rango cal-rango--marcas"><input id="cal-plazo" name="plazo_i" type="range" min="0" step="1" aria-describedby="cal-plazo-nota cal-plazo-error"><ol class="cal-marcas" data-cal="marcas" aria-hidden="true"></ol></div>
      <p id="cal-plazo-nota" class="cal-nota" data-cal="plazo-nota"></p>
      <p id="cal-plazo-error" class="cal-error" data-error="plazo"></p>
    </div>

    <div class="cal-campo" role="group" aria-labelledby="cal-modalidad-t">
      <p class="cal-etq" id="cal-modalidad-t">Modalidad</p>
      <div class="cal-chips">
        <button class="b b-chip" type="button" data-modalidad="credito" aria-pressed="true"><span class="b__txt">Crédito con interés</span></button>
        <button class="b b-chip" type="button" data-modalidad="directo" aria-pressed="false"><span class="b__txt">Directo sin intereses</span></button>
      </div>
    </div>

    <div class="cal-campo" data-cal="tasa">
      <label for="cal-tasa" class="cal-etq">Tasa de interés anual</label>
      <div class="cal-caja cal-caja--pct"><input id="cal-tasa" name="tasa" type="number" inputmode="decimal" min="0" step="0.01" autocomplete="off" aria-describedby="cal-tasa-error"><span class="cal-unidad" aria-hidden="true">%</span></div>
      <p id="cal-tasa-error" class="cal-error" data-error="tasa"></p>
    </div>
  </div>

  <section class="cal-panel cal-resultados" aria-labelledby="cal-res-t">
    <div class="cal-res-cab">
      <h3 class="cal-etq" id="cal-res-t">Cuota mensual</h3>
      <p class="nota-demo cal-demo">Valores de demostración</p>
    </div>
    <p class="cal-cuota"><strong data-res="cuota"></strong><span class="cal-cuota-det" data-res="detalle"></span></p>
    <p class="sr-solo" aria-live="polite" data-cal="anuncio"></p>

    <figure class="cal-composicion">
      <figcaption class="cal-etq">Composición del total pagado</figcaption>
      <div class="cal-barra" aria-hidden="true"><span class="cal-seg cal-seg--enganche" data-seg="enganche"></span><span class="cal-seg cal-seg--capital" data-seg="capital"></span><span class="cal-seg cal-seg--intereses" data-seg="intereses"></span></div>
      <ul class="cal-leyenda">
        <li><span class="cal-muestra cal-seg--enganche" aria-hidden="true"></span><span class="cal-ley-nombre">Enganche</span><span class="cal-ley-valor" data-ley="enganche"></span></li>
        <li><span class="cal-muestra cal-seg--capital" aria-hidden="true"></span><span class="cal-ley-nombre">Capital financiado</span><span class="cal-ley-valor" data-ley="capital"></span></li>
        <li><span class="cal-muestra cal-seg--intereses" aria-hidden="true"></span><span class="cal-ley-nombre">Intereses</span><span class="cal-ley-valor" data-ley="intereses"></span></li>
      </ul>
    </figure>

    <dl class="cal-lista">
      <div><dt>Precio del lote</dt><dd data-res="precio"></dd></div>
      <div><dt>Enganche</dt><dd data-res="enganche"></dd></div>
      <div><dt>Reserva, se descuenta del enganche</dt><dd data-res="reserva"></dd></div>
      <div><dt>Resto del enganche al firmar</dt><dd data-res="resto"></dd></div>
      <div><dt>Monto financiado</dt><dd data-res="financiado"></dd></div>
      <div><dt>Total de intereses</dt><dd data-res="intereses"></dd></div>
      <div class="cal-total"><dt>Total pagado</dt><dd data-res="total"></dd></div>
    </dl>

    <section class="cal-comparar" aria-labelledby="cal-comp-t">
      <h4 class="cal-etq" id="cal-comp-t">Compare con otro plazo</h4>
      <div class="cal-chips" role="group" aria-labelledby="cal-comp-t" data-cal="comparar"></div>
      <table class="cal-comp">
        <caption class="sr-solo">Su plazo frente al plazo de comparación, valores de demostración</caption>
        <thead><tr><td></td><th scope="col" data-comp="a-plazo"></th><th scope="col" data-comp="b-plazo"></th></tr></thead>
        <tbody>
          <tr><th scope="row">Cuota mensual</th><td data-comp="a-cuota"></td><td data-comp="b-cuota"></td></tr>
          <tr><th scope="row">Intereses</th><td data-comp="a-intereses"></td><td data-comp="b-intereses"></td></tr>
          <tr><th scope="row">Total pagado</th><td data-comp="a-total"></td><td data-comp="b-total"></td></tr>
        </tbody>
      </table>
      <p class="cal-nota cal-lectura" data-cal="lectura"></p>
    </section>

    <details class="cal-amort" data-cal="amort">
      <summary class="b b-enlace"><span class="b__txt">Tabla de amortización</span></summary>
      <div class="cal-tabla" role="region" aria-label="Tabla de amortización" tabindex="0">
        <table>
          <caption>Montos en quetzales, valores de demostración. La última cuota ajusta centavos.</caption>
          <thead><tr><th scope="col">Mes</th><th scope="col">Cuota</th><th scope="col">Interés</th><th scope="col">Capital</th><th scope="col">Saldo</th></tr></thead>
          <tbody data-cal="tabla"></tbody>
        </table>
      </div>
    </details>

    <div class="cal-acciones">
      <button type="submit" class="b b-claro"><span class="b__txt" data-cal="accion">Reservar con este plan</span></button>
    </div>
    <p class="cal-estado" role="status" data-cal="estado"></p>
  </section>

  <div class="cal-fijo" aria-hidden="true">
    <span class="cal-fijo-cuota" data-fijo="cuota"></span>
    <span class="cal-fijo-det" data-fijo="detalle"></span>
    <span class="cal-fijo-demo">Demostración</span>
  </div>
</form>`

// Monta la calculadora dentro de `raiz`.
//   precios: datos/precios.json · lote: {id, area_m2} ya elegido · inicial: plan guardado {enganche_pct, plazo, modalidad, tasa}
//   accion: texto del botón · precioFijo: el precio sale del lote y no se edita · alEnviar(plan): qué hacer al enviar
export function montarCalculadora(raiz, { precios: c, lote: loteInicial = null, inicial = null, accion = '', precioFijo = false, alEnviar = null }) {
  raiz.innerHTML = PLANTILLA
  const f = raiz.querySelector('form')
  const $ = (s) => f.querySelector(s)
  const m = { ...MARCADORES, ...(c.marcadores || {}) }
  const { precio, enganche_pct: rango, enganche: monto, tasa, plazo_i: rPlazo } = f.elements
  const plazos = c.plazos_meses.map(Number)
  const minimo = c.enganche_pct.minimo
  const maximo = c.enganche_pct.maximo ?? 90
  const area = c.area_ejemplo_m2 ?? 300
  const acotar = (v, a, b) => Math.min(Math.max(v, a), b)
  let lote = null
  let pct = c.enganche_pct.defecto
  let modalidad = 'credito'
  let iPlazo = Math.max(0, plazos.indexOf(c.plazo_defecto_meses ?? plazos.at(-1)))
  let comparar = null
  let simulado = false
  let plan = null
  let anuncioT = 0

  // ---------- Armado ----------
  rango.min = minimo
  rango.max = maximo
  rPlazo.max = plazos.length - 1
  tasa.max = TASA_MAX
  tasa.value = c.tasa_anual_pct
  precio.readOnly = precioFijo
  $('[data-cal=pct-min]').textContent = pctTexto(minimo)
  $('[data-cal=pct-max]').textContent = pctTexto(maximo)
  if (accion) $('[data-cal=accion]').textContent = accion
  $('.cal-demo').hidden = !c.demo
  const marcas = $('[data-cal=marcas]')
  plazos.forEach((p, i) => {
    const li = document.createElement('li')
    li.textContent = p
    li.style.setProperty('--i', i / (plazos.length - 1))
    marcas.append(li)
  })
  const chipsComp = plazos.map((p) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'b b-chip'
    b.dataset.comparar = p
    b.setAttribute('aria-pressed', 'false')
    b.innerHTML = '<span class="b__txt"></span>'
    b.firstChild.textContent = `${p} meses`
    $('[data-cal=comparar]').append(b)
    return b
  })

  if (inicial) {
    if (Number.isFinite(Number(inicial.enganche_pct))) pct = acotar(Number(inicial.enganche_pct), minimo, maximo)
    if (plazos.includes(Number(inicial.plazo))) iPlazo = plazos.indexOf(Number(inicial.plazo))
    if (inicial.modalidad === 'directo') modalidad = 'directo'
    if (Number.isFinite(Number(inicial.tasa)) && inicial.modalidad !== 'directo') tasa.value = Number(inicial.tasa)
  }

  // ---------- Pintado de controles ----------
  const maxPlazoIdx = () => {
    if (modalidad !== 'directo') return plazos.length - 1
    const tope = c.sin_intereses.plazo_max_meses
    return Math.max(0, plazos.findLastIndex((p) => p <= tope))
  }

  function pintarPlazo() {
    const max = maxPlazoIdx()
    let nota = modalidad === 'directo' ? `Sin intereses, el plazo máximo es de ${plazos[max]} meses.` : ''
    if (iPlazo > max) {
      iPlazo = max
      nota += ` Ajustamos el plazo a ${plazos[max]} meses.`
    }
    rPlazo.value = iPlazo
    rPlazo.parentElement.style.setProperty('--p', (iPlazo / (plazos.length - 1)).toFixed(4))
    rPlazo.setAttribute('aria-valuetext', `${plazos[iPlazo]} meses`)
    $('[data-cal=plazo]').textContent = `${plazos[iPlazo]} meses`
    $('[data-cal=plazo-nota]').textContent = nota.trim()
    ;[...marcas.children].forEach((li, i) => {
      li.toggleAttribute('data-fuera', i > max)
      li.toggleAttribute('data-activa', i === iPlazo)
    })
  }

  function pintarEnganche() {
    const p = precio.valueAsNumber
    if (simulado && p > 0) monto.value = campoNum(cent((p * pct) / 100) / 100)
    rango.value = pct
    rango.parentElement.style.setProperty('--p', ((acotar(pct, minimo, maximo) - minimo) / (maximo - minimo)).toFixed(4))
    $('[data-cal=pct]').textContent = pctTexto(Math.round(pct * 10) / 10)
    rango.setAttribute('aria-valuetext', simulado && monto.value ? `${pctTexto(Math.round(pct * 10) / 10)}, ${fmt(monto.valueAsNumber)}` : pctTexto(Math.round(pct * 10) / 10))
  }

  function pintarModalidad() {
    f.querySelectorAll('[data-modalidad]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.modalidad === modalidad)))
    $('[data-cal=tasa]').hidden = modalidad === 'directo'
  }

  function notaPrecio() {
    const n = $('[data-cal=precio-nota]')
    if (lote) {
      $('[data-cal=lote]').textContent = `Lote ${lote.id}`
      n.textContent = `${lote.area_m2.toLocaleString('es-GT')} m² aprox. × ${simulado ? fmt(c.precio_m2) : m.m2.replace(/\/m²$/, '')} por m²${precioFijo ? '' : '. Puede escribir otro precio.'}`
    } else {
      $('[data-cal=lote]').textContent = 'Lote de ejemplo'
      n.textContent = simulado
        ? `Ejemplo con un lote de ${area} m². Escriba otro precio o elija un lote en el plano.`
        : `Ejemplo con un lote de ${area} m² a ${m.m2}. Mueva un control o elija un lote en el plano para simular.`
    }
  }

  // Primer gesto: deja los marcadores y simula con valores de demostración
  function simular() {
    if (simulado) return
    simulado = true
    f.dataset.simulado = 'si'
    if (!(precio.valueAsNumber > 0)) precio.value = campoNum((lote ? lote.area_m2 : area) * c.precio_m2)
    pintarEnganche()
    notaPrecio()
  }

  function datos() {
    return {
      precio: precio.valueAsNumber,
      enganche: monto.valueAsNumber,
      plazo: plazos[iPlazo],
      tasa: modalidad === 'directo' ? 0 : tasa.valueAsNumber,
      modalidad,
    }
  }

  const poner = (sel, texto) => f.querySelectorAll(sel).forEach((el) => (el.textContent = texto))

  function pintarMarcadores() {
    const vacio = { cuota: m.cuota, precio: m.lote, enganche: 'Q XX,XXX', reserva: m.reserva, resto: 'Q XX,XXX', financiado: m.lote, intereses: 'Q XX,XXX', total: m.lote }
    for (const [k, v] of Object.entries(vacio)) poner(`[data-res=${k}]`, v)
    poner('[data-res=detalle]', `${plazos[iPlazo]} cuotas, ${nombreModalidad({ modalidad, tasa: tasa.valueAsNumber || 0 })}`)
    for (const k of ['enganche', 'capital', 'intereses']) poner(`[data-ley=${k}]`, '')
    const partes = { enganche: pct, capital: 100 - pct, intereses: modalidad === 'directo' ? 0 : 18 }
    for (const [k, v] of Object.entries(partes)) $(`[data-seg=${k}]`).style.setProperty('--ancho', v)
    pintarComparacion(null)
    poner('[data-fijo=cuota]', m.cuota)
    poner('[data-fijo=detalle]', `${plazos[iPlazo]} meses`)
    $('[data-cal=amort]').hidden = true
  }

  // ---------- Comparación de dos plazos ----------
  function plazoComparado() {
    const max = maxPlazoIdx()
    const actual = plazos[iPlazo]
    const validos = plazos.filter((p, i) => i <= max && p !== actual)
    if (!validos.includes(comparar)) comparar = actual === plazos[max] ? validos[0] : plazos[max]
    chipsComp.forEach((b, i) => {
      b.hidden = plazos[i] === actual || i > max
      b.setAttribute('aria-pressed', String(plazos[i] === comparar))
    })
    return comparar
  }

  function pintarComparacion(d) {
    const otro = plazoComparado()
    const tabla = $('.cal-comp')
    tabla.hidden = otro === undefined
    if (otro === undefined) return
    poner('[data-comp=a-plazo]', `Su plazo · ${plazos[iPlazo]} meses`)
    poner('[data-comp=b-plazo]', `${otro} meses`)
    if (!d) {
      for (const k of ['a', 'b']) {
        poner(`[data-comp=${k}-cuota]`, m.cuota.replace(/\/mes$/, ''))
        poner(`[data-comp=${k}-intereses]`, 'Q XX,XXX')
        poner(`[data-comp=${k}-total]`, m.lote)
      }
      poner('[data-cal=lectura]', 'Al simular verá cuánto cambian la cuota y los intereses entre los dos plazos.')
      return
    }
    const a = plan
    const b = calcular({ ...d, plazo: otro })
    for (const [k, p] of [['a', a], ['b', b]]) {
      poner(`[data-comp=${k}-cuota]`, fmt(p.cuota))
      poner(`[data-comp=${k}-intereses]`, fmt(p.intereses))
      poner(`[data-comp=${k}-total]`, fmt(p.total))
    }
    const largo = otro > d.plazo
    const dCuota = fmt(Math.abs(a.cuota - b.cuota))
    const dInt = fmt(Math.abs(a.intereses - b.intereses))
    poner('[data-cal=lectura]', d.modalidad === 'directo'
      ? `Sin intereses el total no cambia: con ${otro} meses la cuota ${largo ? 'baja' : 'sube'} ${dCuota} al mes.`
      : largo
        ? `Con ${otro} meses la cuota baja ${dCuota} al mes, pero paga ${dInt} más en intereses.`
        : `Con ${otro} meses la cuota sube ${dCuota} al mes y ahorra ${dInt} en intereses.`)
  }

  // ---------- Resultados ----------
  const campo = { precio, enganche: monto, tasa, plazo: rPlazo }
  function actualizar(tipo) {
    if (!simulado) {
      plan = null
      pintarMarcadores()
      return
    }
    const d = datos()
    const errs = validar(d, c)
    // Mientras se escribe (input) solo se borran errores; se muestran al confirmar el campo o al enviar.
    for (const k of Object.keys(campo)) {
      const msg = errs[k] ?? ''
      if (msg && tipo === 'input' && k !== 'plazo') continue
      $(`[data-error=${k}]`).textContent = msg
      campo[k].setAttribute('aria-invalid', msg ? 'true' : 'false')
    }
    const ok = Object.keys(errs).length === 0
    f.toggleAttribute('data-invalido', !ok)
    if (!ok) {
      plan = null
      pintarMarcadores()
      poner('[data-res=detalle]', 'Corrija los campos marcados para ver su plan.')
      return
    }
    plan = { ...d, ...calcular(d) }
    const res = {
      cuota: fmt(plan.cuota),
      detalle: `${plan.plazo} cuotas, ${nombreModalidad(plan)}`,
      precio: fmt(plan.precio),
      enganche: `${fmt(plan.enganche)} (${pctTexto(Math.round((plan.enganche / plan.precio) * 1000) / 10)})`,
      reserva: fmt(c.monto_reserva),
      resto: fmt(plan.enganche - c.monto_reserva),
      financiado: fmt(plan.financiado),
      intereses: fmt(plan.intereses),
      total: fmt(plan.total),
    }
    for (const [k, v] of Object.entries(res)) poner(`[data-res=${k}]`, v)

    // Barra de composición: enganche + capital + intereses = total pagado
    const partes = { enganche: plan.enganche, capital: plan.financiado, intereses: plan.intereses }
    for (const [k, v] of Object.entries(partes)) {
      const p = plan.total > 0 ? (v / plan.total) * 100 : 0
      $(`[data-seg=${k}]`).style.setProperty('--ancho', p.toFixed(3))
      poner(`[data-ley=${k}]`, `${fmt(v)} · ${pctTexto(Math.round(p * 10) / 10)}`)
    }

    pintarComparacion(d)
    poner('[data-fijo=cuota]', `${fmt(plan.cuota)}/mes`)
    poner('[data-fijo=detalle]', `${plan.plazo} meses`)
    $('[data-cal=amort]').hidden = false
    $('[data-cal=tabla]').innerHTML = plan.filas
      .map((r) => `<tr><th scope="row">${r.mes}</th><td>${num(r.cuota)}</td><td>${num(r.interes)}</td><td>${num(r.capital)}</td><td>${num(r.saldo)}</td></tr>`)
      .join('')

    clearTimeout(anuncioT)
    anuncioT = setTimeout(() => poner('[data-cal=anuncio]', `Cuota de demostración ${fmt(plan.cuota)} al mes durante ${plan.plazo} meses.`), 600)
    const detalle = emitir()
    guardar('sr-plan', detalle)
  }

  function emitir() {
    const detalle = {
      demo: Boolean(c.demo),
      lote: lote?.id ?? null,
      area_m2: lote?.area_m2 ?? null,
      precio: plan.precio,
      enganche: plan.enganche,
      enganche_pct: Math.round((plan.enganche / plan.precio) * 1000) / 10,
      plazo: plan.plazo,
      modalidad: plan.modalidad,
      tasa: plan.tasa,
      cuota: plan.cuota,
      financiado: plan.financiado,
      intereses: plan.intereses,
      total: plan.total,
      reserva: c.monto_reserva,
    }
    f.dispatchEvent(new CustomEvent('calculadora:plan', { bubbles: true, detail: detalle }))
    return detalle
  }

  // ---------- Gestos ----------
  f.addEventListener('input', (e) => {
    const t = e.target
    if (t === precio) {
      lote = null
      simular()
      notaPrecio()
      pintarEnganche()
    }
    if (t === rango) {
      pct = rango.valueAsNumber
      simular()
      pintarEnganche()
    }
    if (t === monto) {
      simular()
      const v = (monto.valueAsNumber / precio.valueAsNumber) * 100
      if (Number.isFinite(v)) pct = v
      const escrito = monto.value
      pintarEnganche()
      monto.value = escrito // conserva lo que escribe la persona
    }
    if (t === rPlazo) {
      iPlazo = rPlazo.valueAsNumber
      simular()
      pintarPlazo()
    }
    if (t === tasa) simular()
    actualizar('input')
  })
  f.addEventListener('change', () => actualizar('change'))

  f.addEventListener('click', (e) => {
    const b = e.target.closest('[data-modalidad], [data-comparar]')
    if (!b) return
    if (b.dataset.modalidad) {
      modalidad = b.dataset.modalidad === 'directo' ? 'directo' : 'credito'
      pintarModalidad()
      pintarPlazo()
    } else {
      comparar = Number(b.dataset.comparar)
    }
    simular()
    actualizar('change')
  })

  function ponerLote(d) {
    const id = String(d?.id ?? '')
    const a = Number(d?.area_m2)
    if (!/^[A-K]-\d{2}$/.test(id) || !(a > 0)) return
    lote = { id, area_m2: a }
    precio.value = campoNum(a * c.precio_m2)
    simular()
    notaPrecio()
    pintarEnganche()
    actualizar('change')
  }
  addEventListener('lote:seleccionado', (e) => ponerLote(e.detail))
  addEventListener('calculadora:lote', (e) => ponerLote(e.detail))

  f.addEventListener('submit', (e) => {
    e.preventDefault()
    simular()
    actualizar('submit')
    const estado = $('[data-cal=estado]')
    if (!plan) {
      f.querySelector('[aria-invalid=true]')?.focus()
      estado.textContent = 'Revise los campos marcados antes de continuar.'
      return
    }
    const detalle = emitir()
    guardar('sr-plan', detalle)
    estado.textContent = 'Plan listo.'
    alEnviar?.(detalle)
  })

  // ---------- Arranque ----------
  pintarModalidad()
  pintarPlazo()
  if (loteInicial) ponerLote(loteInicial)
  else if (inicial) simular()
  pintarEnganche()
  notaPrecio()
  actualizar('change')
}
