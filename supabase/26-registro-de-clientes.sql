-- ============================================================
-- TIAGO STORE · 26 · REGISTRO DE CLIENTES (USUARIO + WHATSAPP)
-- ============================================================
-- Correr en Supabase → SQL Editor (pegar todo y "Run"). Se puede correr
-- de nuevo sin romper nada.
--
-- EL PEDIDO (13/10/2026)
--   "En USER, que solo tenga estos datos: Usuario y WhatsApp. Que cuando
--   ingresen a mi página muestre todo normal, pero si no se registraron
--   con los datos, les pida."
--
-- CÓMO ANDA
--   · La tienda se ve igual que siempre. Si ese navegador todavía no se
--     registró, a los segundos aparece una ventanita que pide Usuario y
--     WhatsApp (js/usuario.js). Puede tocar "Ahora no" y seguir mirando:
--     se le vuelve a pedir la próxima vez que entre.
--   · En la barra de abajo, "Usuario" abre sus datos para cambiarlos.
--   · El registro se guarda acá (tabla clientes) y en su navegador. Con
--     eso el WhatsApp ya viene escrito al pagar, y el pedido lleva su
--     nombre (el aviso de Telegram y el de vencimiento lo saludan por él).
--   · En el panel: Clientes, con lo que compró cada uno.
--
-- NO ES UN LOGIN
--   No hay contraseña ni correo: es un registro de contacto. Cada cuenta
--   comprada sigue siendo privada de su comprador como antes (el token
--   del pedido). Registrarse no le muestra a nadie compras de otro.
--
-- UNA FILA POR WHATSAPP
--   El WhatsApp es lo que identifica al cliente (es el mismo que queda
--   en sus pedidos). Si se registra de nuevo con el mismo número, desde
--   otro celular, se actualiza su usuario en vez de duplicarlo.
--
-- SECCIONES
--   1. wa_normalizado(): un WhatsApp siempre escrito igual
--   2. La tabla clientes y quién la ve
--   3. registrar_cliente(): lo que llama la tienda
--   4. El pedido lleva el usuario registrado
--   5. Permisos
-- ============================================================


-- ============================================================
-- 1. UN WHATSAPP SIEMPRE ESCRITO IGUAL
-- ============================================================
-- "7 230 9304", "72309304", "+591 72309304" → "59172309304", que es como
-- lo pide wa.me y como lo guarda la tienda en los pedidos.
create or replace function public.wa_normalizado(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when length(regexp_replace(coalesce(p, ''), '\D', '', 'g')) = 8
      then '591' || regexp_replace(p, '\D', '', 'g')
    else regexp_replace(coalesce(p, ''), '\D', '', 'g')
  end
$$;


-- ============================================================
-- 2. LA TABLA
-- ============================================================
create table if not exists public.clientes (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null check (char_length(nombre) between 2 and 40),
  whatsapp       text not null unique check (whatsapp ~ '^591[67][0-9]{7}$'),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists clientes_creado_idx on public.clientes (creado_en desc);

-- Nadie la lee ni la escribe desde afuera: la tienda registra con
-- registrar_cliente() y el panel (solo admins) la mira y puede borrar.
alter table public.clientes enable row level security;
revoke all on public.clientes from anon, authenticated;
grant select, delete on public.clientes to authenticated;

drop policy if exists "el panel ve los clientes" on public.clientes;
create policy "el panel ve los clientes"
  on public.clientes for select
  to authenticated
  using (public.es_admin());

drop policy if exists "el panel borra clientes" on public.clientes;
create policy "el panel borra clientes"
  on public.clientes for delete
  to authenticated
  using (public.es_admin());


-- ============================================================
-- 3. REGISTRAR (lo llama la tienda, sin sesión)
-- ============================================================
-- Valida igual que la tienda: usuario de 2 a 40 letras, WhatsApp de
-- Bolivia (8 números que empiezan con 6 o 7). Si el número ya estaba,
-- le actualiza el usuario.
--
-- Tope contra el que quiera llenar la tabla de basura: más de 60
-- registros en un minuto, de todos juntos, espera un rato.
create or replace function public.registrar_cliente(p_nombre text, p_whatsapp text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text := regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_wa     text := public.wa_normalizado(p_whatsapp);
  v_nuevo  boolean;
begin
  -- Sin signos que puedan armar HTML: es un nombre, no hace falta
  v_nombre := regexp_replace(v_nombre, '[<>"`]', '', 'g');

  if char_length(v_nombre) < 2 or char_length(v_nombre) > 40 then
    raise exception 'Escribí tu usuario: de 2 a 40 letras.' using errcode = '22023';
  end if;

  if v_wa !~ '^591[67][0-9]{7}$' then
    raise exception 'Escribí tu WhatsApp: 8 números que empiezan con 6 o 7.' using errcode = '22023';
  end if;

  if (select count(*) from public.clientes
      where actualizado_en > now() - interval '1 minute') > 60 then
    raise exception 'Muchos registros seguidos: probá de nuevo en un minuto.' using errcode = '54000';
  end if;

  insert into public.clientes (nombre, whatsapp)
  values (v_nombre, v_wa)
  on conflict (whatsapp) do update
    set nombre = excluded.nombre, actualizado_en = now()
  returning (xmax = 0) into v_nuevo;

  return jsonb_build_object('ok', true, 'nombre', v_nombre, 'whatsapp', v_wa, 'nuevo', v_nuevo);
end;
$$;


-- ============================================================
-- 4. EL PEDIDO LLEVA EL USUARIO REGISTRADO
-- ============================================================
-- La tienda ya manda el usuario al armar la compra (pagar-qr.html), pero
-- si llega sin nombre y su WhatsApp está registrado, se completa acá.
-- Solo si viene vacío: lo que escribió al comprar manda.
create or replace function public.nombre_del_registro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(btrim(new.cliente_nombre), '') = '' and coalesce(new.cliente_whatsapp, '') <> '' then
    select c.nombre into new.cliente_nombre
    from public.clientes c
    where c.whatsapp = public.wa_normalizado(new.cliente_whatsapp);
    new.cliente_nombre := coalesce(new.cliente_nombre, '');
  end if;
  return new;
end;
$$;

drop trigger if exists pedidos_nombre_del_registro on public.pedidos;
create trigger pedidos_nombre_del_registro
  before insert on public.pedidos
  for each row execute function public.nombre_del_registro();


-- ============================================================
-- 5. PERMISOS
-- ============================================================
revoke execute on function public.registrar_cliente(text, text) from public;
grant  execute on function public.registrar_cliente(text, text) to anon, authenticated;

revoke execute on function public.nombre_del_registro() from public, anon, authenticated;
-- wa_normalizado no lee nada: la pueden usar el panel y las demás funciones
grant execute on function public.wa_normalizado(text) to anon, authenticated, service_role;
