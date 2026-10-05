// ============================================================
// TIAGO STORE · "Probar la tienda"
// ============================================================
// Los enlaces con data-probar (en el menú y arriba en el celular) abren la
// tienda en modo prueba: index.html#prueba=<clave>. Lo que se compra así
// no cuenta como venta, no avisa por Telegram y, si nadie lo paga, se
// cancela solo (supabase/20-modo-prueba.sql, js/modo-prueba.js).
//
// La clave la da la base solo a un admin. Sin ella los enlaces no se
// muestran: abrirían la tienda normal y la "prueba" sería una compra de
// verdad.
// ============================================================

import { sbAdmin } from '../../js/supabase-config.js';
import { tengoPermiso } from './admin-permiso.js';

(async () => {
  const permiso = await tengoPermiso();
  if (!permiso.puede) return;

  const { data, error } = await sbAdmin.rpc('clave_de_prueba');
  if (error || !data) { if (error) console.warn('Modo prueba:', error.message); return; }

  document.querySelectorAll('[data-probar]').forEach(a => {
    a.href = `../index.html#prueba=${encodeURIComponent(data)}`;
    a.hidden = false;
  });
})();
