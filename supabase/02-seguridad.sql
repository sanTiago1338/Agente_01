-- ============================================================
-- TIAGO STORE · Seguridad (RLS)
-- ============================================================
-- Correr DESPUÉS de 01-esquema.sql, en el SQL Editor de Supabase.
--
-- QUÉ ES RLS Y POR QUÉ IMPORTA ACÁ
--   La clave "anon" de Supabase viaja en el JavaScript de la tienda, así
--   que cualquiera puede leerla del código fuente. Eso está bien y es por
--   diseño — igual que pasaba con la config de Firebase.
--
--   Lo que impide que un curioso con esa clave te cambie los precios NO es
--   esconder la clave: son estas políticas. Row Level Security se aplica
--   del lado del servidor y no hay forma de saltearla desde el navegador.
--
--   Sin RLS activo, esa clave anon deja hacer TODO. Con RLS y sin políticas,
--   no deja hacer nada. Las políticas de abajo abren exactamente lo justo:
--     · cualquiera puede LEER el catálogo   (es una tienda, tiene que verse)
--     · solo un admin de la lista puede ESCRIBIR
-- ============================================================


-- ============================================================
-- 1. QUIÉN ES ADMIN
-- ============================================================
-- En Firestore alcanzaba con "estar logueado" para escribir. Acá vamos un
-- paso más: hay que estar logueado Y estar en esta tabla.
--
-- Por qué el paso extra: si alguna vez se te escapa el registro abierto en
-- Supabase (Authentication → Providers → Enable signups), cualquiera podría
-- crearse una cuenta. Con esta tabla, crearse la cuenta no le sirve de nada:
-- si no está acá, no escribe.
create table if not exists public.admins (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  nota        text,
  creado_en   timestamptz not null default now()
);

alter table public.admins enable row level security;

-- Un admin puede ver la lista de admins. Nadie más.
-- Nadie puede modificarla desde el navegador: para agregar o sacar un admin
-- se usa el SQL Editor (ver el final del archivo).
drop policy if exists "admins se ven entre ellos" on public.admins;
create policy "admins se ven entre ellos"
  on public.admins for select
  to authenticated
  using (id = auth.uid());

-- Helper: ¿el que está pidiendo esto es admin?
-- security definer = la función mira la tabla admins aunque quien pregunta
-- no tenga permiso de leerla. Sin esto, la política se muerde la cola.
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where id = auth.uid());
$$;

-- Toda función que vive en el esquema "public" la publica PostgREST como
-- endpoint (/rest/v1/rpc/es_admin), y Postgres le da EXECUTE a PUBLIC por
-- defecto. O sea: sin estas tres líneas queda abierta a cualquiera.
--
-- No sería grave —contesta "¿el que pregunta es admin?" sobre uno mismo, y
-- sin sesión auth.uid() es null y siempre da false— pero la tienda pública
-- no tiene por qué poder llamarla. El que la usa es el panel, ya logueado:
-- la llama al entrar para avisarte si tu usuario quedó fuera de la lista,
-- en vez de dejarte descubrirlo cuando falla el primer "Guardar".
revoke execute on function public.es_admin() from public;
revoke execute on function public.es_admin() from anon;
grant  execute on function public.es_admin() to   authenticated;

-- ------------------------------------------------------------
-- rls_auto_enable() — la instaló Supabase, no nosotros
-- ------------------------------------------------------------
-- Viene con la opción "Activar RLS automático" al crear el proyecto. Es la
-- función del event trigger "ensure_rls", que enciende RLS sola en cada
-- tabla nueva. La dispara Postgres al correr un CREATE TABLE, no una
-- llamada HTTP: los event triggers no pasan por el permiso EXECUTE. Así que
-- quitarle el permiso la saca de /rest/v1/rpc/ sin apagar la protección.
-- (El revisor de seguridad de Supabase la marcaba como expuesta.)
--
-- Si el proyecto se creó sin esa opción, la función no existe y esto no
-- hace nada.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;


-- ============================================================
-- 2. PRODUCTOS
-- ============================================================
alter table public.productos enable row level security;

-- LEER: cualquiera, incluso sin login. Es el catálogo de una tienda pública.
drop policy if exists "catalogo publico" on public.productos;
create policy "catalogo publico"
  on public.productos for select
  to anon, authenticated
  using (true);

-- ESCRIBIR: solo admins.
-- Van tres políticas separadas (insert / update / delete) en vez de un
-- "for all" para que después se pueda aflojar una sin tocar las otras.
drop policy if exists "solo admin crea productos" on public.productos;
create policy "solo admin crea productos"
  on public.productos for insert
  to authenticated
  with check (public.es_admin());

drop policy if exists "solo admin edita productos" on public.productos;
create policy "solo admin edita productos"
  on public.productos for update
  to authenticated
  using (public.es_admin())
  with check (public.es_admin());

drop policy if exists "solo admin borra productos" on public.productos;
create policy "solo admin borra productos"
  on public.productos for delete
  to authenticated
  using (public.es_admin());


-- ============================================================
-- 3. JUEGOS
-- ============================================================
alter table public.juegos enable row level security;

drop policy if exists "juegos publicos" on public.juegos;
create policy "juegos publicos"
  on public.juegos for select
  to anon, authenticated
  using (true);

drop policy if exists "solo admin crea juegos" on public.juegos;
create policy "solo admin crea juegos"
  on public.juegos for insert
  to authenticated
  with check (public.es_admin());

drop policy if exists "solo admin edita juegos" on public.juegos;
create policy "solo admin edita juegos"
  on public.juegos for update
  to authenticated
  using (public.es_admin())
  with check (public.es_admin());

drop policy if exists "solo admin borra juegos" on public.juegos;
create policy "solo admin borra juegos"
  on public.juegos for delete
  to authenticated
  using (public.es_admin());


-- ============================================================
-- 3b. SI ACTIVASTE "RLS AUTOMÁTICO" AL CREAR EL PROYECTO
-- ============================================================
-- Esa opción instala un event trigger ("ensure_rls") que enciende RLS solo
-- en cada tabla nueva. Está buenísimo, pero deja su función en el esquema
-- public, y por lo tanto expuesta como endpoint HTTP.
--
-- La dispara Postgres cuando corre un CREATE TABLE, no una llamada HTTP:
-- los event triggers no pasan por el permiso EXECUTE. Quitarle el permiso
-- la saca de la API sin apagar la protección — probado creando una tabla
-- después de esto y verificando que igual nace con RLS encendido.
--
-- El "if exists" es porque si no activaste esa opción, la función no está.
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    revoke execute on function public.rls_auto_enable() from public;
    revoke execute on function public.rls_auto_enable() from anon;
    revoke execute on function public.rls_auto_enable() from authenticated;
  end if;
end;
$$;


-- ============================================================
-- 4. CÓMO DARTE DE ALTA COMO ADMIN
-- ============================================================
-- Primero creá tu usuario a mano (una sola vez):
--   Supabase → Authentication → Users → Add user → Create new user
--   Poné tu email y una contraseña. Marcá "Auto Confirm User".
--
-- Después volvé acá, descomentá estas dos líneas, cambiá el email por el
-- tuyo y dale Run:
--
--   insert into public.admins (id, email, nota)
--   select id, email, 'dueño de la tienda' from auth.users where email = 'TU-EMAIL@gmail.com'
--   on conflict (id) do nothing;
--
-- Para comprobar que quedó:
--   select * from public.admins;
--
-- Para sacar un admin:
--   delete from public.admins where email = 'ex-empleado@gmail.com';
--   (la cuenta sigue existiendo y puede entrar al panel, pero no escribe nada)


-- ============================================================
-- 5. CERRÁ EL REGISTRO ABIERTO
-- ============================================================
-- Esto no es SQL, es un botón, pero es parte de la seguridad y se olvida:
--
--   Supabase → Authentication → Sign In / Providers → Email
--   → "Allow new users to sign up"  ->  APAGADO
--
-- Tus usuarios los creás vos a mano desde el panel de Supabase. Nadie
-- necesita registrarse solo en una tienda que no tiene cuentas de cliente.


-- ============================================================
-- LISTO
-- ============================================================
-- Ahora corré 03-realtime.sql.
