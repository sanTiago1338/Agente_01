-- ============================================================
-- TIAGO STORE · 25 · TELEGRAM SIN CONFIRMAR PAGOS
-- ============================================================
-- Aplicado con la migración: telegram_sin_confirmar (13/10/2026). Se puede correr
-- de nuevo sin romper nada (no cambia el interruptor si ya lo tocaste).
--
-- EL PROBLEMA
--   Desde el 23-confirmar-desde-telegram.sql, el aviso de pedido nuevo
--   por QR traía "Confirmar y entregar": dos toques en el chat y la
--   cuenta salía, sin mirar el panel. El dueño prefiere confirmar
--   siempre desde el panel, donde ve el pedido entero.
--
-- LO NUEVO
--   · El aviso de pedido nuevo llega SIN el botón. Dice si hay stock y
--     que se confirma desde el panel.
--   · Si se toca un botón de un aviso viejo ("Sí, ya cobré", "Reintentar
--     entrega", "Ya lo entregué por WhatsApp"), no confirma ni entrega
--     nada: lo frena la base, no la Edge Function, así no hace falta
--     volver a publicarla.
--   · Se prende o se apaga desde Panel → Ajustes ("Confirmar pagos desde
--     Telegram"). Queda APAGADO.
--   · Los botones de las 9:05 ("Cancelar: nunca pagó / duplicado /
--     Dejarlo", 24-sin-pagar-desde-ayer.sql) siguen andando: cancelar no
--     entrega nada.
--
-- Y para la vista Ajustes del panel:
--   · estado_telegram(): si está conectado, el bot, los avisos (pedidos,
--     vencimientos, sin pagar) y cuándo corrieron por última vez
--   · probar_telegram_panel(): "Mandar mensaje de prueba"
--
-- SECCIONES
--   1. El interruptor (ajustes.telegram_confirmar)
--   2. avisar_pedidos_nuevos(): el aviso, sin botón si está apagado
--   3. confirmar_desde_telegram(): frenado si está apagado
--   4. entregado_por_whatsapp_desde_telegram(): frenado si está apagado
--   5. Para el panel: estado, interruptor y mensaje de prueba
--   6. Permisos
-- ============================================================


-- ============================================================
-- 1. EL INTERRUPTOR
-- ============================================================
-- 'si' = el aviso trae el botón y los toques confirman.
-- Cualquier otra cosa (o que no esté) = apagado. Arranca apagado; si lo
-- volvés a correr, no te pisa lo que elegiste en el panel.
insert into public.ajustes (clave, valor)
values ('telegram_confirmar', 'no')
on conflict (clave) do nothing;

create or replace function public.telegram_confirma()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.ajustes
                 where clave = 'telegram_confirmar' and valor = 'si');
$$;


-- ============================================================
-- 2. EL AVISO DE PEDIDO NUEVO
-- ============================================================
-- Igual que en 23-confirmar-desde-telegram.sql, salvo:
--   · el botón sale solo con el interruptor prendido (y la clave puesta)
--   · apagado, dice si hay stock y que se confirma desde el panel
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
  v_boton   boolean;
  v_compra  record;
  v_faltan  text;
  v_texto   text;
  v_mensaje jsonb;
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
  v_boton := public.telegram_confirma()
             and exists (select 1 from public.ajustes
                         where clave = 'telegram_webhook_secreto' and coalesce(valor, '') <> '');

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
      and not p.prueba                 -- las compras de prueba no te avisan
      and p.creado_en > now() - interval '1 day'
      and p.creado_en < now() - interval '5 seconds'
    group by 1
    order by 2
  loop
    -- Lo que no alcanza a salir del stock: el producto pide más cuentas
    -- de las que hay libres (o ya no existe)
    select string_agg(x.nombre, ', ' order by x.nombre)
      into v_faltan
    from (
      select max(p.producto_nombre) as nombre,
             count(*)               as pide,
             (select count(*) from public.cuentas c
              where c.producto_id = p.producto_id and c.estado = 'libre') as hay,
             p.producto_id
      from public.pedidos p
      where p.id = any(v_compra.ids)
      group by p.producto_id
    ) x
    where x.producto_id is null or x.hay < x.pide;

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
              else chr(10) || 'Pago: QR Bolivia' end
      || case when v_compra.cliente is not null or v_compra.whatsapp is not null
              then chr(10) || 'Cliente: ' ||
                   coalesce(v_compra.cliente, 'sin nombre') ||
                   coalesce(' · ' || v_compra.whatsapp, '')
              else '' end
      || chr(10) || chr(10)
      || case
           when v_compra.metodo_usdt is not null then
             'Se confirma solo cuando llegue el pago a tu Binance.'
           when v_boton and v_faltan is not null then
             'Sin stock de ' || v_faltan || ': va por WhatsApp. ' ||
             'Cuando veas el pago en tu banco, tocá Confirmar pago.'
           when v_boton then
             'Hay stock. Cuando veas el pago en tu banco, tocá Confirmar y entregar.'
           when v_faltan is not null then
             'Sin stock de ' || v_faltan || ': va por WhatsApp. ' ||
             'Cuando veas el pago en tu banco, confirmalo desde el panel.'
           else
             'Hay stock. Cuando veas el pago en tu banco, confirmalo desde el panel ' ||
             'y la cuenta se entrega sola.'
         end
      || coalesce(chr(10) || v_panel, '');

    v_mensaje := jsonb_build_object(
      'chat_id', v_chat,
      'text',    v_texto,
      'disable_web_page_preview', true);

    if v_boton and v_compra.metodo_usdt is null then
      v_mensaje := v_mensaje || jsonb_build_object('reply_markup',
        jsonb_build_object('inline_keyboard', jsonb_build_array(jsonb_build_array(
          case when v_faltan is null
            then jsonb_build_object('text', 'Confirmar y entregar',
                                    'callback_data', 'c:' || v_compra.compra)
            else jsonb_build_object('text', 'Confirmar pago (va por WhatsApp)',
                                    'callback_data', 'p:' || v_compra.compra)
          end))));
    end if;

    begin
      select (extensions.http_post(
                'https://api.telegram.org/bot' || v_token || '/sendMessage',
                v_mensaje::text,
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


-- ============================================================
-- 3. EL "SÍ, YA COBRÉ" (y "Reintentar entrega")
-- ============================================================
-- Igual que en 23-confirmar-desde-telegram.sql, con el freno adelante:
-- apagado, no toca nada y lo dice al pie del aviso.
create or replace function public.confirmar_desde_telegram(p_compra uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_es_grupo   boolean;
  v_antes      integer;
  v_total      integer;
  v_entregados integer;
  v_sin_stock  integer;
  v_cancelados integer;
  v_faltan     text;
  v_nuevas     integer;
  v_numero     integer;
  v_nombre     text;
  v_wa         text;
  v_hora       text := to_char(now() at time zone 'America/La_Paz', 'HH24:MI');
begin
  if not public.telegram_confirma() then
    return jsonb_build_object(
      'texto', 'Confirmar desde Telegram está apagado: no se tocó nada. ' ||
               'Confirmalo desde el panel (Ventas).',
      'corto', 'Apagado: confirmalo desde el panel.');
  end if;

  v_es_grupo := exists (select 1 from public.pedidos where grupo = p_compra);

  if not v_es_grupo and not exists (select 1 from public.pedidos where id = p_compra) then
    return jsonb_build_object(
      'texto', 'No encontré ese pedido: revisalo en el panel.',
      'corto', 'No encontré ese pedido.');
  end if;

  -- Lo de Binance se confirma solo cuando llega la plata. Si el cliente
  -- cambió de QR a Binance después del aviso, el botón no lo confirma.
  if exists (select 1 from public.pedidos
             where (grupo = p_compra or id = p_compra)
               and metodo_pago in ('binance', 'bsc')) then
    return jsonb_build_object(
      'texto', 'Este pedido se paga con Binance: se confirma solo cuando llega el pago. No se tocó nada.',
      'corto', 'Es de Binance: se confirma solo.');
  end if;

  -- Cuántas había entregadas antes, para saber si este toque entregó algo
  select count(*) filter (where estado = 'entregado') into v_antes
  from public.pedidos where grupo = p_compra or id = p_compra;

  -- Las dos son idempotentes: lo entregado no se vuelve a entregar y lo
  -- cancelado no se toca
  if v_es_grupo then
    perform public.confirmar_compra(p_compra, null, 'telegram');
  else
    perform public.confirmar_pago(p_compra, null, 'telegram');
  end if;

  select count(*),
         count(*) filter (where estado = 'entregado'),
         count(*) filter (where estado = 'sin_stock'),
         count(*) filter (where estado = 'cancelado'),
         string_agg(distinct producto_nombre, ', ') filter (where estado = 'sin_stock'),
         min(numero),
         max(nullif(cliente_nombre, '')),
         max(nullif(cliente_whatsapp, ''))
    into v_total, v_entregados, v_sin_stock, v_cancelados, v_faltan,
         v_numero, v_nombre, v_wa
  from public.pedidos where grupo = p_compra or id = p_compra;

  v_nuevas := v_entregados - v_antes;

  if v_cancelados = v_total then
    return jsonb_build_object(
      'texto', 'Este pedido está cancelado: no se entregó nada.',
      'corto', 'Está cancelado: no se entregó nada.');
  end if;

  if v_sin_stock > 0 then
    -- El número como lo pide wa.me: con el 591 adelante (igual que
    -- numeroWa() en el panel)
    v_wa := regexp_replace(coalesce(v_wa, ''), '\D', '', 'g');
    if length(v_wa) = 8 then v_wa := '591' || v_wa; end if;

    return jsonb_build_object(
      'texto', 'Pago confirmado a las ' || v_hora || '. '
               || case when v_nuevas > 0 then v_nuevas || ' entregada(s) del stock. ' else '' end
               || 'No hay cuentas libres de ' || v_faltan || ': mandásela por WhatsApp '
               || 'y tocá Ya lo entregué por WhatsApp.',
      'corto', 'Pago confirmado. Sin stock: va por WhatsApp.',
      'sin_stock', true,
      'whatsapp', nullif(v_wa, ''),
      'mensaje_wa', 'Hola' || coalesce(' ' || v_nombre, '') ||
                    ', te escribimos de Tiago Store por tu pedido #' || v_numero ||
                    ': ' || v_faltan || '. Ya confirmamos tu pago y te pasamos tu cuenta por acá.');
  end if;

  if v_nuevas > 0 then
    return jsonb_build_object(
      'texto', 'Entregado a las ' || v_hora || ' (' || v_nuevas ||
               case when v_nuevas = 1 then ' cuenta' else ' cuentas' end ||
               '). El cliente ya lo ve en su página.',
      'corto', 'Entregado.');
  end if;

  if v_entregados = v_total - v_cancelados then
    return jsonb_build_object(
      'texto', 'Ya estaba entregado: no se tocó nada.',
      'corto', 'Ya estaba entregado.');
  end if;

  return jsonb_build_object(
    'texto', 'No se pudo entregar: revisalo en el panel.',
    'corto', 'No se pudo entregar: revisalo en el panel.');
end;
$$;


-- ============================================================
-- 4. EL "YA LO ENTREGUÉ POR WHATSAPP"
-- ============================================================
-- Igual que en 23-confirmar-desde-telegram.sql, con el mismo freno: es
-- parte de confirmar desde el chat, y apagado se hace desde el panel
-- ("Listo" en Ventas).
create or replace function public.entregado_por_whatsapp_desde_telegram(p_compra uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_marcados  integer;
  v_esperando integer;
  v_hora      text := to_char(now() at time zone 'America/La_Paz', 'HH24:MI');
begin
  if not public.telegram_confirma() then
    return jsonb_build_object(
      'texto', 'Confirmar desde Telegram está apagado: no se tocó nada. ' ||
               'Marcalo como entregado desde el panel (Ventas).',
      'corto', 'Apagado: hacelo desde el panel.');
  end if;

  with marcados as (
    update public.pedidos set
      estado         = 'entregado',
      entregado_en   = now(),
      pagado_en      = coalesce(pagado_en, now()),
      confirmado_por = 'panel-wa:telegram'
    where (grupo = p_compra or id = p_compra)
      and estado in ('sin_stock', 'pagado')
    returning 1
  )
  select count(*) into v_marcados from marcados;

  if v_marcados > 0 then
    return jsonb_build_object(
      'texto', 'Entregado por WhatsApp a las ' || v_hora || '.',
      'corto', 'Listo: entregado por WhatsApp.');
  end if;

  select count(*) into v_esperando from public.pedidos
  where (grupo = p_compra or id = p_compra) and estado in ('esperando_pago', 'vencido');

  if v_esperando > 0 then
    return jsonb_build_object(
      'texto', 'Todavía no confirmaste el pago: no se tocó nada.',
      'corto', 'Primero confirmá el pago.');
  end if;

  return jsonb_build_object(
    'texto', 'No quedaba nada por entregar: no se tocó nada.',
    'corto', 'No quedaba nada por entregar.');
end;
$$;


-- ============================================================
-- 5. PARA EL PANEL (Ajustes)
-- ============================================================

-- ------------------------------------------------------------
-- 5.1 Cómo está Telegram
-- ------------------------------------------------------------
-- Le pregunta a Telegram si el bot anda (getMe, 4 segundos como mucho) y
-- mira los relojes de pg_cron de cada aviso: si están prendidos y cuándo
-- corrieron por última vez. El token y el chat no salen de la base.
create or replace function public.estado_telegram()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token     text;
  v_chat      text;
  v_r         extensions.http_response;
  v_bot       text;
  v_conectado boolean := false;
  v_error     text;
  v_trabajos  jsonb;
begin
  if not public.es_admin() then
    raise exception 'Solo para el panel' using errcode = '42501';
  end if;

  select valor into v_token from public.ajustes where clave = 'telegram_token';
  select valor into v_chat  from public.ajustes where clave = 'telegram_chat';

  if v_token is not null and v_chat is not null then
    perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '4000');
    begin
      select * into v_r from extensions.http_get('https://api.telegram.org/bot' || v_token || '/getMe');
      if v_r.status between 200 and 299 then
        v_conectado := true;
        v_bot := v_r.content::jsonb -> 'result' ->> 'username';
      elsif v_r.status in (401, 404) then
        v_error := 'Telegram no reconoce el token (código ' || v_r.status || ').';
      else
        v_error := 'Telegram respondió ' || v_r.status || '.';
      end if;
    exception when others then
      v_error := 'No se pudo hablar con Telegram: ' || sqlerrm;
    end;
  end if;

  -- Los tres relojes. Si pg_cron no se deja leer, el panel lo dice en vez
  -- de romperse.
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'nombre',  j.jobname,
             'horario', j.schedule,
             'activo',  j.active,
             'ultima',  u.start_time,
             'estado',  u.status) order by j.jobname), '[]'::jsonb)
      into v_trabajos
    from cron.job j
    left join lateral (
      select d.start_time, d.status from cron.job_run_details d
      where d.jobid = j.jobid
      order by d.runid desc
      limit 1
    ) u on true
    where j.jobname in ('avisar-pedidos-nuevos', 'avisar-renovaciones', 'avisar-sin-pagar');
  exception when others then
    v_trabajos := null;
  end;

  return jsonb_build_object(
    'configurado',     v_token is not null and v_chat is not null,
    'conectado',       v_conectado,
    'bot',             v_bot,
    'error',           v_error,
    'clave_botones',   exists (select 1 from public.ajustes
                               where clave = 'telegram_webhook_secreto' and coalesce(valor, '') <> ''),
    'confirmar',       public.telegram_confirma(),
    'trabajos',        v_trabajos,
    'ultimo_pedido',   (select max(avisado_en) from public.pedidos),
    'ultimo_vence',    (select max(greatest(suscripcion_avisada_en, suscripcion_vencida_avisada_en))
                        from public.pedidos));
end;
$$;


-- ------------------------------------------------------------
-- 5.2 Prender o apagar "Confirmar pagos desde Telegram"
-- ------------------------------------------------------------
-- Al prenderlo, si los toques todavía no llegan a la Edge Function (no
-- hay clave), se activan en el momento. Vale para los avisos que lleguen
-- desde ahora: los ya mandados quedan como salieron, pero sus botones
-- vuelven a andar.
create or replace function public.poner_confirmar_telegram(p_prendido boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activar text;
begin
  if not public.es_admin() then
    raise exception 'Solo para el panel' using errcode = '42501';
  end if;

  insert into public.ajustes (clave, valor)
  values ('telegram_confirmar', case when p_prendido then 'si' else 'no' end)
  on conflict (clave) do update set valor = excluded.valor, actualizado_en = now();

  if not coalesce(p_prendido, false) then
    return 'Apagado: los avisos nuevos llegan sin botón y los botones viejos no confirman nada.';
  end if;

  if not exists (select 1 from public.ajustes
                 where clave = 'telegram_webhook_secreto' and coalesce(valor, '') <> '') then
    v_activar := public.activar_boton_telegram();
    if v_activar not like 'Listo%' then
      return 'Quedó prendido, pero el botón todavía no anda: ' || v_activar;
    end if;
  end if;

  return 'Prendido: los avisos nuevos por QR traen el botón para confirmar.';
end;
$$;


-- ------------------------------------------------------------
-- 5.3 "Mandar mensaje de prueba"
-- ------------------------------------------------------------
create or replace function public.probar_telegram_panel()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text;
  v_chat  text;
  v_r     extensions.http_response;
begin
  if not public.es_admin() then
    raise exception 'Solo para el panel' using errcode = '42501';
  end if;

  select valor into v_token from public.ajustes where clave = 'telegram_token';
  select valor into v_chat  from public.ajustes where clave = 'telegram_chat';

  if v_token is null or v_chat is null then
    return 'Telegram no está configurado. Desde el SQL Editor: select public.configurar_telegram(''TU_TOKEN'');';
  end if;

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');
  begin
    select * into v_r from extensions.http_post(
      'https://api.telegram.org/bot' || v_token || '/sendMessage',
      jsonb_build_object(
        'chat_id', v_chat,
        'text', 'Tiago Store: mensaje de prueba desde el panel (' ||
                to_char(now() at time zone 'America/La_Paz', 'DD/MM HH24:MI') ||
                '). Los avisos llegan a este chat.')::text,
      'application/json');
  exception when others then
    return 'No se pudo hablar con Telegram: ' || sqlerrm;
  end;

  if v_r.status between 200 and 299 then
    return 'Listo: el mensaje salió. Fijate en tu chat de Telegram.';
  end if;

  return 'Telegram rechazó el mensaje (código ' || v_r.status || '): ' ||
         coalesce(left(v_r.content, 200), '');
end;
$$;


-- ============================================================
-- 6. PERMISOS
-- ============================================================
revoke execute on function public.telegram_confirma()                          from public, anon, authenticated;
revoke execute on function public.avisar_pedidos_nuevos()                      from public, anon, authenticated;
revoke execute on function public.confirmar_desde_telegram(uuid)               from public, anon, authenticated;
revoke execute on function public.entregado_por_whatsapp_desde_telegram(uuid)  from public, anon, authenticated;

-- La Edge Function entra con service_role
grant execute on function public.confirmar_desde_telegram(uuid)              to service_role;
grant execute on function public.entregado_por_whatsapp_desde_telegram(uuid) to service_role;

-- Las del panel: con sesión, y adentro preguntan si sos admin
revoke execute on function public.estado_telegram()                  from public, anon;
revoke execute on function public.poner_confirmar_telegram(boolean)  from public, anon;
revoke execute on function public.probar_telegram_panel()            from public, anon;
grant  execute on function public.estado_telegram()                  to authenticated;
grant  execute on function public.poner_confirmar_telegram(boolean)  to authenticated;
grant  execute on function public.probar_telegram_panel()            to authenticated;
