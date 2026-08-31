/* Fondo animado de burbujas de vidrio (glassmorphism) sobre blanco puro.
   Se inyecta solo: basta con incluir este script en cualquier página.

   No toca el HTML ni el CSS existentes: crea su propia capa fija en
   z-index:-1, detrás de todo el contenido y sin capturar clicks.

   Optimizado: la animación es 100% CSS sobre transform/opacity (la resuelve
   la GPU, sin requestAnimationFrame ni trabajo por frame en JS). El bucle es
   infinito y arranca con delays negativos, así la pantalla ya está poblada
   en el primer pintado y nunca se nota el reinicio del ciclo. */
(function () {

  /* ===== AJUSTES ===== */
  var CONFIG = {
    // Cantidad de burbujas según el ancho de pantalla
    cantidad:   { movil: 7, tablet: 11, escritorio: 16 },
    tamano:     [ 40, 170 ],   // diámetro en px (mín, máx)
    duracion:   [ 26, 54 ],    // segundos en cruzar la pantalla (grande = más rápida)
    vaiven:     [ 10, 34 ],    // desplazamiento lateral en px
    // Tintes del vidrio en RGB. Neutros fríos + guiños tenues a la marca.
    tintes: [
      '146,158,178', '146,158,178', '132,146,170',   // gris azulado (los más comunes)
      '120,140,175',                                  // azul suave
      '224,184,86',                                   // dorado
      '224,96,102'                                    // rojo de marca
    ]
  };

  if (document.querySelector('.bg-burbujas')) return;

  /* ===== ESTILOS ===== */
  var css = document.createElement('style');
  css.textContent = [
    '.bg-burbujas{',
    '  position:fixed; inset:0; z-index:-1;',
    '  pointer-events:none; overflow:hidden;',
    '  contain:strict;',
    '}',
    /* Variables por burbuja:
       --x posición horizontal · --s diámetro · --t duración de subida
       --d delay negativo · --o opacidad máxima · --c tinte RGB
       --sw amplitud del vaivén · --ts periodo del vaivén */
    '.bg-burbuja{',
    '  position:absolute; top:105vh; left:var(--x);',
    '  width:var(--s); height:var(--s); margin-left:calc(var(--s) / -2);',
    '  opacity:0;',
    '  will-change:transform, opacity;',
    '  animation:bg-burbuja-sube var(--t) linear var(--d) infinite;',
    '}',
    /* El vidrio. La burbuja es hueca: el centro queda casi transparente y
       el color se concentra en el aro; los brillos y la sombra exterior son
       lo que le da volumen sobre un blanco puro. Los desenfoques van en
       proporción al diámetro para que se vean igual en todos los tamaños. */
    '.bg-burbuja-vidrio{',
    '  width:100%; height:100%; border-radius:50%;',
    '  background:',
    '    radial-gradient(circle at 30% 26%, rgba(255,255,255,.98) 0%, rgba(255,255,255,.50) 20%, rgba(255,255,255,0) 40%),',
    '    radial-gradient(circle at 74% 79%, rgba(255,255,255,.80) 0%, rgba(255,255,255,0) 16%),',
    '    radial-gradient(circle at 50% 50%, rgba(var(--c),.015) 46%, rgba(var(--c),.075) 76%, rgba(var(--c),.15) 93%, rgba(var(--c),.04) 100%);',
    '  box-shadow:',
    '    inset 0 0 0 1px rgba(var(--c),.17),',
    '    inset calc(var(--s) * .05) calc(var(--s) * .06) calc(var(--s) * .14) rgba(255,255,255,.65),',
    '    inset calc(var(--s) * -.04) calc(var(--s) * -.05) calc(var(--s) * .12) rgba(var(--c),.09),',
    '    0 calc(var(--s) * .07) calc(var(--s) * .20) rgba(20,22,26,.05);',
    '  will-change:transform;',
    '  animation:bg-burbuja-vaiven var(--ts) ease-in-out infinite alternate;',
    '}',
    '@keyframes bg-burbuja-sube{',
    '  0%   { transform:translate3d(0,0,0);      opacity:0; }',
    '  7%   { opacity:var(--o); }',
    '  88%  { opacity:var(--o); }',
    '  100% { transform:translate3d(0,-140vh,0); opacity:0; }',
    '}',
    '@keyframes bg-burbuja-vaiven{',
    '  from { transform:translate3d(calc(var(--sw) * -1),0,0); }',
    '  to   { transform:translate3d(var(--sw),0,0); }',
    '}',
    /* Pausa total al cambiar de pestaña: cero trabajo en segundo plano */
    '.bg-burbujas.esta-oculto *{ animation-play-state:paused; }',
    '@media print{ .bg-burbujas{ display:none; } }',
    '@media (prefers-reduced-motion:reduce){ .bg-burbujas{ display:none; } }'
  ].join('\n');
  document.head.appendChild(css);

  /* ===== BURBUJAS ===== */
  function azar(min, max) { return min + Math.random() * (max - min); }

  function montar() {
    if (document.querySelector('.bg-burbujas')) return;

    var ancho = window.innerWidth;
    var total = ancho < 640 ? CONFIG.cantidad.movil
              : ancho < 1024 ? CONFIG.cantidad.tablet
              : CONFIG.cantidad.escritorio;

    var capa = document.createElement('div');
    capa.className = 'bg-burbujas';
    capa.setAttribute('aria-hidden', 'true');

    var html = '';
    for (var i = 0; i < total; i++) {
      // Repartidas en carriles, con azar dentro de cada uno: nunca se amontonan
      var x      = ((i + azar(0.12, 0.88)) / total) * 100;
      var tamano = Math.round(azar(CONFIG.tamano[0], CONFIG.tamano[1]));
      // Las grandes se sienten más cerca: suben algo más rápido y más opacas
      var cerca  = (tamano - CONFIG.tamano[0]) / (CONFIG.tamano[1] - CONFIG.tamano[0]);
      var dur    = (CONFIG.duracion[1] - cerca * (CONFIG.duracion[1] - CONFIG.duracion[0])) * azar(0.9, 1.1);
      var tinte  = CONFIG.tintes[Math.floor(Math.random() * CONFIG.tintes.length)];

      html += '<div class="bg-burbuja" style="' +
                '--x:' + x.toFixed(2) + '%;' +
                '--s:' + tamano + 'px;' +
                '--t:' + dur.toFixed(1) + 's;' +
                // Delay negativo: cada burbuja entra ya a mitad de recorrido
                '--d:-' + (Math.random() * dur).toFixed(1) + 's;' +
                '--o:' + (0.5 + cerca * 0.45).toFixed(2) + ';' +
                '--c:' + tinte + ';' +
              '">' +
                '<div class="bg-burbuja-vidrio" style="' +
                  '--sw:' + Math.round(azar(CONFIG.vaiven[0], CONFIG.vaiven[1])) + 'px;' +
                  '--ts:' + azar(6, 13).toFixed(1) + 's;' +
                '"></div>' +
              '</div>';
    }
    capa.innerHTML = html;   // un solo reflow para todas las burbujas

    // Primer hijo del body: así nunca se cuela por delante del contenido
    document.body.insertBefore(capa, document.body.firstChild);

    var pausar = function () { capa.classList.toggle('esta-oculto', document.hidden); };
    pausar();   // por si la pestaña ya estaba en segundo plano al cargar
    document.addEventListener('visibilitychange', pausar);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', montar);
  } else {
    montar();
  }
})();
