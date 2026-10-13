-- ============================================================
-- TIAGO STORE · 28 · EL CORREO DEL CLIENTE, EN SU PEDIDO
-- ============================================================
-- Correr en Supabase → SQL Editor (pegar todo y "Run"). Se puede correr
-- de nuevo sin romper nada.
--
-- EL PROBLEMA
--   Los productos "a correo de cliente" (Canva, Spotify renovable…) se
--   activan sobre la cuenta del cliente: hace falta su correo. La página
--   de pago se lo pide, pero el pedido se arma APENAS se abre la página,
--   antes de que lo escriba: pedidos.cliente_email quedaba vacío y el
--   correo solo viajaba en el mensaje de WhatsApp. En el panel no se veía
--   en ningún lado.
--
-- LO NUEVO
--   guardar_correo_compra(): la página de pago lo llama cuando el cliente
--   escribe un correo válido (y al tocar "Ya pagué"). Lo guarda en todos
--   los pedidos de esa compra. En Ventas → Para atender, la fila dice
--   "A correo del cliente: ana@gmail.com" con "Copiar"
--   (admin/js/admin-ventas.js).
--
-- QUIÉN PUEDE
--   El que tiene el token de la compra, o sea el que la armó: es el mismo
--   secreto de 64 caracteres con el que ve su cuenta. Solo cambia el
--   correo; nada de estado, precio ni cuentas.
--   Y solo mientras la compra espera algo (sin pagar, pagada sin entregar,
--   sin stock): una ya entregada no se toca, así no se pierde el correo
--   en el que de verdad se activó. Las líneas canceladas tampoco.
--
-- REVISADO (13/10/2026)
--   · Bloquea las filas en orden de número, igual que confirmar_compra():
--     si el correo llega justo mientras se confirma el pago, uno espera
--     al otro en vez de trabarse (deadlock).
--   · El correo no puede traer espacios, signos de HTML ni caracteres
--     invisibles (los de ancho cero se sacan antes: vienen pegados de otro
--     lado y harían fallar la invitación sin que se note por qué).
-- ============================================================

create or replace function public.guardar_correo_compra(p_token text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido  public.pedidos;
  v_email   text;
  v_cuantos integer;
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'token invalido' using errcode = '22023';
  end if;

  -- Sin los caracteres de ancho cero, sin espacios a los costados y en
  -- minúsculas
  v_email := lower(btrim(regexp_replace(coalesce(p_email, ''), '[​-‍⁠﻿]', '', 'g')));

  -- algo@algo.algo, sin espacios, sin control, sin < > " ' `
  if length(v_email) > 120
     or v_email !~ '^[^[:space:][:cntrl:]<>"''`@]+@[^[:space:][:cntrl:]<>"''`@]+\.[^[:space:][:cntrl:]<>"''`@]+$' then
    raise exception 'Correo inválido' using errcode = '22023';
  end if;

  select * into v_pedido from public.pedidos where token = p_token;
  if not found then
    raise exception 'No existe ese pedido' using errcode = 'P0002';
  end if;

  -- Ya atendida: no se cambia
  if not exists (
    select 1 from public.pedidos
    where ((v_pedido.grupo is not null and grupo = v_pedido.grupo)
        or (v_pedido.grupo is null and id = v_pedido.id))
      and estado in ('esperando_pago', 'pagado', 'sin_stock', 'vencido')
  ) then
    raise exception 'Esa compra ya se atendió' using errcode = '22023';
  end if;

  -- Las filas de la compra, bloqueadas en el mismo orden que
  -- confirmar_compra() (por número): así no se traban entre sí
  perform 1 from public.pedidos
  where (v_pedido.grupo is not null and grupo = v_pedido.grupo)
     or (v_pedido.grupo is null and id = v_pedido.id)
  order by numero
  for update;

  -- Toda la compra: en una de varios productos, cada pedido lo necesita
  update public.pedidos set cliente_email = v_email
  where ((v_pedido.grupo is not null and grupo = v_pedido.grupo)
      or (v_pedido.grupo is null and id = v_pedido.id))
    and estado <> 'cancelado'
    and cliente_email is distinct from v_email;
  get diagnostics v_cuantos = row_count;

  return jsonb_build_object('ok', true, 'correo', v_email, 'cambiados', v_cuantos);
end;
$$;

revoke execute on function public.guardar_correo_compra(text, text) from public;
grant  execute on function public.guardar_correo_compra(text, text) to anon, authenticated;
