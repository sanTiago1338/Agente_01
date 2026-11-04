// ============================================================
// TIAGO STORE · Efectos
// ============================================================
// Los detalles que hacen sentir la tienda viva, todo el año:
//
//   1. AL COMPRAR, UNA EXPLOSIÓN. Al tocar "Añadir al carrito", "Pagar
//      con QR" o "Comprar ahora" salen del botón copos de nieve y
//      destellos dorados en Navidad, y destellos rosas y dorados el resto
//      del año, con una onda de luz.
//   2. INCLINACIÓN 3D. La foto de la ficha y las tarjetas se inclinan
//      siguiendo el puntero, con un brillo de luz que lo acompaña y la
//      foto que se mueve apenas por dentro (profundidad). Solo con mouse.
//   3. EL CARRITO LATE. Cuando sube el número del carrito, el globito
//      salta.
//   4. EN NAVIDAD, EL LOGO BRILLA. Al pasar el puntero por el logo saltan
//      unos destellos dorados.
//
// SIN MOVER NADA: la explosión se dibuja en una capa fija encima de
// todo (un <canvas> sin clics) y lo demás es transform, que no corre a
// nadie. No cambia ningún clic: solo mira, no frena nada.
//
// Con "reducir movimiento" no hay nada de esto. Los estilos están en
// css/premium.css (EFECTOS).
// ============================================================
(function () {
  'use strict';

  const quieto = window.matchMedia('(prefers-reduced-motion: reduce)');
  const conMouse = window.matchMedia('(hover: hover) and (pointer: fine)');
  const raiz = document.documentElement;
  const esNavidad = () => raiz.classList.contains('navidad');

  // ==========================================================
  // 1. LA EXPLOSIÓN
  // ==========================================================
  // Los botones que compran. "Consultar por WhatsApp" (un enlace) y
  // "Agotado" (apagado) no.
  const COMPRAR = 'button.plan-comprar, #cartPagarQR, button.btn-comprar';

  let lienzo = null, ctx = null, dpr = 1, particulas = [], ondas = [], andando = false;

  function prepararLienzo() {
    if (lienzo) return;
    lienzo = document.createElement('canvas');
    lienzo.className = 'fx-lienzo';
    lienzo.setAttribute('aria-hidden', 'true');
    // Suelta y sin clics desde el primer momento, aunque el CSS no llegara
    lienzo.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483000';
    document.body.appendChild(lienzo);
    ctx = lienzo.getContext('2d');
    medir();
    window.addEventListener('resize', medir);
  }
  function medir() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    lienzo.width = Math.round(innerWidth * dpr);
    lienzo.height = Math.round(innerHeight * dpr);
  }

  const azar = (a, b) => a + Math.random() * (b - a);

  // Las paletas: nieve y oro en Navidad, rosa y oro el resto del año
  function paleta() {
    return esNavidad()
      ? { copo: ['#ffffff', '#eaf3fc', '#d7e8f8'], borde: 'rgba(120,160,205,.75)',
          brillo: ['#ffd978', '#f0b429', '#ffe7a3', '#ffffff'], onda: 'rgba(240,180,41,' }
      : { copo: null, borde: null,
          brillo: ['#f9a8d4', '#f472b6', '#ffd978', '#ffffff', '#fbcfe8'], onda: 'rgba(244,114,182,' };
  }

  function explotar(x, y, fuerza) {
    if (quieto.matches) return;
    prepararLienzo();
    const p = paleta();
    const n = Math.round(fuerza);
    for (let i = 0; i < n; i++) {
      const ang = azar(0, Math.PI * 2);
      const vel = azar(3.2, 9.5);
      const nieve = p.copo && i % 3 !== 0;            // en Navidad, 2 de cada 3 son copos
      particulas.push({
        x, y,
        vx: Math.cos(ang) * vel,
        vy: Math.sin(ang) * vel - azar(2.5, 5.5),      // salen un poco hacia arriba
        g: nieve ? .1 : .17,                            // la nieve cae más lenta
        roce: nieve ? .955 : .965,
        r: nieve ? azar(4, 8.5) : azar(3, 6.5),
        giro: azar(0, Math.PI), vgiro: azar(-.18, .18),
        vida: 0, fin: azar(55, 95),
        tipo: nieve ? 'copo' : (i % 4 === 0 ? 'punto' : 'destello'),
        color: nieve ? p.copo[i % p.copo.length] : p.brillo[i % p.brillo.length],
        borde: p.borde,
        meca: azar(0, Math.PI * 2)
      });
    }
    ondas.push({ x, y, r: 6, vida: 0, color: p.onda });
    if (!andando) { andando = true; requestAnimationFrame(cuadro); }
  }

  function dibujarCopo(q) {
    ctx.save();
    ctx.translate(q.x, q.y);
    ctx.rotate(q.giro);
    ctx.strokeStyle = q.color;
    ctx.lineWidth = Math.max(1.1, q.r / 4.5);
    ctx.lineCap = 'round';
    ctx.shadowColor = q.borde;
    ctx.shadowBlur = 3;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3, c = Math.cos(a), s = Math.sin(a);
      ctx.moveTo(0, 0); ctx.lineTo(c * q.r, s * q.r);
      // Las ramitas de cada brazo
      const m = q.r * .55, b = q.r * .32;
      ctx.moveTo(c * m, s * m); ctx.lineTo(c * m + Math.cos(a + .7) * b, s * m + Math.sin(a + .7) * b);
      ctx.moveTo(c * m, s * m); ctx.lineTo(c * m + Math.cos(a - .7) * b, s * m + Math.sin(a - .7) * b);
    }
    ctx.stroke();
    ctx.restore();
  }

  function dibujarDestello(q) {
    const r = q.r, f = r * .28;
    ctx.save();
    ctx.translate(q.x, q.y);
    ctx.rotate(q.giro);
    ctx.fillStyle = q.color;
    ctx.shadowColor = q.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.quadraticCurveTo(f, -f, r, 0);
    ctx.quadraticCurveTo(f, f, 0, r);
    ctx.quadraticCurveTo(-f, f, -r, 0);
    ctx.quadraticCurveTo(-f, -f, 0, -r);
    ctx.fill();
    ctx.restore();
  }

  // Por tiempo, no por cuadros: en un celular que se traba la nieve
  // salta un poco, pero se va a la misma hora (1 = un cuadro a 60 por
  // segundo)
  let ultimoCuadro = 0;
  function cuadro(ahora) {
    const dt = ultimoCuadro ? Math.min(4, (ahora - ultimoCuadro) / (1000 / 60)) : 1;
    ultimoCuadro = ahora;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);

    // La onda de luz que sale del botón
    ondas = ondas.filter(o => {
      o.vida += dt;
      o.r += (90 - o.r) * (1 - Math.pow(.88, dt));
      const a = Math.max(0, 1 - o.vida / 32);
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.strokeStyle = o.color + (a * .55).toFixed(3) + ')';
      ctx.lineWidth = 2.5 * a + .5;
      ctx.stroke();
      return a > 0;
    });

    particulas = particulas.filter(q => {
      q.vida += dt;
      const roce = Math.pow(q.roce, dt);
      q.vx *= roce; q.vy = q.vy * roce + q.g * dt;
      if (q.tipo === 'copo') { q.meca += .08 * dt; q.vx += Math.sin(q.meca) * .06 * dt; }
      q.x += q.vx * dt; q.y += q.vy * dt;
      q.giro += q.vgiro * dt;
      const t = q.vida / q.fin;
      ctx.globalAlpha = t < .7 ? 1 : Math.max(0, 1 - (t - .7) / .3);
      if (q.tipo === 'copo') dibujarCopo(q);
      else if (q.tipo === 'destello') dibujarDestello(q);
      else { ctx.beginPath(); ctx.arc(q.x, q.y, q.r * .45, 0, Math.PI * 2); ctx.fillStyle = q.color; ctx.fill(); }
      ctx.globalAlpha = 1;
      return t < 1 && q.y < innerHeight + 40;
    });

    if (particulas.length || ondas.length) requestAnimationFrame(cuadro);
    else { andando = false; ultimoCuadro = 0; ctx.clearRect(0, 0, innerWidth, innerHeight); }
  }

  // Solo mira el clic: no lo frena ni lo cambia (fase de captura, pasivo)
  document.addEventListener('click', e => {
    const boton = e.target.closest && e.target.closest(COMPRAR);
    if (!boton || boton.disabled) return;
    const r = boton.getBoundingClientRect();
    // Desde donde se tocó (o el centro, si fue con el teclado)
    const x = e.clientX || r.left + r.width / 2;
    const y = e.clientY || r.top + r.height / 2;
    explotar(x, y, innerWidth < 600 ? 46 : 64);
  }, { capture: true, passive: true });


  // ==========================================================
  // 2. LA INCLINACIÓN 3D
  // ==========================================================
  // Cuánto se inclina cada cosa (grados) y cuánto se mueve la foto por
  // dentro (px). La foto grande de la ficha, más; las tarjetas, apenas.
  const INCLINAN = [
    ['.fi-foto', 9, 10],
    ['.plat-card', 5, 0],
    ['.game-card', 6, 0]
  ];
  const SELECTOR = INCLINAN.map(i => i[0]).join(', ');

  let activo = null, pendiente = null, cuadroTilt = 0;

  function ajustes(el) {
    return INCLINAN.find(([sel]) => el.matches(sel));
  }

  function inclinar() {
    cuadroTilt = 0;
    if (!pendiente || !activo) return;
    const { x, y } = pendiente;
    const [, grados, mueve] = ajustes(activo);
    const r = activo.getBoundingClientRect();
    const px = Math.min(1, Math.max(0, (x - r.left) / r.width));
    const py = Math.min(1, Math.max(0, (y - r.top) / r.height));
    activo.style.setProperty('--rx', ((.5 - py) * grados * 2).toFixed(2) + 'deg');
    activo.style.setProperty('--ry', ((px - .5) * grados * 2).toFixed(2) + 'deg');
    activo.style.setProperty('--gx', (px * 100).toFixed(1) + '%');
    activo.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
    if (mueve) {
      activo.style.setProperty('--px', ((.5 - px) * mueve).toFixed(1) + 'px');
      activo.style.setProperty('--py', ((.5 - py) * mueve).toFixed(1) + 'px');
    }
  }

  function soltar() {
    if (!activo) return;
    activo.classList.remove('fx-tilt');
    activo = null;
  }

  document.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || quieto.matches || !conMouse.matches) return;
    const el = e.target.closest && e.target.closest(SELECTOR);
    if (el !== activo) {
      soltar();
      if (!el) return;
      activo = el;
      activo.classList.add('fx-tilt');
    }
    pendiente = { x: e.clientX, y: e.clientY };
    if (!cuadroTilt) cuadroTilt = requestAnimationFrame(inclinar);
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', soltar);
  window.addEventListener('blur', soltar);
  // Si la tarjeta se va (cambia la página del catálogo), se suelta
  document.addEventListener('scroll', () => { if (activo && !activo.isConnected) soltar(); }, { passive: true });


  // ==========================================================
  // 3. EL CARRITO LATE
  // ==========================================================
  function vigilarCarrito() {
    document.querySelectorAll('.nav-cart-badge').forEach(globo => {
      let antes = parseInt(globo.textContent, 10) || 0;
      new MutationObserver(() => {
        const ahora = parseInt(globo.textContent, 10) || 0;
        if (ahora > antes && !quieto.matches) {
          globo.classList.remove('fx-salta');
          void globo.offsetWidth;                       // para que vuelva a saltar
          globo.classList.add('fx-salta');
          const icono = globo.closest('.nav-item');
          if (icono) { icono.classList.remove('fx-sacude'); void icono.offsetWidth; icono.classList.add('fx-sacude'); }
        }
        antes = ahora;
      }).observe(globo, { childList: true, characterData: true, subtree: true });
      globo.addEventListener('animationend', () => globo.classList.remove('fx-salta'));
    });
    document.addEventListener('animationend', e => {
      if (e.animationName !== 'fx-sacude') return;
      const item = e.target.closest && e.target.closest('.fx-sacude');
      if (item) item.classList.remove('fx-sacude');
    });
  }


  // ==========================================================
  // 4. EN NAVIDAD, EL LOGO BRILLA
  // ==========================================================
  let ultimoLogo = 0;
  document.addEventListener('pointerover', e => {
    if (!esNavidad() || quieto.matches || e.pointerType !== 'mouse') return;
    const logo = e.target.closest && e.target.closest('.nav-marca, .header-logo, .nav-logo');
    if (!logo || Date.now() - ultimoLogo < 1600) return;
    ultimoLogo = Date.now();
    const r = logo.getBoundingClientRect();
    prepararLienzo();
    const p = paleta();
    // Unos pocos destellos desde la estrellita de arriba a la derecha
    for (let i = 0; i < 12; i++) {
      const ang = azar(-Math.PI * .95, -Math.PI * .05);
      const vel = azar(1.5, 4.2);
      particulas.push({
        x: r.right + 2, y: r.top + 4,
        vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel,
        g: .06, roce: .96, r: azar(2.5, 5), giro: azar(0, 3), vgiro: azar(-.12, .12),
        vida: 0, fin: azar(40, 70), tipo: i % 3 ? 'destello' : 'punto',
        color: p.brillo[i % p.brillo.length], borde: null, meca: 0
      });
    }
    if (!andando) { andando = true; requestAnimationFrame(cuadro); }
  }, { passive: true });


  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', vigilarCarrito);
  else vigilarCarrito();
})();
