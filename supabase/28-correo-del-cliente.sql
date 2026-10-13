-- ============================================================
-- TIAGO STORE · 28 · EL CORREO DEL CLIENTE ("A CORREO DE CLIENTE")
-- ============================================================
-- Correr en Supabase → SQL Editor, después del 27. Se puede correr de
-- nuevo sin romper nada.
--
-- EL PROBLEMA
--   Hay productos que no se entregan con una cuenta del stock: se activan
--   sobre la cuenta del propio cliente (Canva, Spotify renovable…). La
--   tienda los reconoce porque dicen "a correo de cliente" en el nombre o
--   en la descripción, y en la página de pago le pide el correo.
--
--   Pero ese correo nunca llegaba a la base: el pedido se crea apenas se
--   abre la página, con el campo todavía vacío, y lo que escribía después
--   viajaba solo en el mensaje de WhatsApp. En Ventas no había forma de
--   saber a qué correo activar, ni que ese pedido lo necesitaba.
--
-- LO NUEVO
--   · pedidos.pide_correo: se anota sola al crear el pedido, con la misma
--     regla que la tienda (productFlags en js/tienda.js). Se completa en
--     los pedidos de antes.
--   · guardar_correo_del_cliente(token, correo): la llama pagar-qr.html
--     apenas el correo está bien escrito, y otra vez al tocar "Ya pagué".
--     Solo con el token de la compra (el secreto del cliente, el mismo de
--     su enlace): nadie más puede cambiarlo.
--   · En Ventas → Para atender, la fila dice "A correo del cliente:
--     ana@gmail.com" con "Copiar", o avisa en ámbar que falta. En "Ver",
--     el correo para copiar o el enlace para pedírselo por WhatsApp
--     (admin/js/admin-ventas.js).
--
-- SECCIONES
--   1. La marca y la regla
--   2. Al crear el pedido
--   3. Los pedidos de antes
--   4. guardar_correo_del_cliente()
--   5. Permisos
-- ============================================================


-- ============================================================
-- 1. LA MARCA Y LA REGLA
-- ============================================================
alter table public.pedidos add column if not exists pide_correo boolean not null default false;

-- La misma regla que la tienda: nombre y descripción juntos, en
-- minúsculas, dicen "correo de cliente"
create or replace function public.pide_correo(p_nombre text, p_descripcion text default '')
returns boolean
language sql
immutable
set search_path = public
as $$
  select lower(coalesce(p_nombre, '') || ' ' || coalesce(p_descripcion, '')) like '%correo de cliente%';
$$;


-- ============================================================
-- 2. AL CREAR EL PEDIDO
-- ============================================================
-- Con lo que dice el producto en ese momento, como el nombre y el precio:
-- el pedido es un documento, no una vista del catálogo.
create or replace function public.anotar_pide_correo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.pide_correo :=
    coalesce(new.pide_correo, false)
    or public.pide_correo(new.producto_nombre)
    or coalesce((select public.pide_correo(pr.nombre, pr.descripcion)
                 from public.productos pr where pr.id = new.producto_id), false);
  return new;
end;
$$;

drop trigger if exists pedidos_pide_correo on public.pedidos;
create trigger pedidos_pide_correo
  before insert on public.pedidos
  for each row execute function public.anotar_pide_correo();


-- ============================================================
-- 3. LOS PEDIDOS DE ANTES
-- ============================================================
update public.pedidos p
set pide_correo = true
where not p.pide_correo
  and (public.pide_correo(p.producto_nombre)
       or exists (select 1 from public.productos pr
                  where pr.id = p.producto_id
                    and public.pide_correo(pr.nombre, pr.descripcion)));


-- ============================================================
-- 4. GUARDAR EL CORREO
-- ============================================================
-- Va a todas las líneas de la compra que no estén canceladas. Devuelve
-- true si lo guardó (o ya estaba), false si el token no existe o el
-- correo no parece un correo. No avisa nada: el panel lo ve en vivo
-- (Realtime), porque es un cambio en pedidos.
create or replace function public.guardar_correo_del_cliente(p_token text, p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_compra uuid;
begin
  if coalesce(p_token, '') = '' or length(p_token) > 128 then
    return false;
  end if;

  if length(v_email) > 120 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return false;
  end if;

  select coalesce(p.grupo, p.id) into v_compra
  from public.pedidos p
  where p.token = p_token;

  if v_compra is null then
    return false;
  end if;

  update public.pedidos
  set cliente_email = v_email
  where (grupo = v_compra or id = v_compra)
    and estado <> 'cancelado'
    and cliente_email is distinct from v_email;

  return true;
end;
$$;


-- ============================================================
-- 5. PERMISOS
-- ============================================================
-- La página de pago no tiene login: entra como anon, con el token
revoke execute on function public.guardar_correo_del_cliente(text, text) from public;
grant  execute on function public.guardar_correo_del_cliente(text, text) to anon, authenticated;

revoke execute on function public.anotar_pide_correo() from public, anon, authenticated;
