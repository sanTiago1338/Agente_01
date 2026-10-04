-- ============================================================
-- TIAGO STORE · Los pagos de Binance se confirman solos
-- ============================================================
-- Con la API de Binance cargada (Ventas → Cobros, ver 16-api-binance.sql),
-- cada minuto se miran los pagos que te entraron por Binance Pay y, si uno
-- coincide con un pedido que espera, el pedido se confirma y la cuenta se
-- entrega sola: lo mismo que tocar "Confirmar y entregar" en el panel.
--
-- CÓMO SE SABE DE QUIÉN ES CADA PAGO
--   Binance no deja escribir una nota en el pago, así que el que identifica
--   el pedido es el MONTO. Cada pedido por Binance recibe un monto único
--   entre los que esperan: el primero de 3.50 USDT paga 3.50; si mientras
--   tanto entra otro de 3.50, ese paga 3.51, y así. Casi siempre es el
--   precio justo; solo cambia por centavos cuando dos coinciden.
--
-- LO QUE NO SE CONFIRMA SOLO (queda para vos, con aviso por Telegram)
--   · un pago que no coincide con ningún pedido (pagó otro monto)
--   · un pago que coincide con más de uno (no debería pasar)
--   · pagos en otra moneda que no sea USDT
-- ============================================================

alter table public.pedidos add column if not exists usdt_monto numeric(10,2);

-- Los pagos de Binance ya mirados, para no usar uno dos veces
create table if not exists public.pagos_binance (
  transaccion  text primary key,           -- transactionId de Binance
  monto        numeric(18,8) not null,
  moneda       text not null,
  pagado_en    timestamptz not null,
  pagador      text,
  compra       text,                       -- grupo o id del pedido; null = no coincidió
  numero       integer,                    -- el número del pedido, para leerlo rápido
  nota         text,
  visto_en     timestamptz not null default now()
);

alter table public.pagos_binance enable row level security;
drop policy if exists "el admin ve los pagos de binance" on public.pagos_binance;
create policy "el admin ve los pagos de binance" on public.pagos_binance
  for select to authenticated using (public.es_admin());


-- ------------------------------------------------------------
-- 1. Mandar un mensaje a tu Telegram (uso interno)
-- ------------------------------------------------------------
create or replace function public.enviar_telegram(p_texto text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token  text;
  v_chat   text;
  v_estado integer;
begin
  select valor into v_token from public.ajustes where clave = 'telegram_token';
  select valor into v_chat  from public.ajustes where clave = 'telegram_chat';
  if v_token is null or v_chat is null then
    return false;
  end if;

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');
  begin
    select (extensions.http_post(
              'https://api.telegram.org/bot' || v_token || '/sendMessage',
              jsonb_build_object('chat_id', v_chat, 'text', p_texto,
                                 'disable_web_page_preview', true)::text,
              'application/json')).status
      into v_estado;
  exception when others then
    return false;
  end;
  return v_estado between 200 and 299;
end;
$$;

revoke execute on function public.enviar_telegram(text) from public, anon, authenticated;


-- ------------------------------------------------------------
-- 2. El monto único
-- ------------------------------------------------------------
-- El primero desde p_base que no esté usando otra compra que espera pago
-- por Binance (de las últimas 48 horas, las mismas que se revisan).
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
      and o.metodo_pago = 'binance'
      and o.usdt_monto = x.m
      and o.creado_en > now() - interval '48 hours'
      and coalesce(o.grupo::text, o.id::text) <> p_compra
  )
$$;

revoke execute on function public.monto_usdt_libre(numeric, text) from public, anon, authenticated;


-- ------------------------------------------------------------
-- 3. El cliente elige cómo paga (reemplaza la de 15-pago-binance.sql)
-- ------------------------------------------------------------
-- Igual que antes, y con Binance además le toca su monto único. Si ya lo
-- tenía (recargó la página) se queda con el mismo.
create or replace function public.elegir_metodo_pago(p_token text, p_metodo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido public.pedidos;
  v_compra text;
  v_tasa   numeric;
  v_total  numeric;
  v_monto  numeric;
begin
  if p_metodo not in ('qr', 'binance') then
    raise exception 'Método de pago desconocido';
  end if;

  select * into v_pedido from public.pedidos where token = p_token;
  if not found then
    raise exception 'No existe ese pedido';
  end if;
  v_compra := coalesce(v_pedido.grupo::text, v_pedido.id::text);

  if p_metodo = 'binance' then
    -- De a uno: dos clientes eligiendo a la vez no se llevan el mismo monto
    perform pg_advisory_xact_lock(hashtext('tiago-monto-usdt'));

    v_tasa := (public.datos_de_cobro() ->> 'usdt_bs')::numeric;

    if v_pedido.metodo_pago = 'binance' and v_pedido.usdt_monto is not null
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
    usdt_bs     = case when p_metodo = 'binance' then v_tasa end,
    usdt_monto  = case when p_metodo = 'binance' then v_monto end
  where coalesce(grupo::text, id::text) = v_compra
    and estado = 'esperando_pago';

  return jsonb_build_object('metodo',     p_metodo,
                            'usdt_bs',    case when p_metodo = 'binance' then v_tasa end,
                            'usdt_monto', case when p_metodo = 'binance' then v_monto end);
end;
$$;

revoke execute on function public.elegir_metodo_pago(text, text) from public;
grant  execute on function public.elegir_metodo_pago(text, text) to anon, authenticated;


-- ------------------------------------------------------------
-- 4. La tienda se entera de si la confirmación es automática
-- ------------------------------------------------------------
-- 'automatico': hay API cargada y la última prueba salió bien. La página
-- de pago lo usa para decir "tu pago se confirma solo".
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
    'automatico',     coalesce((select valor from public.ajustes where clave = 'binance_api_key'), '') <> ''
                      and coalesce((select nullif(valor, '')::jsonb ->> 'ok'
                                    from public.ajustes where clave = 'binance_api_estado'), 'false') = 'true'
  )
$$;

revoke execute on function public.datos_de_cobro() from public;
grant  execute on function public.datos_de_cobro() to anon, authenticated;


-- ------------------------------------------------------------
-- 5. Revisar los pagos (cada minuto, con pg_cron)
-- ------------------------------------------------------------
-- Devuelve cuántas compras confirmó. Solo le pregunta a Binance si hay
-- alguna compra esperando pago por Binance: si no, no hace nada.
create or replace function public.verificar_pagos_binance()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key      text;
  v_secret   text;
  v_desde    timestamptz;
  v_query    text;
  v_r        extensions.http_response;
  v_json     jsonb;
  v_tx       jsonb;
  v_id       text;
  v_monto    numeric;
  v_moneda   text;
  v_cuando   timestamptz;
  v_pagador  text;
  v_compras  text[];
  v_compra   text;
  v_pedido   public.pedidos;
  v_res      jsonb;
  v_estado   text;
  v_numeros  text;
  v_total    numeric;
  v_cuantos  integer := 0;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.es_admin() then
    raise exception 'Solo el administrador puede revisar los pagos' using errcode = '42501';
  end if;

  select valor into v_key    from public.ajustes where clave = 'binance_api_key';
  select valor into v_secret from public.ajustes where clave = 'binance_api_secret';
  if coalesce(v_key, '') = '' or coalesce(v_secret, '') = '' then
    return 0;
  end if;

  select min(p.creado_en) into v_desde
  from public.pedidos p
  where p.estado = 'esperando_pago'
    and p.metodo_pago = 'binance'
    and p.usdt_monto is not null
    and p.creado_en > now() - interval '48 hours';
  if v_desde is null then
    return 0;
  end if;

  v_query := 'startTime=' || ((extract(epoch from v_desde) - 300) * 1000)::bigint
          || '&limit=100'
          || '&timestamp=' || (extract(epoch from clock_timestamp()) * 1000)::bigint
          || '&recvWindow=10000';

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');
  begin
    v_r := extensions.http((
      'GET',
      'https://api.binance.com/sapi/v1/pay/transactions?' || v_query
        || '&signature=' || encode(extensions.hmac(v_query, v_secret, 'sha256'), 'hex'),
      array[extensions.http_header('X-MBX-APIKEY', v_key)],
      null, null)::extensions.http_request);
  exception when others then
    return 0;                           -- Binance no contestó: el próximo minuto
  end;

  begin
    v_json := v_r.content::jsonb;
  exception when others then
    v_json := null;
  end;

  if v_r.status not between 200 and 299 or v_json is null then
    -- La API dejó de servir (la borraste en Binance, venció...): se anota
    -- como prueba fallida, así el panel lo muestra y la tienda deja de
    -- prometer la confirmación automática
    if (v_json ->> 'code') in ('-2008', '-2014', '-2015', '-1022') then
      insert into public.ajustes (clave, valor) values ('binance_api_estado',
        jsonb_build_object('ok', false, 'en', now(),
          'mensaje', 'Binance dejó de aceptar la API (código ' || (v_json ->> 'code') ||
                     '). Los pagos de Binance se confirman a mano hasta que la cargues de nuevo.')::text)
      on conflict (clave) do update set valor = excluded.valor, actualizado_en = now();
    end if;
    return 0;
  end if;

  insert into public.ajustes (clave, valor) values ('binance_auto_revisado', now()::text)
  on conflict (clave) do update set valor = excluded.valor, actualizado_en = now();

  -- Del más viejo al más nuevo: si dos pagan, se atienden en orden
  for v_tx in
    select t from jsonb_array_elements(coalesce(v_json -> 'data', '[]'::jsonb)) t
    order by (t ->> 'transactionTime')::bigint
  loop
    v_id     := v_tx ->> 'transactionId';
    v_moneda := v_tx ->> 'currency';
    begin
      v_monto := (v_tx ->> 'amount')::numeric;
    exception when others then
      continue;
    end;

    -- Solo lo que te entró (positivo), por Binance Pay, y que no se miró antes
    continue when v_id is null or v_monto is null or v_monto <= 0;
    continue when coalesce(v_tx ->> 'orderType', '') not in ('C2C', 'PAY');
    continue when exists (select 1 from public.pagos_binance b where b.transaccion = v_id);

    v_cuando  := to_timestamp((v_tx ->> 'transactionTime')::bigint / 1000.0);
    v_pagador := coalesce(nullif(v_tx #>> '{payerInfo,name}', ''), v_tx #>> '{payerInfo,binanceId}');

    -- Las compras que esperan justo ese monto, armadas antes del pago
    v_compras := null;
    if v_moneda = 'USDT' then
      select array_agg(distinct coalesce(p.grupo::text, p.id::text)) into v_compras
      from public.pedidos p
      where p.estado = 'esperando_pago'
        and p.metodo_pago = 'binance'
        and abs(p.usdt_monto - v_monto) < 0.005
        and p.creado_en <= v_cuando + interval '1 minute'
        and p.creado_en > now() - interval '48 hours';
    end if;

    if coalesce(array_length(v_compras, 1), 0) <> 1 then
      -- No coincide con ninguna (o con varias): se anota como visto y se
      -- avisa, para que lo confirmes vos
      insert into public.pagos_binance (transaccion, monto, moneda, pagado_en, pagador, nota)
      values (v_id, v_monto, coalesce(v_moneda, '?'), v_cuando, v_pagador,
              case when coalesce(array_length(v_compras, 1), 0) = 0 then 'sin pedido' else 'varios pedidos' end);

      perform public.enviar_telegram(
        'Pago de Binance para revisar' || chr(10) ||
        trim(to_char(v_monto, 'FM999999990.00999999')) || ' ' || coalesce(v_moneda, '') ||
        coalesce(' de ' || v_pagador, '') || chr(10) || chr(10) ||
        case when coalesce(array_length(v_compras, 1), 0) = 0
             then 'No coincide con ningún pedido que espere pago por Binance. Si es de un cliente, confirmalo a mano en el panel.'
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

    -- Lo mismo que el botón "Confirmar y entregar" del panel
    if v_pedido.grupo is not null then
      v_res := public.confirmar_compra(v_pedido.grupo, v_id, 'Binance automático');
      v_estado := case when (v_res ->> 'sin_stock')::int > 0 then 'sin_stock' else 'entregado' end;
    else
      select c.estado into v_estado from public.confirmar_pago(v_pedido.id, v_id, 'Binance automático') c;
    end if;

    insert into public.pagos_binance (transaccion, monto, moneda, pagado_en, pagador, compra, numero, nota)
    values (v_id, v_monto, v_moneda, v_cuando, v_pagador, v_compra, v_pedido.numero, 'confirmado solo');

    v_cuantos := v_cuantos + 1;

    perform public.enviar_telegram(
      'Pago de Binance confirmado solo' || chr(10) ||
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

revoke execute on function public.verificar_pagos_binance() from public, anon;
grant  execute on function public.verificar_pagos_binance() to authenticated;

select cron.unschedule('verificar-pagos-binance')
where exists (select 1 from cron.job where jobname = 'verificar-pagos-binance');
select cron.schedule('verificar-pagos-binance', '* * * * *', 'select public.verificar_pagos_binance()');


-- ------------------------------------------------------------
-- 6. El panel ve si la confirmación automática anda
-- ------------------------------------------------------------
create or replace function public.estado_api_binance()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_key    text;
  v_secret text;
  v_estado jsonb;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.es_admin() then
    raise exception 'Solo el administrador puede ver la API de Binance' using errcode = '42501';
  end if;

  select valor into v_key    from public.ajustes where clave = 'binance_api_key';
  select valor into v_secret from public.ajustes where clave = 'binance_api_secret';
  select nullif(valor, '')::jsonb into v_estado from public.ajustes where clave = 'binance_api_estado';

  return jsonb_build_object(
    'configurada', coalesce(v_key, '') <> '' and coalesce(v_secret, '') <> '',
    'key_fin',     case when length(v_key) >= 4 then right(v_key, 4) end,
    'prueba',      v_estado,
    'revisado_en', (select nullif(valor, '') from public.ajustes where clave = 'binance_auto_revisado'),
    'confirmados', (select count(*) from public.pagos_binance where compra is not null)
  );
end;
$$;


-- ------------------------------------------------------------
-- 7. ver_mi_compra y el aviso de pedido nuevo usan el monto único
-- ------------------------------------------------------------
create or replace function public.ver_mi_compra(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido    public.pedidos%rowtype;
  v_lineas    jsonb;
  v_total     numeric(10,2);
  v_descuento numeric(10,2);
begin
  if p_token is null or length(p_token) < 32 then
    return jsonb_build_object('error', 'token invalido');
  end if;

  select * into v_pedido from public.pedidos where token = p_token;
  if not found then
    return jsonb_build_object('error', 'no existe');
  end if;

  select
    jsonb_agg(jsonb_build_object(
      'numero',       p.numero,
      'producto',     p.producto_nombre,
      'producto_id',  p.producto_id,
      'precio',       p.precio,
      'descuento',    p.descuento,
      'estado',       p.estado,
      'entregado_en', p.entregado_en,
      'dias',         p.plan_dias,
      'dias_plan',    (select public.dias_del_plan(pr.nombre, pr.suscripcion)
                       from public.productos pr where pr.id = p.producto_id),
      'vence',        p.suscripcion_vence_en,
      'credenciales', case when p.estado = 'entregado' then (
        select c.credenciales from public.cuentas c
        where c.pedido_id = p.id and c.estado = 'entregada' limit 1
      ) else null end
    ) order by p.numero),
    sum(p.precio),
    sum(p.descuento)
  into v_lineas, v_total, v_descuento
  from public.pedidos p
  where (v_pedido.grupo is not null and p.grupo = v_pedido.grupo)
     or (v_pedido.grupo is null     and p.id    = v_pedido.id);

  return jsonb_build_object(
    'numero',     v_pedido.numero,
    'grupo',      v_pedido.grupo,
    'total',      v_total,
    'descuento',  coalesce(v_descuento, 0),
    'moneda',     v_pedido.moneda,
    'metodo',     coalesce(v_pedido.metodo_pago, 'qr'),
    'usdt_bs',    v_pedido.usdt_bs,
    'usdt_monto', v_pedido.usdt_monto,
    'vence_en',   v_pedido.vence_en,
    'creado_en',  v_pedido.creado_en,
    'lineas',     coalesce(v_lineas, '[]'::jsonb)
  );
end;
$$;


-- El aviso de pedido nuevo, con el monto único que tiene que llegarte
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
      max(p.usdt_bs) filter (where p.metodo_pago = 'binance') as usdt_bs,
      max(p.usdt_monto) filter (where p.metodo_pago = 'binance') as usdt_monto
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
      -- Lo mismo que calcula la tienda: hacia arriba, al centavo
      || case when v_compra.usdt_monto > 0
              then chr(10) || 'Pago: Binance Pay · ' ||
                   to_char(v_compra.usdt_monto, 'FM999999990.00') || ' USDT'
              when v_compra.usdt_bs > 0
              then chr(10) || 'Pago: Binance Pay · ' ||
                   to_char(ceil(round(v_compra.total / v_compra.usdt_bs * 100, 6)) / 100, 'FM999999990.00') ||
                   ' USDT'
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
