/* San Rafael v2 · botones.js (PLAN-v2 fase 1, constructor A). Script clásico, sin dependencias.
   - B1 b-claro: el disco se abre desde el punto por donde entra el puntero (--mx, --my).
   - B5 b-flecha[data-iman]: imán de 10 px en un radio de 80 px, solo con (hover:hover) y sin reduced-motion.
   - B4 b-sol[data-control-modo]: día/noche en <html data-modo>, hora real de Paxcamán (America/Guatemala),
     localStorage "sr-modo" (dentro de try/catch) y evento window "modo:cambiado" {modo}.
   - B7 barra-lotes[data-lotes]: ← → cambian de lote; Enter o clic en el lote lo elige.
   - Demostración: [data-demo] recorre cargando > éxito > reposo.
   API: window.SRBotones = { estado(el, 'cargando'|'exito'|null), ponerModo('dia'|'noche'), horaPaxcaman(), solPaxcaman(fecha) } */
(() => {
  'use strict';

  const raiz = document.documentElement;
  const reducido = matchMedia('(prefers-reduced-motion: reduce)');
  const punteroFino = matchMedia('(hover: hover) and (pointer: fine)');
  const anuncio = () => document.getElementById('sr-anuncio');
  const decir = (texto) => { const a = anuncio(); if (a) a.textContent = texto; };

  /* ---------- Estados ---------- */
  // Los textos con [data-exito] cambian en éxito y vuelven en reposo.
  function estado(el, nuevo) {
    const textos = [...el.querySelectorAll('[data-exito]')];
    if (nuevo) el.dataset.estado = nuevo; else delete el.dataset.estado;
    if (nuevo === 'cargando') { el.setAttribute('aria-busy', 'true'); el.style.minWidth = `${el.offsetWidth}px`; }
    else el.removeAttribute('aria-busy');
    for (const t of textos) {
      if (nuevo === 'exito') { t.dataset.reposo ??= t.textContent; t.textContent = t.dataset.exito; }
      else if (t.dataset.reposo !== undefined) { t.textContent = t.dataset.reposo; delete t.dataset.reposo; }
    }
    if (!nuevo) el.style.minWidth = '';
    if (nuevo === 'cargando') decir('Cargando');
    if (nuevo === 'exito') decir(textos.map((t) => t.textContent).join('. ') || 'Listo');
  }

  const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));

  async function demostrar(el, { cargando = 1400, exito = 1800 } = {}) {
    // Un clic durante cargando o éxito no arranca otra secuencia (evita que el reposo de la primera corte la segunda).
    if (el.dataset.estado || el.getAttribute('aria-disabled') === 'true') return;
    estado(el, 'cargando');
    await espera(cargando);
    estado(el, 'exito');
    await espera(exito);
    estado(el, null);
  }

  /* ---------- B1: disco con origen en el puntero (Origin-aware animation) ---------- */
  function origen(e) {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
    e.currentTarget.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
  }

  /* ---------- B5: imán (Magnetic hover + Spring de vuelta en CSS) ---------- */
  const imanes = new Set();
  let cuadro = 0;
  function iman(e) {
    if (cuadro) return;
    cuadro = requestAnimationFrame(() => {
      cuadro = 0;
      for (const b of imanes) {
        const r = b.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        const cerca = Math.hypot(dx, dy) < 80;
        const lim = (v) => Math.max(-10, Math.min(10, v * 0.3));
        b.style.translate = cerca ? `${lim(dx).toFixed(1)}px ${lim(dy).toFixed(1)}px` : '';
      }
    });
  }
  function armarImanes() {
    const activo = punteroFino.matches && !reducido.matches;
    imanes.clear();
    document.querySelectorAll('.b-flecha[data-iman]').forEach((b) => { b.style.translate = ''; if (activo) imanes.add(b); });
    removeEventListener('pointermove', iman);
    if (activo) addEventListener('pointermove', iman, { passive: true });
  }

  /* ---------- B4: hora y luz de Paxcamán ---------- */
  const ZONA = 'America/Guatemala';
  const formato = new Intl.DateTimeFormat('es-GT', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

  const horaPaxcaman = (fecha = new Date()) => formato.format(fecha);

  // Salida y puesta del sol en Paxcamán (16.8992 N, 89.7871 O; UTC-6 sin horario de verano), en minutos locales.
  // Ecuación de NOAA (precisión de 1 a 2 minutos). ponytail: sin refracción local ni altitud; basta para día/noche.
  function solPaxcaman(fecha = new Date()) {
    const p = Object.fromEntries(partes.formatToParts(fecha).map((x) => [x.type, x.value]));
    const inicio = Date.UTC(+p.year, 0, 1), hoy = Date.UTC(+p.year, +p.month - 1, +p.day);
    const n = Math.round((hoy - inicio) / 864e5) + 1;
    const g = (2 * Math.PI / 365) * (n - 1);
    const ecuacion = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const lat = 16.8992 * Math.PI / 180, lon = -89.7871;
    const ha = Math.acos(Math.cos(90.833 * Math.PI / 180) / (Math.cos(lat) * Math.cos(decl)) - Math.tan(lat) * Math.tan(decl)) * 180 / Math.PI;
    const local = (m) => m - 6 * 60;
    return {
      sale: local(720 - 4 * (lon + ha) - ecuacion),
      pone: local(720 - 4 * (lon - ha) - ecuacion),
      ahora: (+p.hour % 24) * 60 + +p.minute,
    };
  }

  const esNocheEnPaxcaman = () => { const s = solPaxcaman(); return s.ahora < s.sale || s.ahora >= s.pone; };

  function pintarHora() {
    const hora = horaPaxcaman();
    document.querySelectorAll('[data-hora]').forEach((n) => { n.textContent = hora; });
    const invitar = raiz.dataset.modo !== 'noche' && esNocheEnPaxcaman();
    document.querySelectorAll('.b-sol[data-control-modo]').forEach((b) => {
      b.classList.toggle('b-sol--invita', invitar);
      const extra = b.querySelector('[data-invita]');
      if (extra) extra.hidden = !invitar;
    });
  }

  function leerModo() { try { return localStorage.getItem('sr-modo'); } catch { return null; } }
  function guardarModo(m) { try { localStorage.setItem('sr-modo', m); } catch { /* sin almacenamiento: el modo dura la visita */ } }

  function ponerModo(modo, { guardar = true, avisar = true } = {}) {
    if (modo !== 'dia' && modo !== 'noche') return;
    raiz.dataset.modo = modo;
    document.querySelectorAll('.b-sol[data-control-modo]').forEach((b) => {
      b.setAttribute('aria-checked', String(modo === 'noche'));
      const exito = b.querySelector('[data-exito-modo]');
      if (exito) exito.textContent = modo === 'noche' ? 'Noche · ' : 'Día · ';
    });
    if (guardar) guardarModo(modo);
    pintarHora();
    if (avisar) dispatchEvent(new CustomEvent('modo:cambiado', { detail: { modo } }));
  }

  // El botón responde en el mismo cuadro; la página cambia de hora en el siguiente. Al cambiar el modo,
  // cerca de 185 elementos arrancaban una transición de color y el teléfono repintaba la página 5 o 6 cuadros
  // seguidos (medido a CPU 6x en 390). Se terminan al instante y el cambio es un solo fundido de página
  // (View Transition) fuera de la portada; en la portada el fundido lo hace la disolución del claro.
  // Un hijo que hereda el color arranca otra transición cuando su padre termina: se repite hasta que no quede ninguna.
  function terminarTransiciones() {
    for (let vuelta = 0; vuelta < 4; vuelta++) {
      const vivas = document.getAnimations().filter((a) => a instanceof CSSTransition && a.effect && a.effect.target && !a.effect.target.closest('.b-sol'));
      if (!vivas.length) return;
      vivas.forEach((a) => a.finish());
    }
  }

  function alternarModo(b) {
    if (b.dataset.estado === 'cargando') return;
    const nuevo = raiz.dataset.modo === 'noche' ? 'dia' : 'noche';
    document.querySelectorAll('.b-sol[data-control-modo]').forEach((x) => x.setAttribute('aria-checked', String(nuevo === 'noche')));
    estado(b, 'exito');
    clearTimeout(b._fin);
    b._fin = setTimeout(() => estado(b, null), 1600);
    const aplicar = () => {
      ponerModo(nuevo);
      terminarTransiciones();
      decir(nuevo === 'noche' ? 'Modo noche' : 'Modo día');
    };
    const umbral = document.getElementById('umbral');
    const enPortada = umbral && umbral.getBoundingClientRect().bottom > innerHeight * .5;
    requestAnimationFrame(() => setTimeout(() => {
      if (document.startViewTransition && !reducido.matches && !enPortada) document.startViewTransition(aplicar);
      else aplicar();
    }, 0));
  }

  /* ---------- B7: barra de lotes (Direction-aware transition) ---------- */
  function armarBarra(barra) {
    let lotes;
    try { lotes = JSON.parse(barra.dataset.lotes); } catch { return; }
    let i = Math.max(0, lotes.findIndex((l) => l[0] === barra.dataset.inicial));
    const boton = barra.querySelector('[data-lote]');
    const txt = boton.querySelector('.b__txt');
    const area = barra.querySelector('[data-area]');
    const mover = (paso) => {
      if (barra.dataset.estado) { clearTimeout(barra._fin); estado(barra, null); } // «Elegido» nunca queda sobre otro lote
      i = (i + paso + lotes.length) % lotes.length;
      txt.textContent = `Lote ${lotes[i][0]}`;
      if (area) area.textContent = `${lotes[i][1]} m² aprox.`;
      boton.classList.remove('entra-der', 'entra-izq');
      void boton.offsetWidth; // reinicia la animación
      boton.classList.add(paso > 0 ? 'entra-der' : 'entra-izq');
      decir(`Lote ${lotes[i][0]}, ${lotes[i][1]} metros cuadrados aproximados`);
    };
    barra.querySelector('[data-paso="-1"]')?.addEventListener('click', () => mover(-1));
    barra.querySelector('[data-paso="1"]')?.addEventListener('click', () => mover(1));
    barra.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); mover(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); mover(-1); }
    });
    boton.addEventListener('click', () => {
      if (barra.dataset.estado) return;
      estado(barra, 'exito');
      barra._fin = setTimeout(() => estado(barra, null), 1600);
    });
  }

  /* ---------- Arranque ---------- */
  function iniciar() {
    const guardado = leerModo();
    if (guardado === 'dia' || guardado === 'noche') ponerModo(guardado, { guardar: false, avisar: false });

    document.querySelectorAll('.b-claro').forEach((b) => {
      b.addEventListener('pointerenter', origen);
      b.addEventListener('pointerleave', origen);
    });

    document.querySelectorAll('.b-sol[data-control-modo]').forEach((b) => b.addEventListener('click', () => alternarModo(b)));

    document.querySelectorAll('[data-demo]').forEach((el) => el.addEventListener('click', (e) => {
      if (el.tagName === 'A') e.preventDefault();
      if (el.matches('.b-chip')) {
        if (el.dataset.estado) return;
        el.setAttribute('aria-pressed', String(el.getAttribute('aria-pressed') !== 'true'));
        demostrar(el, { cargando: 500, exito: 1200 });
        return;
      }
      demostrar(el);
    }));

    document.querySelectorAll('.barra-lotes[data-lotes]').forEach(armarBarra);

    armarImanes();
    reducido.addEventListener('change', armarImanes);
    punteroFino.addEventListener('change', armarImanes);

    pintarHora();
    setInterval(pintarHora, 30000);
  }

  window.SRBotones = { estado, ponerModo, horaPaxcaman, solPaxcaman };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
