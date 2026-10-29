/* San Rafael v2 · selector de lotes · camara.js (constructor B)
   Cámara 2D del render aprobado (05-vistas/render-interactivo.html) llevada a módulo de página:
   - dentro de la página la rueda hace scroll; el zoom va con los botones y con ctrl o cmd + rueda;
   - el arrastre solo funciona con zoom; en táctil, touch-action pan-y sin zoom y none con zoom; el pellizco hace zoom;
   - en pantalla completa (pleno) vuelven todos los gestos del render aprobado.
   Un solo transform (translate + scale) sobre el lienzo de 2400×1350: imagen y SVG se mueven juntos. */

export function crearCamara(vista, lienzo, { W, H, caja, alCambiar, alTocar, alAvisar, reserva = () => 0 }) {
  // reserva(base): px libres abajo (barra en pleno; lámina inferior abierta en móvil, salvo para la escala base)
  const quieto = matchMedia('(prefers-reduced-motion: reduce)');
  let s = 1, x = 0, y = 0, w = 1, h = 1, base = 1, minimo = 1, pleno = false;
  let vuelo = null;

  function medir() {
    w = vista.clientWidth || 1;
    h = vista.clientHeight || 1;
    const cubrir = Math.max(w / W, h / H);       // el render siempre llena la vista
    const [x0, y0, x1, y1] = caja;
    base = Math.max(cubrir, Math.min(w / ((x1 - x0) * 1.12), (h - reserva(true)) / ((y1 - y0) * 1.12)));
    minimo = pleno ? cubrir : base;
  }
  const maximo = () => Math.max(2.6, base * 2);
  const conZoom = () => s > base * 1.02;

  function limitar(ns, nx, ny) {
    ns = Math.min(maximo(), Math.max(minimo, ns));
    return [ns, Math.min(0, Math.max(w - W * ns, nx)), Math.min(0, Math.max(h - H * ns, ny))];
  }

  function aplicar() {
    [s, x, y] = limitar(s, x, y);
    lienzo.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`;
    vista.classList.toggle('es-libre', pleno || conZoom());   // arrastre y touch-action: none
    alCambiar(s);
  }

  function parar() { vuelo = null; }

  function volar(t) {
    if (!vuelo) return;
    const k = Math.min(1, (t - vuelo.t0) / vuelo.dur);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;   // ease-in-out cúbica, como el render aprobado
    const [a, b] = [vuelo.a, vuelo.b];
    s = a[0] + (b[0] - a[0]) * e; x = a[1] + (b[1] - a[1]) * e; y = a[2] + (b[2] - a[2]) * e;
    aplicar();
    if (k < 1) requestAnimationFrame(volar); else vuelo = null;
  }

  // Encuadra una caja de la imagen [x0, y0, x1, y1] con un margen relativo, sobre la franja libre (sin la reserva de abajo)
  function encuadrar([x0, y0, x1, y1], { margen = 1, animado = true } = {}) {
    const libre = h - reserva();
    const ns = Math.min(w / ((x1 - x0) * margen), libre / ((y1 - y0) * margen));
    const c = Math.min(maximo(), Math.max(minimo, ns));
    const destino = limitar(c, w / 2 - (x0 + x1) / 2 * c, libre / 2 - (y0 + y1) / 2 * c);
    if (!animado || quieto.matches) { [s, x, y] = destino; vuelo = null; aplicar(); return; }
    vuelo = { a: [s, x, y], b: destino, t0: performance.now(), dur: 900 };
    requestAnimationFrame(volar);
  }

  const inicio = (animado = true) => encuadrar(caja, { margen: 1.12, animado });

  function zoomEn(f, cx = w / 2, cy = h / 2) {
    parar();
    const ns = Math.min(maximo(), Math.max(minimo, s * f));
    x = cx - (cx - x) * ns / s;
    y = cy - (cy - y) * ns / s;
    s = ns;
    aplicar();
  }

  // ---------- Puntero: toque (elige) o arrastre (solo con zoom o en pleno) ----------
  let toque = null;
  let pinza = null;
  vista.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (toque?.arrastre && toque.id !== e.pointerId) return;   // segundo dedo: el arrastre sigue con el primero
    // Un toque anterior que se soltó fuera de la vista (sin captura) no deja el estado trabado: se reemplaza
    toque = { id: e.pointerId, x0: e.clientX, y0: e.clientY, px: e.clientX, py: e.clientY, arrastre: false, objetivo: e.target };
  });
  vista.addEventListener('pointermove', (e) => {
    if (!toque || e.pointerId !== toque.id) return;
    const dx = e.clientX - toque.px, dy = e.clientY - toque.py;
    toque.px = e.clientX; toque.py = e.clientY;   // se actualiza también durante el pellizco: al terminar no hay salto
    if (pinza) return;
    if (!toque.arrastre) {
      if (!(pleno || conZoom()) || Math.hypot(e.clientX - toque.x0, e.clientY - toque.y0) < 5) return;
      toque.arrastre = true;
      parar();
      vista.setPointerCapture(e.pointerId);
      vista.classList.add('es-arrastre');
    }
    x += dx; y += dy;
    aplicar();
  });
  const soltar = (e) => {
    if (!toque || e.pointerId !== toque.id) return;
    const t = toque;
    toque = null;
    vista.classList.remove('es-arrastre');
    if (e.type === 'pointerup' && !t.arrastre && !t.pinza && Math.hypot(e.clientX - t.x0, e.clientY - t.y0) < 8) alTocar(t.objetivo);
  };
  vista.addEventListener('pointerup', soltar);
  vista.addEventListener('pointercancel', soltar);
  vista.addEventListener('lostpointercapture', soltar);
  addEventListener('blur', () => { toque = null; pinza = null; vista.classList.remove('es-arrastre'); });

  // ---------- Pellizco (eventos táctiles: funciona también con touch-action pan-y) ----------
  const separacion = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  vista.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 2) return;
    e.preventDefault();
    pinza = separacion(e.touches);
    if (toque) toque.pinza = true;
    parar();
  }, { passive: false });
  vista.addEventListener('touchmove', (e) => {
    if (!pinza || e.touches.length !== 2) return;
    e.preventDefault();
    const d = separacion(e.touches), r = vista.getBoundingClientRect();
    zoomEn(d / pinza, (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left, (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top);
    pinza = d;
  }, { passive: false });
  const finPinza = (e) => { if (e.touches.length < 2) pinza = null; };
  vista.addEventListener('touchend', finPinza);
  vista.addEventListener('touchcancel', finPinza);

  // ---------- Rueda: en la página hace scroll; ctrl o cmd + rueda (y el pellizco del trackpad) hacen zoom ----------
  vista.addEventListener('wheel', (e) => {
    if (!pleno && !e.ctrlKey && !e.metaKey) { alAvisar(); return; }
    e.preventDefault();
    const r = vista.getBoundingClientRect();
    zoomEn(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016)), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  // La vista cambia de tamaño (ancho de página, pantalla completa): se vuelve a medir y quien llama re-encuadra
  let alMedir = null;
  new ResizeObserver(() => {
    const antes = [w, h];
    medir();
    if (antes[0] !== w || antes[1] !== h) (alMedir ? alMedir() : inicio(false));
  }).observe(vista);

  medir();

  return {
    encuadrar,
    inicio,
    zoomEn,
    escala: () => s,
    base: () => base,
    conZoom,
    limites: () => [minimo, maximo()],
    alRedimensionar(fn) { alMedir = fn; },
    ponerPleno(v) { pleno = v; parar(); medir(); },
  };
}
