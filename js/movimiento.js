/* San Rafael v2 · movimiento.js (PLAN-v2 fase 3, constructor A). Script clásico con defer, después de
   vendor/gsap (gsap, ScrollTrigger, SplitText) y vendor/lenis. Sin otras dependencias.

   Momento autoral: «el claro se abre». El dosel cerrado (img/bosque) deja ver el aéreo por una máscara con la
   forma del lindero real (maqueta/lotes-2d.json, lindero_simple, en píxeles del render 2400 × 1350). La foto vive
   en un lienzo de 2400 × 1350 px; la cámara es un transform del lienzo y la máscara es un <clipPath> en esas
   coordenadas al que solo se le cambia el transform (escala alrededor del centroide), nunca los vértices.

   Ramas de gsap.matchMedia(): escritorio, movil y reducido. Lenis solo con (hover:hover) and (min-width:900px).
   Cada tween o tramo lleva su nombre de animation-vocabulary en el comentario.

   API: window.SRPagina = { listo: Promise, lote(): id del lote del cierre }.
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

  /* ---------- Fotos del aéreo del claro: se piden después del dosel (no compiten con el LCP) ---------- */
  function cargarAereos() {
    const modo = raiz.dataset.modo === 'noche' ? 'noche' : 'dia';
    const primero = (img) => (img.classList.contains(`aereo--${modo}`) ? 0 : 1);
    const imgs = $$('.lienzo__fotos--claro [data-src]').sort((a, b) => primero(a) - primero(b));
    imgs.forEach((img, i) => setTimeout(() => { img.src = img.dataset.src; img.removeAttribute('data-src'); }, i * 400));
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
  $('.areas')?.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') marcarZona(''); });
  $('.areas')?.addEventListener('focusout', (e) => { if (!e.currentTarget.contains(e.relatedTarget)) marcarZona(''); });

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
     El claro se abre
     ========================================================================================= */
  const vuelo = $('#vuelo');
  const claro = {
    lienzo: $('[data-lienzo="claro"]'),
    mascara: $('.mascara-claro__forma'),
    trazo: $('.lindero-trazo'),
    iso: $('.umbral__iso'),
    palabra: $('.umbral__palabra'),
    marcaU: $('.umbral__marca'),
    linea: $('.umbral__linea'),
    guia: $('.umbral__guia'),
    anillo: $('.umbral__anillo'),
    texto: $('.claro__texto'),
    nota: $('.claro__nota'),
    navMarca: $('.nav__marca svg'),
    navIso: $('.nav__marca .marca-h__iso'),
    navPalabra: $('.nav__marca .marca-h__palabra'),
    geo: null,
    p: 0,
  };

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
    const total = vuelo.offsetHeight - H;
    const u = lim($('#umbral').offsetHeight / Math.max(1, total), .2, .8);
    return { pts, c, ancho, fit, kb, k: alcance(pts, c, ancho, W, H), u, flip: medirFlip() };
  }

  function prepararClaro(esc) {
    claro.geo = geoClaro(esc);
    claro.mascara.setAttribute('d', ruta(claro.geo.pts));
    claro.trazo.setAttribute('d', ruta(claro.geo.pts));
    pintarClaro(claro.p);
  }

  function pintarClaro(p) {
    claro.p = p;
    const g = claro.geo;
    if (!g) return;
    const { u } = g;
    const despues = 1 - u;
    const fin = {
      flip: u * .92,
      retiene: u + despues * .24,
      textoFuera: u + despues * .32,
      abre: [u + despues * .26, u + despues * .66],
    };

    // Umbral: la línea y la guía se apagan al primer gesto (Fade out)
    const fuera = 1 - tramo(p, 0, .05);
    claro.linea.style.opacity = fuera.toFixed(3);
    claro.guia.style.opacity = fuera.toFixed(3);
    if (claro.anillo && p > .01) claro.anillo.style.visibility = 'hidden';

    // Shared element transition (FLIP) del isotipo hacia la barra; la palabra hace Crossfade
    const f = suave(tramo(p, .02, fin.flip));
    const { dx, dy, s } = g.flip;
    claro.iso.style.transform = `translate3d(${(dx * f).toFixed(2)}px, ${(dy * f).toFixed(2)}px, 0) scale(${mezcla(1, s, f).toFixed(4)})`;
    const llego = p >= fin.flip;
    claro.iso.style.opacity = llego ? '0' : '1';
    claro.navIso.style.opacity = llego ? '1' : '0';
    claro.palabra.style.opacity = (1 - tramo(p, .02, u * .34)).toFixed(3);
    claro.palabra.style.transform = `scale(${mezcla(1, .94, tramo(p, .02, u * .34)).toFixed(4)})`;
    claro.navPalabra.style.opacity = tramo(p, u * .6, fin.flip).toFixed(3);
    claro.marcaU.style.visibility = p >= 1 ? 'hidden' : 'visible';

    // Mask reveal con el lindero: el claro aparece en su sitio real (k de 0 a 1), luego se abre a toda la pantalla
    const t1 = suave(tramo(p, u * .1, u));
    const t2 = suave(tramo(p, fin.abre[0], fin.abre[1]));
    const k = t2 > 0 ? g.k ** t2 : Math.max(.001, t1);
    // Cámara: encuadre del lindero → toda la foto (Continuity transition) → Ken Burns hacia el parque lineal
    const t3 = tramo(p, fin.abre[1], 1);
    const cam = t3 > 0 ? entre(g.ancho, g.kb, t3, g.c) : entre(g.fit, g.ancho, t2, g.c);
    ponerCamara(claro.lienzo, cam);
    const tr = escalar(g.c, k);
    claro.mascara.setAttribute('transform', tr);
    claro.trazo.setAttribute('transform', tr);
    claro.trazo.setAttribute('stroke-width', (1.5 / (cam.s * k)).toFixed(3));
    // Line drawing del lindero (stroke-dashoffset) y Fade out cuando el claro ya llena la pantalla
    claro.trazo.style.strokeDashoffset = (1 - suave(tramo(p, u * .3, u * 1.02))).toFixed(4);
    claro.trazo.style.opacity = (.9 * (1 - tramo(p, fin.abre[0], fin.abre[0] + despues * .12))).toFixed(3);

    // El texto del claro se retira antes de que la foto soleada llegue debajo (Fade out)
    const salida = 1 - tramo(p, fin.retiene, fin.textoFuera);
    claro.texto.style.opacity = salida.toFixed(3);
    claro.texto.style.visibility = salida <= 0 ? 'hidden' : 'visible';
    if (claro.nota) claro.nota.style.opacity = salida.toFixed(3);
  }

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
          // Sin pin ni scrub: el umbral es el dosel cerrado; al llegar al claro aparece (Crossfade) en su tamaño real.
          // El logo pasa a la barra con un Crossfade, sin viajar. El cierre ya está cerrado sobre el lote.
          pintarClaroFinal();
          pintarReserva(1);
          vuelo.classList.add('claro-cerrado');
          const navLogo = [claro.navIso, claro.navPalabra];
          gsap.set(navLogo, { opacity: 0 });
          ScrollTrigger.create({
            trigger: '#claro', start: 'top 65%', end: 'max',
            onToggle: (s) => { vuelo.classList.toggle('claro-cerrado', !s.isActive); gsap.set(navLogo, { opacity: s.isActive ? 1 : 0 }); },
          });
          quitar.push(() => { vuelo.classList.remove('claro-cerrado'); navLogo.forEach((el) => el.removeAttribute('style')); });
          return;
        }

        /* El claro se abre: Mask reveal + Scroll-driven animation, con Shared element transition del logo y Ken Burns */
        raiz.classList.add('con-vuelo');
        quitar.push(() => {
          raiz.classList.remove('con-vuelo');
          [claro.iso, claro.palabra, claro.texto, claro.linea, claro.guia, claro.navIso, claro.navPalabra, claro.marcaU, claro.nota].forEach((el) => el && el.removeAttribute('style'));
        });
        prepararClaro(escritorio);
        const progClaro = { p: 0 };
        gsap.to(progClaro, {
          p: 1,
          ease: 'none',
          onUpdate: () => pintarClaro(progClaro.p),
          scrollTrigger: { trigger: vuelo, start: 'top top', end: 'bottom bottom', scrub: escritorio ? .7 : .4, onRefresh: () => prepararClaro(escritorio) },
        });

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
            const disparo = el.id === 'claro-t' ? { trigger: '#claro', start: 'top 72%', once: true } : { trigger: el, start: 'top 86%', once: true };
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
