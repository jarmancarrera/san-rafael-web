/* San Rafael v2 · selector de lotes definitivo (constructor B, PLAN-v2 fase 4, §8 y §12)
   Se monta solo en #selector-ui. Patrón Infia: lista a un lado, render al centro, ficha al otro (escritorio);
   en móvil el render arriba, la lista como camino principal y la ficha como lámina inferior con asa.
   Eventos en window:
     emite  lote:seleccionado {id, manzana, area_m2, frente_m, fondo_m, latlon} · lote:deseleccionado {}
            calculadora:lote {id, area_m2} (B8 «Simular crédito»)
     escucha modo:cambiado {modo}; el crossfade día/noche lo hace el CSS con <html data-modo>.
   API: window.SRSelector = { elegir(id), soltar(), pleno(bool), estado() } */
import { crearPlano, caja, W, H } from './plano.js';
import { crearCamara } from './camara.js';

const RAIZ = new URL('../../', import.meta.url);
const RESPALDO = { lote: 'Q XXX,XXX', cuota: 'Q Z,ZZZ/mes' };
const NOMBRE = { disponible: 'Disponible', reservado: 'Reservado', vendido: 'Vendido' };
const MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const quieto = matchMedia('(prefers-reduced-motion: reduce)');
const movil = matchMedia('(max-width: 1099px)');
const uno = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });   // Number(): un valor no numérico sale «NaN», nunca como texto crudo

async function leer(ruta, opcional = false) {
  const r = await fetch(new URL(ruta, RAIZ));
  if (!r.ok) {
    if (opcional) return {};
    throw new Error(`${ruta}: HTTP ${r.status}`);
  }
  return r.json();
}

// «c4», «C 04», «lote c-04» → C-04; «C1» → C-01 y C-10 a C-14
const normal = (q) => q.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^LOTE/, '');
function coincide(id, clave) {
  const k = id.replace('-', ''), m = clave.match(/^([A-Z])0*(\d{1,2})$/);
  return k.startsWith(clave) || (m !== null && k === m[1] + m[2].padStart(2, '0'));
}

const ICONO = {
  buscar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/></svg>',
  mas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14"/></svg>',
  menos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M5 12h14"/></svg>',
  todo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>',
  pleno: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5"/></svg>',
  salir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>',
  norte: '<svg viewBox="0 0 10 14" aria-hidden="true" focusable="false"><path d="M5 0l5 14-5-4-5 4z" fill="currentColor"/></svg>',
};

function plantilla(manzanas, opciones) {
  const chip = (mz, texto, pulsado) => `<button class="b b-chip" type="button" aria-pressed="${pulsado}" data-mz="${mz}"${mz ? ` aria-label="Manzana ${mz}"` : ''} tabindex="${pulsado ? 0 : -1}"><span class="punto" aria-hidden="true"></span><span class="b__txt">${texto}</span></button>`;
  return `
<div class="sel__lista">
  <div class="sel__filtros" role="group" aria-label="Filtrar por manzana">${chip('', 'Todas', true)}${manzanas.map((m) => chip(m, m, false)).join('')}</div>
  <div class="sel__buscar">${ICONO.buscar}
    <label class="sr-solo" for="sel-buscar">Buscar lote por número</label>
    <input class="sel__campo" id="sel-buscar" type="search" placeholder="Buscar lote, p. ej. C-04" autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="search" aria-controls="sel-opciones" aria-describedby="sel-cuenta">
  </div>
  <p class="sel__cuenta" id="sel-cuenta" aria-live="polite"></p>
  <ul class="sel__opciones" id="sel-opciones" role="listbox" tabindex="0" aria-label="Lotes" data-lenis-prevent>${opciones}</ul>
  <p class="sel__vacio" hidden></p>
</div>
<div class="sel__centro">
<figure class="sel__escena">
  <figcaption class="sr-solo">Render aéreo del condominio con sus 145 lotes. Para elegir con el teclado use la lista de lotes.</figcaption>
  <div class="sel__vista">
    <div class="sel__lienzo">
      <img class="sel__foto sel__dia" alt="" width="2400" height="1350" loading="lazy" decoding="async" draggable="false">
      <img class="sel__foto sel__noche" alt="" width="2400" height="1350" decoding="async" draggable="false">
      <svg class="sel__plano" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false"></svg>
    </div>
  </div>
  <div class="sel__ref" aria-hidden="true">
    <span class="sel__norte">${ICONO.norte}N</span>
    <span class="sel__escala"><span data-escala-txt>50 m</span><i data-escala-barra></i></span>
  </div>
  <button class="b sel__pleno" type="button" data-pleno aria-label="Pantalla completa">${ICONO.pleno}<span class="b__txt">Pantalla completa</span></button>
  <div class="sel__zoom" role="group" aria-label="Zoom del plano">
    <button class="b sel__redondo" type="button" data-zoom="mas" aria-label="Acercar">${ICONO.mas}</button>
    <button class="b sel__redondo" type="button" data-zoom="menos" aria-label="Alejar">${ICONO.menos}</button>
    <button class="b sel__redondo" type="button" data-zoom="todo" aria-label="Ver todo el conjunto">${ICONO.todo}</button>
  </div>
  <p class="sel__aviso" aria-hidden="true">${MAC ? '⌘' : 'Ctrl'} + rueda para acercar</p>
  <p class="sel__globo" aria-hidden="true"></p>
</figure>
  <div class="barra-lotes sel__barra" role="group" aria-label="Recorrer lotes de la manzana A">
    <button class="b b-flecha b-flecha--chica b-flecha--atras" type="button" aria-label="Lote anterior" data-paso="-1"><span class="ico ico--flecha" aria-hidden="true"></span></button>
    <button class="barra-lotes__lote" type="button" aria-describedby="sel-barra-area"><span class="b__txt" data-b="lote">Lote A-01</span></button>
    <span class="sr-solo" id="sel-barra-area" data-b="area"></span>
    <span class="estado-lote" data-estado-lote="disponible"><span class="punto" aria-hidden="true"></span><span class="ico ico--check b__ok" aria-hidden="true"></span><span data-b="estado" data-exito="Elegido">Disponible</span></span>
    <button class="b b-flecha b-flecha--chica" type="button" aria-label="Lote siguiente" data-paso="1"><span class="ico ico--flecha" aria-hidden="true"></span></button>
  </div>
</div>
<section class="sel__ficha" aria-label="Ficha del lote" data-lenis-prevent>
  <button class="sel__asa" type="button" aria-label="Cerrar ficha"><i></i></button>
  <div class="sel__ficha-vacia">
    <h3 class="sel__ficha-titulo sel__ficha-titulo--vacia">Ningún lote elegido</h3>
    <p class="sel__ficha-txt">Toque un lote en el render, búsquelo en la lista o recorra su manzana con la barra bajo el render.</p>
    <ul class="sel__leyenda">
      <li data-estado-lote="disponible"><span class="punto" aria-hidden="true"></span>Disponibles<b data-cuenta="disponible"></b></li>
      <li data-estado-lote="reservado"><span class="punto" aria-hidden="true"></span>Reservados<b data-cuenta="reservado"></b></li>
      <li data-estado-lote="vendido"><span class="punto" aria-hidden="true"></span>Vendidos<b data-cuenta="vendido"></b></li>
    </ul>
    <p class="sel__nota">Valores de demostración. Superficies aproximadas, medidas sobre el plano del PDF.</p>
  </div>
  <div class="sel__ficha-lote" hidden>
    <div class="sel__ficha-cab">
      <h3 class="sel__ficha-titulo" data-f="titulo">Lote</h3>
      <button class="b b-flecha b-flecha--chica sel__cerrar" type="button" aria-label="Cerrar ficha"><span class="ico ico--cerrar" aria-hidden="true"></span></button>
    </div>
    <p class="sel__ficha-meta"><span class="estado-lote" data-f="estado-caja"><span class="punto" aria-hidden="true"></span><span data-f="estado">Disponible</span></span><span data-f="mz">Manzana</span></p>
    <dl class="sel__datos">
      <div><dt>Superficie</dt><dd data-f="area"></dd></div>
      <div><dt>Frente × fondo</dt><dd data-f="medidas"></dd></div>
      <div><dt>Precio</dt><dd data-f="precio"></dd></div>
      <div><dt>Cuota desde</dt><dd data-f="cuota"></dd></div>
    </dl>
    <div class="sel__acciones">
      <a class="b b-claro" data-f="reservar" href="reservar.html"><span class="ico ico--check b__ok" aria-hidden="true"></span><span class="b__txt">Reservar este lote</span></a>
      <a class="b b-enlace" data-f="credito" href="#credito"><span class="b__txt">Simular crédito</span></a>
    </div>
    <p class="sel__nota">Valores de demostración. Superficie aproximada, medida sobre el plano del PDF.</p>
  </div>
</section>
<p class="sr-solo" aria-live="polite" data-anuncio></p>`;
}

export async function montar(raiz) {
  raiz.setAttribute('aria-busy', 'true');
  raiz.innerHTML = '<p class="sel__estado">Cargando plano de lotes</p>';
  let plano2d, datos, precios;
  try {
    [plano2d, datos, precios] = await Promise.all([leer('maqueta/lotes-2d.json'), leer('datos/lotes.json'), leer('datos/precios.json', true).catch(() => ({}))]);
  } catch {
    raiz.innerHTML = '<div class="sel__estado sel__estado--error"><p>No se pudo cargar el plano de lotes. Revise su conexión e intente de nuevo.</p><button class="b b-linea" type="button"><span class="b__txt">Reintentar</span></button></div>';
    raiz.querySelector('button').addEventListener('click', () => montar(raiz), { once: true });
    raiz.removeAttribute('aria-busy');
    return null;
  }

  // ---------- Datos ----------
  const info = new Map(datos.lotes.map((l) => [l.id, l]));
  // Solo ids con forma de lote («C-04»): son los únicos datos que entran a innerHTML
  const orden = plano2d.lotes.map((l) => l.id).filter((id) => /^[A-Z]-\d{2}$/.test(id) && info.has(id) && Number.isFinite(info.get(id).area_m2)).sort();
  const manzanas = [...new Set(orden.map((id) => id[0]))];
  const porMz = new Map(manzanas.map((m) => [m, orden.filter((id) => id[0] === m)]));
  const marcadores = { ...RESPALDO, ...(precios.marcadores || {}) };
  const estados = new Map(orden.map((id) => [id, Object.hasOwn(NOMBRE, precios.estados?.[id] ?? '') ? precios.estados[id] : 'disponible']));   // solo disponible, reservado o vendido
  const estadoDe = (id) => estados.get(id) || 'disponible';

  const opciones = orden.map((id) => {
    const m = info.get(id), e = estadoDe(id);
    const medio = e === 'disponible' ? `${uno(m.frente_m)} × ${uno(m.fondo_m)} m` : NOMBRE[e];
    return `<li class="sel__op" role="option" id="sel-op-${id}" data-id="${id}" data-estado-lote="${e}" aria-selected="false"${e === 'vendido' ? ' aria-disabled="true"' : ''} aria-label="Lote ${id}, ${uno(m.area_m2)} metros cuadrados aproximados, ${NOMBRE[e].toLowerCase()}"><span class="punto" aria-hidden="true"></span><span class="sel__op-id">${id}</span><span class="sel__op-med">${medio}</span><span class="sel__op-area">${uno(m.area_m2)} m²</span></li>`;
  }).join('');

  const sel = document.createElement('div');
  sel.className = 'sel';
  sel.innerHTML = plantilla(manzanas, opciones);
  raiz.replaceChildren(sel);
  raiz.removeAttribute('aria-busy');

  const $ = (q) => sel.querySelector(q);
  const lista = $('.sel__opciones'), buscar = $('.sel__campo'), cuenta = $('.sel__cuenta'), vacio = $('.sel__vacio');
  const chips = [...sel.querySelectorAll('.sel__filtros .b-chip')];
  const escena = $('.sel__escena'), vista = $('.sel__vista'), lienzo = $('.sel__lienzo'), svg = $('.sel__plano');
  const dia = $('.sel__dia'), noche = $('.sel__noche');
  const barra = $('.sel__barra'), bLote = barra.querySelector('.barra-lotes__lote');
  const ficha = $('.sel__ficha'), fichaVacia = $('.sel__ficha-vacia'), fichaLote = $('.sel__ficha-lote');
  const f = (k) => fichaLote.querySelector(`[data-f="${k}"]`);
  const b = (k) => barra.querySelector(`[data-b="${k}"]`);
  const botonPleno = $('[data-pleno]'), aviso = $('.sel__aviso'), globo = $('.sel__globo'), anuncio = $('[data-anuncio]');
  const zoomMas = $('[data-zoom="mas"]'), zoomMenos = $('[data-zoom="menos"]');
  const escTxt = $('[data-escala-txt]'), escBarra = $('[data-escala-barra]');
  const opcion = new Map([...lista.children].map((li) => [li.dataset.id, li]));

  for (const e of Object.keys(NOMBRE)) $(`[data-cuenta="${e}"]`).textContent = [...estados.values()].filter((v) => v === e).length;

  // ---------- Plano y cámara ----------
  const plano = crearPlano(svg, plano2d, info);
  for (const [id, e] of estados) plano.estado(id, e);
  const cajaLindero = caja(plano2d.lindero);
  const cajasMz = new Map(manzanas.map((m) => [m, caja(porMz.get(m).flatMap((id) => plano.lotes.get(id).puntos))]));

  let elegido = null, cursor = orden[0], activo = null, pleno = false;
  let filtro = { mz: '', q: '' };

  const camara = crearCamara(vista, lienzo, {
    W, H, caja: cajaLindero,
    reserva(base) {
      // La lámina inferior abierta (móvil) tapa la parte baja del render: el lote se centra en lo que queda a la vista
      if (!base && ficha.classList.contains('es-abierta') && movil.matches) {
        const r = vista.getBoundingClientRect();
        return Math.min(r.height * 0.6, Math.max(0, r.bottom - (innerHeight - ficha.offsetHeight)));
      }
      return pleno ? barra.offsetHeight + 32 : 0;   // en pantalla completa la barra va sobre la foto
    },
    alCambiar(s) {
      plano.tamanos(s);
      globo.classList.remove('es-visible');
      const m = [5, 10, 20, 25, 50, 100, 200].find((v) => v * plano.pxPorM * s >= 64) || 200;
      escTxt.textContent = `${m} m`;
      escBarra.style.width = `${(m * plano.pxPorM * s).toFixed(1)}px`;
      const [min, max] = camara ? camara.limites() : [s, Infinity];
      zoomMas.setAttribute('aria-disabled', String(s >= max * 0.999));
      zoomMenos.setAttribute('aria-disabled', String(s <= min * 1.001));
    },
    alTocar(objetivo) {
      const id = objetivo?.closest?.('[data-id]')?.dataset.id;
      if (id && plano.lotes.has(id)) elegir(id);
    },
    alAvisar() {
      if (pleno) return;
      aviso.classList.add('es-visible');
      clearTimeout(aviso._t);
      aviso._t = setTimeout(() => aviso.classList.remove('es-visible'), 1400);
    },
  });
  const volarA = (id, animado = true) => {
    const [x0, y0, x1, y1] = caja(plano.lotes.get(id).puntos), r = 150;
    camara.encuadrar([x0 - r, y0 - r, x1 + r, y1 + r], { animado });
  };
  camara.alRedimensionar(() => (elegido ? volarA(elegido, false) : camara.inicio(false)));
  camara.inicio(false);

  // Imágenes: día al entrar; noche después (o enseguida si el modo ya es noche) para que el crossfade no espere
  const cargarNoche = () => { if (!noche.getAttribute('src')) noche.src = new URL('maqueta/noche.webp', RAIZ).href; };
  dia.addEventListener('load', () => (window.requestIdleCallback || setTimeout)(cargarNoche), { once: true });
  dia.src = new URL('maqueta/dia.webp', RAIZ).href;
  if (document.documentElement.dataset.modo === 'noche') cargarNoche();
  addEventListener('modo:cambiado', (e) => { if (e.detail?.modo === 'noche') cargarNoche(); });

  // El lindero se dibuja una sola vez, al entrar el selector en pantalla
  if (!quieto.matches) {
    plano.prepararLindero();
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { plano.dibujarLindero(); io.disconnect(); }
    }, { threshold: 0.3 });
    io.observe(escena);
  }

  // ---------- Anuncios ----------
  const anunciar = (texto) => { anuncio.textContent = texto; };
  const detalle = (id) => {
    const m = info.get(id);
    return { id, manzana: m.manzana, area_m2: m.area_m2, frente_m: m.frente_m, fondo_m: m.fondo_m, latlon: m.latlon };
  };

  // ---------- Lista (listbox con aria-activedescendant) ----------
  const visibles = () => orden.map((id) => opcion.get(id)).filter((op) => !op.hidden);

  function asegurarVisible(op) {
    // Solo mueve el scroll interno de la lista, nunca el de la página
    const arriba = op.offsetTop - 4, abajo = op.offsetTop + op.offsetHeight + 4;
    if (arriba < lista.scrollTop) lista.scrollTop = arriba;
    else if (abajo > lista.scrollTop + lista.clientHeight) lista.scrollTop = abajo - lista.clientHeight;
  }

  function activar(op) {
    activo?.classList.remove('es-activo');
    activo = op;
    if (op) {
      op.classList.add('es-activo');
      lista.setAttribute('aria-activedescendant', op.id);
      asegurarVisible(op);
    } else lista.removeAttribute('aria-activedescendant');
    plano.enfocar(op && document.activeElement === lista ? op.dataset.id : null);
  }

  function filtrar(mz, q = '', { volar = false } = {}) {
    filtro = { mz, q };
    const clave = normal(q);
    let n = 0;
    for (const id of orden) {
      const ok = (!mz || id[0] === mz) && (!clave || coincide(id, clave));
      opcion.get(id).hidden = !ok;
      if (ok) n += 1;
    }
    for (const c of chips) {
      const si = c.dataset.mz === mz;
      c.setAttribute('aria-pressed', String(si));
      c.tabIndex = si ? 0 : -1;
    }
    cuenta.textContent = q ? `${n} ${n === 1 ? 'lote' : 'lotes'} para «${q.trim()}»` : mz ? `${n} lotes · manzana ${mz}` : `${n} lotes`;
    vacio.hidden = n > 0;
    if (!n) vacio.textContent = `Ningún lote coincide con «${q.trim()}». Escriba la manzana y el número, por ejemplo C-04.`;
    if (activo?.hidden) activar(null);
    lista.scrollTop = 0;
    if (!elegido && mz) { cursor = porMz.get(mz)[0]; pintarBarra(cursor); }
    if (volar) {
      if (mz) camara.encuadrar(cajasMz.get(mz), { margen: 1.3 });
      else if (!elegido) camara.inicio();
    }
  }

  chips.forEach((c) => c.addEventListener('click', () => {
    buscar.value = '';
    filtrar(c.dataset.mz, '', { volar: true });
  }));
  // Un solo alto de tabulación para los chips: ← → recorren (roving tabindex)
  $('.sel__filtros').addEventListener('keydown', (e) => {
    const i = chips.indexOf(document.activeElement);
    const destino = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: chips.length - 1 }[e.key];
    if (i < 0 || destino === undefined) return;
    e.preventDefault();
    const c = chips[(destino + chips.length) % chips.length];
    chips.forEach((x) => { x.tabIndex = x === c ? 0 : -1; });
    c.focus();
  });

  buscar.addEventListener('input', () => filtrar('', buscar.value));
  buscar.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); lista.focus(); }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const v = visibles().filter((op) => op.getAttribute('aria-disabled') !== 'true');
    const exacto = v.find((op) => op.dataset.id.replace('-', '') === normal(buscar.value)) || (v.length === 1 ? v[0] : null);
    if (exacto) elegir(exacto.dataset.id);
  });

  lista.addEventListener('focus', () => {
    const v = visibles();
    if (!activo || activo.hidden) activar(v.find((op) => op.dataset.id === elegido) || v[0] || null);
    else plano.enfocar(activo.dataset.id);
  });
  lista.addEventListener('blur', () => plano.enfocar(null));
  lista.addEventListener('keydown', (e) => {
    const v = visibles();
    if (!v.length) return;
    let i = v.indexOf(activo);
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (activo) elegir(activo.dataset.id);
      return;
    }
    const destino = { ArrowDown: Math.min(v.length - 1, i + 1), ArrowUp: Math.max(0, i - 1), Home: 0, End: v.length - 1, PageDown: Math.min(v.length - 1, i + 8), PageUp: Math.max(0, i - 8) }[e.key];
    if (destino === undefined) return;
    e.preventDefault();
    activar(v[destino]);
  });
  lista.addEventListener('click', (e) => {
    const op = e.target.closest('.sel__op');
    if (!op) return;
    activar(op);
    elegir(op.dataset.id);
  });
  lista.addEventListener('pointerover', (e) => {
    const op = e.target.closest('.sel__op');
    if (op && e.pointerType === 'mouse') plano.enfocar(op.dataset.id);
  });
  lista.addEventListener('pointerleave', () => plano.enfocar(document.activeElement === lista ? activo?.dataset.id : null));

  // ---------- Plano: hover sincronizado con la lista y globo con el lote ----------
  let hover = null;
  svg.addEventListener('pointerover', (e) => {
    const id = e.target.dataset?.id;
    hover?.classList.remove('es-hover');
    hover = id ? opcion.get(id) : null;
    hover?.classList.add('es-hover');
  });
  svg.addEventListener('pointerleave', () => { hover?.classList.remove('es-hover'); hover = null; globo.classList.remove('es-visible'); });
  vista.addEventListener('pointermove', (e) => {
    const id = e.pointerType === 'mouse' && !vista.classList.contains('es-arrastre') ? e.target.dataset?.id : null;
    globo.classList.toggle('es-visible', Boolean(id));
    if (!id) return;
    const r = escena.getBoundingClientRect(), m = info.get(id);
    globo.textContent = `Lote ${id} · ${uno(m.area_m2)} m²`;
    let gx = e.clientX - r.left + 14;
    if (gx + globo.offsetWidth > r.width - 8) gx = e.clientX - r.left - 14 - globo.offsetWidth;   // cerca del borde, a la izquierda
    globo.style.translate = `${Math.round(gx)}px ${Math.round(Math.max(8, e.clientY - r.top - 34))}px`;
  });

  // ---------- Ficha ----------
  function pintarFicha(id) {
    fichaVacia.hidden = Boolean(id);
    fichaLote.hidden = !id;
    if (!id) return;
    const m = info.get(id), e = estadoDe(id);
    f('titulo').textContent = `Lote ${id}`;
    f('mz').textContent = `Manzana ${m.manzana}`;
    f('estado-caja').dataset.estadoLote = e;
    f('estado').textContent = NOMBRE[e];
    f('area').textContent = `${uno(m.area_m2)} m² aprox.`;
    f('medidas').textContent = `${uno(m.frente_m)} × ${uno(m.fondo_m)} m`;
    f('precio').textContent = marcadores.lote;
    f('cuota').textContent = marcadores.cuota;
    const reservar = f('reservar');
    if (e === 'disponible') {
      reservar.href = `reservar.html?lote=${encodeURIComponent(id)}`;
      reservar.removeAttribute('aria-disabled');
    } else {
      reservar.removeAttribute('href');
      reservar.setAttribute('aria-disabled', 'true');
    }
    if (!quieto.matches) {
      fichaLote.classList.remove('entra');
      void fichaLote.offsetWidth;   // reinicia la entrada (Slide in + Fade, 600 ms)
      fichaLote.classList.add('entra');
    }
  }

  // B1: el disco se abre desde donde entra el puntero (botones.js arma los que existen al cargar; este nace después)
  const origen = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
    e.currentTarget.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
  };
  f('reservar').addEventListener('pointerenter', origen);
  f('reservar').addEventListener('pointerleave', origen);

  // B8: lleva a la calculadora con el lote elegido
  f('credito').addEventListener('click', (e) => {
    e.preventDefault();
    if (!elegido) return;
    if (pleno) ponerPleno(false);
    const m = info.get(elegido);
    dispatchEvent(new CustomEvent('calculadora:lote', { detail: { id: elegido, area_m2: m.area_m2 } }));
    const destino = document.getElementById('credito');
    if (!destino) return;
    if (window.lenis?.scrollTo) window.lenis.scrollTo(destino);
    else destino.scrollIntoView({ behavior: quieto.matches ? 'auto' : 'smooth', block: 'start' });
  });

  $('.sel__cerrar').addEventListener('click', () => soltar());

  // Asa de la lámina inferior (móvil): tocar cierra; arrastrar hacia abajo más de 64 px también
  const asa = $('.sel__asa');
  let arrastroAsa = false;
  asa.addEventListener('pointerdown', (e) => {
    const y0 = e.clientY, gesto = new AbortController();
    let dy = 0;
    asa.setPointerCapture(e.pointerId);
    ficha.classList.add('es-arrastre');
    const fin = () => {
      gesto.abort();   // quita las tres escuchas de este gesto
      ficha.classList.remove('es-arrastre');
      ficha.style.transform = '';
      arrastroAsa = dy > 6;
      if (dy > 64) soltar();
    };
    asa.addEventListener('pointermove', (ev) => { dy = Math.max(0, ev.clientY - y0); ficha.style.transform = `translateY(${dy}px)`; }, { signal: gesto.signal });
    asa.addEventListener('pointerup', fin, { signal: gesto.signal });
    asa.addEventListener('pointercancel', fin, { signal: gesto.signal });
  });
  asa.addEventListener('click', () => { if (!arrastroAsa) soltar(); arrastroAsa = false; });

  // ---------- Barra B7 ----------
  function pintarBarra(id, dir = 0) {
    if (barra.dataset.estado) { clearTimeout(barra._fin); window.SRBotones ? window.SRBotones.estado(barra, null) : delete barra.dataset.estado; }
    const m = info.get(id), e = estadoDe(id);
    b('lote').textContent = `Lote ${id}`;
    b('area').textContent = `${uno(m.area_m2)} m² aprox.`;
    b('estado').textContent = NOMBRE[e];
    b('estado').parentElement.dataset.estadoLote = e;
    barra.setAttribute('aria-label', `Recorrer lotes de la manzana ${id[0]}`);
    if (dir) {
      bLote.classList.remove('entra-der', 'entra-izq');
      void bLote.offsetWidth;   // Direction-aware transition (botones.css)
      bLote.classList.add(dir > 0 ? 'entra-der' : 'entra-izq');
    }
  }
  function paso(d) {
    const ids = porMz.get(cursor[0]).filter((id) => estadoDe(id) !== 'vendido');
    if (!ids.length) return;
    const i = ids.indexOf(cursor);
    elegir(ids[(Math.max(i, 0) + d + ids.length) % ids.length], { dir: d });
  }
  barra.querySelectorAll('[data-paso]').forEach((x) => x.addEventListener('click', () => paso(Number(x.dataset.paso))));
  barra.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); paso(e.key === 'ArrowRight' ? 1 : -1); }
  });
  bLote.addEventListener('click', () => {
    elegir(cursor);
    if (!window.SRBotones || barra.dataset.estado || estadoDe(cursor) !== 'disponible') return;
    window.SRBotones.estado(barra, 'exito');
    barra._fin = setTimeout(() => window.SRBotones.estado(barra, null), 1600);
  });

  // ---------- Elegir y soltar ----------
  function elegir(id, { volar = true, dir = 0 } = {}) {
    if (!opcion.has(id) || estadoDe(id) === 'vendido') return;
    const nuevo = id !== elegido;
    elegido = id;
    cursor = id;
    plano.elegir(id);
    if (opcion.get(id).hidden) { buscar.value = ''; filtrar(id[0]); }
    for (const [k, op] of opcion) op.setAttribute('aria-selected', String(k === id));
    activar(opcion.get(id));
    pintarFicha(id);
    pintarBarra(id, dir);
    ficha.classList.add('es-abierta');
    if (volar) volarA(id);
    const m = info.get(id);
    anunciar(`Lote ${id}, ${uno(m.area_m2)} metros cuadrados aproximados, ${NOMBRE[estadoDe(id)].toLowerCase()}, precio de demostración`);
    if (nuevo) dispatchEvent(new CustomEvent('lote:seleccionado', { detail: detalle(id) }));
  }

  function soltar({ volar = true } = {}) {
    if (!elegido) return;
    const teniaFoco = ficha.contains(document.activeElement);
    elegido = null;
    plano.elegir(null);
    for (const op of opcion.values()) op.setAttribute('aria-selected', 'false');
    ficha.classList.remove('es-abierta');
    pintarFicha(null);
    if (volar) camara.inicio();
    anunciar('Ficha cerrada. Ningún lote elegido.');
    dispatchEvent(new CustomEvent('lote:deseleccionado', { detail: {} }));
    if (teniaFoco) (pleno ? botonPleno : lista).focus({ preventScroll: true });
  }

  // ---------- Zoom y pantalla completa ----------
  zoomMas.addEventListener('click', () => camara.zoomEn(1.5));
  zoomMenos.addEventListener('click', () => camara.zoomEn(1 / 1.5));
  $('[data-zoom="todo"]').addEventListener('click', () => camara.inicio());

  function ponerPleno(v) {
    if (v === pleno) return;
    pleno = v;
    sel.classList.toggle('sel--pleno', v);
    document.documentElement.classList.toggle('sel-pleno-abierto', v);
    if (v) {
      sel.setAttribute('role', 'dialog');
      sel.setAttribute('aria-modal', 'true');
      sel.setAttribute('aria-label', 'Plano de lotes a pantalla completa');
      sel.setAttribute('data-lenis-prevent', '');
      window.lenis?.stop?.();
    } else {
      ['role', 'aria-modal', 'aria-label', 'data-lenis-prevent'].forEach((a) => sel.removeAttribute(a));
      window.lenis?.start?.();
    }
    botonPleno.innerHTML = v ? `${ICONO.salir}<span class="b__txt">Salir</span>` : `${ICONO.pleno}<span class="b__txt">Pantalla completa</span>`;
    botonPleno.setAttribute('aria-label', v ? 'Salir de pantalla completa' : 'Pantalla completa');
    camara.ponerPleno(v);
    if (elegido) volarA(elegido, false); else camara.inicio(false);
    botonPleno.focus({ preventScroll: true });
    anunciar(v ? 'Pantalla completa. Arrastre para mover, rueda para acercar, Escape para salir.' : 'Pantalla completa cerrada.');
  }
  botonPleno.addEventListener('click', () => ponerPleno(!pleno));

  const enfocables = () => [...sel.querySelectorAll('button, a[href], input, [tabindex="0"]')]
    .filter((n) => n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden');
  document.addEventListener('keydown', (e) => {
    if (!pleno) return;
    if (e.key === 'Escape') { e.preventDefault(); ponerPleno(false); return; }
    if (e.key !== 'Tab') return;
    const n = enfocables(), i = n.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); n[n.length - 1].focus(); }
    else if (!e.shiftKey && i === n.length - 1) { e.preventDefault(); n[0].focus(); }
  });
  // Escape dentro del selector suelta el lote (salvo que esté borrando la búsqueda)
  sel.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || pleno || !elegido) return;
    if (e.target === buscar && buscar.value) return;
    soltar();
  });

  filtrar('');
  pintarBarra(cursor);
  pintarFicha(null);

  const api = {
    elegir: (id) => elegir(id),
    soltar: () => soltar(),
    pleno: (v = true) => ponerPleno(Boolean(v)),
    estado: () => ({ elegido, pleno, filtro: { ...filtro }, escala: camara.escala(), base: camara.base(), conZoom: camara.conZoom() }),
  };
  window.SRSelector = api;
  sel.dispatchEvent(new CustomEvent('selector:listo', { bubbles: true }));
  return api;
}

const raiz = document.getElementById('selector-ui');
if (raiz) montar(raiz);
