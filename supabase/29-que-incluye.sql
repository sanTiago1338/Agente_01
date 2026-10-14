-- ============================================================
-- TIAGO STORE · 29 · "QUÉ INCLUYE": LA DESCRIPCIÓN PARA EL CLIENTE
-- ============================================================
-- Se puede correr de nuevo sin romper nada.
--
-- EL PROBLEMA
--   La columna descripcion ya tiene dueño: es la "Guía de activación"
--   (las reglas del servicio) y además decide si la tienda le pide el
--   correo al cliente ("a correo de cliente", ver 28). No había dónde
--   poner lo que vende el producto: qué es y qué beneficios trae.
--
-- LO NUEVO
--   · productos.detalle: una frase y abajo los beneficios, uno por
--     renglón con "- " adelante. Se carga en el panel (Productos →
--     editar → Qué incluye). Vacío = la tienda no muestra el botón.
--   · Alcanza con ponerlo en un plan: la tienda usa el primero que
--     encuentra entre los planes de la misma plataforma.
--   · En la tienda, el cartel de la plataforma suma un botón de vidrio
--     "Qué incluye": al tocarlo el cartel se da vuelta y atrás está esto
--     (js/tienda.js, cartelQueGira).
--
-- Los permisos no cambian: la tienda ya lee productos con select('*') y
-- el panel ya los edita; una columna nueva entra sola en los dos.
-- ============================================================

alter table public.productos
  add column if not exists detalle text not null default '';

comment on column public.productos.detalle is
  'Qué incluye: frase y beneficios ("- " adelante), lo ve el cliente al dar vuelta el cartel de la plataforma';
