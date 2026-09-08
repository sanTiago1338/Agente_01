-- ============================================================
-- TIAGO STORE · Pedidos, stock de cuentas y entrega automática
-- ============================================================
-- Correr DESPUÉS de 01, 02 y 03.
--
-- QUÉ RESUELVE
--   Hoy: el cliente paga por QR, te escribe por WhatsApp, vos mirás si
--   entró la plata y le mandás la cuenta a mano. De noche o cuando estás
--   ocupado, el cliente espera.
--
--   Con esto: el cliente paga, el pago se confirma, y la cuenta le aparece
--   sola en la misma página donde estaba. Sin WhatsApp, sin esperar.
--
-- DE DÓNDE SALE LA CONFIRMACIÓN
--   Este archivo NO decide eso a propósito. La confirmación entra por una
--   sola puerta —confirmar_pago()— y puede llamarla:
--     · el panel, cuando vos tocás "Confirmar" (funciona hoy mismo)
--     · un webhook de la pasarela, cuando tengas una (automático)
--   Cambiar de una a la otra no toca ni las tablas ni la entrega.
--
-- LO QUE NO SE PUEDE
--   Con un QR estático (una imagen fija) no hay detección automática
--   posible: ese QR no lleva monto ni referencia, y el banco no avisa a
--   nadie. Hace falta un QR dinámico por pedido, que da una pasarela con
--   API. Mientras tanto, la Capa 1 (confirmás vos) ya entrega sola.
-- ============================================================


-- ============================================================
-- 1. STOCK DE CUENTAS
-- ============================================================
-- Las cuentas compradas por lote que esperan comprador.
--
-- ⚠️ ESTA ES LA TABLA MÁS SENSIBLE DE TODA LA BASE. Tiene contraseñas de
--    verdad. Abajo se le niega TODO acceso a la clave anon: no hay ninguna
--    política de lectura para el público. La única forma de que un cliente
--    vea credenciales es la función ver_mi_pedido(), que se las da solo si
--    su pedido está pagado y trae el token correcto.
create table if not exists public.cuentas (
  id            uuid primary key default gen_random_uuid(),

  -- De qué producto es esta cuenta.
  -- restrict = no te deja borrar un producto que todavía tiene stock,
  -- para que no se te evaporen cuentas por las que pagaste.
  producto_id   uuid not null references public.productos (id) on delete restrict,

  -- Lo que se le entrega al cliente. jsonb porque cada servicio pide algo
  -- distinto: Netflix lleva perfil y PIN, Spotify va a correo del cliente,
  -- una IPTV lleva usuario, clave y URL del portal.
  --   { "usuario": "...", "clave": "...", "perfil": "Perfil 2", "pin": "1234",
  --     "notas": "No cambiar la contraseña" }
  credenciales  jsonb not null,

  -- libre      → esperando comprador
  -- reservada  → hay un pedido pagado apuntándole, se está entregando
  -- entregada  → ya es de un cliente
  -- anulada    → se cayó, la reemplazaste, no la vendas
  estado        text not null default 'libre'
                check (estado in ('libre','reservada','entregada','anulada')),

  pedido_id     uuid,

  -- Para cuentas renovables: hasta cuándo sirve.
  vence_en      date,

  -- Cuánto te costó. Sirve para saber si estás ganando plata de verdad.
  costo         numeric(10,2),

  nota          text,
  creada_en     timestamptz not null default now(),
  entregada_en  timestamptz
);

-- El índice que hace rápida la pregunta "¿hay stock de este producto?",
-- que es la que se hace en cada venta.
create index if not exists cuentas_libres_idx
  on public.cuentas (producto_id)
  where estado = 'libre';

create index if not exists cuentas_pedido_idx
  on public.cuentas (pedido_id)
  where pedido_id is not null;


-- ============================================================
-- 2. PEDIDOS
-- ============================================================
create table if not exists public.pedidos (
  id                uuid primary key default gen_random_uuid(),

  -- Número corto y humano para hablar con el cliente: "tu pedido 1043".
  -- El uuid es para las máquinas; nadie te lo va a dictar por WhatsApp.
  numero            bigint generated always as identity,

  -- --- Qué compró ---
  producto_id       uuid references public.productos (id) on delete set null,

  -- El nombre y el precio se COPIAN acá, no se leen del producto.
  -- Si mañana subís el precio de Netflix, este pedido tiene que seguir
  -- diciendo lo que el cliente pagó realmente. Un pedido es un documento
  -- histórico, no una vista de la tabla de productos.
  producto_nombre   text not null,
  precio            numeric(10,2) not null,
  moneda            text not null default 'BOB',

  -- --- Quién ---
  cliente_nombre    text not null default '',
  cliente_whatsapp  text not null default '',
  cliente_email     text not null default '',

  -- --- En qué anda ---
  -- esperando_pago → se creó, todavía no pagó
  -- pagado         → se confirmó la plata, falta darle la cuenta
  -- entregado      → tiene su cuenta
  -- sin_stock      → pagó pero no había cuenta libre: hay que atenderlo a mano
  -- vencido        → nunca pagó y se le acabó el tiempo
  -- cancelado      → lo diste de baja
  estado            text not null default 'esperando_pago'
                    check (estado in ('esperando_pago','pagado','entregado',
                                      'sin_stock','vencido','cancelado')),

  -- --- El secreto del cliente ---
  -- Con esto ve su pedido sin tener que crearse una cuenta. Va en la URL:
  --   pagar-qr.html#t=a3f9...
  -- Por eso es largo y aleatorio: es la única llave de sus credenciales.
  token             text not null unique,

  -- --- El pago ---
  metodo_pago       text not null default 'qr',
  -- Lo que devuelve la pasarela, o el número de comprobante que copiaste.
  referencia_pago   text,
  -- 'panel:tu@email.com' o 'webhook:pagofacil'. Sirve para auditar después
  -- quién dio por bueno cada pago.
  confirmado_por    text,

  pagado_en         timestamptz,
  entregado_en      timestamptz,

  -- Si no paga antes de esto, el pedido se marca vencido.
  vence_en          timestamptz not null default (now() + interval '2 hours'),
  creado_en         timestamptz not null default now()
);

create index if not exists pedidos_estado_idx  on public.pedidos (estado);
create index if not exists pedidos_creado_idx  on public.pedidos (creado_en desc);
create index if not exists pedidos_token_idx   on public.pedidos (token);

-- Un pedido entregado apunta a su cuenta, y la cuenta a su pedido.
-- La referencia se agrega acá porque las dos tablas se necesitan mutuamente
-- y una de las dos tiene que crearse primero.
do $$
begin
  alter table public.cuentas
    add constraint cuentas_pedido_fk
    foreign key (pedido_id) references public.pedidos (id) on delete set null;
exception
  when duplicate_object then null;
end;
$$;


-- ============================================================
-- 3. SEGURIDAD
-- ============================================================
alter table public.cuentas enable row level security;
alter table public.pedidos enable row level security;

-- --- cuentas: NADIE desde el navegador, salvo vos ---
-- No hay política para anon. Sin política, RLS niega todo: la clave anon
-- no puede leer ni una fila de esta tabla aunque lo intente.
drop policy if exists "solo admin ve el stock" on public.cuentas;
create policy "solo admin ve el stock"
  on public.cuentas for select
  to authenticated
  using (public.es_admin());

drop policy if exists "solo admin carga stock" on public.cuentas;
create policy "solo admin carga stock"
  on public.cuentas for insert
  to authenticated
  with check (public.es_admin());

drop policy if exists "solo admin edita stock" on public.cuentas;
create policy "solo admin edita stock"
  on public.cuentas for update
  to authenticated
  using (public.es_admin())
  with check (public.es_admin());

drop policy if exists "solo admin borra stock" on public.cuentas;
create policy "solo admin borra stock"
  on public.cuentas for delete
  to authenticated
  using (public.es_admin());

-- --- pedidos: el cliente tampoco los lee directo ---
-- Podría parecer natural dejar que lea "su" pedido, pero no hay forma de
-- saber cuál es "suyo" sin login. Entra por ver_mi_pedido(token), que
-- además filtra qué campos devuelve.
drop policy if exists "solo admin ve pedidos" on public.pedidos;
create policy "solo admin ve pedidos"
  on public.pedidos for select
  to authenticated
  using (public.es_admin());

drop policy if exists "solo admin edita pedidos" on public.pedidos;
create policy "solo admin edita pedidos"
  on public.pedidos for update
  to authenticated
  using (public.es_admin())
  with check (public.es_admin());


-- ============================================================
-- 4. CREAR UN PEDIDO
-- ============================================================
-- La llama la tienda, sin login.
--
-- ⚠️ EL PRECIO NO VIENE DEL CLIENTE. Se lee de la tabla productos acá
--    adentro. Si el precio lo mandara el navegador, cualquiera con la
--    consola abierta se compra Netflix a 1 Bs.
create or replace function public.crear_pedido(
  p_producto_id uuid,
  p_nombre      text default '',
  p_whatsapp    text default '',
  p_email       text default ''
)
returns table (token text, numero bigint, precio numeric, producto text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_producto public.productos%rowtype;
  v_precio   numeric(10,2);
  v_token    text;
  v_pedido   public.pedidos%rowtype;
begin
  select * into v_producto from public.productos where id = p_producto_id;

  if not found then
    raise exception 'Ese producto no existe';
  end if;

  -- activo = false significa AGOTADO en esta tienda (no oculto).
  -- No tiene sentido cobrar por algo agotado.
  if v_producto.activo = false then
    raise exception 'Ese producto está agotado';
  end if;

  -- El precio real: respeta la oferta si está activa. Es la misma regla
  -- que precioFinal() en el front, pero acá es la que vale.
  v_precio := case
    when v_producto.oferta and coalesce(v_producto.precio_oferta, 0) > 0
      then v_producto.precio_oferta
    else v_producto.precio
  end;

  -- 64 caracteres hexadecimales de aleatoriedad. Dos uuid pegados evitan
  -- depender de pgcrypto y alcanzan de sobra: adivinarlo es imposible.
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  insert into public.pedidos (
    producto_id, producto_nombre, precio,
    cliente_nombre, cliente_whatsapp, cliente_email, token
  ) values (
    v_producto.id, v_producto.nombre, v_precio,
    coalesce(p_nombre, ''), coalesce(p_whatsapp, ''), coalesce(p_email, ''), v_token
  )
  returning * into v_pedido;

  return query select v_pedido.token, v_pedido.numero, v_pedido.precio, v_pedido.producto_nombre;
end;
$$;


-- ============================================================
-- 5. CONFIRMAR EL PAGO Y ENTREGAR
-- ============================================================
-- LA PUERTA ÚNICA. La llama el panel cuando tocás "Confirmar", o el
-- webhook de la pasarela cuando la tengas. Hace las dos cosas juntas:
-- marca pagado y entrega, para que no exista el estado intermedio de
-- "pagó pero nadie le dio nada".
--
-- ⚠️ NO la puede llamar la tienda pública: abajo se le quita el permiso a
--    anon. Si no, cualquiera se autoconfirmaría el pago y se llevaría una
--    cuenta gratis.
create or replace function public.confirmar_pago(
  p_pedido_id  uuid,
  p_referencia text default null,
  p_quien      text default null
)
returns table (estado text, entregada boolean, mensaje text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido  public.pedidos%rowtype;
  v_cuenta  public.cuentas%rowtype;
begin
  -- Bloquea la fila del pedido: si llegan dos confirmaciones a la vez
  -- (tocaste el botón y encima entró el webhook), la segunda espera acá.
  select * into v_pedido from public.pedidos where id = p_pedido_id for update;

  if not found then
    raise exception 'Ese pedido no existe';
  end if;

  -- Ya estaba entregado: no se entrega dos veces. Que sea idempotente
  -- importa porque las pasarelas reintentan el webhook si no contestás
  -- rápido, y no queremos regalar una cuenta por cada reintento.
  if v_pedido.estado = 'entregado' then
    return query select v_pedido.estado, false, 'Este pedido ya estaba entregado'::text;
    return;
  end if;

  if v_pedido.estado = 'cancelado' then
    return query select v_pedido.estado, false, 'Este pedido está cancelado'::text;
    return;
  end if;

  -- Toma UNA cuenta libre de ese producto.
  --
  -- "for update skip locked" es lo que evita vender dos veces la misma
  -- cuenta: si dos pedidos entran en el mismo instante, el primero se
  -- lleva la fila bloqueada y el segundo la SALTEA en vez de esperarla,
  -- y se lleva la siguiente. Sin skip locked, el segundo esperaría y
  -- terminaría llevándose la misma.
  -- El alias "c" no es cosmético. Esta función devuelve una columna
  -- llamada "estado" (el "returns table" de arriba), y eso crea una
  -- variable PL/pgSQL con ese nombre. Sin el alias, "estado = 'libre'"
  -- es ambiguo entre la variable y la columna, y Postgres aborta la
  -- función entera con "column reference estado is ambiguous".
  select * into v_cuenta
  from public.cuentas c
  where c.producto_id = v_pedido.producto_id
    and c.estado = 'libre'
  order by coalesce(c.vence_en, 'infinity'::date), c.creada_en  -- primero las que vencen antes
  limit 1
  for update skip locked;

  if not found then
    -- Pagó y no hay stock. NO es un error: la plata entró y hay que
    -- respetarla. Se marca para que lo atiendas a mano y no se pierda.
    update public.pedidos set
      estado          = 'sin_stock',
      pagado_en       = coalesce(v_pedido.pagado_en, now()),
      referencia_pago = coalesce(p_referencia, referencia_pago),
      confirmado_por  = coalesce(p_quien, confirmado_por)
    where id = p_pedido_id;

    return query select 'sin_stock'::text, false,
      'Pago confirmado, pero no hay cuentas libres de este producto. Atendelo a mano.'::text;
    return;
  end if;

  update public.cuentas set
    estado       = 'entregada',
    pedido_id    = p_pedido_id,
    entregada_en = now()
  where id = v_cuenta.id;

  update public.pedidos set
    estado          = 'entregado',
    pagado_en       = coalesce(v_pedido.pagado_en, now()),
    entregado_en    = now(),
    referencia_pago = coalesce(p_referencia, referencia_pago),
    confirmado_por  = coalesce(p_quien, confirmado_por)
  where id = p_pedido_id;

  return query select 'entregado'::text, true, 'Entregado'::text;
end;
$$;


-- ============================================================
-- 6. LO QUE VE EL CLIENTE
-- ============================================================
-- La tienda la llama con el token que tiene en la URL. Es la ÚNICA forma
-- de que salgan credenciales de la base hacia el navegador.
--
-- Devuelve solo los campos que el cliente necesita: nada de costo, ni
-- nota interna, ni cuántas cuentas te quedan.
create or replace function public.ver_mi_pedido(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido public.pedidos%rowtype;
  v_cred   jsonb;
begin
  -- Un token corto o vacío no se busca: evita que alguien pruebe con ''.
  if p_token is null or length(p_token) < 32 then
    return jsonb_build_object('error', 'token invalido');
  end if;

  select * into v_pedido from public.pedidos where token = p_token;

  if not found then
    return jsonb_build_object('error', 'no existe');
  end if;

  -- Las credenciales SOLO si está entregado. Mientras está esperando el
  -- pago, ni siquiera se leen de la tabla.
  if v_pedido.estado = 'entregado' then
    select credenciales into v_cred
    from public.cuentas
    where pedido_id = v_pedido.id and estado = 'entregada'
    limit 1;
  end if;

  return jsonb_build_object(
    'numero',      v_pedido.numero,
    'producto',    v_pedido.producto_nombre,
    'precio',      v_pedido.precio,
    'moneda',      v_pedido.moneda,
    'estado',      v_pedido.estado,
    'vence_en',    v_pedido.vence_en,
    'entregado_en',v_pedido.entregado_en,
    'credenciales',v_cred          -- null salvo que esté entregado
  );
end;
$$;


-- ============================================================
-- 7. ¿HAY STOCK?
-- ============================================================
-- Para que la tienda pueda decir "entrega al instante" o "entrega en
-- minutos" ANTES de que el cliente pague.
--
-- Devuelve solo cuántas hay, nunca las credenciales. Que se sepa que hay
-- 3 Netflix libres no le sirve a nadie para robártelas.
create or replace function public.hay_stock(p_producto_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.cuentas
  where producto_id = p_producto_id and estado = 'libre';
$$;


-- ============================================================
-- 8. LIMPIAR PEDIDOS VENCIDOS
-- ============================================================
-- El que entra, arma un pedido y nunca paga, deja basura. Esto la barre.
-- Se puede llamar desde el panel o programar con pg_cron más adelante.
create or replace function public.vencer_pedidos()
returns integer
language sql
security definer
set search_path = public
as $$
  with vencidos as (
    update public.pedidos
    set estado = 'vencido'
    where estado = 'esperando_pago' and vence_en < now()
    returning 1
  )
  select count(*)::integer from vencidos;
$$;


-- ============================================================
-- 9. QUIÉN PUEDE LLAMAR A CADA FUNCIÓN
-- ============================================================
-- Postgres le da EXECUTE a todo el mundo por defecto, y PostgREST publica
-- como endpoint HTTP todo lo que viva en "public". O sea que sin estas
-- líneas, la tienda pública podría llamar a confirmar_pago() y regalarse
-- cuentas. Esto es lo más importante del archivo.

-- Primero se cierra todo.
revoke execute on function public.crear_pedido(uuid, text, text, text)  from public, anon, authenticated;
revoke execute on function public.confirmar_pago(uuid, text, text)      from public, anon, authenticated;
revoke execute on function public.ver_mi_pedido(text)                   from public, anon, authenticated;
revoke execute on function public.hay_stock(uuid)                       from public, anon, authenticated;
revoke execute on function public.vencer_pedidos()                      from public, anon, authenticated;

-- Y después se abre solo lo justo.

-- La tienda (sin login) necesita: armar el pedido, mirar el suyo, y saber
-- si hay stock. Nada más.
grant execute on function public.crear_pedido(uuid, text, text, text) to anon, authenticated;
grant execute on function public.ver_mi_pedido(text)                  to anon, authenticated;
grant execute on function public.hay_stock(uuid)                      to anon, authenticated;

-- Confirmar un pago y vencer pedidos son cosa tuya.
-- (El webhook de la pasarela, cuando lo tengas, va a correr en una Edge
--  Function con la clave service_role, que se saltea esto por diseño.)
grant execute on function public.confirmar_pago(uuid, text, text) to authenticated;
grant execute on function public.vencer_pedidos()                 to authenticated;


-- ============================================================
-- 9b. EL REVISOR DE SUPABASE VA A QUEJARSE. ESTÁ BIEN.
-- ============================================================
-- Después de correr esto, Advisors → Security va a marcar unas cuantas
-- veces "Public/Signed-In Users Can Execute SECURITY DEFINER Function",
-- una por cada función de acá.
--
-- NO LAS ARREGLES. El linter marca toda función SECURITY DEFINER que
-- alguien pueda llamar, sin poder saber si es a propósito. Acá lo es:
-- son justamente la puerta controlada, y para eso existe SECURITY DEFINER.
--
--   crear_pedido    anon la NECESITA — es el checkout
--   ver_mi_pedido   anon la NECESITA — es como el cliente ve lo que compró
--   hay_stock       anon la NECESITA — para decir "entrega al instante"
--   confirmar_pago  solo admin (anon ya tiene el permiso revocado)
--   vencer_pedidos  solo admin
--
-- La seguridad no está en que no se puedan llamar: está en lo que hacen
-- ADENTRO. crear_pedido lee el precio de la base y no del cliente;
-- ver_mi_pedido exige el token y solo suelta credenciales si está
-- entregado; confirmar_pago está fuera del alcance de anon.
--
-- Lo que SÍ conviene vigilar algún día: un anónimo puede crear pedidos en
-- masa y llenarte la tabla de basura. No cuesta plata ni entrega nada
-- —vencer_pedidos() los barre— pero si alguna vez pasa, la solución es
-- limitar por IP en una Edge Function delante de crear_pedido.


-- ============================================================
-- 10. REALTIME — PARA EL PANEL, NO PARA EL CLIENTE
-- ============================================================
-- Acá hay una trampa que conviene tener escrita, porque la idea obvia no
-- funciona:
--
--   "que la página del cliente escuche su pedido por Realtime y las
--    credenciales aparezcan solas"
--
-- No se puede. Realtime respeta RLS, y arriba decidimos —bien— que solo
-- un admin puede leer la tabla pedidos. El cliente no tiene login, así
-- que no recibiría ningún evento. Y aflojar esa política para que el
-- anónimo lea pedidos abriría la tabla entera: cualquiera podría listar
-- los pedidos de todos.
--
-- Entonces:
--
--   CLIENTE  → pregunta cada 4 segundos con ver_mi_pedido(token).
--              Es una llamada minúscula, solo mientras la página de pago
--              está abierta, y el token no le sirve a nadie más. Para un
--              flujo que dura un par de minutos, sobra.
--
--   PANEL    → sí usa Realtime (está logueado y es admin). Sirve para que
--              veas los pedidos entrar en vivo, sin recargar.
do $$
begin
  alter publication supabase_realtime add table public.pedidos;
exception
  when duplicate_object then
    raise notice 'pedidos ya estaba en supabase_realtime, sigo';
end;
$$;

alter table public.pedidos replica identity full;
