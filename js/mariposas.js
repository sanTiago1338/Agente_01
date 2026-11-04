// ============================================================
// TIAGO STORE · Mariposas y pétalos
// ============================================================
// Unas mariposas de colores pastel que cruzan la página aleteando (y se
// apartan si el mouse se les acerca), una lluvia de pétalos rosas que
// caen girando, y al tocar en cualquier lugar explotan flores de cerezo.
// Todo el año.
//
// SIN MOVER NADA Y SIN TAPAR CLICS: una sola capa fija (position:
// fixed, pointer-events: none) entre el contenido y el menú. Pasan por
// delante de las tarjetas pero por detrás del menú de arriba, de la
// barra de abajo y de las ventanas (carrito, ficha). Todo se mueve con
// transform: lo resuelve la placa de video.
//
// Menos en el celular. Con "reducir movimiento" no aparece nada. Con la
// pestaña oculta el navegador frena las animaciones solo.
//
// Se carga en la tienda, Planes, Contacto y Recargas (no en el pago ni
// en Mis compras, para no distraer).
// ============================================================
(function () {
  'use strict';

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // ---------- Los estilos (van acá: un solo archivo para todo) ----------
  const CSS = `
  .mp-capa {
    position: fixed; inset: 0; z-index: 2;
    pointer-events: none; overflow: hidden; contain: strict;
  }
  @media print { .mp-capa { display: none; } }

  /* Pétalo: cae (.mp-petalo), se mece (b) y gira en 3D (i) */
  .mp-petalo {
    position: absolute; top: -6vh; left: var(--x);
    animation: mp-cae var(--t) linear var(--d) infinite;
    will-change: transform;
  }
  .mp-petalo b {
    display: block;
    animation: mp-mece var(--m) ease-in-out var(--d) infinite alternate;
  }
  .mp-petalo i {
    display: block; width: var(--s); height: calc(var(--s) * .8);
    border-radius: 80% 0 80% 0;
    background: radial-gradient(circle at 30% 30%, #fff 0, var(--c) 58%, var(--c2) 100%);
    box-shadow: 0 1px 2px rgba(190,24,93,.15);
    opacity: var(--o);
    animation: mp-gira var(--g) linear infinite;
  }
  @keyframes mp-cae  { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(var(--dx), 114vh, 0); } }
  @keyframes mp-mece { from { transform: translateX(-22px); } to { transform: translateX(22px); } }
  @keyframes mp-gira {
    from { transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg); }
    to   { transform: rotateX(360deg) rotateY(180deg) rotateZ(360deg); }
  }

  /* Mariposa: vuela (.mp-mariposa), se aparta del mouse (.mp-huye), sube
     y baja apenas (.mp-cuerpo) y aletea (.mp-alas) */
  .mp-mariposa {
    position: absolute; left: 0; top: 0;
    animation: var(--vuelo) var(--t) ease-in-out var(--d) infinite;
    will-change: transform;
  }
  .mp-huye { transition: transform 2.4s cubic-bezier(.2,.8,.2,1); }
  .mp-huye.lejos { transition: transform .7s cubic-bezier(.2,.8,.2,1); }
  .mp-cuerpo {
    width: var(--s); height: calc(var(--s) * .8);
    animation: mp-flota 2.6s ease-in-out infinite alternate;
    filter: drop-shadow(0 3px 4px rgba(120,60,160,.18));
  }
  .mp-cuerpo svg { display: block; width: 100%; height: 100%; overflow: visible; }
  .mp-alas {
    transform-box: view-box; transform-origin: 20px 16px;
    animation: mp-aletea var(--a) ease-in-out infinite alternate;
  }
  @keyframes mp-aletea { from { transform: scaleX(1); } to { transform: scaleX(.32); } }
  @keyframes mp-flota  { from { transform: translateY(-6px) rotate(-8deg); } to { transform: translateY(6px) rotate(8deg); } }

  /* Tres recorridos distintos, de un lado al otro, con curvas */
  @keyframes mp-vuelo-1 {
    0%   { transform: translate(-12vw, 70vh) rotate(20deg); }
    25%  { transform: translate(22vw, 48vh) rotate(8deg); }
    50%  { transform: translate(48vw, 62vh) rotate(24deg); }
    75%  { transform: translate(76vw, 34vh) rotate(6deg); }
    100% { transform: translate(112vw, 46vh) rotate(18deg); }
  }
  @keyframes mp-vuelo-2 {
    0%   { transform: translate(112vw, 26vh) rotate(-20deg); }
    30%  { transform: translate(70vw, 44vh) rotate(-8deg); }
    55%  { transform: translate(44vw, 22vh) rotate(-26deg); }
    80%  { transform: translate(18vw, 52vh) rotate(-10deg); }
    100% { transform: translate(-12vw, 36vh) rotate(-18deg); }
  }
  @keyframes mp-vuelo-3 {
    0%   { transform: translate(30vw, 110vh) rotate(4deg); }
    30%  { transform: translate(40vw, 66vh) rotate(-14deg); }
    60%  { transform: translate(62vw, 40vh) rotate(16deg); }
    100% { transform: translate(84vw, -14vh) rotate(-6deg); }
  }`;

  // ---------- La mariposa, vista de arriba ----------
  // Cuatro alas en degradé (las de arriba más grandes), el cuerpo y las
  // antenas. Las alas se pliegan hacia el cuerpo (scaleX) para aletear.
  function svgMariposa(id, c1, c2, c3) {
    return `<svg viewBox="0 0 40 32" aria-hidden="true"><defs>
      <linearGradient id="mpa${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${c1}"/><stop offset=".55" stop-color="${c2}"/><stop offset="1" stop-color="${c3}"/></linearGradient>
      <linearGradient id="mpb${id}" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stop-color="${c3}"/><stop offset="1" stop-color="${c1}"/></linearGradient></defs>
      <g class="mp-alas">
        <path fill="url(#mpa${id})" d="M20 15C15 4 5 .5 2.2 6.5 0 12 9 16.8 20 16.2Z"/>
        <path fill="url(#mpa${id})" d="M20 15C25 4 35 .5 37.8 6.5 40 12 31 16.8 20 16.2Z"/>
        <path fill="url(#mpb${id})" d="M20 17C13 17.6 5.5 21 7.2 27.2 8.8 32 16.8 27 20 18.6Z"/>
        <path fill="url(#mpb${id})" d="M20 17C27 17.6 34.5 21 32.8 27.2 31.2 32 23.2 27 20 18.6Z"/>
        <circle cx="9" cy="8.5" r="1.7" fill="#fff" opacity=".7"/><circle cx="31" cy="8.5" r="1.7" fill="#fff" opacity=".7"/>
      </g>
      <ellipse cx="20" cy="17" rx="1.25" ry="6.5" fill="#4a2a55"/>
      <path d="M19.6 11C18.6 7.5 17.2 5.6 15.8 5M20.4 11C21.4 7.5 22.8 5.6 24.2 5" fill="none" stroke="#4a2a55" stroke-width=".7" stroke-linecap="round"/>
      <circle cx="15.8" cy="5" r=".8" fill="#4a2a55"/><circle cx="24.2" cy="5" r=".8" fill="#4a2a55"/>
    </svg>`;
  }

  // Rosa, lila, celeste y durazno, como la paleta de la tienda
  const COLORES = [
    ['#fbcfe8', '#f472b6', '#db2777'],
    ['#ede9fe', '#a78bfa', '#7c3aed'],
    ['#dbeafe', '#7cb8f7', '#3b82f6'],
    ['#ffe4e6', '#fda4af', '#f472b6']
  ];
  const PETALOS = [['#fbcfe8', '#f49ac1'], ['#fde2ee', '#f472b6'], ['#ffd6e7', '#f78fb8'], ['#fce7f3', '#f9a8d4']];

  // Un azar con semilla: siempre los mismos, así no "salta" en cada visita
  function azar(semilla) {
    let s = semilla >>> 0 || 1;
    return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909)) >>> 0) / 4294967296;
  }

  let mariposas = [];

  function armar() {
    if (document.querySelector('.mp-capa')) return;
    const estilo = document.createElement('style');
    estilo.textContent = CSS;
    document.head.appendChild(estilo);

    const ancho = window.innerWidth;
    const celular = ancho < 700;
    const navidad = document.documentElement.classList.contains('navidad');
    // Una lluvia de pétalos (en Navidad, unos pocos menos: ya cae nieve)
    const cuantosPetalos = (celular ? 18 : 34) - (navidad ? (celular ? 4 : 8) : 0);
    const cuantasMariposas = celular ? 2 : 4;
    const r = azar(31);

    let html = '';
    for (let i = 0; i < cuantosPetalos; i++) {
      const [c, c2] = PETALOS[i % PETALOS.length];
      const t = 14 + r() * 12;
      html += `<div class="mp-petalo" style="--x:${(r() * 100).toFixed(1)}%;--dx:${(8 + r() * 18).toFixed(1)}vw;` +
              `--t:${t.toFixed(1)}s;--d:${(-r() * t).toFixed(1)}s;--m:${(2.6 + r() * 2.4).toFixed(1)}s;` +
              `--g:${(4 + r() * 5).toFixed(1)}s;--s:${(8 + r() * 8).toFixed(1)}px;--o:${(.7 + r() * .3).toFixed(2)};` +
              `--c:${c};--c2:${c2}"><b><i></i></b></div>`;
    }
    for (let i = 0; i < cuantasMariposas; i++) {
      const [c1, c2, c3] = COLORES[i % COLORES.length];
      const t = 26 + r() * 14;
      html += `<div class="mp-mariposa" style="--vuelo:mp-vuelo-${i % 3 + 1};--t:${t.toFixed(1)}s;--d:${(-r() * t).toFixed(1)}s;` +
              `--s:${(celular ? 24 : 28) + Math.round(r() * 10)}px;--a:${(.16 + r() * .1).toFixed(2)}s">` +
              `<div class="mp-huye"><div class="mp-cuerpo">${svgMariposa(i, c1, c2, c3)}</div></div></div>`;
    }

    const capa = document.createElement('div');
    capa.className = 'mp-capa';
    capa.setAttribute('aria-hidden', 'true');
    // Suelta y sin clics desde el primer momento
    capa.style.cssText = 'position:fixed;inset:0;z-index:2;pointer-events:none;overflow:hidden';
    capa.innerHTML = html;
    document.body.appendChild(capa);
    mariposas = [...capa.querySelectorAll('.mp-huye')];
  }

  // ---------- Se apartan del mouse ----------
  // Si el puntero pasa cerca, la mariposa se corre rápido para el otro
  // lado y después vuelve despacio a su camino.
  let pendiente = null, cuadro = 0;
  function revisar() {
    cuadro = 0;
    if (!pendiente) return;
    const { x, y } = pendiente;
    mariposas.forEach(m => {
      if (m.classList.contains('lejos')) return;
      const r = m.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dx = cx - x, dy = cy - y, d = Math.hypot(dx, dy);
      if (d > 120 || !d) return;
      const k = 150 / d;
      m.style.transform = `translate(${(dx * k).toFixed(0)}px, ${(dy * k - 40).toFixed(0)}px)`;
      m.classList.add('lejos');
      setTimeout(() => { m.classList.remove('lejos'); m.style.transform = ''; }, 1400);
    });
  }
  document.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || !mariposas.length) return;
    pendiente = { x: e.clientX, y: e.clientY };
    if (!cuadro) cuadro = requestAnimationFrame(revisar);
  }, { passive: true });

  // ==========================================================
  // AL TOCAR, EXPLOTAN FLORES
  // ==========================================================
  // Donde se toque (o se haga clic) salta un ramillete de flores de
  // cerezo y pétalos que giran y caen. En los botones de comprar no:
  // ahí ya está la explosión de nieve y destellos (js/efectos.js).
  // Se dibuja en su propia capa fija encima de todo, sin clics, y solo
  // mientras hay flores en el aire. No frena ni cambia ningún clic.
  const COMPRAR = 'button.plan-comprar, #cartPagarQR, button.btn-comprar';
  const FLORES = ['#f9a8d4', '#f472b6', '#fbcfe8', '#fda4c4', '#f78fb8'];
  let lienzo = null, ctx = null, dpr = 1, flores = [], andando = false, ultimo = 0;

  function prepararLienzo() {
    if (lienzo) return;
    lienzo = document.createElement('canvas');
    lienzo.className = 'mp-flores';
    lienzo.setAttribute('aria-hidden', 'true');
    lienzo.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147482999';
    document.body.appendChild(lienzo);
    ctx = lienzo.getContext('2d');
    const medir = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      lienzo.width = Math.round(innerWidth * dpr);
      lienzo.height = Math.round(innerHeight * dpr);
    };
    medir();
    window.addEventListener('resize', medir);
  }

  const al = (a, b) => a + Math.random() * (b - a);

  // Una flor de cerezo: cinco pétalos con su muesca y el centro claro
  function dibujarFlor(f) {
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.giro);
    ctx.scale(f.r / 10, f.r / 10);
    ctx.fillStyle = f.color;
    ctx.shadowColor = 'rgba(219,39,119,.25)';
    ctx.shadowBlur = 3;
    for (let k = 0; k < 5; k++) {
      ctx.rotate(Math.PI * 2 / 5);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-6, -3, -6.5, -9, -2.2, -10.5);
      ctx.lineTo(0, -9);
      ctx.lineTo(2.2, -10.5);
      ctx.bezierCurveTo(6.5, -9, 6, -3, 0, 0);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff6d6';
    ctx.beginPath(); ctx.arc(0, 0, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f59e0b';
    for (let k = 0; k < 5; k++) {
      const a = k * Math.PI * 2 / 5 + .6;
      ctx.beginPath(); ctx.arc(Math.cos(a) * 3.6, Math.sin(a) * 3.6, .7, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // Un pétalo suelto que da vueltas en el aire (se achica de un lado al
  // girar, como si se diera vuelta)
  function dibujarPetalo(f) {
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.giro);
    ctx.scale(1, Math.max(.18, Math.abs(Math.cos(f.vuelta))));
    const g = ctx.createLinearGradient(-f.r, -f.r, f.r, f.r);
    g.addColorStop(0, '#fff');
    g.addColorStop(.45, f.color);
    g.addColorStop(1, '#ec4899');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -f.r);
    ctx.bezierCurveTo(f.r * .9, -f.r * .6, f.r * .8, f.r * .6, 0, f.r);
    ctx.bezierCurveTo(-f.r * .8, f.r * .6, -f.r * .9, -f.r * .6, 0, -f.r);
    ctx.fill();
    ctx.restore();
  }

  let ultimoCuadro = 0;
  function cuadroFlores(ahora) {
    const dt = ultimoCuadro ? Math.min(4, (ahora - ultimoCuadro) / (1000 / 60)) : 1;
    ultimoCuadro = ahora;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    flores = flores.filter(f => {
      f.vida += dt;
      const roce = Math.pow(f.roce, dt);
      f.vx *= roce; f.vy = f.vy * roce + f.g * dt;
      f.meca += .07 * dt;
      f.x += (f.vx + Math.sin(f.meca) * f.ola) * dt;
      f.y += f.vy * dt;
      f.giro += f.vgiro * dt;
      f.vuelta += .12 * dt;
      const t = f.vida / f.fin;
      ctx.globalAlpha = t < .65 ? 1 : Math.max(0, 1 - (t - .65) / .35);
      if (f.flor) dibujarFlor(f); else dibujarPetalo(f);
      ctx.globalAlpha = 1;
      return t < 1 && f.y < innerHeight + 30;
    });
    if (flores.length) requestAnimationFrame(cuadroFlores);
    else { andando = false; ultimoCuadro = 0; ctx.clearRect(0, 0, innerWidth, innerHeight); }
  }

  function explotarFlores(x, y) {
    prepararLienzo();
    const n = innerWidth < 600 ? 16 : 22;
    for (let i = 0; i < n && flores.length < 360; i++) {
      const ang = al(0, Math.PI * 2), vel = al(2, 6.5);
      const flor = i % 3 === 0;                         // una de cada tres es una flor entera
      flores.push({
        x, y, flor,
        vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel - al(1.5, 3.5),
        g: .09, roce: .955, ola: al(.2, .6), meca: al(0, 6),
        r: flor ? al(7, 11) : al(4.5, 7.5),
        giro: al(0, Math.PI * 2), vgiro: al(-.09, .09), vuelta: al(0, 3),
        vida: 0, fin: al(60, 100),
        color: FLORES[i % FLORES.length]
      });
    }
    if (!andando) { andando = true; requestAnimationFrame(cuadroFlores); }
  }

  document.addEventListener('pointerdown', e => {
    if (e.button !== undefined && e.button > 0) return;      // solo el clic principal
    if (e.target.closest && e.target.closest(COMPRAR)) return;
    if (Date.now() - ultimo < 90) return;                    // tocar seguido no satura
    ultimo = Date.now();
    explotarFlores(e.clientX, e.clientY);
  }, { capture: true, passive: true });

  if (document.body) armar();
  else document.addEventListener('DOMContentLoaded', armar);
})();
