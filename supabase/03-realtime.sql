-- ============================================================
-- TIAGO STORE · Realtime (que la tienda se actualice sola)
-- ============================================================
-- Correr DESPUÉS de 02-seguridad.sql.
--
-- QUÉ HACE
--   Hoy, con Firestore, cuando cambiás un precio en el panel la tienda
--   abierta en el celular de un cliente se actualiza sola, sin recargar.
--   Eso lo daba onSnapshot().
--
--   En Supabase el equivalente es Realtime, y hay que encenderlo tabla por
--   tabla: Postgres no manda cambios a nadie salvo que se lo pidas.
--
-- OJO CON RLS
--   Realtime respeta las políticas de 02-seguridad.sql. Como el SELECT es
--   público, los cambios del catálogo llegan a todos los que estén mirando
--   la tienda — que es justo lo que queremos.
-- ============================================================

-- La publicación supabase_realtime ya viene creada en todo proyecto nuevo.
-- Estas dos líneas le agregan nuestras tablas.
-- El bloque do/exception es porque "add table" tira error si la tabla ya
-- está adentro, y queremos poder correr este archivo dos veces sin drama.
do $$
begin
  alter publication supabase_realtime add table public.productos;
exception
  when duplicate_object then
    raise notice 'productos ya estaba en supabase_realtime, sigo';
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.juegos;
exception
  when duplicate_object then
    raise notice 'juegos ya estaba en supabase_realtime, sigo';
end;
$$;


-- ============================================================
-- FILA COMPLETA EN LOS BORRADOS Y EN LAS EDICIONES
-- ============================================================
-- Por defecto, cuando borrás una fila, Postgres solo avisa su clave
-- primaria: el evento DELETE llega con { id } y nada más.
--
-- Para la tienda alcanza (con el id sabe qué tarjeta sacar), pero
-- "replica identity full" hace que el evento traiga la fila entera.
-- Cuesta un poco más de tráfico y a cambio el panel puede mostrar
-- "se eliminó Netflix Premium" en vez de "se eliminó a1b2c3d4".
alter table public.productos replica identity full;
alter table public.juegos    replica identity full;


-- ============================================================
-- COMPROBAR QUE QUEDÓ
-- ============================================================
-- Tienen que salir las dos filas, productos y juegos:
--
--   select tablename
--   from pg_publication_tables
--   where pubname = 'supabase_realtime';
--
-- También se ve con botones en:
--   Supabase → Database → Replication → supabase_realtime


-- ============================================================
-- LISTO
-- ============================================================
-- Con esto la base ya funciona. 04-storage.sql es opcional (fase 2).
