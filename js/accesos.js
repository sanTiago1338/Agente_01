// ============================================================
// TIAGO STORE · Los accesos de una compra
// ============================================================
// Arma "Tus accesos": cada cuenta entregada en su tarjeta oscura, con el
// nombre del producto arriba y sus datos abajo. Todo lo que se tipea
// (correo, contraseña, PIN) tiene su botón de copiar; la contraseña sale
// tapada, con el ojo para verla.
//
// Lo usan la página de pago ("¡Pago confirmado!", pagar-qr.html) y Mis
// compras (mis-compras.html), así el cliente ve lo mismo en los dos
// lugares. Los estilos están en css/accesos.css.
//
// Las credenciales llegan de la base en el momento (ver_mi_compra): no
// se guardan en el navegador. Acá solo se dibujan.
// ============================================================

export const escapar = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * ¿Esta línea tiene credenciales guardadas?
 *
 * Un pedido que se cierra desde el panel con "Listo" se entregó por
 * WhatsApp: quedó entregado, pero no hay ninguna cuenta guardada del lado
 * nuestro. Sin preguntar esto, al cliente le aparecía la tarjeta de las
 * credenciales vacía.
 */
export function conDatos(l) {
  const c = (l && l.credenciales) || {};
  return !!(c.usuario || c.clave || c.perfil || c.pin || c.notas);
}

// "2026-11-29" o "2026-11-29T…" → "29/11/2026"
export function fechaCorta(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

const ICONO_COPIAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>';
const ICONO_OJO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
export const ICONO_LLAVE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7.5" cy="12" r="3.5"/><path d="M11 12h10M18 12v3M15 12v2"/></svg>';

const TAPADA = '••••••••';

// El valor viaja en data-copiar / data-valor (escapado): copiar y ver no
// dependen de lo que está escrito en pantalla
const copiar = v =>
  `<button type="button" class="pp-icono" data-copiar="${escapar(v)}" aria-label="Copiar" title="Copiar">${ICONO_COPIAR}</button>`;

// Un dato de la cuenta: 'copiar' (con botón), 'clave' (tapada, con el ojo
// y copiar) o 'texto' (solo para leer, como el perfil)
function fila(etiqueta, valor, como = 'copiar') {
  if (!valor) return '';
  if (como === 'texto') {
    return `<div class="pp-dato"><span>${etiqueta}</span><b>${escapar(valor)}</b></div>`;
  }
  if (como === 'clave') {
    return `<div class="pp-dato"><span>${etiqueta}</span>
              <code class="tapada" data-valor="${escapar(valor)}">${TAPADA}</code>
              <span class="pp-dato-botones">
                <button type="button" class="pp-icono" data-ver aria-label="Mostrar contraseña" title="Mostrar">${ICONO_OJO}</button>
                ${copiar(valor)}
              </span></div>`;
  }
  return `<div class="pp-dato"><span>${etiqueta}</span><code>${escapar(valor)}</code>
            <span class="pp-dato-botones">${copiar(valor)}</span></div>`;
}

/**
 * Las tarjetas de las cuentas entregadas.
 *
 * @param {Array}  lineas   las de ver_mi_compra (se dibujan solo las entregadas)
 * @param {Object} opciones
 *   siempreVence: mostrar "Vence el" en todas. Si no, solo en un plan
 *                 rebajado, que dura menos que el plan entero (en la página
 *                 de pago, recién comprada, el resto se sobreentiende).
 * @returns {string} HTML
 */
export function htmlDeCuentas(lineas, { siempreVence = false } = {}) {
  return (lineas || []).filter(l => l.estado === 'entregado').map(l => {
    const nombre = `<div class="pp-cuenta-nombre">${escapar(l.producto)}</div>`;

    // Entregada a mano: los datos se los pasamos por el chat, no hay
    // nada que mostrar acá. Se dice, en vez de dejar el hueco.
    if (!conDatos(l)) {
      return `<div class="pp-cuenta">${nombre}
                <div class="pp-cuenta-wa">Esta cuenta te la entregamos <strong>por WhatsApp</strong>.
                Si todavía no te llegó, escribinos y te la reenviamos.</div></div>`;
    }

    const c = l.credenciales || {};
    const rebajado = Number(l.dias) && Number(l.dias_plan) && Number(l.dias) < Number(l.dias_plan);
    const vence = l.vence && (siempreVence || rebajado) ? fechaCorta(l.vence) : '';
    // "Correo" si el usuario es un correo, como lo llama la plataforma
    const usuario = String(c.usuario || '');

    return `<div class="pp-cuenta">${nombre}` +
      fila(usuario.includes('@') ? 'Correo' : 'Usuario', usuario) +
      fila('Contraseña', c.clave, 'clave') +
      fila('Perfil',     c.perfil, 'texto') +
      fila('PIN',        c.pin) +
      fila('Vence el',   vence, 'texto') +
      (c.notas ? `<div class="pp-cuenta-nota">${escapar(c.notas)}</div>` : '') +
      '</div>';
  }).join('');
}

/**
 * La caja entera: la llave, "Tus accesos" y las cuentas.
 * @returns {string} HTML ('' si no hay ninguna entregada)
 */
export function htmlDeAccesos(lineas, opciones) {
  const cuentas = htmlDeCuentas(lineas, opciones);
  if (!cuentas) return '';
  return `<div class="pp-accesos">
      <div class="pp-accesos-cab">
        <span class="pp-llave" aria-hidden="true">${ICONO_LLAVE}</span>
        <div>
          <strong>Tus accesos</strong>
          <small>Guárdalos en un lugar seguro. No compartas la contraseña.</small>
        </div>
      </div>
      <div class="pp-cuentas">${cuentas}</div>
    </div>`;
}

/**
 * Los botones de cada dato. Las tarjetas se vuelven a dibujar seguido,
 * por eso se escucha en la caja que las contiene y no en cada botón.
 * Se puede llamar más de una vez sobre la misma caja: engancha una sola.
 *   ojo     muestra u oculta la contraseña
 *   copiar  copia ese dato solo, y el ícono se pone verde un momento
 */
export function activarAccesos(caja) {
  if (!caja || caja.dataset.accesos) return;
  caja.dataset.accesos = '1';

  caja.addEventListener('click', async e => {
    const ver = e.target.closest('[data-ver]');
    if (ver) {
      const valor = ver.closest('.pp-dato').querySelector('code');
      const mostrar = valor.classList.contains('tapada');
      valor.textContent = mostrar ? valor.dataset.valor : TAPADA;
      valor.classList.toggle('tapada', !mostrar);
      ver.setAttribute('aria-label', mostrar ? 'Ocultar contraseña' : 'Mostrar contraseña');
      ver.title = mostrar ? 'Ocultar' : 'Mostrar';
      return;
    }

    const boton = e.target.closest('[data-copiar]');
    if (!boton) return;
    try {
      await navigator.clipboard.writeText(boton.dataset.copiar);
      boton.classList.add('ok');
      boton.title = 'Copiado';
      setTimeout(() => { boton.classList.remove('ok'); boton.title = 'Copiar'; }, 1400);
    } catch {
      // Sin permiso de portapapeles: se muestra el dato para copiarlo a mano
      const valor = boton.closest('.pp-dato').querySelector('code');
      if (valor && valor.classList.contains('tapada')) {
        valor.textContent = valor.dataset.valor;
        valor.classList.remove('tapada');
      }
    }
  });
}
