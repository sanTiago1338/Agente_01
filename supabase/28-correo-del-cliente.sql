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
--   "A correo: ana@gmail.com" con "Copiar" (admin/js/admin-ventas.js).
--
-- QUIÉN PUEDE
--   El que tiene el token de la compra, o sea el que la armó: es el mismo
--   secreto de 64 caracteres con el que ve su cuenta. Solo cambia el
--   correo; nada de estado, precio ni cuentas. Una compra cancelada no se
--   toca.
-- ============================================================

create or replace function public.guardar_correo_compra(p_token text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido  public.pedidos;
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_cuantos integer;
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'token invalido' using errcode = '22023';
  end if;

  -- La misma regla que la página de pago: algo@algo.algo, sin espacios
  if length(v_email) > 120 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Correo inválido' using errcode = '22023';
  end if;

  select * into v_pedido from public.pedidos where token = p_token;
  if not found then
    raise exception 'No existe ese pedido' using errcode = 'P0002';
  end if;

  -- Toda la compra: en una de varios productos, cada pedido lo necesita
  update public.pedidos set cliente_email = v_email
  where coalesce(grupo::text, id::text) = coalesce(v_pedido.grupo::text, v_pedido.id::text)
    and estado <> 'cancelado'
    and cliente_email is distinct from v_email;
  get diagnostics v_cuantos = row_count;

  return jsonb_build_object('ok', true, 'correo', v_email, 'cambiados', v_cuantos);
end;
$$;

revoke execute on function public.guardar_correo_compra(text, text) from public;
grant  execute on function public.guardar_correo_compra(text, text) to anon, authenticated;
