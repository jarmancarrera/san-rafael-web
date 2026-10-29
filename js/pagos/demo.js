// Adaptador de pagos de DEMOSTRACIÓN (PLAN.md fase 4; PLAN-v2 §11). No llama a ninguna red, no tiene llaves
// y no pide datos de tarjeta. Misma forma que tendrá el adaptador real (ver README.md):
//   crearIntento({ lote, monto, cliente }) → { id, estado: 'creado' }
//   confirmar(id, 'aprobar' | 'rechazar')  → Promise<{ id, estado: 'aprobado', numero } | { id, estado: 'rechazado', causa, mensaje }>
// El número de reserva es SR-DEMO-<AAAAMMDD>-<4 dígitos>, con la fecha de Paxcamán (America/Guatemala).

const ESPERA_MS = 1200 // lo que tardaría una pasarela en responder; da tiempo a ver el estado «cargando»
const intentos = new Map()

const aleatorio = (n) => {
  const v = new Uint32Array(n)
  crypto.getRandomValues(v)
  return [...v]
}

export function numeroReserva(fecha = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(fecha).map((x) => [x.type, x.value]))
  const cuatro = String(aleatorio(1)[0] % 10000).padStart(4, '0')
  return `SR-DEMO-${p.year}${p.month}${p.day}-${cuatro}`
}

export function crearIntento({ lote, monto, cliente } = {}) {
  if (!/^[A-K]-\d{2}$/.test(String(lote))) throw new Error('Intento de pago sin lote válido.')
  if (!(Number(monto) > 0)) throw new Error('Intento de pago sin monto.')
  if (!cliente?.nombre || !cliente?.correo) throw new Error('Intento de pago sin datos del cliente.')
  const id = `pi_demo_${aleatorio(2).map((x) => x.toString(36)).join('')}`
  intentos.set(id, { id, estado: 'creado', lote, monto: Number(monto) })
  return { id, estado: 'creado' }
}

export async function confirmar(id, simulacion) {
  const i = intentos.get(id)
  if (!i) throw new Error('Intento de pago desconocido.')
  // Idempotente: un intento ya resuelto devuelve el mismo resultado (como un webhook repetido)
  if (i.resultado) return i.resultado
  await new Promise((ok) => setTimeout(ok, ESPERA_MS))
  i.resultado = simulacion === 'rechazar'
    ? { id, estado: 'rechazado', causa: 'fondos_insuficientes', mensaje: 'La tarjeta no tiene fondos suficientes.' }
    : { id, estado: 'aprobado', numero: numeroReserva() }
  i.estado = i.resultado.estado
  return i.resultado
}
