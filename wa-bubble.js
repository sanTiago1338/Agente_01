/* Burbuja flotante para unirse al grupo de WhatsApp.
   Se inyecta sola: basta con incluir este script en cualquier página. */
(function () {
  var GRUPO = 'https://chat.whatsapp.com/EcYW44UHMPaDncFarSqVac';

  var css = document.createElement('style');
  css.textContent = [
    '.wa-bubble{',
    '  position:fixed; right:16px; bottom:20px; z-index:150;',
    '  display:flex; align-items:center; justify-content:center;',
    '  width:56px; height:56px; border-radius:50%;',
    '  background:#25D366; color:#fff; text-decoration:none;',
    '  box-shadow:0 6px 22px rgba(0,0,0,0.45), 0 0 0 rgba(37,211,102,0.5);',
    '  animation:wa-bubble-pulse 2.6s ease-out infinite;',
    '  transition:transform .2s ease, background .2s ease;',
    '}',
    '.wa-bubble:hover{ background:#1fbe5b; transform:scale(1.06); }',
    '.wa-bubble svg{ width:32px; height:32px; }',
    /* En páginas con barra inferior fija, subimos la burbuja para no taparla */
    '.wa-bubble.has-bottom-nav{ bottom:76px; }',
    '@keyframes wa-bubble-pulse{',
    '  0%{ box-shadow:0 6px 22px rgba(0,0,0,0.45), 0 0 0 0 rgba(37,211,102,0.45); }',
    '  70%{ box-shadow:0 6px 22px rgba(0,0,0,0.45), 0 0 0 16px rgba(37,211,102,0); }',
    '  100%{ box-shadow:0 6px 22px rgba(0,0,0,0.45), 0 0 0 0 rgba(37,211,102,0); }',
    '}',
    '@media (prefers-reduced-motion:reduce){ .wa-bubble{ animation:none; } }'
  ].join('\n');
  document.head.appendChild(css);

  function montar() {
    if (document.querySelector('.wa-bubble')) return;

    var a = document.createElement('a');
    a.className = 'wa-bubble';
    a.href = GRUPO;
    a.target = '_blank';
    a.rel = 'noopener';
    a.setAttribute('aria-label', 'Unirme al grupo de WhatsApp');
    a.title = 'Unirme al grupo de WhatsApp';
    a.innerHTML =
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
      '<path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.48-1.75-1.65-2.05-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.28.17-1.41-.07-.13-.27-.2-.57-.35z"/>' +
      '<path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.83 9.83 0 0 0 12.04 2zm0 18.13h-.01c-1.48 0-2.94-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.22 8.22 0 0 1-1.26-4.36c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.7 8.23-8.23 8.23z"/>' +
      '</svg>';

    if (document.querySelector('.bottom-nav')) a.classList.add('has-bottom-nav');
    document.body.appendChild(a);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', montar);
  } else {
    montar();
  }
})();
