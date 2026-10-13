-- ============================================================
-- TIAGO STORE · 26 · REGISTRO DE CLIENTES
-- ============================================================
-- Correr en Supabase → SQL Editor, después del 25 y antes del 27 (el 27
-- usa wa_normal() y la tabla clientes). Se puede correr de nuevo.
--
-- EL PROBLEMA
--   La tienda no sabía quién le compraba hasta que llegaba el pedido, y
--   muchos pedidos llegaban sin nombre: en Ventas y en los avisos de
--   Telegram salían como "sin nombre", y el mensaje de vencimiento no
--   podía saludar a nadie.
--
-- LO NUEVO (js/usuario.js)
--   · Al entrar a la tienda, a los 2 segundos, una ventana pide solo dos
--     cosas: Usuario (2 a 40 letras) y WhatsApp (+591, 8 números que
--     empiezan con 6 o 7). "Ahora no" la deja para la próxima visita.
--   · Queda en el navegador y acá, una fila por WhatsApp
--     (registrar_cliente). Si la base no contesta, queda en el navegador
--     y se reintenta en la próxima visita.
--   · Al pagar, el WhatsApp ya viene escrito y el pedido lleva el
--     usuario. Si un pedido llega sin nombre, la base lo completa
--     buscando su WhatsApp entre los registrados (disparador de abajo).
--   · No es un login: sin contraseña ni correo. Cualquiera puede decir
--     que se llama de una forma; lo que se guarda es cómo quiere que lo
--     llamemos, no una identidad verificada.
--
-- Y para el panel (admin/js/admin-clientes.js): clientes_panel(), los
-- registrados y los que compraron, por WhatsApp, con sus compras.
--
-- SECCIONES
--   1. wa_normal(): un WhatsApp, siempre escrito igual
--   2. La tabla clientes
--   3. registrar_cliente(): lo que llama la tienda
--   4. El nombre de los pedidos que llegan sin nombre
--   5. clientes_panel(): la vista Clientes
--   6. Permisos
-- ============================================================


-- ============================================================
-- 1. UN WHATSAPP, SIEMPRE ESCRITO IGUAL
-- ============================================================
-- Los pedidos lo guardan de varias formas según de cuándo son:
-- "59171234567", "71234567", "+591 7123 4567". Para juntar las compras
-- de una persona hace falta una sola: solo números, con el 591 adelante
-- si es un celular de Bolivia. Lo que no parece un número da null.
create or replace function public.wa_normal(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when d ~ '^[67][0-9]{7}$'    then '591' || d
    when d ~ '^591[67][0-9]{7}$' then d
    when length(d) between 8 and 15 then d
    else null
  end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x;
$$;


-- ============================================================
-- 2. LA TABLA
-- ============================================================
-- Una fila por WhatsApp. "dispositivo" es una marca al azar que guarda el
-- navegador que se registró: con ella, si cambia de número, se borra la
-- fila del número viejo (y nadie más puede borrarla, porque no la sabe).
create table if not exists public.clientes (
  whatsapp       text primary key check (whatsapp ~ '^591[67][0-9]{7}$'),
  usuario        text not null check (char_length(usuario) between 2 and 40),
  dispositivo    text,
  registrado_en  timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

alter table public.clientes enable row level security;

-- Desde la tienda nadie la lee ni la escribe directo: entra por
-- registrar_cliente(). El panel la lee y borra registros, solo un admin.
revoke all on public.clientes from anon;
revoke all on public.clientes from authenticated;
grant select, delete on public.clientes to authenticated;

drop policy if exists "solo admin ve clientes" on public.clientes;
create policy "solo admin ve clientes"
  on public.clientes for select
  to authenticated
  using (public.es_admin());

drop policy if exists "solo admin borra clientes" on public.clientes;
create policy "solo admin borra clientes"
  on public.clientes for delete
  to authenticated
  using (public.es_admin());


-- ============================================================
-- 3. REGISTRARSE (o cambiar los datos)
-- ============================================================
-- La llama la tienda, sin login. Valida lo mismo que la ventana (que el
-- navegador se puede saltear) y devuelve cómo quedó.
--   p_anterior: el WhatsApp de antes, si lo cambió. Su fila se borra solo
--               si la registró este mismo navegador (mismo dispositivo).
-- Tope: 30 registros nuevos por minuto entre todos. Un cliente de verdad
-- no lo nota; alguien llenando la tabla con un programa, sí. Si salta, la
-- tienda lo deja guardado en el navegador y reintenta en la otra visita.
create or replace function public.registrar_cliente(
  p_usuario     text,
  p_whatsapp    text,
  p_dispositivo text default null,
  p_anterior    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario text := btrim(regexp_replace(coalesce(p_usuario, ''), '\s+', ' ', 'g'));
  v_wa      text := public.wa_normal(p_whatsapp);
  v_disp    text := lower(btrim(coalesce(p_dispositivo, '')));
  v_ant     text := public.wa_normal(p_anterior);
  v_desde   timestamptz;
begin
  if char_length(v_usuario) not between 2 and 40 or v_usuario ~ '[[:cntrl:]<>]' then
    raise exception 'El usuario tiene que tener de 2 a 40 letras' using errcode = '22023';
  end if;

  if v_wa is null or v_wa !~ '^591[67][0-9]{7}$' then
    raise exception 'El WhatsApp tiene que ser un celular de Bolivia: 8 números que empiezan con 6 o 7'
      using errcode = '22023';
  end if;

  if v_disp !~ '^[0-9a-f]{16,64}$' then
    v_disp := null;
  end if;

  if not exists (select 1 from public.clientes where whatsapp = v_wa)
     and (select count(*) from public.clientes where registrado_en > now() - interval '1 minute') >= 30 then
    raise exception 'Demasiados registros en este momento, probá en un rato' using errcode = '54000';
  end if;

  -- Cambió de número: la fila del número viejo se va, si era suya
  if v_ant is not null and v_ant <> v_wa and v_disp is not null then
    delete from public.clientes
    where whatsapp = v_ant and dispositivo = v_disp
    returning registrado_en into v_desde;
  end if;

  insert into public.clientes (whatsapp, usuario, dispositivo, registrado_en)
  values (v_wa, v_usuario, v_disp, coalesce(v_desde, now()))
  on conflict (whatsapp) do update set
    usuario        = excluded.usuario,
    dispositivo    = coalesce(excluded.dispositivo, clientes.dispositivo),
    actualizado_en = now();

  return jsonb_build_object('ok', true, 'whatsapp', v_wa, 'usuario', v_usuario);
end;
$$;


-- ============================================================
-- 4. EL NOMBRE DE LOS PEDIDOS QUE LLEGAN SIN NOMBRE
-- ============================================================
-- La tienda manda el usuario al pagar (pagar-qr.html), pero una compra
-- hecha desde otro navegador, o desde una tienda vieja guardada en la
-- caché, llega sin. Si su WhatsApp está registrado, se completa acá, al
-- crearse: así sale con nombre en Ventas, en el aviso de Telegram y en el
-- mensaje de vencimiento.
create or replace function public.nombre_del_cliente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario text;
begin
  if btrim(coalesce(new.cliente_nombre, '')) = '' and coalesce(new.cliente_whatsapp, '') <> '' then
    select c.usuario into v_usuario
    from public.clientes c
    where c.whatsapp = public.wa_normal(new.cliente_whatsapp);

    if v_usuario is not null then
      new.cliente_nombre := v_usuario;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists pedidos_nombre_del_cliente on public.pedidos;
create trigger pedidos_nombre_del_cliente
  before insert on public.pedidos
  for each row execute function public.nombre_del_cliente();


-- ============================================================
-- 5. LA VISTA CLIENTES DEL PANEL
-- ============================================================
-- Una fila por WhatsApp: los registrados (aunque no hayan comprado) y los
-- que compraron (aunque no se hayan registrado). Las compras de prueba no
-- cuentan.
--   compras        compras pagadas (una compra de 3 productos es una)
--   gastado        lo que pagó, en Bs
--   suscripciones  la última de cada producto, con los días que le quedan
--                  (negativo = vencida): si renovó, cuenta la renovación
--   pedidos        todos sus pedidos, del más nuevo al más viejo, para el
--                  detalle (también los que no pagó)
create or replace function public.clientes_panel()
returns table (
  whatsapp       text,
  usuario        text,
  registrado_en  timestamptz,
  actualizado_en timestamptz,
  nombre         text,
  compras        integer,
  gastado        numeric,
  primera_compra timestamptz,
  ultima_compra  timestamptz,
  suscripciones  jsonb,
  pedidos        jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_hoy date := (now() at time zone 'America/La_Paz')::date;
begin
  if not public.es_admin() then
    raise exception 'Solo para el panel' using errcode = '42501';
  end if;

  return query
  with ped as (
    select p.id, p.numero, p.grupo, p.producto_id, p.producto_nombre, p.precio,
           p.estado, p.metodo_pago, p.cliente_nombre, p.creado_en,
           p.suscripcion_vence_en,
           coalesce(p.pagado_en, p.creado_en)   as fecha,
           public.wa_normal(p.cliente_whatsapp) as wa
    from public.pedidos p
    where not p.prueba
      and public.wa_normal(p.cliente_whatsapp) is not null
  ),
  pagados as (
    select * from ped where ped.estado in ('entregado', 'sin_stock', 'pagado')
  ),
  quienes as (
    select c.whatsapp as wa from public.clientes c
    union
    select pagados.wa from pagados
  ),
  totales as (
    select pagados.wa,
           count(distinct coalesce(pagados.grupo, pagados.id))::integer as n,
           sum(pagados.precio)  as bs,
           min(pagados.fecha)   as primera,
           max(pagados.fecha)   as ultima
    from pagados
    group by pagados.wa
  ),
  subs as (
    select s.wa,
           jsonb_agg(jsonb_build_object(
             'producto', s.producto_nombre,
             'numero',   s.numero,
             'vence',    s.suscripcion_vence_en,
             'dias',     s.suscripcion_vence_en - v_hoy)
             order by s.suscripcion_vence_en) as lista
    from (
      select distinct on (pagados.wa, coalesce(pagados.producto_id::text, pagados.producto_nombre))
             pagados.wa, pagados.producto_nombre, pagados.numero, pagados.suscripcion_vence_en
      from pagados
      where pagados.suscripcion_vence_en is not null
      order by pagados.wa, coalesce(pagados.producto_id::text, pagados.producto_nombre),
               pagados.suscripcion_vence_en desc
    ) s
    group by s.wa
  ),
  historial as (
    select ped.wa,
           jsonb_agg(jsonb_build_object(
             'numero',   ped.numero,
             'compra',   coalesce(ped.grupo, ped.id),
             'producto', ped.producto_nombre,
             'precio',   ped.precio,
             'estado',   ped.estado,
             'metodo',   ped.metodo_pago,
             'fecha',    ped.fecha,
             'vence',    ped.suscripcion_vence_en)
             order by ped.numero desc) as lista
    from ped
    group by ped.wa
  ),
  nombres as (
    select distinct on (ped.wa) ped.wa, btrim(ped.cliente_nombre) as n
    from ped
    where btrim(ped.cliente_nombre) <> ''
    order by ped.wa, ped.creado_en desc
  )
  select q.wa,
         c.usuario,
         c.registrado_en,
         c.actualizado_en,
         n.n,
         coalesce(t.n, 0),
         coalesce(t.bs, 0),
         t.primera,
         t.ultima,
         coalesce(s.lista, '[]'::jsonb),
         coalesce(h.lista, '[]'::jsonb)
  from quienes q
  left join public.clientes c on c.whatsapp = q.wa
  left join totales   t on t.wa = q.wa
  left join subs      s on s.wa = q.wa
  left join historial h on h.wa = q.wa
  left join nombres   n on n.wa = q.wa
  order by coalesce(t.ultima, c.registrado_en) desc nulls last;
end;
$$;


-- ============================================================
-- 6. PERMISOS
-- ============================================================
-- registrar_cliente la llama cualquiera (es la tienda, sin login)
revoke execute on function public.registrar_cliente(text, text, text, text) from public;
grant  execute on function public.registrar_cliente(text, text, text, text) to anon, authenticated;

-- El panel, con sesión: adentro pregunta si sos admin
revoke execute on function public.clientes_panel() from public, anon;
grant  execute on function public.clientes_panel() to authenticated;

-- Uso interno
revoke execute on function public.nombre_del_cliente() from public, anon, authenticated;
