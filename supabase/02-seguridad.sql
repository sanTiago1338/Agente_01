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
