// Monta la calculadora en #calculadora-ui de index.html (capítulo «credito»; bitácora, ola de construcción).
// Escucha lote:seleccionado y calculadora:lote desde el arranque para no perder un lote elegido mientras llega precios.json.
// Si precios.json no carga, #calculadora-ui queda vacío e index.html muestra su respaldo con marcadores.
import { montarCalculadora } from './calculadora.js'

const raiz = document.getElementById('calculadora-ui')
if (raiz) {
  let pendiente = null
  const anotar = (e) => { pendiente = e.detail }
  addEventListener('lote:seleccionado', anotar)
  addEventListener('calculadora:lote', anotar)
  try {
    const r = await fetch(new URL('../../datos/precios.json', import.meta.url))
    if (!r.ok) throw new Error(`datos/precios.json: HTTP ${r.status}`)
    const precios = await r.json()
    removeEventListener('lote:seleccionado', anotar)
    removeEventListener('calculadora:lote', anotar)
    montarCalculadora(raiz, {
      precios,
      lote: pendiente,
      alEnviar: (plan) => {
        location.href = plan.lote ? `reservar.html?lote=${encodeURIComponent(plan.lote)}` : 'reservar.html'
      },
    })
  } catch {
    raiz.replaceChildren()
  }
}
