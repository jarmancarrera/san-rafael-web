# Pagos de reserva · cómo se conectaría la pasarela real

Hoy el sitio usa solo el **adaptador de demostración** (`demo.js`): no hay red, ni llaves, ni campos de tarjeta, y el
número de reserva es `SR-DEMO-<AAAAMMDD>-<4 dígitos>`. Este archivo explica qué cambia el día que se conecte el cobro real.
Nada de lo de abajo está implementado.

## Archivos de esta carpeta

| Archivo | Qué hace |
| :- | :- |
| `demo.js` | Adaptador de demostración: `crearIntento({ lote, monto, cliente })` y `confirmar(id, 'aprobar' \| 'rechazar')`. Espera 1.2 s y responde aprobado (con número) o rechazado (con causa). |
| `pasarela.js` | Pantalla «Pasarela de demostración»: dos botones, «Simular aprobación» y «Simular rechazo», con estados cargando, éxito y rechazo con reintento. |
| `comprobante.js` | Guarda el comprobante en `sessionStorage`, pinta `comprobante.html?n=...` (con todo texto escapado) y lo descarga como HTML con `Blob`. |

## Pasarela recomendada: Recurrente

Fuente: análisis de `00-plan/PLAN.md` §6 (recurrente.com, recurrente.com/precios y docs.recurrente.com, consultados el
2026-10-29). Opera en Guatemala, cobra en GTQ y USD, ofrece checkout alojado por API (`checkout_url`), ambiente de
pruebas con llaves de prueba y webhooks. Antes de implementar, releer la documentación vigente: rutas, nombres de
cabeceras y de eventos pueden cambiar.

## Flujo real (checkout alojado)

```
navegador                      función del servidor (/api/reserva)             Recurrente
   | POST {lote, plan, cliente}  ->|                                              |
   |                               | valida lote y monto contra su propia tabla   |
   |                               | POST /api/checkouts (X-SECRET-KEY) --------->|
   |                               |<---------------------- { id, checkout_url } -|
   |<--------- { checkout_url } ---|  guarda reserva «pendiente» con ese id        |
   | location.href = checkout_url --------------------------------------------->  | la persona paga en la página de Recurrente
   |<---------------------------------------------- redirige a success_url ------|
   |                               |<---------- webhook (pago aprobado/fallido) --|
   |                               | verifica la firma, marca la reserva «pagada» |
   | GET /api/reserva/<id> ------->| devuelve el estado y el número de reserva    |
```

1. **`js/pagos/recurrente.js`** (nuevo, misma forma que `demo.js`): `crearIntento` hace `POST /api/reserva` en el mismo
   dominio y devuelve `{ id, checkout_url }`; la pasarela redirige con `location.assign(checkout_url)` en vez de mostrar
   los botones de simulación. `confirmar` consulta `GET /api/reserva/<id>` al volver de `success_url`.
2. **`/api/reserva`** (función serverless del hosting; p. ej. Cloudflare Pages Functions):
   - recalcula el monto de la reserva desde su propia tabla de precios: **nunca** confía en el monto que manda el navegador;
   - llama a `POST https://app.recurrente.com/api/checkouts` con las cabeceras de llave del comercio
     (`X-PUBLIC-KEY` y `X-SECRET-KEY`; verificar nombres en docs.recurrente.com), el concepto «Reserva del lote C-04»,
     el monto en centavos, `success_url` y `cancel_url` de este sitio, y el número de reserva en los metadatos;
   - responde solo `{ id, checkout_url }`.
3. **`/api/webhook`**: recibe el evento de pago de Recurrente, **verifica la firma** con el secreto del webhook
   (verificar el esquema de firma vigente en la documentación) y solo entonces marca la reserva como pagada y emite el
   número definitivo `SR-<AAAAMMDD>-<4 dígitos>` (sin `DEMO`). El webhook es la única fuente de verdad: la vuelta del
   navegador a `success_url` no prueba el pago. Debe ser idempotente (un mismo evento puede llegar dos veces).
4. **Comprobante**: se arma con lo que devuelve el servidor, no con `sessionStorage`. Ahí puede viajar por correo.

## Por qué el navegador no lleva llaves

- Todo lo que se sirve al navegador (HTML, JS, JSON) lo puede leer cualquiera con «Ver código fuente». Una llave secreta
  ahí permite crear cobros, reembolsos o leer pagos a nombre del comercio.
- Por eso la llave secreta y el secreto del webhook viven **solo** en las variables de entorno de la función del
  servidor (en la nube de Claude Code: *network secrets* del environment; en el Mac: Keychain `carrera`). Nunca en el
  repositorio, en `datos/precios.json` ni en este JS.
- El navegador tampoco toca datos de tarjeta: los escribe la persona en la página alojada de Recurrente. Así el sitio
  queda fuera del alcance más pesado de PCI DSS.
- `reservar.html` y `comprobante.html` traen una CSP en `<meta>` (`script-src 'self'`, `connect-src 'self'`): el
  adaptador real solo puede llamar a `/api/*` del mismo dominio, y la ida a `checkout_url` es una navegación, no un `fetch`.
  Si se agrega otro origen, se cambia la CSP de las dos páginas en el mismo paso.
- El monto lo fija el servidor. Si el navegador mandara el precio, cualquiera podría reservar por un quetzal
  editando la petición.

## Antes de pasar a real (pendientes del usuario)

- Cuenta de comercio en Recurrente y llaves de prueba, luego de producción: [FALTANTE].
- Monto real de la reserva y política de reembolso: [FALTANTE].
- Hosting con funciones (sugerido Cloudflare Pages): [FALTANTE].
- Quitar `"demo": true` de `datos/precios.json` solo cuando existan precios reales aprobados. A propósito,
  `02-herramientas/precios_check.py` falla si `demo` no es `true`: hay que cambiarlo en el mismo paso.
- Cambiar `SR-DEMO-` por `SR-` solo en el número que emite el servidor.
