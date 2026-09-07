-- ============================================================
-- TIAGO STORE · Esquema de la base en Supabase
-- ============================================================
-- Correr una sola vez, en:  Supabase → SQL Editor → New query
-- Pegar TODO este archivo y darle a "Run".
--
-- Es idempotente: si lo corrés dos veces no rompe nada.
--
-- Orden de los archivos:
--   01-esquema.sql     <- estás acá (tablas)
--   02-seguridad.sql      (quién puede leer y escribir)
--   03-realtime.sql       (que la tienda se actualice sola)
--   04-storage.sql        (opcional, fase 2: imágenes)
--
-- POR QUÉ LOS NOMBRES CAMBIAN DE FORMA
--   En Firestore los campos eran camelCase: precioOferta, mostrarEnPlanes.
--   En Postgres lo normal es snake_case: precio_oferta, mostrar_en_planes.
--   Si usáramos camelCase habría que escribir "precioOferta" entre comillas
--   dobles en CADA consulta, para siempre.
--   La traducción entre los dos mundos vive en un solo archivo: js/mapeo.js.
--   La tienda y el panel siguen viendo camelCase y no se enteran de nada.
-- ============================================================


-- ============================================================
-- 1. PRODUCTOS
-- ============================================================
-- Lo que se vende en la tienda: Netflix, Spotify, Canva, combos...
create table if not exists public.productos (
  id                  uuid primary key default gen_random_uuid(),

  -- --- Lo que ve el cliente ---
  nombre              text        not null,
  categoria           text        not null default '',   -- streaming, musica, ia, combos, vpn, seguidores, juegos
  descripcion         text        not null default '',
  etiqueta            text        not null default '',   -- "OFERTA", "RENOVABLE", "NUEVO"...
  estrellas           smallint    not null default 5,
  tipo                text        not null default '',   -- lista separada por comas: "completa,premium"

  -- --- Precios (en bolivianos) ---
  precio              numeric(10,2) not null default 0,
  -- precio_oferta va NULL cuando no hay oferta. No 0: 0 es un precio,
  -- NULL es "no tiene". La tienda distingue los dos casos.
  precio_oferta       numeric(10,2),
  oferta              boolean     not null default false,

  -- --- Imagen ---
  -- Hoy guarda o una ruta ("Img/Netflix.jpg") o un data URI completo
  -- ("data:image/webp;base64,..."). Por eso es text y no varchar(n).
  imagen              text        not null default '',
  imagen_fill         boolean     not null default false,
  imagen_color        text        not null default '#333333,#666666',
  imagen_texto        text        not null default '',

  -- --- Ficha del plan (vacío = "deducilo vos, tienda") ---
  entrega             text        not null default '',
  soporte             text        not null default '',
  acceso              text        not null default '',
  suscripcion         text        not null default '',

  -- --- Estado ---
  -- OJO: activo = false NO oculta el producto. Lo muestra como AGOTADO
  -- (botón gris, no se puede comprar). Así funciona hoy la tienda.
  activo              boolean     not null default true,
  destacado           boolean     not null default false,
  mostrar_en_planes   boolean     not null default false,
  orden               integer     not null default 999999,  -- menor = primero

  -- El id numérico del catálogo viejo (el de antes de Firestore).
  -- La tienda lo usa en los onclick: openProduct(12). Se conserva para
  -- que los links viejos que alguien haya guardado sigan funcionando.
  id_legacy           integer,

  -- El id que tenía el documento en Firestore ("kL9x2mPq").
  -- Es SOLO para la mudanza, y hace dos cosas importantes:
  --   1. La herramienta de migración se puede correr las veces que quieras
  --      sin duplicar nada: la segunda vez actualiza en vez de insertar.
  --   2. Deja comparar las dos bases fila por fila para verificar que la
  --      copia salió bien.
  -- Cuando la mudanza esté confirmada se puede borrar la columna:
  --      alter table public.productos drop column firestore_id;
  firestore_id        text unique,

  fecha_creacion      timestamptz not null default now(),
  fecha_actualizacion timestamptz not null default now()
);

-- La tienda SIEMPRE pide el catálogo ordenado por "orden".
create index if not exists productos_orden_idx
  on public.productos (orden);

-- planes.html filtra por esta bandera.
create index if not exists productos_planes_idx
  on public.productos (mostrar_en_planes)
  where mostrar_en_planes = true;

-- El panel ordena por "más nuevo".
create index if not exists productos_fecha_creacion_idx
  on public.productos (fecha_creacion desc);

-- Dos productos no deberían compartir el id viejo.
-- Se permiten varios NULL (los productos creados desde el panel no lo tienen).
create unique index if not exists productos_id_legacy_idx
  on public.productos (id_legacy)
  where id_legacy is not null;


-- ============================================================
-- 2. JUEGOS
-- ============================================================
-- Las recargas: Free Fire, Roblox, Mobile Legends...
--
-- Los paquetes de recarga viven DENTRO del juego, en una columna jsonb,
-- igual que en Firestore. Podrían ser una tabla aparte, pero:
--   · nunca se consultan sueltos (siempre se pide el juego entero),
--   · se editan todos juntos en el mismo formulario del panel,
--   · así una sola lectura trae el juego completo.
-- Si algún día hace falta buscar "todos los paquetes de menos de 20 Bs",
-- ahí sí conviene partirlos en su propia tabla.
create table if not exists public.juegos (
  id                  uuid primary key default gen_random_uuid(),

  nombre              text        not null,
  unidad              text        not null default '',   -- "Diamantes", "Robux", "CP"...
  etiqueta            text        not null default '',   -- "PROMO", "NUEVO"...
  logo                text        not null default '',
  color1              text        not null default '#333333',
  color2              text        not null default '#666666',

  -- --- Qué le pedimos al cliente para recargar ---
  necesita_server_id  boolean     not null default false,
  necesita_cuenta     boolean     not null default false,
  auto_region         boolean     not null default false,
  etiquetas_id        jsonb       not null default '[]'::jsonb,

  -- --- Estado ---
  -- Acá activo = false SÍ oculta el juego (a diferencia de productos).
  activo              boolean     not null default true,
  popular             boolean     not null default false,
  nuevo               boolean     not null default false,
  orden               integer     not null default 999999,

  -- Cada paquete:
  --   { nombre, icono, precio, grupo, consultar, necesitaEmail, cantidad, orden }
  -- Adentro del JSON los nombres siguen en camelCase, igual que en
  -- Firestore, así el front no cambia ni una línea.
  paquetes            jsonb       not null default '[]'::jsonb,

  -- Igual que en productos: el id del documento de Firestore, para que la
  -- migración se pueda repetir sin duplicar. Se borra cuando ya no haga falta.
  firestore_id        text unique,

  fecha_creacion      timestamptz not null default now(),
  fecha_actualizacion timestamptz not null default now()
);

create index if not exists juegos_orden_idx
  on public.juegos (orden);

-- La página pública solo trae los juegos activos.
create index if not exists juegos_activos_idx
  on public.juegos (activo)
  where activo = true;


-- ============================================================
-- 3. FECHA DE ACTUALIZACIÓN AUTOMÁTICA
-- ============================================================
-- En Firestore el panel mandaba serverTimestamp() en cada guardado y
-- había que acordarse de ponerlo en cada updateDoc. Un olvido y la fecha
-- quedaba vieja.
--
-- Acá lo hace la base: pase lo que pase, si la fila cambia, la fecha se
-- actualiza sola. No hay forma de olvidarse.
create or replace function public.tocar_fecha_actualizacion()
returns trigger
language plpgsql
as $$
begin
  new.fecha_actualizacion = now();
  -- La fecha de creación no se toca nunca, aunque manden otra cosa.
  new.fecha_creacion = old.fecha_creacion;
  return new;
end;
$$;

drop trigger if exists productos_tocar_fecha on public.productos;
create trigger productos_tocar_fecha
  before update on public.productos
  for each row execute function public.tocar_fecha_actualizacion();

drop trigger if exists juegos_tocar_fecha on public.juegos;
create trigger juegos_tocar_fecha
  before update on public.juegos
  for each row execute function public.tocar_fecha_actualizacion();


-- ============================================================
-- 4. SIGUIENTE "orden" Y SIGUIENTE "id_legacy"
-- ============================================================
-- El panel los calcula hoy en JavaScript, mirando el catálogo que tiene
-- en memoria. Funciona, pero si dos personas crean un producto al mismo
-- tiempo pueden pisarse. Estas funciones lo resuelven en la base.
create or replace function public.siguiente_orden_producto()
returns integer
language sql
stable
as $$
  select coalesce(max(orden), 0) + 10 from public.productos;
$$;

create or replace function public.siguiente_orden_juego()
returns integer
language sql
stable
as $$
  select coalesce(max(orden), 0) + 10 from public.juegos;
$$;

create or replace function public.siguiente_id_legacy()
returns integer
language sql
stable
as $$
  select coalesce(max(id_legacy), 0) + 1 from public.productos;
$$;


-- ============================================================
-- LISTO
-- ============================================================
-- Ahora corré 02-seguridad.sql.
