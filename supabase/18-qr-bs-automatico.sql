-- ============================================================
-- TIAGO STORE · QR en Bs automático (listo para la pasarela)
-- ============================================================
-- Igual que Binance, pero para el QR en bolivianos: cuando tu pasarela
-- de QR (OpenBCB, BCP QR Simple, PagosNet, CUCU...) esté habilitada, cada
-- pago le avisa a la tienda y el pedido se confirma solo.
--
-- Todo se configura en el panel, Ventas → Cobros → QR Bolivia automático:
--   · los datos que te dé la pasarela (URL, código de comercio, API Key y
--     Secret Key), guardados protegidos como los de Binance
--   · la dirección de avisos (webhook) y su clave, para cargársela a la
--     pasarela. La clave se genera en el panel: ya no hace falta entrar a
--     Supabase a ponerla.
--
-- Lo que llega por el webhook lo atiende supabase/functions/webhook-pago
-- (ver COBROS.md). Cuando te den el manual, se completa ahí leerAviso() y,
-- si la pasarela arma un QR por pedido, la llamada que lo crea.
--
--   bs_proveedor        nombre de la pasarela
--   bs_api_url          la URL de su API
--   bs_api_comercio     tu código de comercio
--   bs_api_key          API Key
--   bs_api_secret       Secret Key (nunca vuelve al navegador)
--   bs_webhook_secreto  la clave que la pasarela manda en cada aviso
--   bs_ultimo_aviso     el último aviso que llegó y qué se hizo (jsonb)
-- ============================================================


-- ------------------------------------------------------------
-- 1. Cómo está (solo el admin)
-- ------------------------------------------------------------
create or replace function public.estado_api_bs()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_key text;
  v_sec text;
  v_web text;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.es_admin() then
    raise exception 'Solo el administrador puede ver el QR automático' using errcode = '42501';
  end if;

  select valor into v_key from public.ajustes where clave = 'bs_api_key';
  select valor into v_sec from public.ajustes where clave = 'bs_api_secret';
  select valor into v_web from public.ajustes where clave = 'bs_webhook_secreto';

  return jsonb_build_object(
    'proveedor',     (select nullif(valor, '') from public.ajustes where clave = 'bs_proveedor'),
    'api_url',       (select nullif(valor, '') from public.ajustes where clave = 'bs_api_url'),
    'comercio',      (select nullif(valor, '') from public.ajustes where clave = 'bs_api_comercio'),
    'configurada',   coalesce(v_key, '') <> '' and coalesce(v_sec, '') <> '',
    'key_fin',       case when length(v_key) >= 4 then right(v_key, 4) end,
    'webhook_listo', coalesce(v_web, '') <> '',
    'webhook_fin',   case when length(v_web) >= 4 then right(v_web, 4) end,
    'ultimo_aviso',  (select nullif(valor, '')::jsonb from public.ajustes where clave = 'bs_ultimo_aviso')
  );
end;
$$;

revoke execute on function public.estado_api_bs() from public, anon;
grant  execute on function public.estado_api_bs() to authenticated;


-- ------------------------------------------------------------
-- 2. Guardar los datos de la pasarela (solo el admin)
-- ------------------------------------------------------------
-- La API Key o la Secret Key vacías = se dejan las que ya estaban (así
-- cambiás la URL sin volver a pegarlas). p_quitar = se borra todo.
-- (La primera versión no tenía p_quitar: se borra para que no queden dos.)
drop function if exists public.guardar_api_bs(text, text, text, text, text);

create or replace function public.guardar_api_bs(
  p_proveedor  text,
  p_api_url    text,
  p_comercio   text,
  p_api_key    text,
  p_api_secret text,
  p_quitar     boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text := btrim(coalesce(p_api_url, ''));
  v_key    text := btrim(coalesce(p_api_key, ''));
  v_secret text := btrim(coalesce(p_api_secret, ''));
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.es_admin() then
    raise exception 'Solo el administrador puede cambiar el QR automático' using errcode = '42501';
  end if;

  if p_quitar then
    delete from public.ajustes
     where clave in ('bs_proveedor', 'bs_api_url', 'bs_api_comercio', 'bs_api_key', 'bs_api_secret');
    return public.estado_api_bs();
  end if;

  if v_url <> '' and v_url !~* '^https://[^ ]+$' then
    raise exception 'La URL de la API tiene que empezar con https://';
  end if;

  if v_key = '' then
    select valor into v_key from public.ajustes where clave = 'bs_api_key';
    v_key := coalesce(v_key, '');
  end if;
  if v_secret = '' then
    select valor into v_secret from public.ajustes where clave = 'bs_api_secret';
    v_secret := coalesce(v_secret, '');
  end if;

  insert into public.ajustes (clave, valor) values
    ('bs_proveedor',    btrim(coalesce(p_proveedor, ''))),
    ('bs_api_url',      v_url),
    ('bs_api_comercio', btrim(coalesce(p_comercio, ''))),
    ('bs_api_key',      v_key),
    ('bs_api_secret',   v_secret)
  on conflict (clave) do update set valor = excluded.valor, actualizado_en = now();

  return public.estado_api_bs();
end;
$$;

revoke execute on function public.guardar_api_bs(text, text, text, text, text, boolean) from public, anon;
grant  execute on function public.guardar_api_bs(text, text, text, text, text, boolean) to authenticated;


-- ------------------------------------------------------------
-- 3. La clave del webhook (solo el admin)
-- ------------------------------------------------------------
-- Genera una nueva y la devuelve UNA vez, para copiarla a la pasarela.
-- Si la perdés, generás otra (y se la volvés a cargar a la pasarela).
create or replace function public.generar_clave_webhook_bs()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_clave text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.es_admin() then
    raise exception 'Solo el administrador puede generar la clave' using errcode = '42501';
  end if;

  insert into public.ajustes (clave, valor) values ('bs_webhook_secreto', v_clave)
  on conflict (clave) do update set valor = excluded.valor, actualizado_en = now();

  return v_clave;
end;
$$;

revoke execute on function public.generar_clave_webhook_bs() from public, anon;
grant  execute on function public.generar_clave_webhook_bs() to authenticated;


-- ------------------------------------------------------------
-- 4. Confirmar desde el webhook (reemplaza la de 05-cobros.sql)
-- ------------------------------------------------------------
-- Igual que antes, con tres cambios:
--   · una compra de VARIOS productos se paga con un solo QR: el monto se
--     compara contra el total de la compra y se confirma entera (antes se
--     comparaba contra un solo renglón y se entregaba ese solo)
--   · queda anotado el último aviso, así el panel muestra que llegan
--   · te avisa por Telegram, como Binance
-- Solo la llama el servidor (la Edge Function, con la service role).
create or replace function public.confirmar_pago_webhook(
  p_numero     bigint,
  p_monto      numeric,
  p_referencia text default null,
  p_origen     text default 'webhook'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido  public.pedidos%rowtype;
  v_compra  text;
  v_total   numeric;
  v_numeros text;
  v_res     jsonb;
  v_estado  text;
  v_fila    record;
begin
  select * into v_pedido from public.pedidos p where p.numero = p_numero;

  if not found then
    insert into public.ajustes (clave, valor) values ('bs_ultimo_aviso',
      jsonb_build_object('en', now(), 'numero', p_numero, 'monto', p_monto,
                         'ok', false, 'motivo', 'pedido_no_encontrado')::text)
    on conflict (clave) do update set valor = excluded.valor, actualizado_en = now();
    -- No se revela nada más: si alguien prueba números al azar, que no
    -- pueda deducir cuáles existen por la forma de la respuesta.
    return jsonb_build_object('ok', false, 'motivo', 'pedido_no_encontrado');
  end if;

  v_compra := coalesce(v_pedido.grupo::text, v_pedido.id::text);
  select sum(p.precio), string_agg('#' || p.numero, ' · ' order by p.numero)
    into v_total, v_numeros
  from public.pedidos p where coalesce(p.grupo::text, p.id::text) = v_compra;

  -- Pago de menos: no se entrega. Se dejan los datos igual para que
  -- puedas verlo en el panel y resolverlo con el cliente.
  if p_monto is not null and p_monto < v_total then
    update public.pedidos p set
      referencia_pago = coalesce(p_referencia, p.referencia_pago),
      confirmado_por  = p_origen || ' (MONTO INSUFICIENTE: ' || p_monto || ' de ' || v_total || ')'
    where coalesce(p.grupo::text, p.id::text) = v_compra;

    insert into public.ajustes (clave, valor) values ('bs_ultimo_aviso',
      jsonb_build_object('en', now(), 'numero', p_numero, 'monto', p_monto,
                         'ok', false, 'motivo', 'monto_insuficiente')::text)
    on conflict (clave) do update set valor = excluded.valor, actualizado_en = now();

    perform public.enviar_telegram(
      'Pago en Bs para revisar' || chr(10) ||
      'Pedido ' || v_numeros || chr(10) ||
      'Pagó ' || to_char(p_monto, 'FM999999990.00') || ' Bs de ' ||
      to_char(v_total, 'FM999999990.00') || ' Bs: no se entregó.' || chr(10) ||
      'Resolvelo con el cliente desde el panel.');

    return jsonb_build_object(
      'ok', false, 'motivo', 'monto_insuficiente',
      'esperado', v_total, 'recibido', p_monto);
  end if;

  -- Todo en orden: se entrega por la MISMA puerta que usa el botón del
  -- panel. No hay dos caminos de entrega que puedan desincronizarse.
  if v_pedido.grupo is not null then
    v_res := public.confirmar_compra(v_pedido.grupo, p_referencia, p_origen);
    v_estado := case when (v_res ->> 'sin_stock')::int > 0 then 'sin_stock' else 'entregado' end;
  else
    select * into v_fila from public.confirmar_pago(v_pedido.id, p_referencia, p_origen);
    v_estado := v_fila.estado;
    v_res := jsonb_build_object('estado', v_fila.estado, 'entregada', v_fila.entregada,
                                'mensaje', v_fila.mensaje);
  end if;

  insert into public.ajustes (clave, valor) values ('bs_ultimo_aviso',
    jsonb_build_object('en', now(), 'numero', p_numero, 'monto', p_monto,
                       'ok', true, 'estado', v_estado)::text)
  on conflict (clave) do update set valor = excluded.valor, actualizado_en = now();

  perform public.enviar_telegram(
    'Pago en Bs confirmado solo' || chr(10) ||
    'Pedido ' || v_numeros || chr(10) ||
    coalesce(to_char(p_monto, 'FM999999990.00'), to_char(v_total, 'FM999999990.00')) || ' Bs' ||
    chr(10) || chr(10) ||
    case when v_estado = 'sin_stock'
         then 'No había stock para todo: lo que falta, entregalo a mano desde el panel.'
         else 'La cuenta ya se le entregó en su página.' end);

  return jsonb_build_object('ok', true, 'numero', v_pedido.numero, 'estado', v_estado,
                            'resultado', v_res);
end;
$$;

revoke execute on function public.confirmar_pago_webhook(bigint, numeric, text, text) from public, anon, authenticated;
grant  execute on function public.confirmar_pago_webhook(bigint, numeric, text, text) to service_role;
