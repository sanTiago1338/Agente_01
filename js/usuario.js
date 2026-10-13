// ============================================================
// TIAGO STORE · El usuario del cliente (registro sin contraseña)
// ============================================================
// Cuando alguien entra a la tienda todo se ve normal. Si ese navegador
// todavía no se registró, a los 2 segundos aparece una ventana que pide
// solo dos cosas:
//   · Usuario  (2 a 40 letras): cómo quiere que lo llamemos
//   · WhatsApp (+591, 8 números que empiezan con 6 o 7)
// "Ahora no" la deja para la próxima visita (esta pestaña no la vuelve a
// mostrar, aunque cambie de página).
//
// Al tocar "Pagar" (js/tienda.js) es obligatorio: si no se registró, se
// abre la misma ventana ("Antes de pagar") y al completarla sigue solo
// al pago, con ese WhatsApp. El checkout ya no pide el número aparte.
//
// Los botones con data-usuario ("Usuario" en la barra de abajo, en el
// menú de Planes y Contacto, arriba en Mis compras) abren la misma
// ventana para ver o cambiar los datos. Su .usuario-punto se prende en
// verde cuando ya se registró.
//
// DÓNDE QUEDA
//   · En el navegador (localStorage 'tiago-usuario'). El WhatsApp además
//     va a 'tiago-whatsapp', el que usaba el checkout: el enlace de
//     renovar lo deja ahí y la ventana lo trae escrito.
//   · En la base, una fila por WhatsApp (registrar_cliente, ver
//     supabase/26-registro-de-clientes.sql). Si la base no contesta,
//     queda en el navegador y se reintenta en la próxima visita.
//
// NO ES UN LOGIN: sin contraseña ni correo. Es cómo quiere que lo
// llamemos y a dónde escribirle.
//
// En pagar-qr.html se carga con data-ventana="no": ahí no se interrumpe a
// nadie que está pagando, solo se lee el usuario para el pedido
// (window.tiagoUsuario.datos()).
//
// Script común (no módulo): la ventana y el botón andan aunque falle la
// conexión con Supabase. La base se trae recién para subir los datos.
// ============================================================
(function () {
  'use strict';

  var LLAVE      = 'tiago-usuario';
  var LLAVE_WA   = 'tiago-whatsapp';           // la misma de js/tienda.js
  var LLAVE_DISP = 'tiago-dispositivo';
  var LLAVE_NO   = 'tiago-usuario-ahora-no';   // en sessionStorage: esta visita
  var ESPERA_MS  = 2000;

  var yo = document.currentScript;
  var conVentana = !(yo && yo.getAttribute('data-ventana') === 'no');
  // Al lado de este archivo, sin el ?v=: es la misma dirección con la que
  // la importan los demás módulos, así no se crea un segundo cliente
  var URL_BASE = new URL('supabase-base.js', (yo && yo.src) || location.href).href;


  // ============================================================
  // 1. LO GUARDADO
  // ============================================================
  function leerLocal(llave) {
    try { return localStorage.getItem(llave); } catch (e) { return null; }
  }
  function ponerLocal(llave, valor) {
    try { localStorage.setItem(llave, valor); } catch (e) { /* sin almacenamiento: queda para esta página */ }
  }

  function limpiarUsuario(v) {
    return String(v || '').replace(/\s+/g, ' ').trim();
  }
  function usuarioValido(v) {
    var n = Array.from(limpiarUsuario(v)).length;
    return n >= 2 && n <= 40 && !/[<>]/.test(v);
  }
  // Los 8 números del celular. Si lo pega con el 591 adelante, se saca.
  function soloCelular(v) {
    var d = String(v || '').replace(/\D/g, '');
    if (d.length === 11 && d.indexOf('591') === 0) d = d.slice(3);
    return d;
  }
  function celularValido(v) {
    return /^[67]\d{7}$/.test(soloCelular(v));
  }

  // { usuario, whatsapp (8 números), subido, anterior?, desde }
  function leer() {
    try {
      var d = JSON.parse(leerLocal(LLAVE) || 'null');
      if (d && typeof d.usuario === 'string' && /^[67]\d{7}$/.test(d.whatsapp)) return d;
      // Registrado con la versión anterior de este archivo (13/10/2026,
      // { nombre, wa }): se pasa a la de ahora y se sube a la base, así no
      // se le vuelve a pedir
      if (d && typeof d.nombre === 'string' && /^[67]\d{7}$/.test(d.wa) && usuarioValido(d.nombre)) {
        var nuevo = { usuario: limpiarUsuario(d.nombre), whatsapp: d.wa, subido: false,
                      desde: d.en || new Date().toISOString() };
        guardar(nuevo);
        return nuevo;
      }
    } catch (e) { /* algo roto: como si no hubiera nada */ }
    return null;
  }
  function guardar(d) { ponerLocal(LLAVE, JSON.stringify(d)); }

  /** Lo que usan las demás páginas: { usuario, whatsapp, whatsappCompleto } o null */
  function datos() {
    var d = leer();
    return d ? { usuario: d.usuario, whatsapp: d.whatsapp, whatsappCompleto: '591' + d.whatsapp } : null;
  }

  // Una marca al azar de este navegador. Con ella la base sabe que el
  // número viejo es tuyo cuando lo cambiás, y borra esa fila.
  function dispositivo() {
    var d = leerLocal(LLAVE_DISP);
    if (d && /^[0-9a-f]{32}$/.test(d)) return d;
    var b = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(b);
    d = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    ponerLocal(LLAVE_DISP, d);
    return d;
  }


  // ============================================================
  // 2. SUBIRLO A LA BASE
  // ============================================================
  // Una sola vez por cambio. Si falla (sin internet, la base caída, el
  // tope de registros), queda marcado como pendiente y se reintenta al
  // abrir la próxima página.
  var subiendo = null;

  function subir() {
    var d = leer();
    if (!d || d.subido) return Promise.resolve(false);
    if (subiendo) return subiendo;

    subiendo = import(URL_BASE)
      .then(function (m) {
        return m.sb.rpc('registrar_cliente', {
          p_usuario:     d.usuario,
          p_whatsapp:    '591' + d.whatsapp,
          p_dispositivo: dispositivo(),
          p_anterior:    d.anterior ? '591' + d.anterior : null
        });
      })
      .then(function (r) {
        if (r.error) throw new Error(r.error.message);
        // Si mientras subía los cambió otra vez, lo nuevo sigue pendiente
        var ahora = leer();
        if (ahora && ahora.usuario === d.usuario && ahora.whatsapp === d.whatsapp) {
          ahora.subido = true;
          delete ahora.anterior;
          guardar(ahora);
        }
        return true;
      })
      .catch(function (e) {
        console.warn('Usuario: quedó guardado en este navegador y se sube en la próxima visita.',
                     e && e.message);
        return false;
      })
      .then(function (ok) { subiendo = null; return ok; });

    return subiendo;
  }


  // ============================================================
  // 3. LA VENTANA
  // ============================================================
  // La misma ventana que el carrito vacío de la tienda (css/tienda.css,
  // .modal-overlay y .modal-sheet en LIQUID GLASS): hoja de vidrio de hasta
  // 600 px, que en el celular sube desde abajo y en la compu queda al
  // medio; la rayita arriba, el título con la ✕, el ícono al centro y el
  // botón de vidrio claro con el borde tornasolado. Los tonos salen de
  // css/vidrio.css (todas las páginas lo cargan), así sigue el control
  // "Transparente o teñido". Va escrita acá porque Planes, Contacto,
  // Recargas y Mis compras no cargan css/tienda.css.
  var css = [
    '.tu-fondo{position:fixed;inset:0;z-index:1000;display:flex;align-items:flex-end;justify-content:center;',
    '  background:rgba(20,22,26,.2);-webkit-backdrop-filter:blur(16px) saturate(140%);backdrop-filter:blur(16px) saturate(140%);',
    '  animation:tu-aparecer .2s ease-out}',
    '.tu-fondo[hidden]{display:none}',
    '.tu-caja{position:relative;box-sizing:border-box;width:100%;max-width:600px;max-height:85vh;overflow-y:auto;',
    '  padding:1.5rem 1rem calc(1.5rem + env(safe-area-inset-bottom));border-radius:20px 20px 0 0;color:var(--tinta,#14161a);',
    '  background:linear-gradient(180deg,rgba(255,255,255,.37),rgba(255,255,255,.3));',
    '  -webkit-backdrop-filter:blur(28px) saturate(170%) brightness(1.15);backdrop-filter:blur(28px) saturate(170%) brightness(1.15);',
    '  border:1px solid rgba(255,255,255,.9);box-shadow:0 -12px 40px rgba(20,22,26,.18),inset 0 1px 0 #fff;',
    '  animation:tu-subir .3s ease}',
    'html.tenido .tu-caja{background-color:var(--vidrio-tinte)}',
    '@media (min-width:600px){',
    '  .tu-fondo{align-items:center}',
    '  .tu-caja{border-radius:20px;margin-bottom:5rem;max-height:80vh;padding-left:1.5rem;padding-right:1.5rem}',
    '}',
    '.tu-asa{width:40px;height:4px;border-radius:2px;margin:0 auto 1.25rem;background:var(--gris2,#dfe0e5)}',
    '.tu-cab{display:flex;align-items:center;gap:.75rem;padding-bottom:1rem;margin-bottom:1.1rem;',
    '  border-bottom:1px solid var(--borde,rgba(20,22,26,.09))}',
    '.tu-cab h3{margin:0;flex:1;font-size:1.05rem;font-weight:900;line-height:1.3;color:var(--tinta,#14161a)}',
    '.tu-x{flex-shrink:0;padding:.25rem .45rem;border:none;border-radius:8px;background:none;',
    '  color:var(--tinta-suave,#4b515c);font-size:1.3rem;line-height:1;cursor:pointer}',
    '.tu-x:hover{color:var(--tinta,#14161a);background:rgba(255,255,255,.55)}',
    '.tu-cuerpo{padding:0 .5rem .25rem}',
    /* El ícono, en la lente de vidrio de la tienda (lo activo de las
       pestañas): más clara arriba, con brillo y el borde tornasolado */
    '.tu-ico{position:relative;isolation:isolate;width:56px;height:56px;margin:0 auto .75rem;border-radius:50%;',
    '  display:grid;place-items:center;color:var(--marca,#e50914);',
    '  background:var(--vidrio-lente,radial-gradient(120% 90% at 50% 0%,#fff 0%,rgba(255,255,255,.14) 55%,rgba(255,255,255,.02) 100%));',
    '  box-shadow:inset 0 1.5px 0 #fff,inset 0 -1.5px 2px rgba(20,22,26,.07),inset 0 0 0 1px rgba(255,255,255,.55),',
    '             0 6px 16px rgba(20,22,26,.13),0 1px 3px rgba(20,22,26,.08)}',
    '.tu-ico::after{content:"";position:absolute;inset:0;border-radius:inherit;padding:1.5px;pointer-events:none;opacity:.55;',
    '  background:var(--vidrio-tornasol,conic-gradient(from 210deg,rgba(255,90,170,.75),rgba(255,205,90,.75),rgba(110,230,255,.8),rgba(150,120,255,.75),rgba(255,90,170,.75)));',
    '  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}',
    '.tu-ico svg{width:26px;height:26px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
    '.tu-caja h2{margin:0 0 .35rem;text-align:center;font-size:1.25rem;font-weight:900;letter-spacing:-.01em;color:var(--tinta,#14161a)}',
    '.tu-sub{margin:0 auto 1rem;max-width:27rem;text-align:center;font-size:.86rem;line-height:1.5;color:var(--tinta-suave,#4b515c)}',
    '.tu-caja form{margin:0 auto}',
    /* En la compu los dos campos van uno al lado del otro: así la ventana
       queda del tamaño del carrito vacío */
    '.tu-campos{display:grid;gap:0 .8rem}',
    '@media (min-width:600px){.tu-campos{grid-template-columns:1fr 1fr}}',
    '.tu-campo{min-width:0}',
    '.tu-caja label{display:block;margin:.8rem 0 .4rem .2rem;font-size:.72rem;font-weight:800;letter-spacing:.06em;',
    '  text-transform:uppercase;color:var(--tinta-media,#3d424b)}',
    /* Los campos: vidrio claro, como el buscador de la tienda. El de
       WhatsApp es una sola cápsula con el +591 adentro. */
    '.tu-caja input,.tu-tel{width:100%;box-sizing:border-box;height:50px;border-radius:14px;',
    '  border:1px solid rgba(255,255,255,.85);background:rgba(255,255,255,.55);color:var(--tinta,#14161a);',
    '  box-shadow:inset 0 1px 2px rgba(20,22,26,.06),0 0 0 .5px rgba(20,22,26,.12);',
    '  transition:border-color .2s,box-shadow .2s,background .2s}',
    '.tu-caja input{padding:0 .95rem;font:inherit;font-size:1rem}',
    '.tu-caja input::placeholder{color:var(--tinta-tenue,#656b77)}',
    '.tu-caja input:focus,.tu-tel:focus-within{outline:none;border-color:rgba(229,9,20,.4);background:rgba(255,255,255,.72);',
    '  box-shadow:0 0 0 4px rgba(229,9,20,.10),inset 0 1px 2px rgba(20,22,26,.06)}',
    /* Separadas: un navegador que no entiende :has() descartaría la regla
       entera, también el rojo del campo Usuario */
    '.tu-caja input.mal{border-color:#dc2626;box-shadow:0 0 0 4px rgba(220,38,38,.12)}',
    '.tu-tel:has(input.mal){border-color:#dc2626;box-shadow:0 0 0 4px rgba(220,38,38,.12)}',
    '.tu-tel{display:flex;align-items:center;overflow:hidden}',
    '.tu-tel span{flex:none;align-self:stretch;display:grid;place-items:center;padding:0 .8rem;',
    '  border-right:1px solid rgba(20,22,26,.1);background:rgba(255,255,255,.3);',
    '  font-weight:800;color:var(--tinta-media,#3d424b);font-size:.95rem}',
    '.tu-tel input,.tu-tel input:focus,.tu-tel input.mal{flex:1;min-width:0;height:100%;border:none;border-radius:0;',
    '  background:none;box-shadow:none;letter-spacing:.04em}',
    /* Lo que tranquiliza: tres tildes chicas abajo de todo */
    '.tu-confianza{display:flex;flex-wrap:wrap;justify-content:center;gap:.3rem 1rem;margin:.6rem 0 0;padding:0;list-style:none;',
    '  font-size:.72rem;font-weight:600;color:var(--tinta-suave,#4b515c)}',
    '.tu-confianza li{display:inline-flex;align-items:center;gap:.3rem}',
    '.tu-confianza svg{width:13px;height:13px;fill:none;stroke:#15803d;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}',
    '.tu-error{margin:.6rem 0 0;font-size:.8rem;font-weight:600;color:#dc2626;text-align:center}',
    '.tu-botones{display:grid;gap:.4rem;margin-top:1.1rem}',
    /* El botón principal: vidrio claro, letras negras y borde tornasolado,
       como "Ver productos" del carrito */
    '.tu-ok{position:relative;isolation:isolate;width:100%;padding:1rem;border-radius:999px;cursor:pointer;',
    '  font:inherit;font-size:.95rem;font-weight:900;letter-spacing:.06em;text-transform:uppercase;',
    '  color:var(--tinta,#14161a);border:1px solid rgba(255,255,255,.85);',
    '  background:var(--vidrio-reflejo,linear-gradient(180deg,rgba(255,255,255,.4),rgba(255,255,255,0) 55%)),',
    '             linear-gradient(180deg,rgba(255,255,255,.47),rgba(255,255,255,.15));',
    '  -webkit-backdrop-filter:blur(16px) saturate(180%) brightness(1.1);backdrop-filter:blur(16px) saturate(180%) brightness(1.1);',
    '  box-shadow:0 8px 24px rgba(20,22,26,.14),0 1px 3px rgba(20,22,26,.08),0 0 0 .5px rgba(20,22,26,.08),',
    '             inset 0 1.5px 0 #fff,inset 0 -2px 5px rgba(20,22,26,.06);',
    '  transition:transform .15s}',
    '.tu-ok::after{content:"";position:absolute;inset:0;border-radius:inherit;padding:1.5px;pointer-events:none;opacity:.5;',
    '  background:var(--vidrio-tornasol,conic-gradient(from 210deg,rgba(255,90,170,.75),rgba(255,205,90,.75),rgba(110,230,255,.8),rgba(150,120,255,.75),rgba(255,90,170,.75)));',
    '  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}',
    '.tu-ok:hover{transform:translateY(-1px);',
    '  background:var(--vidrio-reflejo,linear-gradient(180deg,rgba(255,255,255,.4),rgba(255,255,255,0) 55%)),',
    '             linear-gradient(180deg,rgba(255,255,255,.67),rgba(255,255,255,.35))}',
    '.tu-no{padding:.55rem;border:none;border-radius:999px;background:none;cursor:pointer;',
    '  font:inherit;font-size:.9rem;font-weight:700;color:var(--tinta-suave,#4b515c)}',
    '.tu-no:hover{color:var(--marca,#e50914)}',
    /* El cartelito de "Listo": una píldora de vidrio, como la barra de abajo */
    '.tu-aviso{position:fixed;left:50%;bottom:calc(96px + env(safe-area-inset-bottom));z-index:1001;',
    '  transform:translateX(-50%);max-width:min(92vw,380px);padding:.75rem 1.1rem;border-radius:999px;',
    '  color:var(--tinta,#14161a);font-size:.88rem;font-weight:700;line-height:1.4;text-align:center;',
    '  background:linear-gradient(180deg,rgba(255,255,255,.72),rgba(255,255,255,.55));',
    '  -webkit-backdrop-filter:blur(20px) saturate(180%);backdrop-filter:blur(20px) saturate(180%);',
    '  border:1px solid rgba(255,255,255,.9);',
    '  box-shadow:0 10px 30px rgba(20,22,26,.14),0 0 0 .5px rgba(20,22,26,.08),inset 0 1px 0 #fff;',
    '  animation:tu-aviso .25s ease-out}',
    /* El puntito verde del botón Usuario: ya se registró */
    '.usuario-punto{display:inline-block;width:8px;height:8px;border-radius:50%;background:#16a34a;',
    '  box-shadow:0 0 0 2px #fff;vertical-align:middle;margin-left:5px}',
    '.usuario-punto[hidden]{display:none}',
    '.nav-item .usuario-punto{position:absolute;top:7px;left:calc(50% + 6px);margin:0}',
    '@keyframes tu-aparecer{from{opacity:0}}',
    '@keyframes tu-subir{from{transform:translateY(100%)}to{transform:translateY(0)}}',
    '@keyframes tu-aviso{from{opacity:0;transform:translate(-50%,12px)}}',
    '@media (prefers-reduced-motion:reduce){.tu-fondo,.tu-caja,.tu-aviso{animation:none}}'
  ].join('\n');

  var ICONO = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/>' +
              '<path d="M4 20.5a8 8 0 0 1 16 0"/></svg>';
  var TILDE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

  var fondo = null;
  var modo = 'registro';        // 'registro' (la primera vez) o 'editar'
  var antesDeAbrir = null;      // a dónde vuelve el foco al cerrar

  function $(id) { return document.getElementById(id); }

  // Van desde el arranque: el puntito verde de los botones los necesita
  var conEstilos = false;
  function ponerEstilos() {
    if (conEstilos) return;
    conEstilos = true;
    var estilo = document.createElement('style');
    estilo.textContent = css;
    document.head.appendChild(estilo);
  }

  function armar() {
    if (fondo) return;
    ponerEstilos();

    fondo = document.createElement('div');
    fondo.className = 'tu-fondo';
    fondo.hidden = true;
    fondo.innerHTML =
      '<div class="tu-caja" role="dialog" aria-modal="true" aria-labelledby="tuTitulo" aria-describedby="tuSub">' +
        '<div class="tu-asa" aria-hidden="true"></div>' +
        '<div class="tu-cab">' +
          '<h3>Tu usuario</h3>' +
          '<button type="button" class="tu-x" id="tuX" aria-label="Cerrar">✕</button>' +
        '</div>' +
        '<div class="tu-cuerpo">' +
        '<div class="tu-ico">' + ICONO + '</div>' +
        '<h2 id="tuTitulo"></h2>' +
        '<p class="tu-sub" id="tuSub"></p>' +
        '<form id="tuForm" novalidate>' +
          '<div class="tu-campos">' +
            '<div class="tu-campo">' +
              '<label for="tuUsuario">Usuario</label>' +
              '<input id="tuUsuario" type="text" maxlength="40" autocomplete="nickname" ' +
                     'autocapitalize="words" placeholder="Cómo querés que te llamemos">' +
            '</div>' +
            '<div class="tu-campo">' +
              '<label for="tuWa">WhatsApp</label>' +
              '<div class="tu-tel"><span>+591</span>' +
                '<input id="tuWa" type="tel" inputmode="numeric" maxlength="12" ' +
                       'autocomplete="tel-national" placeholder="7 123 4567"></div>' +
            '</div>' +
          '</div>' +
          '<p class="tu-error" id="tuError" role="alert" hidden></p>' +
          '<div class="tu-botones">' +
            '<button type="submit" class="tu-ok" id="tuOk"></button>' +
            '<button type="button" class="tu-no" id="tuNo"></button>' +
          '</div>' +
        '</form>' +
        '<ul class="tu-confianza">' +
          '<li>' + TILDE + 'Sin contraseña</li>' +
          '<li>' + TILDE + 'Sin correo</li>' +
          '<li>' + TILDE + 'No se cobra nada</li>' +
        '</ul>' +
        '</div>' +
      '</div>';
    document.body.appendChild(fondo);

    $('tuForm').addEventListener('submit', function (e) { e.preventDefault(); enviar(); });
    $('tuNo').addEventListener('click', ahoraNo);
    $('tuX').addEventListener('click', ahoraNo);
    fondo.addEventListener('mousedown', function (e) { if (e.target === fondo) ahoraNo(); });
    // Solo los números, como en el checkout. Si lo escribe con el 591
    // adelante, se lo deja terminar y al completarlo se saca el 591.
    $('tuWa').addEventListener('input', function () {
      var d = this.value.replace(/\D/g, '');
      d = d.indexOf('591') === 0
        ? (d.length >= 11 ? d.slice(3, 11) : d)
        : d.slice(0, 8);
      if (this.value !== d) this.value = d;
      this.classList.remove('mal');
      $('tuError').hidden = true;
    });
    $('tuUsuario').addEventListener('input', function () {
      this.classList.remove('mal');
      $('tuError').hidden = true;
    });
  }

  // Los textos de cada modo:
  //   registro  la ventana de los 2 segundos al entrar
  //   pagar     al tocar "Pagar" sin registrarse (js/tienda.js, payWithQR)
  //   editar    el botón "Usuario", ya registrado
  var TEXTOS = {
    registro: {
      titulo: '¿Cómo te llamamos?',
      sub: 'Dejanos tu usuario y tu WhatsApp: tus pedidos salen a tu nombre y te avisamos antes de que venza tu cuenta.',
      ok: 'Guardar', no: 'Ahora no'
    },
    pagar: {
      titulo: 'Antes de pagar',
      sub: 'Para seguir al pago, dejanos tu usuario y tu WhatsApp: tu pedido sale a tu nombre y por ahí te avisamos si hay algo con tu compra.',
      ok: 'Seguir al pago', no: 'Cancelar'
    },
    editar: {
      titulo: 'Tus datos',
      sub: 'Con estos datos salen tus pedidos y te avisamos por WhatsApp antes de que venza tu cuenta. Podés cambiarlos cuando quieras.',
      ok: 'Guardar cambios', no: 'Cerrar'
    }
  };

  // Quien pidió el registro para pagar, esperando la respuesta
  var alTerminar = null;
  function responder(valor) {
    var f = alTerminar;
    alTerminar = null;
    if (f) f(valor);
  }

  function abrir(cual) {
    armar();
    var d = leer();
    modo = cual || (d ? 'editar' : 'registro');

    var t = TEXTOS[modo] || TEXTOS.registro;
    $('tuTitulo').textContent = t.titulo;
    $('tuSub').textContent = t.sub;
    $('tuOk').textContent = t.ok;
    $('tuNo').textContent = t.no;

    $('tuUsuario').value = d ? d.usuario : '';
    $('tuWa').value = d ? d.whatsapp : soloCelular(leerLocal(LLAVE_WA) || '').slice(0, 8);
    $('tuUsuario').classList.remove('mal');
    $('tuWa').classList.remove('mal');
    $('tuError').hidden = true;

    antesDeAbrir = document.activeElement;
    fondo.hidden = false;
    document.addEventListener('keydown', teclas);
    // En el celular el teclado tapa media pantalla: el foco solo en la compu
    if (window.matchMedia && matchMedia('(pointer: fine)').matches) {
      setTimeout(function () { $('tuUsuario').focus(); }, 30);
    }
  }

  function cerrar() {
    if (!fondo || fondo.hidden) return;
    fondo.hidden = true;
    document.removeEventListener('keydown', teclas);
    if (antesDeAbrir && antesDeAbrir.focus) { try { antesDeAbrir.focus(); } catch (e) { /* nada */ } }
  }

  // "Ahora no", la X, tocar afuera o Escape. La primera vez cuenta como
  // "ahora no": no se le vuelve a preguntar hasta la próxima visita. Si
  // se la abrió "Pagar", no paga (y en la próxima vez que toque Pagar, se
  // le vuelve a pedir).
  function ahoraNo() {
    if (modo === 'registro') {
      try { sessionStorage.setItem(LLAVE_NO, '1'); } catch (e) { /* nada */ }
    }
    cerrar();
    responder(null);
  }

  function teclas(e) {
    if (e.key === 'Escape') { e.preventDefault(); ahoraNo(); return; }
    // El foco no se escapa de la ventana con Tab
    if (e.key === 'Tab') {
      var focos = fondo.querySelectorAll('button, input');
      var primero = focos[0], ultimo = focos[focos.length - 1];
      if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    }
  }

  function error(campo, texto) {
    var el = $('tuError');
    el.textContent = texto;
    el.hidden = false;
    campo.classList.add('mal');
    campo.focus();
  }

  function enviar() {
    var usuario = limpiarUsuario($('tuUsuario').value);
    var cel     = soloCelular($('tuWa').value);

    if (!usuarioValido(usuario)) {
      return error($('tuUsuario'), usuario
        ? 'El usuario tiene que tener de 2 a 40 letras.'
        : 'Escribí cómo querés que te llamemos.');
    }
    if (!celularValido(cel)) {
      return error($('tuWa'), cel
        ? 'Escribí tu celular completo: 8 números que empiezan con 6 o 7.'
        : 'Escribí tu WhatsApp: es por donde te avisamos y te damos soporte.');
    }

    var antes = leer();
    if (antes && antes.usuario === usuario && antes.whatsapp === cel) { cerrar(); responder(datos()); return; }

    var d = { usuario: usuario, whatsapp: cel, subido: false,
              desde: (antes && antes.desde) || new Date().toISOString() };
    // Cambió de número: el de antes se borra de la base (si ya estaba
    // subido; si no, el que quedó pendiente de antes)
    if (antes && antes.whatsapp !== cel) {
      var viejo = antes.subido ? antes.whatsapp : antes.anterior;
      if (viejo && viejo !== cel) d.anterior = viejo;
    } else if (antes && antes.anterior) {
      d.anterior = antes.anterior;
    }
    guardar(d);

    // El último WhatsApp de este navegador (lo usa js/tienda.js si este
    // archivo no llegara a cargar)
    ponerLocal(LLAVE_WA, cel);

    var paraPagar = modo === 'pagar';
    pintarBotones();
    cerrar();
    if (!paraPagar) {
      avisar(antes ? 'Listo: tus datos quedaron guardados.'
                   : 'Listo, ' + usuario.split(' ')[0] + ': quedaste registrado.');
    }
    try { document.dispatchEvent(new CustomEvent('usuario-cambiado', { detail: datos() })); } catch (e) { /* nada */ }
    subir();
    // "Pagar" sigue solo, con estos datos
    responder(datos());
  }

  /**
   * Para "Pagar" (js/tienda.js): si ya se registró, sus datos en el acto;
   * si no, abre la ventana y espera. Devuelve una promesa con
   * { usuario, whatsapp, whatsappCompleto }, o null si la cerró sin
   * completarla.
   */
  function pedir(cual) {
    var d = datos();
    if (d) return Promise.resolve(d);
    responder(null);      // si había otro esperando, ese ya no paga
    return new Promise(function (listo) {
      alTerminar = listo;
      abrir(cual || 'pagar');
    });
  }

  function avisar(texto) {
    var el = document.createElement('div');
    el.className = 'tu-aviso';
    el.setAttribute('role', 'status');
    el.textContent = texto;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 3200);
  }


  // ============================================================
  // 4. LOS BOTONES "USUARIO"
  // ============================================================
  function pintarBotones() {
    var d = leer();
    var botones = document.querySelectorAll('[data-usuario]');
    for (var i = 0; i < botones.length; i++) {
      var b = botones[i];
      var punto = b.querySelector('.usuario-punto');
      if (punto) punto.hidden = !d;
      b.classList.toggle('usuario-registrado', !!d);
      var texto = d ? 'Usuario: ' + d.usuario + ' (registrado)' : 'Usuario: registrate';
      b.setAttribute('title', texto);
      b.setAttribute('aria-label', texto);
    }
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-usuario]');
    if (!b) return;
    e.preventDefault();
    responder(null);      // abrir "Usuario" no sigue a ningún pago pendiente
    abrir();
  });


  // ============================================================
  // 5. AL ENTRAR
  // ============================================================
  // A los 2 segundos, si este navegador no se registró y en esta visita
  // no dijo "Ahora no". No interrumpe un link de renovar (abre directo en
  // Pagar), ni si ya hay otra ventana abierta (un producto, el carrito).
  function quizasPedir() {
    if (!conVentana || leer()) return;
    // También el "Ahora no" de la versión anterior de este archivo
    try { if (sessionStorage.getItem(LLAVE_NO) || sessionStorage.getItem('tiago-usuario-despues')) return; } catch (e) { /* sigue */ }
    if (/^#(renovar|prueba|t)=/.test(location.hash)) return;

    setTimeout(function () {
      if (leer()) return;
      try { if (sessionStorage.getItem(LLAVE_NO)) return; } catch (e) { /* sigue */ }
      if (document.querySelector('.modal-overlay.open, .modal-overlay.active')) return;
      abrir('registro');
    }, ESPERA_MS);
  }

  function empezar() {
    ponerEstilos();
    pintarBotones();
    subir();
    quizasPedir();
  }

  window.tiagoUsuario = { datos: datos, abrir: function () { abrir(); }, pedir: pedir };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', empezar);
  else empezar();
})();
