-- ============================================================
-- TIAGO STORE · Storage para imágenes  (OPCIONAL — fase 2)
-- ============================================================
-- Esto NO hace falta para mudarte. La tienda funciona perfecto sin correr
-- este archivo. Dejalo para cuando la mudanza ya esté andando y quieras
-- bajarle el peso.
--
-- EL PROBLEMA QUE RESUELVE
--   Hoy las imágenes viven DENTRO del producto, como data URI:
--     imagen: "data:image/webp;base64,UklGRt4..."
--
--   Eso se hizo por una limitación de Firestore (1 MB por documento) y
--   funciona, pero tiene dos costos:
--
--     1. El catálogo entero se descarga en una sola respuesta. Con 200
--        productos a ~150 KB de base64 cada uno, son ~30 MB antes de que
--        se vea la primera tarjeta.
--     2. El navegador no puede cachear las imágenes por separado ni
--        cargarlas de a poco (lazy loading), porque no son archivos:
--        son texto adentro del JSON.
--
--   Moviéndolas a Storage, el campo "imagen" pasa a ser una URL normal:
--     imagen: "https://xxxx.supabase.co/storage/v1/object/public/imagenes/netflix.webp"
--
--   El catálogo pesa unos pocos KB, cada imagen se cachea sola, y el
--   loading="lazy" que ya tienen las tarjetas por fin sirve para algo.
--
-- CÓMO SE HACE LA MUDANZA DE LAS IMÁGENES
--   Con backup/migrar-imagenes-supabase.html, que hace el trabajo de a
--   tandas y va guardando: si se corta, seguís desde donde quedó.
--   No borra nada hasta que la URL nueva contesta bien.
-- ============================================================


-- ============================================================
-- 1. EL BUCKET
-- ============================================================
-- public = true significa que las imágenes se ven sin login ni firma,
-- igual que un archivo estático cualquiera. Es lo que querés para las
-- fotos de un catálogo público.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'imagenes',
  'imagenes',
  true,
  2097152,                                   -- 2 MB por archivo, de sobra:
                                             -- el panel ya las comprime a ~220 KB
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- ============================================================
-- 2. QUIÉN PUEDE QUÉ
-- ============================================================
-- Las políticas de Storage funcionan igual que las de las tablas: son RLS
-- sobre storage.objects.

-- VER: cualquiera. Son las fotos de la tienda.
drop policy if exists "imagenes visibles para todos" on storage.objects;
create policy "imagenes visibles para todos"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'imagenes');

-- SUBIR / REEMPLAZAR / BORRAR: solo admins, la misma lista de 02-seguridad.sql.
drop policy if exists "solo admin sube imagenes" on storage.objects;
create policy "solo admin sube imagenes"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'imagenes' and public.es_admin());

drop policy if exists "solo admin reemplaza imagenes" on storage.objects;
create policy "solo admin reemplaza imagenes"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'imagenes' and public.es_admin())
  with check (bucket_id = 'imagenes' and public.es_admin());

drop policy if exists "solo admin borra imagenes" on storage.objects;
create policy "solo admin borra imagenes"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'imagenes' and public.es_admin());


-- ============================================================
-- 3. CUÁNTO PESA HOY EL CATÁLOGO
-- ============================================================
-- Para saber si vale la pena. Corré esto y mirá el total:
--
--   select
--     count(*)                                              as productos,
--     count(*) filter (where imagen like 'data:%')          as con_imagen_pegada,
--     pg_size_pretty(sum(length(imagen))::bigint)           as peso_de_las_imagenes
--   from public.productos;
--
-- Si "con_imagen_pegada" es 0, ya está todo en Storage y no hay nada que hacer.
