/* San Rafael v2 · selector de lotes · plano.js (constructor B, PLAN-v2 §8)
   Un solo SVG en viewBox 0 0 2400 1350, encima del render: lindero, parques, 145 lotes, etiquetas y cotas.
   Las coordenadas vienen de maqueta/lotes-2d.json, proyectadas con la misma cámara del render: alineación exacta. */

const NS = 'http://www.w3.org/2000/svg';
export const W = 2400;
export const H = 1350;

export const centroide = (pts) => pts.reduce((c, [x, y]) => [c[0] + x / pts.length, c[1] + y / pts.length], [0, 0]);
export const caja = (pts) => pts.reduce((c, [x, y]) => [Math.min(c[0], x), Math.min(c[1], y), Math.max(c[2], x), Math.max(c[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
const largo = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const trazo = (pts) => 'M' + pts.map((p) => p.join(',')).join('L') + 'Z';
const uno = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });   // Number(): un valor no numérico sale «NaN», nunca como texto crudo

function nodo(tag, attrs, padre) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  padre.append(n);
  return n;
}

// Umbral de escala a partir del cual se leen los ids de lote en vez de las letras de manzana
const UMBRAL_IDS = 0.95;

export function crearPlano(svg, plano2d, info) {
  const gParques = nodo('g', { class: 'sel-parques' }, svg);
  for (const p of plano2d.parques) nodo('path', { d: trazo(p), class: 'sel-parque' }, gParques);
  const lindero = nodo('path', { d: trazo(plano2d.lindero), class: 'sel-lindero' }, svg);

  const gLotes = nodo('g', { class: 'sel-lotes' }, svg);
  const lotes = new Map();
  for (const l of plano2d.lotes) {
    const path = nodo('path', { d: trazo(l.puntos), class: 'sel-lote', 'data-id': l.id }, gLotes);
    lotes.set(l.id, { path, puntos: l.puntos, manzana: l.manzana, centro: centroide(l.puntos) });
  }

  const gMz = nodo('g', { class: 'sel-etq sel-etq--mz' }, svg);
  const letras = Object.entries(plano2d.manzanas).map(([mz, [x, y]]) => {
    const t = nodo('text', { x, y }, gMz);
    t.textContent = mz;
    return { centro: [x, y], etiqueta: t };
  });
  const gIds = nodo('g', { class: 'sel-etq sel-etq--lote' }, svg);
  for (const [id, l] of lotes) {
    l.etiqueta = nodo('text', { x: l.centro[0], y: l.centro[1] }, gIds);
    l.etiqueta.textContent = id;
  }
  const gCota = nodo('g', { class: 'sel-cota' }, svg);

  // Metros por pixel del render: mediana de (lado corto en px / medida corta en m). Hay perspectiva leve: la barra es aproximada.
  const razones = plano2d.lotes.map((l) => {
    const m = info.get(l.id), p = l.puntos;
    if (!m) return NaN;
    const lados = p.map((q, i) => largo(q, p[(i + 1) % p.length])).sort((a, b) => a - b);
    return lados[0] / Math.min(m.frente_m, m.fondo_m);
  }).filter(Number.isFinite).sort((a, b) => a - b);
  const pxPorM = razones[razones.length >> 1] || 3.4;

  let elegido = null;
  let escala = 1;

  // Tamaños constantes en pantalla: el texto y los remates no crecen con el zoom
  function tamanos(s) {
    escala = s;
    const k = 1 / s;
    gMz.style.fontSize = `${26 * k}px`;
    gMz.style.strokeWidth = `${4 * k}px`;
    gIds.style.fontSize = `${11 * k}px`;
    gIds.style.strokeWidth = `${3 * k}px`;
    svg.classList.toggle('es-cerca', s >= UMBRAL_IDS);
    if (elegido) cota();
  }

  // Cotas: dos lados consecutivos con línea de cota desplazada hacia afuera, remates de 4 px y su medida.
  function cota() {
    gCota.replaceChildren();
    const l = lotes.get(elegido), m = info.get(elegido);
    if (!l || !m) return;
    const p = l.puntos, k = 1 / escala, c = l.centro;
    const lados = [[p[0], p[1]], [p[1], p[2]]];
    const corto = Math.min(m.frente_m, m.fondo_m), ancho = Math.max(m.frente_m, m.fondo_m);
    const medidas = largo(...lados[0]) < largo(...lados[1]) ? [corto, ancho] : [ancho, corto];
    lados.forEach(([a, b], i) => {
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, L = largo(a, b);
      let nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
      if ((mx - c[0]) * nx + (my - c[1]) * ny < 0) { nx = -nx; ny = -ny; }
      const off = 14 * k, rem = 4 * k;
      nodo('line', { x1: a[0] + nx * off, y1: a[1] + ny * off, x2: b[0] + nx * off, y2: b[1] + ny * off }, gCota);
      for (const q of [a, b]) nodo('line', { x1: q[0] + nx * (off - rem), y1: q[1] + ny * (off - rem), x2: q[0] + nx * (off + rem), y2: q[1] + ny * (off + rem) }, gCota);
      let ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
      if (ang > 90) ang -= 180;
      if (ang < -90) ang += 180;
      const tx = mx + nx * (off + 11 * k), ty = my + ny * (off + 11 * k);
      const t = nodo('text', { x: tx, y: ty, transform: `rotate(${ang.toFixed(2)} ${tx} ${ty})`, 'font-size': 11 * k, 'stroke-width': 3 * k, class: 'sel-cota__medida' }, gCota);
      t.textContent = `${uno(medidas[i])} m`;
    });
    const id = nodo('text', { x: c[0], y: c[1] - 7 * k, 'font-size': 13 * k, 'stroke-width': 3 * k, class: 'sel-cota__id' }, gCota);
    id.textContent = elegido;
    const area = nodo('text', { x: c[0], y: c[1] + 8 * k, 'font-size': 11 * k, 'stroke-width': 3 * k, class: 'sel-cota__area' }, gCota);
    area.textContent = `${uno(m.area_m2)} m² aprox.`;
    taparVecinos(k);
  }

  // Los ids de lote y las letras de manzana que chocan con un texto de la cota se ocultan mientras dure la selección
  const tapadas = new Set();
  function taparVecinos(k) {
    for (const t of tapadas) t.classList.remove('es-tapada');
    tapadas.clear();
    const cajas = [...gCota.querySelectorAll('text')].map((t) => t.getBBox());
    const c = lotes.get(elegido).centro, holgura = 4 * k;
    const revisar = (centro, etiqueta, ax, ay) => {
      if (Math.hypot(centro[0] - c[0], centro[1] - c[1]) > 320) return;
      const [x, y] = centro;
      if (cajas.some((b) => x + ax > b.x - holgura && x - ax < b.x + b.width + holgura && y + ay > b.y - holgura && y - ay < b.y + b.height + holgura)) {
        etiqueta.classList.add('es-tapada');
        tapadas.add(etiqueta);
      }
    };
    for (const [id, l] of lotes) if (id !== elegido) revisar(l.centro, l.etiqueta, 14 * k, 6 * k);   // id de 11 px
    for (const m of letras) revisar(m.centro, m.etiqueta, 9 * k, 14 * k);                           // letra de 26 px
  }

  function elegir(id) {
    const antes = lotes.get(elegido);
    antes?.path.classList.remove('es-elegido');
    antes?.etiqueta.classList.remove('es-oculta');
    elegido = id;
    const ahora = lotes.get(id);
    ahora?.path.classList.add('es-elegido');
    ahora?.etiqueta.classList.add('es-oculta');   // la cota trae su propio id y área
    svg.dataset.elegido = id || '';
    if (id) cota();
    else {
      gCota.replaceChildren();
      for (const t of tapadas) t.classList.remove('es-tapada');
      tapadas.clear();
    }
  }

  // Hover o foco que viene de la lista (el puntero sobre el plano usa :hover)
  let foco = null;
  function enfocar(id) {
    if (foco) lotes.get(foco)?.path.classList.remove('es-foco');
    foco = id;
    if (id) lotes.get(id)?.path.classList.add('es-foco');
  }

  function estado(id, valor) {
    const l = lotes.get(id);
    if (l) l.path.dataset.estado = valor;
  }

  // Draw-on del lindero, una sola vez (re-terreno-delineate). Sin movimiento: queda dibujado.
  let largoLindero = 0;
  function prepararLindero() {
    largoLindero = lindero.getTotalLength();
    lindero.style.strokeDasharray = `${largoLindero}`;
    lindero.style.strokeDashoffset = `${largoLindero}`;
  }
  function dibujarLindero() {
    if (!largoLindero) return;
    lindero.getBoundingClientRect();
    lindero.classList.add('es-dibujado');
    lindero.style.strokeDashoffset = '0';
    largoLindero = 0;
  }

  return { lotes, lindero, pxPorM, tamanos, elegir, enfocar, estado, prepararLindero, dibujarLindero };
}
