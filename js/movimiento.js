/* San Rafael v2 · movimiento.js (PLAN-v2 fase 3, constructor A). Script clásico con defer, después de
   vendor/gsap (gsap, ScrollTrigger, SplitText) y vendor/lenis. Sin otras dependencias.

   Momento autoral: «el claro se abre». El dosel cerrado (img/bosque) deja ver el aéreo por una máscara con la
   forma del lindero real (maqueta/lotes-2d.json, lindero_simple, en píxeles del render 2400 × 1350). La foto vive
   en un lienzo de 2400 × 1350 px; la cámara es un transform del lienzo y la máscara es un <clipPath> en esas
   coordenadas al que solo se le cambia el transform (escala alrededor del centroide), nunca los vértices.

   Ramas de gsap.matchMedia(): escritorio, movil y reducido. Lenis solo con (hover:hover) and (min-width:900px).
   Cada tween o tramo lleva su nombre de animation-vocabulary en el comentario.

   API: window.SRPagina = { listo: Promise, lote(): id del lote del cierre,
        obertura: { estado: pendiente|corriendo|pausa|hecha, inicio, fin (performance.now), duracion (s), adelantada, pausada } }.
   Escucha en window: lote:seleccionado {id, ...} y lote:deseleccionado {}. */
(() => {
  'use strict';

  const raiz = document.documentElement;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const IMG = { w: 2400, h: 1350 };
  const LOTE_INICIAL = 'A-01';
  const ACCESO = [1236, 236]; // pórtico de acceso, medido sobre maqueta/dia.webp (2026-10-29); revisar si cambia la cámara

  const { gsap, ScrollTrigger, SplitText } = window;
  const hayGsap = Boolean(gsap && ScrollTrigger);
  if (!hayGsap) raiz.classList.add('sin-gsap');
  else gsap.registerPlugin(ScrollTrigger, ...(SplitText ? [SplitText] : []));

  /* ---------- Utilidades ---------- */
  const lim = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const tramo = (p, a, b) => lim((p - a) / (b - a));
  const mezcla = (a, b, t) => a + (b - a) * t;
  const suave = (t) => (t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2); // ease-in-out cúbica (un astro ya visible va de A a B)
  const sale = (t) => 1 - (1 - t) ** 3;                                      // ease-out
  const n1 = (v) => Number(v).toFixed(1);

  const ruta = (pts) => `M${pts.map((p) => `${n1(p[0])} ${n1(p[1])}`).join('L')}Z`;

  function centroide(pts) {
    let a = 0, x = 0, y = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
      const f = x0 * y1 - x1 * y0;
      a += f; x += (x0 + x1) * f; y += (y0 + y1) * f;
    }
    return a ? [x / (3 * a), y / (3 * a)] : pts[0];
  }

  function caja(pts) {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    return { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }

  const area = (pts) => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;

  function dentro([x, y], pts) {
    let ok = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ok = !ok;
    }
    return ok;
  }

  // Escala k alrededor de c para que el polígono cubra toda la pantalla bajo la cámara cam (con 8 % de margen).
  function alcance(pts, c, cam, W, H) {
    let k = 1;
    for (const sx of [0, W / 2, W]) for (const sy of [0, H / 2, H]) {
      const q = [(sx - cam.x) / cam.s, (sy - cam.y) / cam.s];
      const d = Math.hypot(q[0] - c[0], q[1] - c[1]);
      if (d < 1) continue;
      const u = [(q[0] - c[0]) / d, (q[1] - c[1]) / d];
      let r = Infinity;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const e = [b[0] - a[0], b[1] - a[1]];
        const den = u[0] * e[1] - u[1] * e[0];
        if (Math.abs(den) < 1e-9) continue;
        const w = [a[0] - c[0], a[1] - c[1]];
        const t = (w[0] * e[1] - w[1] * e[0]) / den;
        const s = (w[0] * u[1] - w[1] * u[0]) / den;
        if (t > 0 && s >= 0 && s <= 1) r = Math.min(r, t);
      }
      if (Number.isFinite(r)) k = Math.max(k, d / r);
    }
    return k * 1.08;
  }

  /* ---------- Cámaras (x, y en px de pantalla; s = px de pantalla por px del render) ---------- */
  const cubrir = (W, H) => { const s = Math.max(W / IMG.w, H / IMG.h); return { x: (W - IMG.w * s) / 2, y: (H - IMG.h * s) / 2, s }; };

  function encuadrar(W, H, b, { cx, cy, fw, fh, max = Infinity }) {
    const s = Math.min((fw * W) / b.w, (fh * H) / b.h, max);
    return { x: cx * W - s * b.cx, y: cy * H - s * b.cy, s };
  }

  // Ken Burns: acerca f veces hacia el punto p y lo lleva un tramo hacia el centro, sin descubrir bordes.
  function acercar(cam, W, H, p, f, alCentro = .45) {
    const s = cam.s * f;
    const px = cam.x + cam.s * p[0], py = cam.y + cam.s * p[1];
    const x = mezcla(px, W / 2, alCentro) - s * p[0], y = mezcla(py, H / 2, alCentro) - s * p[1];
    return { x: lim(x, W - IMG.w * s, 0), y: lim(y, H - IMG.h * s, 0), s };
  }

  // Continuity transition entre dos cámaras: el ancla viaja en línea recta y la escala cambia en logaritmo.
  function entre(a, b, t, ancla) {
    const s = a.s * (b.s / a.s) ** t;
    const pa = [a.x + a.s * ancla[0], a.y + a.s * ancla[1]], pb = [b.x + b.s * ancla[0], b.y + b.s * ancla[1]];
    return { x: mezcla(pa[0], pb[0], t) - s * ancla[0], y: mezcla(pa[1], pb[1], t) - s * ancla[1], s };
  }

  const ponerCamara = (el, c) => { el.style.transform = `translate3d(${c.x.toFixed(2)}px, ${c.y.toFixed(2)}px, 0) scale(${c.s.toFixed(5)})`; };
  const escalar = (c, k) => `translate(${n1(c[0])} ${n1(c[1])}) scale(${k.toFixed(5)}) translate(${n1(-c[0])} ${n1(-c[1])})`;

  /* ---------- Datos ---------- */
  const datos = { lindero: null, linderoSimple: null, parques: [], manzanas: {}, poligonos: new Map(), fichas: new Map() };
  const json = (url) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${url}: ${r.status}`))));
  const listo = Promise.all([json('maqueta/lotes-2d.json'), json('datos/lotes.json')]).then(([m, l]) => {
    datos.lindero = m.lindero;
    datos.linderoSimple = m.lindero_simple || m.lindero;
    datos.parques = m.parques || [];
    datos.manzanas = m.manzanas || {};
    for (const p of m.lotes) datos.poligonos.set(p.id, p.puntos);
    for (const f of l.lotes) datos.fichas.set(f.id, f);
    return datos;
  });
  listo.catch(() => raiz.classList.add('sin-datos'));

  const estado = { lote: LOTE_INICIAL };
  window.SRPagina = { listo, lote: () => estado.lote };

  /* ---------- Fotos del aéreo del claro: se piden después del dosel (no compiten con el LCP) ----------
     En móvil, las de 1200 px (dia-1200.webp: 202 KB contra 521 KB). fotoClaro se resuelve cuando la foto del
     modo actual está decodificada: la obertura la espera antes de abrir el claro. */
  let fotoLista = () => {};
  const fotoClaro = new Promise((ok) => { fotoLista = ok; });
  function cargarAereos() {
    const modo = raiz.dataset.modo === 'noche' ? 'noche' : 'dia';
    const primero = (img) => (img.classList.contains(`aereo--${modo}`) ? 0 : 1);
    const imgs = $$('.lienzo__fotos--claro [data-src]').sort((a, b) => primero(a) - primero(b));
    const chica = innerWidth < 900;
    if (!imgs.length) fotoLista();
    imgs.forEach((img, i) => setTimeout(() => {
      img.src = chica ? img.dataset.src.replace(/\.webp$/, '-1200.webp') : img.dataset.src;
      img.removeAttribute('data-src');
      if (i === 0) img.decode().catch(() => {}).then(fotoLista);
    }, i * 400));
  }
  const dosel = $('.vuelo .escena__dosel');
  if (dosel && !dosel.complete) {
    dosel.addEventListener('load', cargarAereos, { once: true });
    dosel.addEventListener('error', cargarAereos, { once: true });
  } else cargarAereos();

  /* ---------- Cierre: datos del lote elegido en el capítulo reserva ---------- */
  const reserva = {
    sec: $('#reserva'),
    lienzo: $('[data-lienzo="reserva"]'),
    mascara: $('.mascara-lote__forma'),
    trazo: $('.lote-trazo'),
    ventana: $('.ventana-trazo'),
    cotas: $('.lote-cotas'),
    geo: null,
    p: 0,
  };

  function textoLote(id) {
    const f = datos.fichas.get(id);
    const poner = (clave, v) => $$(`[data-lote="${clave}"]`, reserva.sec).forEach((n) => { n.textContent = v; });
    poner('id', id);
    if (f) {
      poner('area', n1(f.area_m2));
      poner('manzana', f.manzana);
      poner('frente', n1(f.frente_m));
      poner('fondo', n1(f.fondo_m));
    }
    const a = $('[data-reservar]', reserva.sec);
    if (a) a.href = `reservar.html?lote=${encodeURIComponent(id)}`;
  }

  // Cotas de frente y fondo (cartografía: línea de cota desplazada, líneas de extensión y remates oblicuos)
  function dibujarCotas(pts, ficha, s) {
    const g = reserva.cotas;
    if (!g) return;
    const u = 1 / s; // un px de pantalla en px del render, con la cámara final
    const c = centroide(pts);
    const lados = [[pts[0], pts[1]], [pts[1], pts[2]]];
    const largo = ([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]);
    const [corto, largoL] = largo(lados[0]) <= largo(lados[1]) ? lados : [lados[1], lados[0]];
    const valores = ficha ? [`${n1(ficha.frente_m)} m`, `${n1(ficha.fondo_m)} m`] : ['', ''];
    let svg = '';
    [[corto, valores[0]], [largoL, valores[1]]].forEach(([[a, b], txt]) => {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const t = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      let nrm = [-t[1], t[0]];
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if ((m[0] - c[0]) * nrm[0] + (m[1] - c[1]) * nrm[1] < 0) nrm = [-nrm[0], -nrm[1]];
      const o = 16 * u;
      const A = [a[0] + nrm[0] * o, a[1] + nrm[1] * o], B = [b[0] + nrm[0] * o, b[1] + nrm[1] * o];
      const rem = 5 * u; // remate a 45°
      const ob = [(t[0] + nrm[0]) * rem, (t[1] + nrm[1]) * rem];
      let ang = (Math.atan2(t[1], t[0]) * 180) / Math.PI;
      if (ang > 90) ang -= 180; if (ang <= -90) ang += 180;
      const T = [m[0] + nrm[0] * (o + 14 * u), m[1] + nrm[1] * (o + 14 * u)];
      svg += `<line x1="${n1(a[0] + nrm[0] * 4 * u)}" y1="${n1(a[1] + nrm[1] * 4 * u)}" x2="${n1(A[0] + nrm[0] * 5 * u)}" y2="${n1(A[1] + nrm[1] * 5 * u)}" stroke-width="${(u * .9).toFixed(3)}"/>`
        + `<line x1="${n1(b[0] + nrm[0] * 4 * u)}" y1="${n1(b[1] + nrm[1] * 4 * u)}" x2="${n1(B[0] + nrm[0] * 5 * u)}" y2="${n1(B[1] + nrm[1] * 5 * u)}" stroke-width="${(u * .9).toFixed(3)}"/>`
        + `<line x1="${n1(A[0])}" y1="${n1(A[1])}" x2="${n1(B[0])}" y2="${n1(B[1])}" stroke-width="${(u * 1.1).toFixed(3)}"/>`
        + `<line x1="${n1(A[0] - ob[0])}" y1="${n1(A[1] - ob[1])}" x2="${n1(A[0] + ob[0])}" y2="${n1(A[1] + ob[1])}" stroke-width="${(u * 1.4).toFixed(3)}"/>`
        + `<line x1="${n1(B[0] - ob[0])}" y1="${n1(B[1] - ob[1])}" x2="${n1(B[0] + ob[0])}" y2="${n1(B[1] + ob[1])}" stroke-width="${(u * 1.4).toFixed(3)}"/>`
        + `<text x="${n1(T[0])}" y="${n1(T[1])}" font-size="${(12 * u).toFixed(3)}" stroke-width="${(3.5 * u).toFixed(3)}" transform="rotate(${ang.toFixed(1)} ${n1(T[0])} ${n1(T[1])})">${txt}</text>`;
    });
    g.innerHTML = svg;
  }

  // Geometría del cierre para la pantalla actual y el lote actual
  function geoReserva() {
    const pts = datos.poligonos.get(estado.lote) || datos.poligonos.get(LOTE_INICIAL);
    if (!pts) return null;
    const W = innerWidth, H = innerHeight;
    const esc = W >= 900;
    const c = centroide(pts);
    const b = caja(pts);
    const ancho = cubrir(W, H);
    const lote = encuadrar(W, H, b, esc ? { cx: .64, cy: .5, fw: .2, fh: .22, max: 2.3 } : { cx: .5, cy: .28, fw: .4, fh: .19, max: 2.5 });
    // El último claro: una ventana con la forma del lote, un poco más grande que él, para verlo con su calle y sus vecinos
    return { pts, c, ancho, lote, k: alcance(pts, c, ancho, W, H), kFin: esc ? 2.2 : 2, W, H };
  }

  function prepararReserva() {
    const g = geoReserva();
    reserva.geo = g;
    if (!g || !reserva.mascara) return;
    reserva.mascara.setAttribute('d', ruta(g.pts));
    reserva.ventana.setAttribute('d', ruta(g.pts));
    reserva.trazo.setAttribute('d', ruta(g.pts));
    dibujarCotas(g.pts, datos.fichas.get(estado.lote), g.lote.s);
    pintarReserva(reserva.p);
  }

  // El claro se cierra: Mask reveal inverso (la máscara del lote encoge en escala logarítmica) + Continuity transition de cámara
  function pintarReserva(p) {
    reserva.p = p;
    const g = reserva.geo;
    if (!g) return;
    const t = suave(tramo(p, .08, .78));
    const k = g.k ** (1 - t) * g.kFin ** t;
    const cam = entre(g.ancho, g.lote, t, g.c);
    ponerCamara(reserva.lienzo, cam);
    const tr = escalar(g.c, k);
    reserva.mascara.setAttribute('transform', tr);
    reserva.ventana.setAttribute('transform', tr);
    reserva.ventana.setAttribute('stroke-width', (1.2 / (cam.s * k)).toFixed(3));
    reserva.ventana.style.opacity = (.7 * tramo(p, .45, .7)).toFixed(3);   // el borde del claro aparece al cerrarse
    reserva.trazo.setAttribute('stroke-width', (2 / cam.s).toFixed(3));
    reserva.trazo.style.opacity = tramo(p, .55, .78).toFixed(3);       // Fade in del trazo madera
    reserva.cotas.style.opacity = sale(tramo(p, .76, .9)).toFixed(3); // Fade in de las cotas
  }

  // harden: solo ids con la forma del plano (A-01 … K-15); uno que no exista en los datos vuelve a A-01
  function elegirLote(id) {
    estado.lote = typeof id === 'string' && /^[A-K]-\d{2}$/.test(id) ? id : LOTE_INICIAL;
    textoLote(estado.lote);
    listo.then(() => {
      if (!datos.poligonos.has(estado.lote)) estado.lote = LOTE_INICIAL;
      textoLote(estado.lote);
      prepararReserva();
    }).catch(() => {});
  }

  addEventListener('lote:seleccionado', (e) => elegirLote(e.detail && e.detail.id));
  // B8 «Simular crédito» del selector: B desplaza a #credito; aquí el foco pasa al título del capítulo
  addEventListener('calculadora:lote', () => $('#credito-t')?.focus({ preventScroll: true }));
  addEventListener('lote:deseleccionado', () => elegirLote(LOTE_INICIAL));

  /* ---------- Plan maestro: plano dibujado (sin foto) y cuadro de áreas que ubica cada zona ---------- */
  const figuraPlan = $('[data-plano]');

  function armarPlan() {
    if (!figuraPlan) return;
    const svg = $('.plano__svg', figuraPlan);
    const lin = datos.lindero, b = caja(lin), m = 80;
    svg.setAttribute('viewBox', `${n1(b.x0 - m)} ${n1(b.y0 - m)} ${n1(b.w + 2 * m)} ${n1(b.h + 2 * m)}`);
    $('.plano__lindero', svg).setAttribute('d', ruta(lin));
    $('.plano__borde', svg).setAttribute('d', ruta(lin));
    // Lotes agrupados por manzana (entran en ese orden)
    const porMz = {};
    let suma = 0;
    for (const [id, pts] of datos.poligonos) { (porMz[id[0]] ||= []).push(`<path d="${ruta(pts)}"/>`); suma += area(pts); }
    $('.plano__lotes', svg).innerHTML = Object.keys(porMz).sort().map((k) => `<g data-mz="${k}">${porMz[k].join('')}</g>`).join('');
    // Parques dentro del lindero: los del eje central son el parque lineal; los demás, áreas verdes (aprox.)
    const eje = b.cx;
    const dentroLin = datos.parques.filter((q) => dentro(centroide(q), lin));
    const esLineal = (q) => Math.abs(centroide(q)[0] - eje) / b.w < 0.08;
    $('[data-capa="lineal"]', svg).innerHTML = dentroLin.filter(esLineal).map((q) => `<path d="${ruta(q)}"/>`).join('');
    $('[data-capa="verdes"]', svg).innerHTML = dentroLin.filter((q) => !esLineal(q)).map((q) => `<path d="${ruta(q)}"/>`).join('');
    $('.plano__manzanas', svg).innerHTML = Object.entries(datos.manzanas).filter(([k]) => /^[A-K]$/.test(k)).map(([k, [x, y]]) => `<text x="${n1(x)}" y="${n1(y)}">${k}</text>`).join('');
    $('.plano__acceso', svg).setAttribute('transform', `translate(${ACCESO[0]} ${ACCESO[1]})`);
    $('.plano__norte', svg).setAttribute('transform', `translate(${n1(b.x1 + m * 0.45)} ${n1(b.y0 + 10)})`);
    // Escala gráfica de 50 m: px por metro con la suma de los lotes (44,442 m², lámina 4)
    const pxM = Math.sqrt(suma / 44442), L = 50 * pxM, ex = b.x0 + 10, ey = b.y1 + m * 0.55;
    const esc = $('.plano__escala', svg);
    esc.setAttribute('transform', `translate(${n1(ex)} ${n1(ey)})`);
    $('path', esc).setAttribute('d', `M0 -7V7M0 0H${n1(L)}M${n1(L)} -7V7`);
    $('text', esc).setAttribute('x', n1(L / 2));
    figuraPlan.classList.add('plano-listo');
  }

  // Cuadro de áreas: pasar o enfocar una fila ilumina su zona en el plano
  const filasZona = $$('.areas tr[data-zona]');
  function marcarZona(z) {
    if (!figuraPlan) return;
    figuraPlan.classList.toggle('activo', !!z);
    $$('.plano__capa', figuraPlan).forEach((c) => c.classList.toggle('on', c.dataset.capa === z));
    filasZona.forEach((f) => f.classList.toggle('on', f.dataset.zona === z));
  }
  filasZona.forEach((f) => {
    f.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') marcarZona(f.dataset.zona); });
    f.addEventListener('focus', () => marcarZona(f.dataset.zona));
    f.addEventListener('click', () => marcarZona(f.classList.contains('on') ? '' : f.dataset.zona));
  });
  $('.areas')?.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') marcarZona(pasoActivo); });
  $('.areas')?.addEventListener('focusout', (e) => { if (!e.currentTarget.contains(e.relatedTarget)) marcarZona(pasoActivo); });

  // Recorrido: el paso que cruza la franja media de la pantalla ilumina su zona (Scroll-triggered highlight)
  let pasoActivo = 'acceso';
  const pasos = $$('.paso');
  if (pasos.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      pasoActivo = e.target.dataset.zona;
      pasos.forEach((p) => p.classList.toggle('es-activo', p === e.target));
      marcarZona(pasoActivo);
    }), { rootMargin: '-50% 0px -35% 0px' });
    pasos.forEach((p) => io.observe(p));
  }

  /* ---------- Pilares: Hover-activated list (escritorio) y acordeón de una línea (móvil) ---------- */
  const pilares = $$('.pilar');
  const movilMQ = matchMedia('(max-width: 899.98px)');
  function activarPilar(b, alternar = false) {
    const abierto = b.getAttribute('aria-expanded') === 'true';
    if (abierto && !alternar) return;
    pilares.forEach((o) => o.setAttribute('aria-expanded', String(o === b && !(abierto && alternar))));
  }
  pilares.forEach((b) => {
    b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && !movilMQ.matches) activarPilar(b); });
    b.addEventListener('focus', () => { if (!movilMQ.matches) activarPilar(b); });
    b.addEventListener('click', () => activarPilar(b, movilMQ.matches));
  });

  /* ---------- Selector de B: si no llega, el vacío lo dice ---------- */
  addEventListener('load', () => setTimeout(() => {
    const ui = $('#selector-ui');
    if (ui && !ui.firstElementChild) $('#lotes')?.classList.add('selector-falla');
  }, 6000));

  /* ---------- Sin GSAP: estados finales y fin ---------- */
  if (!hayGsap) {
    listo.then(() => {
      armarPlan();
      prepararReserva();
      pintarReserva(1);
      pintarClaroFinal();
    }).catch(() => {});
    return;
  }

  /* =========================================================================================
     El claro se abre (ANALISIS Zacamil, versión a)
     1. Obertura de ~4 s (3 s en móvil) que corre sola desde que el dosel está decodificado: las letras del
        logo suben, el isotipo viaja a la barra, el lindero se traza sobre el dosel, el claro se abre en su sitio
        con la imagen virada que toma color y el título entra por los lados. Termina en el estado que antes daba
        el scroll al final del umbral. Cualquier gesto la adelanta (timeScale 4).
     2. Después, el scroll (claro.p de 0 a 1): el claro se abre a toda la pantalla y Ken Burns hacia el parque.
     Cada propiedad compartida se pinta como obertura × scroll, así nunca se pisan.
     ========================================================================================= */
  const vuelo = $('#vuelo');
  const reducidoMQ = matchMedia('(prefers-reduced-motion: reduce)');
  const claro = {
    lienzo: $('[data-lienzo="claro"]'),
    mascara: $('.mascara-claro__forma'),
    trazo: $('.lindero-trazo'),
    fotos: $('.lienzo__fotos--claro'),
    aereos: $$('.lienzo__fotos--claro .aereo'),
    noche: $('.lienzo__fotos--claro .aereo--noche'),
    iso: $('.umbral__iso'),
    palabra: $('.umbral__palabra'),
    marcaU: $('.umbral__marca'),
    guia: $('.umbral__guia'),
    anillo: $('.umbral__anillo'),
    texto: $('.claro__texto'),
    nota: $('.claro__nota'),
    navMarca: $('.nav__marca svg'),
    navIso: $('.nav__marca .marca-h__iso'),
    navPalabra: $('.nav__marca .marca-h__palabra'),
    geo: null,
    flip: null,
    cam: null,
    par: { x: 0, y: 0 }, // parallax del puntero, de -1 a 1
    p: 0,
  };

  // Estado de la obertura. Los valores de reposo son los del final: así el salto, el modo reducido y un
  // matchMedia que se revierte dejan la portada completa.
  const ob = { dosel: 1, trazo: 1, flip: 1, palabra: 0, navPalabra: 1, k: 1, foto: 1, color: 1, nota: 1, guia: 1 };
  const info = { estado: 'pendiente', inicio: 0, fin: 0, duracion: 0, adelantada: false, pausada: false };
  window.SRPagina.obertura = info;
  // Si este script llega tarde (el respaldo CSS ya mostró la portada a los 3.5 s), no hay obertura
  const conObertura = !reducidoMQ.matches && performance.now() < 3200;
  if (conObertura) raiz.classList.add('obertura');
  else raiz.classList.add('obertura-hecha');
  if (!conObertura) info.estado = 'hecha';
  const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
  // «Invisible» es .001 y no 0: Chrome cuenta para el LCP el primer cuadro con opacidad > 0. Así el texto del claro
  // se registra al pintarse (primer cuadro) y no cuando la obertura lo revela segundos después.
  const OCULTO = .001;
  const doselListo = Promise.race([dosel ? dosel.decode().catch(() => {}) : null, espera(2500)]);
  let fotoOk = false;
  fotoClaro.then(() => { fotoOk = true; });
  listo.catch(() => {
    // Sin datos no hay claro: la marca pasa a la barra y el texto queda visible
    raiz.classList.remove('obertura');
    raiz.classList.add('obertura-hecha');
    claro.marcaU.style.visibility = 'hidden';
    [claro.navIso, claro.navPalabra].forEach((el) => { el.style.opacity = '1'; });
  });

  // FLIP del isotipo: First (centro, grande) → Last (esquina de la barra). Medidas sin transform (offset*).
  function medirFlip() {
    const r = claro.navMarca.getBoundingClientRect();
    const u = r.width / 956;                       // unidades del viewBox horizontal (-2 -2 956 204)
    const destino = { x: r.left + (-2.4 + 2) * u, y: r.top + (-6.6 + 2) * u, w: 168 * u };
    const origen = { x: claro.iso.offsetLeft, y: claro.iso.offsetTop, w: claro.iso.offsetWidth };
    return { dx: destino.x - origen.x, dy: destino.y - origen.y, s: destino.w / origen.w };
  }

  function geoClaro(esc) {
    const pts = datos.linderoSimple;
    const W = innerWidth, H = innerHeight;
    const b = caja(pts);
    const c = centroide(pts);
    const ancho = cubrir(W, H);
    const fit = encuadrar(W, H, b, esc ? { cx: .62, cy: .52, fw: .4, fh: .8 } : { cx: .5, cy: .33, fw: .84, fh: .43 });
    const parque = datos.parques.length ? centroide(datos.parques.reduce((a, p) => (area(p) > area(a) ? p : a))) : c;
    const kb = acercar(ancho, W, H, parque, 1.18);
    return { pts, c, ancho, fit, kb, k: alcance(pts, c, ancho, W, H) };
  }

  function prepararClaro(esc) {
    claro.geo = geoClaro(esc);
    claro.flip = medirFlip();
    const { pts } = claro.geo;
    claro.mascara.setAttribute('d', ruta(pts));
    claro.trazo.setAttribute('d', ruta(pts));
    pintarClaro();
  }

  // Cámara del lienzo y dosel, con el parallax del puntero (lienzo ±6 px, dosel ±12 px, en sentidos opuestos)
  function pintarCamara() {
    const { x, y } = claro.par;
    if (claro.cam) ponerCamara(claro.lienzo, { x: claro.cam.x + x * 6, y: claro.cam.y + y * 6, s: claro.cam.s });
    if (dosel) dosel.style.transform = `translate3d(${(-x * 12).toFixed(2)}px, ${(-y * 12).toFixed(2)}px, 0) scale(${ob.dosel.toFixed(4)})`;
  }

  function pintarClaro(p = claro.p) {
    claro.p = p;

    // Marca: Shared element transition (FLIP) del isotipo hacia la barra; la palabra hace Crossfade (solo obertura)
    const f = ob.flip;
    if (claro.flip) {
      const { dx, dy, s } = claro.flip;
      claro.iso.style.transform = `translate3d(${(dx * f).toFixed(2)}px, ${(dy * f).toFixed(2)}px, 0) scale(${mezcla(1, s, f).toFixed(4)})`;
    }
    const llego = f >= 1;
    claro.iso.style.opacity = llego ? '0' : '1';
    claro.navIso.style.opacity = llego ? '1' : '0';
    if (claro.anillo && f > 0) claro.anillo.style.visibility = 'hidden';
    claro.palabra.style.opacity = ob.palabra.toFixed(3);
    claro.palabra.style.transform = `scale(${mezcla(.94, 1, ob.palabra).toFixed(4)})`;
    claro.navPalabra.style.opacity = ob.navPalabra.toFixed(3);
    claro.marcaU.style.visibility = llego && ob.palabra <= 0 ? 'hidden' : 'visible';

    // La guía late al final de la obertura y se apaga al primer tramo de scroll (Fade out)
    claro.guia.style.opacity = (ob.guia * (1 - tramo(p, 0, .05))).toFixed(3);
    // El texto del claro se retira antes de que la foto soleada llegue debajo (Fade out)
    const salida = 1 - tramo(p, .24, .32);
    claro.texto.style.opacity = salida.toFixed(3);
    claro.texto.style.visibility = salida <= 0 ? 'hidden' : 'visible';
    if (claro.nota) claro.nota.style.opacity = (ob.nota * salida).toFixed(3);

    const g = claro.geo;
    if (!g) { pintarCamara(); return; }
    // Mask reveal con el lindero: la obertura lo abre en su sitio (k de 0 a 1); el scroll lo lleva a toda la pantalla
    const t2 = suave(tramo(p, .26, .66));
    const kScroll = t2 > 0 ? g.k ** t2 : 1;
    const k = Math.max(.001, ob.k) * kScroll;
    // Cámara: encuadre del lindero → toda la foto (Continuity transition) → Ken Burns hacia el parque lineal
    const t3 = tramo(p, .66, 1);
    let cam = t3 > 0 ? entre(g.ancho, g.kb, t3, g.c) : entre(g.fit, g.ancho, t2, g.c);
    // La imagen se acerca mientras la ventana se abre (contraescala ob.foto de 1.25 a 1 alrededor del centro del
    // claro). Va en la cámara y la máscara la compensa: así la ventana en pantalla no cambia y las <img> nunca
    // llevan transform propio (si lo llevaran, Chrome las volvería a contar para el LCP al quitarlo).
    const e = ob.foto;
    if (e !== 1) {
      const px = cam.x + cam.s * g.c[0], py = cam.y + cam.s * g.c[1];
      cam = { x: px - cam.s * e * g.c[0], y: py - cam.s * e * g.c[1], s: cam.s * e };
    }
    claro.cam = cam;
    pintarCamara();
    claro.kVentana = k / e;
    claro.mascara.setAttribute('transform', escalar(g.c, claro.kVentana));
    // El lindero se traza a su tamaño real antes de que la ventana se abra (Line drawing, como el lápiz de Zacamil)
    claro.trazo.setAttribute('transform', escalar(g.c, kScroll / e));
    claro.trazo.setAttribute('stroke-width', (1.5 / (cam.s * kScroll / e)).toFixed(3));
    claro.trazo.style.strokeDashoffset = ((claro.sentido || 1) * (1 - ob.trazo)).toFixed(4);
    claro.trazo.style.opacity = (.9 * (1 - tramo(p, .26, .38))).toFixed(3);
    // La imagen entra virada y toma color después de que el lindero ya está dibujado
    claro.fotos.style.filter = ob.color >= 1 ? '' : `saturate(${mezcla(.35, 1, ob.color).toFixed(3)}) brightness(${mezcla(.9, 1, ob.color).toFixed(3)})`;
  }

  // Obertura: una línea de tiempo por carga. Curvas de Zacamil: power3 lo que viaja, power2.inOut (la cúbica
  // .645,.045,.355,1) el recorte, power1.inOut el velo de color, lineal las opacidades de entrada.
  function armarObertura(esc, conPuntero) {
    const [r1, r2] = $$('.umbral__renglon');
    const subraya = $('.umbral__subraya');
    const titulo = $$('.claro__t');
    const resto = [$('.claro__lugar'), $('.claro__cifra'), $('.claro .acciones')];
    const doselFin = conPuntero ? 1.03 : 1; // margen para el parallax del dosel (±12 px)
    const T = esc
      ? { letras: [.15, .25], dosel: 2.4, trazo: [1.9, .6], flip: [1.45, .95], palabra: [1.8, .4], navPalabra: [2.05, .35], abre: 2.5, k: 1.25, titulo: 2.6, resto: 3.3 }
      : { letras: [.15, .22], dosel: 2, trazo: [1.3, .6], flip: [1.15, .7], palabra: [1.3, .3], navPalabra: [1.55, .3], abre: 1.9, k: .9, titulo: 2.05, resto: 2.35 };
    // Sentido del trazo: en escritorio el lindero se dibuja hacia atrás para que el lado que cruza la palabra llegue
    // al final, cuando la palabra ya se fue; en móvil hacia adelante (el lado que la roza queda para el final).
    claro.sentido = esc ? -1 : 1;
    let quitarPuntero = () => {};

    const tl = gsap.timeline({ paused: true, onUpdate: () => pintarClaro(), onComplete: terminar });
    if (info.estado === 'pendiente') {
      Object.assign(ob, { dosel: 1.08, trazo: 0, flip: 0, palabra: 1, navPalabra: 0, k: 0, foto: esc ? 1.25 : 1, color: esc ? 0 : 1, nota: OCULTO, guia: 0 });
    }
    gsap.set([r1, r2, subraya], { opacity: 1 });
    tl.fromTo(ob, { dosel: 1.08 }, { dosel: doselFin, duration: T.dosel, ease: 'power3.out' }, 0);
    // Las letras suben dentro de su renglón (escritorio, una por una); en móvil cada renglón sube entero
    if (esc) {
      tl.from($$('.umbral__letra', r1), { y: 56, duration: .85, ease: 'power3.out', stagger: .03 }, T.letras[0])
        .from($$('.umbral__letra', r2), { y: 140, duration: .85, ease: 'power3.out', stagger: .03 }, T.letras[1]);
    } else {
      tl.from(r1, { y: 56, duration: 1.1, ease: 'power3.out' }, T.letras[0])
        .from(r2, { y: 140, duration: 1.1, ease: 'power3.out' }, T.letras[1]);
    }
    tl.from(subraya, { scaleX: 0, transformOrigin: '50% 50%', duration: .5, ease: 'power2.out' }, esc ? 1 : .9)
      .fromTo(ob, { trazo: 0 }, { trazo: 1, duration: T.trazo[1], ease: 'power2.inOut' }, T.trazo[0])
      .fromTo(ob, { flip: 0 }, { flip: 1, duration: T.flip[1], ease: 'power3.inOut' }, T.flip[0])
      .fromTo(ob, { palabra: 1 }, { palabra: 0, duration: T.palabra[1], ease: 'power1.inOut' }, T.palabra[0])
      .fromTo(ob, { navPalabra: 0 }, { navPalabra: 1, duration: T.navPalabra[1], ease: 'power1.out' }, T.navPalabra[0])
      // Pausa invisible: si la foto del claro no está decodificada, la escena queda quieta con el lindero dibujado
      .call(esperarFoto, null, T.abre)
      .fromTo(ob, { k: 0 }, { k: 1, duration: T.k, ease: 'power2.inOut' }, T.abre);
    if (esc) {
      tl.fromTo(ob, { foto: 1.25 }, { foto: 1, duration: T.k, ease: 'power2.inOut' }, T.abre)
        .fromTo(ob, { color: 0 }, { color: 1, duration: 1.35, ease: 'power1.inOut' }, T.abre + .05)
        // El título entra por los lados: «Condominio» desde la izquierda, «San Rafael» desde la derecha
        .fromTo(titulo[0], { x: -120 }, { x: 0, duration: 1.5, ease: 'power3.inOut' }, T.titulo)
        .fromTo(titulo[1], { x: 120 }, { x: 0, duration: 1.5, ease: 'power3.inOut' }, T.titulo)
        .fromTo(titulo, { opacity: OCULTO }, { opacity: 1, duration: 1, ease: 'none' }, T.titulo + .4);
    } else {
      tl.fromTo(titulo, { y: 24 }, { y: 0, duration: .9, ease: 'power3.out', stagger: .08 }, T.titulo)
        .fromTo(titulo, { opacity: OCULTO }, { opacity: 1, duration: .7, ease: 'none', stagger: .08 }, T.titulo);
    }
    tl.fromTo(resto, { opacity: OCULTO }, { opacity: 1, duration: esc ? .7 : .5, ease: 'none', stagger: esc ? .1 : .07 }, T.resto)
      .fromTo(ob, { nota: OCULTO }, { nota: 1, duration: esc ? .7 : .5, ease: 'none' }, T.resto + .2)
      .fromTo(ob, { guia: 0 }, { guia: 1, duration: .4, ease: 'none' }, T.resto + (esc ? .5 : .1));
    info.duracion = tl.duration();

    function esperarFoto() {
      if (fotoOk || info.estado !== 'corriendo') return;
      tl.pause();
      info.estado = 'pausa';
      info.pausada = true;
      fotoClaro.then(() => { if (info.estado === 'pausa') { info.estado = 'corriendo'; tl.play(); } });
    }

    function terminar() {
      if (info.estado !== 'hecha') { info.estado = 'hecha'; info.fin = performance.now(); }
      raiz.classList.add('obertura-hecha');
      soltarGestos();
      pintarClaro();
      if (conPuntero) quitarPuntero = arrancarPuntero();
    }

    // Cualquier gesto (rueda, toque, tecla, scroll, clic fuera de un control) la adelanta: llega sin salto seco
    const gestos = ['wheel', 'touchstart', 'keydown', 'pointerdown', 'scroll'];
    function acelerar(e) {
      if (e.type === 'pointerdown' && e.target.closest('a, button, input, select, textarea, label')) return;
      if (e.type === 'scroll' && scrollY < 4) return;
      info.adelantada = true;
      tl.timeScale(4);
      soltarGestos();
    }
    function soltarGestos() { gestos.forEach((g) => removeEventListener(g, acelerar)); }

    let vigente = true;
    if (info.estado !== 'pendiente') {
      // Ya corrió (otra rama de matchMedia) o no corresponde: estado final sin animar
      tl.progress(1, true);
      terminar();
    } else {
      pintarClaro(); // primer cuadro: solo el dosel y el isotipo
      gestos.forEach((g) => addEventListener(g, acelerar, { passive: true }));
      doselListo.then(() => {
        if (!vigente || info.estado !== 'pendiente') return;
        if (scrollY > 8) { tl.progress(1, true); terminar(); return; } // llegó con scroll (recarga, ancla): sin obertura
        info.estado = 'corriendo';
        info.inicio = performance.now();
        tl.play();
      });
    }
    return () => { vigente = false; soltarGestos(); quitarPuntero(); tl.kill(); };
  }

  // Puntero (solo hover y escritorio, solo el hero, después de la obertura): la cámara sigue al ratón con lerp .06
  function arrancarPuntero() {
    const meta = { x: 0, y: 0 };
    const mover = (e) => {
      if (e.pointerType !== 'mouse') return;
      meta.x = lim((e.clientX / innerWidth) * 2 - 1, -1, 1);
      meta.y = lim((e.clientY / innerHeight) * 2 - 1, -1, 1);
    };
    const tic = () => {
      const activo = claro.p < .001; // se apaga en cuanto empieza el scroll
      const dx = (activo ? meta.x : 0) - claro.par.x, dy = (activo ? meta.y : 0) - claro.par.y;
      if (Math.abs(dx) < .0005 && Math.abs(dy) < .0005) return;
      claro.par.x += dx * .06;
      claro.par.y += dy * .06;
      pintarCamara();
    };
    addEventListener('pointermove', mover, { passive: true });
    gsap.ticker.add(tic);
    return () => { removeEventListener('pointermove', mover); gsap.ticker.remove(tic); claro.par.x = 0; claro.par.y = 0; };
  }

  // Día ↔ noche en el claro (lección de Zacamil). Solo si la portada se ve; si no, el CSS ya dejó el modo final.
  // - Escritorio con puntero: la foto de noche se descubre con una máscara radial que crece del centro del claro
  //   hasta su vértice más lejano (o la pantalla); de noche a día, la misma máscara invertida.
  // - Táctil o angosto: fundido de opacidad de la foto de noche (compositor).
  // El dosel cambia su filtro a la par con Element.animate (botones.js termina al instante las CSSTransition del
  // cambio de modo; estas animaciones no lo son). No toca clases de <html> ni lee estilos o medidas: nada de
  // recálculos síncronos sobre toda la página.
  const tactilMQ = matchMedia('(hover: none), (max-width: 899.98px)');
  const FILTRO_DOSEL = { dia: 'brightness(.8)', noche: 'brightness(.42) saturate(.7) contrast(1.05)' }; // = pagina.css
  const CURVA_MODO = 'cubic-bezier(.45, 0, .55, 1)'; // power2.inOut
  const umbralSec = $('#umbral');
  let portadaVisible = true;
  if (umbralSec && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { portadaVisible = e.intersectionRatio >= .5; }, { threshold: [0, .5, 1] }).observe(umbralSec);
  }
  const disolucion = { anims: [], r: null };
  function disolver(modo) {
    const g = claro.geo, cam = claro.cam, el = claro.noche;
    disolucion.anims.forEach((a) => a.cancel());
    disolucion.anims = [];
    if (disolucion.r) { disolucion.r.progress(1); disolucion.r = null; }
    if (!g || !cam || !el || reducidoMQ.matches || !raiz.classList.contains('con-vuelo') || !portadaVisible) return;
    const corto = tactilMQ.matches;
    const dur = corto ? 800 : 1200;
    if (dosel) disolucion.anims.push(dosel.animate([{ filter: FILTRO_DOSEL[modo === 'noche' ? 'dia' : 'noche'] }, { filter: FILTRO_DOSEL[modo] }], { duration: dur, easing: CURVA_MODO }));
    if (corto) {
      disolucion.anims.push(el.animate([{ opacity: modo === 'noche' ? 0 : 1 }, { opacity: modo === 'noche' ? 1 : 0 }], { duration: dur, easing: CURVA_MODO }));
      return;
    }
    const W = innerWidth, H = innerHeight;
    const cx = cam.x + cam.s * g.c[0], cy = cam.y + cam.s * g.c[1];
    // Radio: hasta la esquina más lejana de lo que se ve del claro (la ventana o, si ya llena, la pantalla)
    const pantalla = Math.max(...[[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => Math.hypot(x - cx, y - cy))) / cam.s;
    const ventana = Math.max(...g.pts.map(([x, y]) => Math.hypot(x - g.c[0], y - g.c[1]))) * (claro.kVentana || 1);
    const R = Math.min(pantalla, ventana);
    el.style.setProperty('--cx', `${n1(g.c[0])}px`);
    el.style.setProperty('--cy', `${n1(g.c[1])}px`);
    el.style.setProperty('--R', `${n1(R)}px`);
    el.style.setProperty('--r', '-18%');
    el.classList.add('disuelve');
    el.classList.toggle('a-dia', modo === 'dia');
    const t = { r: -18 };
    disolucion.r = gsap.to(t, {
      r: 100, duration: dur / 1000, ease: 'power2.inOut',
      onUpdate: () => el.style.setProperty('--r', `${t.r.toFixed(2)}%`),
      onComplete: () => {
        el.classList.remove('disuelve', 'a-dia');
        ['--r', '--cx', '--cy', '--R'].forEach((v) => el.style.removeProperty(v));
      },
    });
  }
  addEventListener('modo:cambiado', (e) => disolver(e.detail && e.detail.modo));

  // Movimiento reducido o sin GSAP: el claro abierto en su sitio real (máscara a escala 1, sin escalar ni volar)
  function pintarClaroFinal() {
    const pts = datos.linderoSimple;
    if (!pts) return;
    const W = innerWidth, H = innerHeight;
    const cam = encuadrar(W, H, caja(pts), W >= 900 ? { cx: .62, cy: .52, fw: .4, fh: .8 } : { cx: .5, cy: .33, fw: .84, fh: .43 });
    ponerCamara($('[data-lienzo="claro"]'), cam);
    const mascara = $('.mascara-claro__forma'), trazo = $('.lindero-trazo');
    mascara.setAttribute('d', ruta(pts));
    mascara.removeAttribute('transform');
    trazo.setAttribute('d', ruta(pts));
    trazo.removeAttribute('transform');
    trazo.setAttribute('stroke-width', (1.5 / cam.s).toFixed(3));
    trazo.style.strokeDashoffset = '0';
  }

  /* =========================================================================================
     gsap.matchMedia(): escritorio, móvil y reducido
     ========================================================================================= */
  const mm = gsap.matchMedia();
  const titulos = $$('[data-titulo]');

  mm.add({
    escritorio: '(min-width: 900px) and (prefers-reduced-motion: no-preference)',
    movil: '(max-width: 899.98px) and (prefers-reduced-motion: no-preference)',
    reducido: '(prefers-reduced-motion: reduce)',
    suave: '(hover: hover) and (min-width: 900px) and (prefers-reduced-motion: no-preference)',
  }, (ctx) => {
    const { escritorio, movil, reducido, suave: conLenis } = ctx.conditions;
    const enMovimiento = escritorio || movil;
    const quitar = [];

    /* ----- Lenis: solo escritorio con puntero fino ----- */
    let lenis = null;
    if (conLenis && window.Lenis) {
      lenis = new window.Lenis({ anchors: true, lerp: .11, wheelMultiplier: .9 });
      lenis.on('scroll', ScrollTrigger.update);
      const tic = (t) => lenis.raf(t * 1000);
      gsap.ticker.add(tic);
      gsap.ticker.lagSmoothing(0);
      window.lenis = lenis;
      quitar.push(() => { gsap.ticker.remove(tic); gsap.ticker.lagSmoothing(500, 33); lenis.destroy(); window.lenis = undefined; });
    }

    /* ----- Barra: sin fondo sobre las fotos; punto de luz en el capítulo actual ----- */
    const nav = $('.nav');
    const sobre = new Set();
    const marcar = (id, on) => { if (on) sobre.add(id); else sobre.delete(id); nav.dataset.sobre = sobre.size ? 'foto' : 'lamina'; };
    ScrollTrigger.create({ trigger: '#vuelo', start: 'top bottom', end: () => `bottom ${nav.offsetHeight}px`, onToggle: (s) => marcar('vuelo', s.isActive) });
    ScrollTrigger.create({ trigger: '#reserva', start: () => `top ${nav.offsetHeight}px`, end: 'bottom top', onToggle: (s) => marcar('reserva', s.isActive) });
    for (const id of ['plan', 'lotes', 'reserva']) {
      const pildora = $(`.nav__pildora[data-ir="${id}"]`);
      ScrollTrigger.create({ trigger: `#${id}`, start: 'top 55%', end: 'bottom 45%', onToggle: (s) => (s.isActive ? pildora.setAttribute('aria-current', 'true') : pildora.removeAttribute('aria-current')) });
    }
    // Barra inferior móvil: entra (Slide in) al dejar el claro
    ScrollTrigger.create({ trigger: '#plan', start: 'top 85%', onToggle: (s) => raiz.classList.toggle('con-barra', s.isActive || s.progress > 0), end: 'max' });

    /* ----- Datos listos: plan, claro y cierre ----- */
    let vivo = true;
    quitar.push(() => { vivo = false; });
    listo.then(() => {
      if (!vivo) return;
      ctx.add(() => {
        armarPlan();
        reserva.p = enMovimiento ? 0 : 1;
        prepararReserva();

        if (reducido) {
          // Sin obertura, sin pin ni scrub: el primer cuadro ya es el final (claro abierto en su sitio, lindero trazado,
          // título visible y logo en la barra, por CSS) con un fundido de 300 ms. El cierre ya está cerrado sobre el lote.
          info.estado = 'hecha';
          raiz.classList.add('obertura-hecha');
          pintarClaroFinal();
          pintarReserva(1);
          vuelo.classList.add('claro-cerrado');
          requestAnimationFrame(() => requestAnimationFrame(() => vuelo.classList.remove('claro-cerrado')));
          quitar.push(() => vuelo.classList.remove('claro-cerrado'));
          return;
        }

        /* El claro se abre: obertura temporal (Mask reveal, FLIP del logo, Line drawing) y después
           Scroll-driven animation hasta toda la foto y Ken Burns */
        raiz.classList.add('con-vuelo');
        quitar.push(() => {
          raiz.classList.remove('con-vuelo');
          [claro.iso, claro.palabra, claro.texto, claro.guia, claro.navIso, claro.navPalabra, claro.marcaU, claro.nota, claro.fotos, dosel, ...claro.aereos].forEach((el) => el && el.removeAttribute('style'));
        });
        prepararClaro(escritorio);
        const progClaro = { p: 0 };
        gsap.to(progClaro, {
          p: 1,
          ease: 'none',
          onUpdate: () => pintarClaro(progClaro.p),
          scrollTrigger: { trigger: vuelo, start: 'top top', end: 'bottom bottom', scrub: escritorio ? .7 : .4, onRefresh: () => prepararClaro(escritorio) },
        });
        quitar.push(armarObertura(escritorio, conLenis));

        /* El claro se cierra sobre su lote: Mask reveal inverso + Scroll-driven animation */
        const progLote = { p: 0 };
        gsap.to(progLote, {
          p: 1,
          ease: 'none',
          onUpdate: () => pintarReserva(progLote.p),
          scrollTrigger: { trigger: reserva.sec, start: 'top top', end: 'bottom bottom', scrub: escritorio ? .7 : .4, onRefresh: prepararReserva },
        });

        /* Plan: Line drawing del lindero + Stagger de manzanas, una vez al entrar */
        if (figuraPlan) {
          const borde = $('.plano__borde', figuraPlan);
          const manzanas = $$('.plano__lotes g', figuraPlan);
          const resto = [...$$('.plano__parques', figuraPlan), $('.plano__manzanas', figuraPlan), $('.plano__acceso', figuraPlan)];
          gsap.set(borde, { strokeDasharray: 1, strokeDashoffset: 1 });
          gsap.set([...manzanas, ...resto], { autoAlpha: 0 });
          gsap.timeline({ scrollTrigger: { trigger: figuraPlan, start: 'top 72%', once: true } })
            .to(borde, { strokeDashoffset: 0, duration: 1.4, ease: 'power2.inOut' })                       // Line drawing
            .to(manzanas, { autoAlpha: 1, duration: .45, ease: 'power1.out', stagger: .07 }, .5)            // Stagger por manzana
            .to(resto, { autoAlpha: 1, duration: .5, ease: 'power1.out', stagger: .1 }, 1.1);               // Fade in
        }
      });
    }).catch(() => {});

    if (reducido) return () => quitar.forEach((f) => f());

    /* ----- Paseo: Pinned horizontal scroll (solo escritorio; en móvil la rejilla vertical) ----- */
    if (escritorio) {
      const sec = $('#paseo');
      const pista = $('.paseo__pista', sec);
      const ventana = $('.paseo__ventana', sec);
      const avance = $('.paseo__avance i', sec);
      raiz.classList.add('con-paseo');
      const recorrido = () => Math.max(0, pista.scrollWidth - ventana.clientWidth);
      const medir = () => sec.style.setProperty('--recorrido', `${recorrido()}px`);
      medir();
      ScrollTrigger.addEventListener('refreshInit', medir);
      quitar.push(() => { ScrollTrigger.removeEventListener('refreshInit', medir); raiz.classList.remove('con-paseo'); sec.style.removeProperty('--recorrido'); });
      gsap.timeline({ scrollTrigger: { trigger: sec, start: 'top top', end: 'bottom bottom', scrub: .6, invalidateOnRefresh: true } })
        .to(pista, { x: () => -recorrido(), ease: 'none' }, 0)  // Translate ligado al scroll
        .to(avance, { scaleX: 1, ease: 'none' }, 0);            // barra de avance de 1 px
    }

    /* ----- Lugar: Ken Burns leve sobre las palmeras ----- */
    const fotoLugar = $('.lugar__foto img');
    if (fotoLugar) {
      gsap.fromTo(fotoLugar, { scale: 1.1 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: '.lugar__foto', start: 'top bottom', end: 'bottom top', scrub: .5 } });
    }

    /* ----- Títulos: Reveal por palabra con máscara (SplitText), 40 ms de stagger, una vez por capítulo ----- */
    if (SplitText) {
      document.fonts.ready.then(() => {
        if (!vivo) return;
        ctx.add(() => {
          titulos.forEach((el) => {
            const partes = SplitText.create(el, { type: 'words', mask: 'words', wordsClass: 'palabra' });
            const disparo = { trigger: el, start: 'top 86%', once: true }; // el título del claro lo trae la obertura
            gsap.from(partes.words, { yPercent: 108, duration: .9, ease: 'expo.out', stagger: .04, scrollTrigger: disparo });
          });
        });
        ScrollTrigger.refresh();
      });
    }

    return () => quitar.forEach((f) => f());
  });

  // Al cambiar de tamaño la geometría se recalcula en el refresh de ScrollTrigger (onRefresh de cada escena).
})();
