// Pantalla «Pasarela de demostración» (PLAN-v2 §11.3). Sin campos de tarjeta: dos botones simulan el resultado.
// Estados: lista → procesando → aprobado (llama a alAprobar) | rechazado (causa + «Reintentar el pago» → lista).
// Los datos de la persona entran solo con textContent.
import { fmt } from '../calculadora/calculadora.js'

const PLANTILLA = `
<div class="pasarela" data-estado="lista">
  <div class="pasarela__cab">
    <h3 class="pasarela__titulo">Pasarela de demostración</h3>
    <p class="nota-demo">Sin cobro real</p>
  </div>
  <dl class="pasarela__datos">
    <div><dt>Concepto</dt><dd data-p="concepto"></dd></div>
    <div><dt>Monto de la reserva</dt><dd data-p="monto"></dd></div>
    <div><dt>A nombre de</dt><dd data-p="nombre"></dd></div>
    <div><dt>Comprobante para</dt><dd data-p="correo"></dd></div>
  </dl>
  <p class="pasarela__nota">Esta pasarela no pide datos de tarjeta ni cobra nada. Elija qué resultado quiere simular.</p>
  <div class="pasarela__acciones">
    <button class="b b-claro" type="button" data-simular="aprobar"><span class="ico ico--check b__ok" aria-hidden="true"></span><span class="b__txt" data-exito="Pago aprobado">Simular aprobación</span></button>
    <button class="b b-linea" type="button" data-simular="rechazar"><span class="b__txt">Simular rechazo</span></button>
  </div>
  <div class="pasarela__alerta" role="alert" data-p="alerta"></div>
  <p class="sr-solo" role="status" data-p="estado"></p>
</div>`

const RECHAZO = `
<div class="pasarela__rechazo">
  <h4 class="pasarela__rechazo-t"><span class="ico ico--cerrar" aria-hidden="true"></span>Pago rechazado</h4>
  <p data-p="causa"></p>
  <p>No se cobró nada. Sus datos siguen guardados: puede intentarlo otra vez.</p>
  <button class="b b-claro" type="button" data-reintentar><span class="b__txt">Reintentar el pago</span></button>
</div>`

const espera = (ms) => new Promise((ok) => setTimeout(ok, ms))

export function montarPasarela(el, { adaptador, lote, monto, cliente, alAprobar }) {
  el.innerHTML = PLANTILLA
  const caja = el.querySelector('.pasarela')
  const $ = (k) => el.querySelector(`[data-p="${k}"]`)
  const botones = [...el.querySelectorAll('[data-simular]')]
  const estado = (b, e) => {
    if (window.SRBotones) window.SRBotones.estado(b, e)
    else if (e) b.dataset.estado = e
    else delete b.dataset.estado
  }
  const habilitar = (si) => botones.forEach((b) => (si ? b.removeAttribute('aria-disabled') : b.setAttribute('aria-disabled', 'true')))

  $('concepto').textContent = `Reserva del lote ${lote}`
  $('monto').textContent = `${fmt(monto)} · valor de demostración`
  $('nombre').textContent = cliente.nombre
  $('correo').textContent = cliente.correo

  let ocupado = false
  async function pagar(boton) {
    if (ocupado || boton.getAttribute('aria-disabled') === 'true') return
    ocupado = true
    caja.dataset.estado = 'procesando'
    botones.filter((b) => b !== boton).forEach((b) => b.setAttribute('aria-disabled', 'true'))
    estado(boton, 'cargando')
    $('estado').textContent = 'Procesando el pago de demostración.'
    let r
    try {
      const intento = adaptador.crearIntento({ lote, monto, cliente })
      r = await adaptador.confirmar(intento.id, boton.dataset.simular)
    } catch {
      r = { estado: 'rechazado', mensaje: 'La pasarela de demostración no respondió.' }
    }
    if (r.estado === 'aprobado') {
      estado(boton, 'exito')
      caja.dataset.estado = 'aprobado'
      $('estado').textContent = `Pago aprobado. Número de reserva ${r.numero}.`
      await espera(800)
      alAprobar(r)
      return
    }
    estado(boton, null)
    caja.dataset.estado = 'rechazado'
    habilitar(false)
    $('estado').textContent = ''
    $('alerta').innerHTML = RECHAZO
    $('causa').textContent = `Causa: ${r.mensaje} (simulación)`
    el.querySelector('[data-reintentar]').focus()
    ocupado = false
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-simular]')
    if (b) return pagar(b)
    if (e.target.closest('[data-reintentar]')) {
      $('alerta').replaceChildren()
      caja.dataset.estado = 'lista'
      habilitar(true)
      $('estado').textContent = 'Listo para intentar el pago otra vez.'
      botones[0].focus()
    }
  })
}
