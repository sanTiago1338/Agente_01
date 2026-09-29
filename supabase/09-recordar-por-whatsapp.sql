-- ============================================================
-- TIAGO STORE · Recordarle por WhatsApp al que no pagó
-- ============================================================
-- Aplicado como la migración recordado_en.
--
-- En Panel → Ventas → "Ver", las compras sin pagar tienen el botón
-- "Recordar por WhatsApp": abre el chat del cliente con el mensaje ya
-- escrito y el enlace a su QR. Al tocarlo se anota cuándo, así la próxima
-- vez el panel dice "Ya le recordaste hace 2 h" y no se le escribe dos
-- veces sin querer.
--
-- El panel lo escribe con la política "solo admin edita pedidos"
-- (02-seguridad.sql): no hace falta nada más.
alter table public.pedidos
  add column if not exists recordado_en timestamptz;
