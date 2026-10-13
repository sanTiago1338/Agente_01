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
  var css = [
    '.tu-fondo{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:18px;',
    '  background:rgba(14,15,18,.42);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);',
    '  animation:tu-aparecer .2s ease-out}',
    '.tu-fondo[hidden]{display:none}',
    '.tu-caja{position:relative;width:min(100%,400px);max-height:calc(100vh - 36px);overflow:auto;',
    '  background:#fff;color:#14161a;border-radius:22px;padding:26px 22px 20px;',
    '  box-shadow:0 24px 60px rgba(14,15,18,.28),0 0 0 1px rgba(14,15,18,.06);',
    '  animation:tu-subir .25s cubic-bezier(.2,.8,.3,1)}',
    '.tu-x{position:absolute;top:10px;right:10px;width:36px;height:36px;border:none;border-radius:50%;',
    '  background:#f2f3f5;color:#3d424b;font:400 22px/1 system-ui,sans-serif;cursor:pointer}',
    '.tu-x:hover{background:#e7e9ed}',
    '.tu-ico{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;margin-bottom:12px;',
    '  background:#fdecec;color:#e50914}',
    '.tu-ico svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
    '.tu-caja h2{margin:0 0 6px;font-size:1.3rem;font-weight:800;letter-spacing:-.01em;color:#14161a}',
    '.tu-sub{margin:0 0 16px;font-size:.88rem;line-height:1.5;color:#4b515c}',
    '.tu-caja label{display:block;margin:12px 0 6px;font-size:.78rem;font-weight:700;color:#3d424b}',
    '.tu-caja input{width:100%;box-sizing:border-box;padding:12px 13px;border:1.5px solid #dfe0e5;border-radius:12px;',
    '  background:#fff;color:#14161a;font:inherit;font-size:1rem}',
    '.tu-caja input:focus{outline:none;border-color:#14161a;box-shadow:0 0 0 3px rgba(20,22,26,.08)}',
    '.tu-caja input.mal{border-color:#dc2626;box-shadow:0 0 0 3px rgba(220,38,38,.12)}',
    '.tu-tel{display:flex;align-items:stretch}',
    '.tu-tel span{display:grid;place-items:center;padding:0 12px;border:1.5px solid #dfe0e5;border-right:none;',
    '  border-radius:12px 0 0 12px;background:#f4f5f7;font-weight:700;color:#3d424b;font-size:.95rem}',
    '.tu-tel input{border-radius:0 12px 12px 0}',
    '.tu-error{margin:10px 0 0;font-size:.8rem;font-weight:600;color:#dc2626}',
    '.tu-botones{display:grid;gap:8px;margin-top:18px}',
    '.tu-ok{padding:13px;border:none;border-radius:12px;background:#14161a;color:#fff;font:inherit;',
    '  font-weight:700;font-size:.98rem;cursor:pointer}',
    '.tu-ok:hover{background:#2a2d33}',
    '.tu-no{padding:11px;border:none;border-radius:12px;background:none;color:#4b515c;font:inherit;',
    '  font-weight:600;font-size:.9rem;cursor:pointer}',
    '.tu-no:hover{background:#f2f3f5;color:#14161a}',
    '.tu-pie{margin:12px 0 0;font-size:.74rem;line-height:1.45;color:#767c88;text-align:center}',
    '.tu-aviso{position:fixed;left:50%;bottom:calc(96px + env(safe-area-inset-bottom));z-index:1001;',
    '  transform:translateX(-50%);max-width:min(92vw,380px);padding:11px 16px;border-radius:12px;',
    '  background:#14161a;color:#fff;font-size:.88rem;font-weight:600;line-height:1.4;text-align:center;',
    '  box-shadow:0 10px 30px rgba(14,15,18,.3);animation:tu-aviso .25s ease-out}',
    /* El puntito verde del botón Usuario: ya se registró */
    '.usuario-punto{display:inline-block;width:8px;height:8px;border-radius:50%;background:#16a34a;',
    '  box-shadow:0 0 0 2px #fff;vertical-align:middle;margin-left:5px}',
    '.usuario-punto[hidden]{display:none}',
    '.nav-item .usuario-punto{position:absolute;top:7px;left:calc(50% + 6px);margin:0}',
    '@keyframes tu-aparecer{from{opacity:0}}',
    '@keyframes tu-subir{from{opacity:0;transform:translateY(12px)}}',
    '@keyframes tu-aviso{from{opacity:0;transform:translate(-50%,12px)}}',
    '@media (prefers-reduced-motion:reduce){.tu-fondo,.tu-caja,.tu-aviso{animation:none}}'
  ].join('\n');

  var ICONO = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/>' +
              '<path d="M4 20.5a8 8 0 0 1 16 0"/></svg>';

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
        '<button type="button" class="tu-x" id="tuX" aria-label="Cerrar">&times;</button>' +
        '<div class="tu-ico">' + ICONO + '</div>' +
        '<h2 id="tuTitulo"></h2>' +
        '<p class="tu-sub" id="tuSub"></p>' +
        '<form id="tuForm" novalidate>' +
          '<label for="tuUsuario">Usuario</label>' +
          '<input id="tuUsuario" type="text" maxlength="40" autocomplete="nickname" ' +
                 'autocapitalize="words" placeholder="Cómo querés que te llamemos">' +
          '<label for="tuWa">WhatsApp</label>' +
          '<div class="tu-tel"><span>+591</span>' +
            '<input id="tuWa" type="tel" inputmode="numeric" maxlength="12" ' +
                   'autocomplete="tel-national" placeholder="7 123 4567"></div>' +
          '<p class="tu-error" id="tuError" role="alert" hidden></p>' +
          '<div class="tu-botones">' +
            '<button type="submit" class="tu-ok" id="tuOk"></button>' +
            '<button type="button" class="tu-no" id="tuNo"></button>' +
          '</div>' +
        '</form>' +
        '<p class="tu-pie">Sin contraseña ni correo. Queda guardado en este celular.</p>' +
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
      sub: 'Dejanos tu usuario y tu WhatsApp: tu pedido sale a tu nombre y por ahí te avisamos si hay algo con tu compra y antes de que venza. No se cobra nada automáticamente.',
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
    try { if (sessionStorage.getItem(LLAVE_NO)) return; } catch (e) { /* sigue */ }
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
