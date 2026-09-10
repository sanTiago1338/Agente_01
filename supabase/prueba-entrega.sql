-- ============================================================
-- TIAGO STORE · Probar la entrega automática de punta a punta
-- ============================================================
-- Para correr en Supabase → SQL Editor, UN BLOQUE POR VEZ.
--
-- Crea un producto de prueba para que pagar-qr.html tenga contra qué crear
-- un pedido de verdad.
--
-- ⚠️ OJO: este producto SÍ se va a ver en el catálogo mientras exista, y
--    lo puede ver un cliente. Crealo, probá, y borralo con el bloque 4.
--
--    Y tiene que estar activo: crear_pedido() se niega a cobrar por algo
--    agotado, así que no se puede esconder marcándolo inactivo sin romper
--    la prueba misma.
--
--    O sea: mientras dure la prueba vas a tener un producto llamado
--    "PRUEBA entrega automatica (borrar)" a 1 Bs en tu tienda publicada.
--    Va último de la lista (orden 999999), pero se ve.
--
--    CORRÉ EL BLOQUE DE LIMPIEZA DEL FINAL APENAS TERMINES.
--    Si podés, hacelo en un horario de poco tráfico.
--
-- El id es fijo a propósito (a0000000-...-c0de): así el link de prueba se
-- puede armar sin tener que copiar nada de acá.
--
-- Cuando termines, corré el BLOQUE 4 y no queda rastro.
--
-- DESPUÉS DEL BLOQUE 1, con el servidor local corriendo
-- (powershell -File servidor.ps1), abrí esto y vas a ver el pedido
-- crearse solo, con su número en vez de la referencia al azar:
--
--   http://localhost:8099/pagar-qr.html?cart=%255B%257B%2522fid%2522%253A%2522a0000000-0000-4000-8000-00000000c0de%2522%252C%2522name%2522%253A%2522PRUEBA%2520entrega%2520automatica%2520%28borrar%29%2522%252C%2522price%2522%253A1%252C%2522qty%2522%253A1%257D%255D&total=1.00
--
-- Después del BLOQUE 3, la cuenta aparece en esa misma página sin
-- recargar. Con el link pelado (pagar-qr.html#t=...), el que queda en
-- WhatsApp, se vuelve a ver.
-- ============================================================


-- ============================================================
-- BLOQUE 1 · Crear el producto de prueba y UNA cuenta libre
-- ============================================================
-- Una sola cuenta a propósito: el primer pedido se entrega, el segundo
-- cae en "sin_stock". Así se prueban los dos caminos.
insert into public.productos (id, nombre, categoria, precio, activo, orden, imagen_texto)
values (
  'a0000000-0000-4000-8000-00000000c0de',
  'PRUEBA entrega automatica (borrar)',
  'streaming', 1.00, true, 999999, 'PRUEBA'
)
on conflict (id) do nothing;

insert into public.cuentas (producto_id, credenciales, nota)
values (
  'a0000000-0000-4000-8000-00000000c0de',
  '{"usuario": "prueba@tiagostore.test",
    "clave":   "Clave-De-Prueba-123",
    "perfil":  "Perfil 2",
    "pin":     "4321",
    "notas":   "Es una cuenta de PRUEBA, no sirve para nada"}'::jsonb,
  'prueba'
);

select 'Listo: producto de prueba con ' || public.hay_stock('a0000000-0000-4000-8000-00000000c0de') || ' cuenta libre' as resultado;


-- ============================================================
-- BLOQUE 2 · Ver los pedidos de prueba que se crearon
-- ============================================================
select numero, estado, precio, cliente_nombre, cliente_email, creado_en
from public.pedidos
where producto_id = 'a0000000-0000-4000-8000-00000000c0de'
order by numero desc;


-- ============================================================
-- BLOQUE 3 · Confirmar el pago del ÚLTIMO pedido de prueba
-- ============================================================
-- Hace exactamente lo mismo que el botón "Confirmar pago" del panel:
-- llama a confirmar_pago(). La página del cliente lo ve sola en
-- menos de 4 segundos.
select * from public.confirmar_pago(
  (select id from public.pedidos
    where producto_id = 'a0000000-0000-4000-8000-00000000c0de'
    order by numero desc limit 1),
  'prueba manual',
  'sql:prueba'
);


-- ============================================================
-- BLOQUE 4 · Limpiar. No queda nada.
-- ============================================================
-- En este orden: las cuentas apuntan al producto con "restrict", así que
-- el producto no se deja borrar mientras tenga cuentas.
delete from public.cuentas   where producto_id = 'a0000000-0000-4000-8000-00000000c0de';
delete from public.pedidos   where producto_id = 'a0000000-0000-4000-8000-00000000c0de';
delete from public.productos where id          = 'a0000000-0000-4000-8000-00000000c0de';

select 'Limpio' as resultado;
