-- ============================================================
-- TIAGO STORE · Probar la entrega automática de punta a punta
-- ============================================================
-- Para correr en Supabase → SQL Editor, UN BLOQUE POR VEZ.
--
-- Crea un producto de prueba que no toca nada de lo tuyo: la tienda
-- pública sigue leyendo de Firestore, así que este producto no aparece en
-- ninguna página. Solo existe para que pagar-qr.html tenga contra qué
-- crear un pedido de verdad.
--
-- El id es fijo a propósito (a0000000-...-c0de): así el link de prueba se
-- puede armar sin tener que copiar nada de acá.
--
-- Cuando termines, corré el BLOQUE 4 y no queda rastro.
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
