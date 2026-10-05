-- ============================================================
-- TIAGO STORE · 22 · Cerrar dos funciones viejas
-- ============================================================
-- Aplicado con la migración:
--   cerrar_funciones_viejas   (4/10/2026, antes que el 20 y el 21: da
--   igual el orden, solo quita permisos)
--
-- crear_pedido() y ver_mi_pedido() son de cuando la tienda vendía un
-- producto por pedido. Las reemplazaron crear_compra() y ver_mi_compra()
-- (compras de varios productos), y ni la tienda ni el panel ni otra
-- función las llaman: revisado en el código, en la base y en los
-- registros (0 llamadas en 24 horas, el 4/10/2026).
--
-- Seguían abiertas a cualquiera desde internet. No se borran: solo se les
-- quita el acceso público. Si algún día hicieran falta, se vuelven a abrir
-- con un GRANT.
-- ============================================================

revoke execute on function public.crear_pedido(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.ver_mi_pedido(text) from public, anon, authenticated;
