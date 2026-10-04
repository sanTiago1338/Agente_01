-- ============================================================
-- TIAGO STORE · USDT por red BSC (BEP20), confirmado solo
-- ============================================================
-- Además de Binance Pay, el cliente puede mandarte USDT desde cualquier
-- billetera o exchange (Trust Wallet, OKX, Bybit...) a tu dirección de
-- depósito de Binance, por la red BNB Smart Chain (BEP20).
--
-- Con la misma API de solo lectura (16-api-binance.sql), el revisor de
-- cada minuto lee también tus depósitos de USDT por BSC y, si uno
-- coincide con el monto único de un pedido, lo confirma y entrega la
-- cuenta. Igual que Binance Pay (17-binance-automatico.sql).
--
--   ajustes.bsc_direccion   tu dirección de depósito USDT · BSC (0x...)
--   pedidos.metodo_pago     'qr', 'binance' o 'bsc'
-- ============================================================


-- ------------------------------------------------------------
-- 1. Guardar la dirección (solo el admin)
-- ------------------------------------------------------------
create or replace function public.guardar_direccion_bsc(p_direccion text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dir text := btrim(coalesce(p_direccion, ''));
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.es_admin() then
    raise exception 'Solo el administrador puede cambiar la dirección' using errcode = '42501';
  end if;

  if v_dir <> '' and v_dir !~ '^0x[0-9a-fA-F]{40}$' then
    raise exception 'La dirección BSC empieza con 0x y tiene 42 caracteres: copiala de nuevo desde Binance';
  end if;

  insert into public.ajustes (clave, valor) values ('bsc_direccion', v_dir)
  on conflict (clave) do update set valor = excluded.valor, actualizado_en = now();

  return public.datos_de_cobro();
end;
$$;

revoke execute on function public.guardar_direccion_bsc(text) from public, anon;
grant  execute on function public.guardar_direccion_bsc(text) to authenticated;


-- ------------------------------------------------------------
-- 2. La tienda se entera de la dirección
-- ------------------------------------------------------------
create or replace function public.datos_de_cobro()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'usdt_bs',        coalesce(nullif((select valor from public.ajustes where clave = 'usdt_bs'), '')::numeric, 10),
    'binance_qr',     nullif((select valor from public.ajustes where clave = 'binance_qr'), ''),
    'binance_pay_id', nullif((select valor from public.ajustes where clave = 'binance_pay_id'), ''),
    'bsc_direccion',  nullif((select valor from public.ajustes where clave = 'bsc_direccion'), ''),
    'automatico',     coalesce((select valor from public.ajustes where clave = 'binance_api_key'), '') <> ''
                      and coalesce((select nullif(valor, '')::jsonb ->> 'ok'
                                    from public.ajustes where clave = 'binance_api_estado'), 'false') = 'true'
  )
$$;

revoke execute on function public.datos_de_cobro() from public;
grant  execute on function public.datos_de_cobro() to anon, authenticated;


-- ------------------------------------------------------------
-- 3. El monto único, para Binance Pay y para BSC
-- ------------------------------------------------------------
-- Comparten la lista: así un monto nunca puede ser de dos pedidos, venga
-- el pago por donde venga.
create or replace function public.monto_usdt_libre(p_base numeric, p_compra text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select min(x.m)
  from (select round(p_base + i / 100.0, 2) as m from generate_series(0, 99) i) x
  where not exists (
    select 1 from public.pedidos o
    where o.estado = 'esperando_pago'
      and o.metodo_pago in ('binance', 'bsc')
      and o.usdt_monto = x.m
      and o.creado_en > now() - interval '48 hours'
      and coalesce(o.grupo::text, o.id::text) <> p_compra
  )
$$;

revoke execute on function public.monto_usdt_libre(numeric, text) from public, anon, authenticated;


-- ------------------------------------------------------------
-- 4. El cliente elige cómo paga: también 'bsc'
-- ------------------------------------------------------------
create or replace function public.elegir_metodo_pago(p_token text, p_metodo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido public.pedidos;
  v_compra text;
  v_usdt   boolean := p_metodo in ('binance', 'bsc');
  v_tasa   numeric;
  v_total  numeric;
  v_monto  numeric;
begin
  if p_metodo not in ('qr', 'binance', 'bsc') then
    raise exception 'Método de pago desconocido';
  end if;

  select * into v_pedido from public.pedidos where token = p_token;
  if not found then
    raise exception 'No existe ese pedido';
  end if;
  v_compra := coalesce(v_pedido.grupo::text, v_pedido.id::text);

  if v_usdt then
    -- De a uno: dos clientes eligiendo a la vez no se llevan el mismo monto
    perform pg_advisory_xact_lock(hashtext('tiago-monto-usdt'));

    v_tasa := (public.datos_de_cobro() ->> 'usdt_bs')::numeric;

    -- Ya tenía monto con la misma tasa (recargó la página, o cambió entre
    -- Binance Pay y BSC): se queda con el mismo
    if v_pedido.metodo_pago in ('binance', 'bsc') and v_pedido.usdt_monto is not null
       and v_pedido.usdt_bs = v_tasa then
      v_monto := v_pedido.usdt_monto;
    else
      select sum(p.precio) into v_total from public.pedidos p
      where coalesce(p.grupo::text, p.id::text) = v_compra;
      v_monto := public.monto_usdt_libre(
        ceil(round(coalesce(v_total, 0) / v_tasa * 100, 6)) / 100, v_compra);
    end if;
  end if;

  update public.pedidos set
    metodo_pago = p_metodo,
    usdt_bs     = case when v_usdt then v_tasa end,
    usdt_monto  = case when v_usdt then v_monto end
  where coalesce(grupo::text, id::text) = v_compra
    and estado = 'esperando_pago';

  return jsonb_build_object('metodo',     p_metodo,
                            'usdt_bs',    case when v_usdt then v_tasa end,
                            'usdt_monto', case when v_usdt then v_monto end);
end;
$$;

revoke execute on function public.elegir_metodo_pago(text, text) from public;
grant  execute on function public.elegir_metodo_pago(text, text) to anon, authenticated;


-- ------------------------------------------------------------
-- 5. Pedirle algo a Binance, firmado (uso interno)
-- ------------------------------------------------------------
-- La firma que pide Binance (HMAC SHA256 con la Secret Key). Devuelve null
-- si no hay API cargada.
create or replace function public.binance_get(p_ruta text, p_params text)
returns extensions.http_response
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key    text;
  v_secret text;
  v_query  text;
begin
  select valor into v_key    from public.ajustes where clave = 'binance_api_key';
  select valor into v_secret from public.ajustes where clave = 'binance_api_secret';
  if coalesce(v_key, '') = '' or coalesce(v_secret, '') = '' then
    return null;
  end if;

  v_query := case when coalesce(p_params, '') <> '' then p_params || '&' else '' end
          || 'timestamp=' || (extract(epoch from clock_timestamp()) * 1000)::bigint
          || '&recvWindow=10000';

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');
  return extensions.http((
    'GET',
    'https://api.binance.com' || p_ruta || '?' || v_query
      || '&signature=' || encode(extensions.hmac(v_query, v_secret, 'sha256'), 'hex'),
    array[extensions.http_header('X-MBX-APIKEY', v_key)],
    null, null)::extensions.http_request);
end;
$$;

revoke execute on function public.binance_get(text, text) from public, anon, authenticated;


-- ------------------------------------------------------------
-- 6. Emparejar los pagos con los pedidos (uso interno)
-- ------------------------------------------------------------
-- Recibe los movimientos ya en un solo formato, vengan de Binance Pay o de
-- un depósito por BSC:
--   { id, monto, moneda, cuando (ms), pagador, metodo: 'binance' | 'bsc' }
-- Si uno coincide con el monto único de UNA compra que espera pago por ese
-- método, la confirma (lo mismo que "Confirmar y entregar" en el panel).
-- Los que no coinciden se anotan como vistos y te llegan por Telegram.
create or replace function public.conciliar_pagos_usdt(p_movs jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mov     jsonb;
  v_id      text;
  v_monto   numeric;
  v_moneda  text;
  v_metodo  text;
  v_nombre  text;
  v_cuando  timestamptz;
  v_pagador text;
  v_compras text[];
  v_compra  text;
  v_pedido  public.pedidos;
  v_res     jsonb;
  v_estado  text;
  v_numeros text;
  v_total   numeric;
  v_cuantos integer := 0;
begin
  for v_mov in
    select m from jsonb_array_elements(coalesce(p_movs, '[]'::jsonb)) m
    order by (m ->> 'cuando')::bigint
  loop
    v_id      := v_mov ->> 'id';
    v_moneda  := v_mov ->> 'moneda';
    v_metodo  := v_mov ->> 'metodo';
    v_pagador := nullif(v_mov ->> 'pagador', '');
    v_nombre  := case when v_metodo = 'bsc' then 'USDT por red BSC' else 'Binance Pay' end;
    begin
      v_monto  := (v_mov ->> 'monto')::numeric;
      v_cuando := to_timestamp((v_mov ->> 'cuando')::bigint / 1000.0);
    exception when others then
      continue;
    end;

    continue when v_id is null or v_monto is null or v_monto <= 0;
    continue when exists (select 1 from public.pagos_binance b where b.transaccion = v_id);

    -- Las compras que esperan justo ese monto por ese método, armadas antes del pago
    v_compras := null;
    if v_moneda = 'USDT' then
      select array_agg(distinct coalesce(p.grupo::text, p.id::text)) into v_compras
      from public.pedidos p
      where p.estado = 'esperando_pago'
        and p.metodo_pago = v_metodo
        and abs(p.usdt_monto - v_monto) < 0.005
        and p.creado_en <= v_cuando + interval '1 minute'
        and p.creado_en > now() - interval '48 hours';
    end if;

    if coalesce(array_length(v_compras, 1), 0) <> 1 then
      insert into public.pagos_binance (transaccion, monto, moneda, pagado_en, pagador, nota)
      values (v_id, v_monto, coalesce(v_moneda, '?'), v_cuando, v_pagador,
              case when coalesce(array_length(v_compras, 1), 0) = 0 then 'sin pedido' else 'varios pedidos' end);

      perform public.enviar_telegram(
        'Pago por ' || v_nombre || ' para revisar' || chr(10) ||
        trim(to_char(v_monto, 'FM999999990.00999999')) || ' ' || coalesce(v_moneda, '') ||
        coalesce(' de ' || v_pagador, '') || chr(10) || chr(10) ||
        case when coalesce(array_length(v_compras, 1), 0) = 0
             then 'No coincide con ningún pedido que espere ese pago. Si es de un cliente, confirmalo a mano en el panel.'
             else 'Coincide con más de un pedido. Confirmá a mano el que corresponde.' end);
      continue;
    end if;

    v_compra := v_compras[1];
    select * into v_pedido from public.pedidos p
    where coalesce(p.grupo::text, p.id::text) = v_compra
    order by p.numero limit 1;

    select string_agg('#' || p.numero, ' · ' order by p.numero), sum(p.precio)
      into v_numeros, v_total
    from public.pedidos p where coalesce(p.grupo::text, p.id::text) = v_compra;

    if v_pedido.grupo is not null then
      v_res := public.confirmar_compra(v_pedido.grupo, v_id, v_nombre || ' automático');
      v_estado := case when (v_res ->> 'sin_stock')::int > 0 then 'sin_stock' else 'entregado' end;
    else
      select c.estado into v_estado
      from public.confirmar_pago(v_pedido.id, v_id, v_nombre || ' automático') c;
    end if;

    insert into public.pagos_binance (transaccion, monto, moneda, pagado_en, pagador, compra, numero, nota)
    values (v_id, v_monto, v_moneda, v_cuando, v_pagador, v_compra, v_pedido.numero, 'confirmado solo');

    v_cuantos := v_cuantos + 1;

    perform public.enviar_telegram(
      'Pago por ' || v_nombre || ' confirmado solo' || chr(10) ||
      'Pedido ' || v_numeros || chr(10) ||
      trim(to_char(v_monto, 'FM999999990.00')) || ' USDT (' || to_char(v_total, 'FM999999990.00') || ' Bs)' ||
      coalesce(chr(10) || 'De: ' || v_pagador, '') || chr(10) || chr(10) ||
      case when v_estado = 'sin_stock'
           then 'No había stock para todo: lo que falta, entregalo a mano desde el panel.'
           else 'La cuenta ya se le entregó en su página.' end);
  end loop;

  return v_cuantos;
end;
$$;

revoke execute on function public.conciliar_pagos_usdt(jsonb) from public, anon, authenticated;


-- ------------------------------------------------------------
-- 7. El revisor de cada minuto: Binance Pay y depósitos por BSC
-- ------------------------------------------------------------
-- Solo le pregunta a Binance por lo que hace falta: Binance Pay si hay
-- pedidos esperando por Binance Pay, depósitos si hay pedidos esperando
-- por BSC. Sin ninguno, no hace nada. Mismo nombre y mismo pg_cron que
-- en 17-binance-automatico.sql.
create or replace function public.verificar_pagos_binance()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_desde   timestamptz;
  v_dir     text;
  v_r       extensions.http_response;
  v_json    jsonb;
  v_movs    jsonb;
  v_cuantos integer := 0;
  v_codigo  text;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.es_admin() then
    raise exception 'Solo el administrador puede revisar los pagos' using errcode = '42501';
  end if;

  if coalesce((select valor from public.ajustes where clave = 'binance_api_key'), '') = '' then
    return 0;
  end if;

  -- ---- Binance Pay ----
  select min(p.creado_en) into v_desde from public.pedidos p
  where p.estado = 'esperando_pago' and p.metodo_pago = 'binance'
    and p.usdt_monto is not null and p.creado_en > now() - interval '48 hours';

  if v_desde is not null then
    begin
      v_r := public.binance_get('/sapi/v1/pay/transactions',
        'startTime=' || ((extract(epoch from v_desde) - 300) * 1000)::bigint || '&limit=100');
      v_json := v_r.content::jsonb;
    exception when others then
      v_r := null; v_json := null;
    end;

    if v_r.status between 200 and 299 and v_json is not null then
      select jsonb_agg(jsonb_build_object(
               'id',      t ->> 'transactionId',
               'monto',   t ->> 'amount',
               'moneda',  t ->> 'currency',
               'cuando',  t ->> 'transactionTime',
               'pagador', coalesce(nullif(t #>> '{payerInfo,name}', ''), t #>> '{payerInfo,binanceId}'),
               'metodo',  'binance'))
        into v_movs
      from jsonb_array_elements(coalesce(v_json -> 'data', '[]'::jsonb)) t
      where coalesce(t ->> 'orderType', '') in ('C2C', 'PAY')
        and coalesce(t ->> 'amount', '') ~ '^[0-9.]+$';           -- solo lo que entró (positivo)
      v_cuantos := v_cuantos + public.conciliar_pagos_usdt(v_movs);
    else
      v_codigo := v_json ->> 'code';
    end if;
  end if;

  -- ---- Depósitos de USDT por BSC ----
  v_dir := lower(nullif((select valor from public.ajustes where clave = 'bsc_direccion'), ''));
  select min(p.creado_en) into v_desde from public.pedidos p
  where p.estado = 'esperando_pago' and p.metodo_pago = 'bsc'
    and p.usdt_monto is not null and p.creado_en > now() - interval '48 hours';

  if v_desde is not null and v_dir is not null then
    begin
      v_r := public.binance_get('/sapi/v1/capital/deposit/hisrec',
        'coin=USDT&startTime=' || ((extract(epoch from v_desde) - 300) * 1000)::bigint || '&limit=1000');
      v_json := v_r.content::jsonb;
    exception when others then
      v_r := null; v_json := null;
    end;

    if v_r.status between 200 and 299 and jsonb_typeof(v_json) = 'array' then
      -- Acreditados (1 = listo, 6 = acreditado), por BSC, a tu dirección
      select jsonb_agg(jsonb_build_object(
               'id',      'dep:' || coalesce(t ->> 'txId', t ->> 'id'),
               'monto',   t ->> 'amount',
               'moneda',  t ->> 'coin',
               'cuando',  t ->> 'insertTime',
               'pagador', null,
               'metodo',  'bsc'))
        into v_movs
      from jsonb_array_elements(v_json) t
      where t ->> 'coin' = 'USDT'
        and t ->> 'network' = 'BSC'
        and (t ->> 'status') in ('1', '6')
        and lower(coalesce(t ->> 'address', '')) = v_dir;
      v_cuantos := v_cuantos + public.conciliar_pagos_usdt(v_movs);
    elsif v_codigo is null then
      v_codigo := v_json ->> 'code';
    end if;
  end if;

  if v_codigo in ('-2008', '-2014', '-2015', '-1022') then
    -- La API dejó de servir (la borraste en Binance, venció...): se anota
    -- como prueba fallida, así el panel lo muestra y la tienda deja de
    -- prometer la confirmación automática
    insert into public.ajustes (clave, valor) values ('binance_api_estado',
      jsonb_build_object('ok', false, 'en', now(),
        'mensaje', 'Binance dejó de aceptar la API (código ' || v_codigo ||
                   '). Los pagos en USDT se confirman a mano hasta que la cargues de nuevo.')::text)
    on conflict (clave) do update set valor = excluded.valor, actualizado_en = now();
  elsif v_r.status between 200 and 299 then
    insert into public.ajustes (clave, valor) values ('binance_auto_revisado', now()::text)
    on conflict (clave) do update set valor = excluded.valor, actualizado_en = now();
  end if;

  return v_cuantos;
end;
$$;

revoke execute on function public.verificar_pagos_binance() from public, anon;
grant  execute on function public.verificar_pagos_binance() to authenticated;


-- ------------------------------------------------------------
-- 8. El aviso de pedido nuevo dice si es por BSC
-- ------------------------------------------------------------
create or replace function public.avisar_pedidos_nuevos()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token   text;
  v_chat    text;
  v_panel   text;
  v_compra  record;
  v_texto   text;
  v_estado  integer;
  v_cuantos integer := 0;
begin
  select valor into v_token from public.ajustes where clave = 'telegram_token';
  select valor into v_chat  from public.ajustes where clave = 'telegram_chat';

  if v_token is null or v_chat is null then
    return 0;
  end if;

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');

  select valor into v_panel from public.ajustes where clave = 'panel_url';

  for v_compra in
    select
      coalesce(p.grupo::text, p.id::text)                    as compra,
      min(p.numero)                                          as numero,
      count(*)                                               as cuantos,
      sum(p.precio)                                          as total,
      max(nullif(p.cliente_nombre, ''))                      as cliente,
      max(nullif(p.cliente_whatsapp, ''))                    as whatsapp,
      string_agg(
        p.producto_nombre
        || coalesce(' · ' || p.plan_dias || ' días'
             || case when p.plan_dias < public.dias_del_plan(p.producto_nombre, pr.suscripcion)
                     then ' (de ' || public.dias_del_plan(p.producto_nombre, pr.suscripcion) || ')'
                     else '' end, ''),
        chr(10) || '· ' order by p.numero)                   as productos,
      array_agg(p.id)                                        as ids,
      max(p.metodo_pago) filter (where p.metodo_pago in ('binance', 'bsc')) as metodo_usdt,
      max(p.usdt_bs)    filter (where p.metodo_pago in ('binance', 'bsc')) as usdt_bs,
      max(p.usdt_monto) filter (where p.metodo_pago in ('binance', 'bsc')) as usdt_monto
    from public.pedidos p
    left join public.productos pr on pr.id = p.producto_id
    where p.avisado_en is null
      and p.creado_en > now() - interval '1 day'
      and p.creado_en < now() - interval '5 seconds'
    group by 1
    order by 2
  loop
    v_texto :=
      case when v_compra.cuantos = 1
        then 'Pedido nuevo #' || v_compra.numero || chr(10) ||
             v_compra.productos
        else 'Compra nueva #' || v_compra.numero ||
             ' (' || v_compra.cuantos || ' productos)' || chr(10) ||
             '· ' || v_compra.productos
      end
      || chr(10) || chr(10)
      || 'Total: ' || to_char(v_compra.total, 'FM999999990.00') || ' Bs'
      || case when v_compra.metodo_usdt is not null
              then chr(10) || 'Pago: ' ||
                   case when v_compra.metodo_usdt = 'bsc' then 'USDT por red BSC' else 'Binance Pay' end ||
                   ' · ' ||
                   to_char(coalesce(v_compra.usdt_monto,
                                    ceil(round(v_compra.total / nullif(v_compra.usdt_bs, 0) * 100, 6)) / 100),
                           'FM999999990.00') || ' USDT'
              else '' end
      || case when v_compra.cliente is not null or v_compra.whatsapp is not null
              then chr(10) || 'Cliente: ' ||
                   coalesce(v_compra.cliente, 'sin nombre') ||
                   coalesce(' · ' || v_compra.whatsapp, '')
              else '' end
      || chr(10) || chr(10) || 'Esperando que lo apruebes en el panel.'
      || coalesce(chr(10) || v_panel, '');

    begin
      select (extensions.http_post(
                'https://api.telegram.org/bot' || v_token || '/sendMessage',
                jsonb_build_object(
                  'chat_id', v_chat,
                  'text',    v_texto,
                  'disable_web_page_preview', true)::text,
                'application/json')).status
        into v_estado;
    exception when others then
      v_estado := null;
    end;

    if v_estado between 200 and 299 then
      update public.pedidos set avisado_en = now() where id = any(v_compra.ids);
      v_cuantos := v_cuantos + 1;
    end if;
  end loop;

  return v_cuantos;
end;
$$;
