-- ============================================================
-- TIAGO STORE · 24 · SIN PAGAR DESDE AYER
-- ============================================================
-- Aplicado con la migración:
--   sin_pagar_desde_ayer   (6/10/2026)
-- Los botones los atiende la Edge Function telegram-boton (la misma del
-- 23-confirmar-desde-telegram.sql).
--
-- EL PROBLEMA
--   Desde 10-sin-vencimiento.sql ningún pedido se cancela solo (así se
--   había ido el #121 de la lista sin que nadie lo mirara): cada uno lo
--   cerrás vos desde el panel con la X. En el último mes fueron 80
--   compras así (43 "Nunca pagó", 28 "Pedido duplicado"), en promedio
--   23 horas después de armadas. Había que acordarse de entrar al panel
--   a buscarlas.
--
-- LO NUEVO
--   Todos los días a las 9:05 (hora de Bolivia) te llega por Telegram un
--   mensaje por cada compra que sigue sin pagar desde ayer o antes, con:
--     · "Cancelar: nunca pagó"
--     · "Cancelar: duplicado"
--     · "Dejarlo": no toca nada; al otro día te vuelve a preguntar
--   Sigue sin cancelarse nada solo: decidís vos, sin abrir el panel.
--   Al cancelar queda igual que con la X del panel: estado 'cancelado'
--   con el motivo, que es lo que cuentan las cifras de Ventas.
--
--   Entran las de cualquier forma de pago (QR o Binance) y las 'vencido'
--   de antes de que se apagara el vencimiento. Las de prueba no: esas se
--   cancelan solas (20-modo-prueba.sql).
--
-- SECCIONES
--   1. avisar_sin_pagar(): los mensajes de la mañana
--   2. cancelar_desde_telegram(): lo que hacen los dos "Cancelar"
--   3. El reloj (pg_cron)
--   4. Permisos
-- ============================================================


-- ============================================================
-- 1. LOS MENSAJES DE LA MAÑANA
-- ============================================================
-- "Desde ayer": armadas antes de las 0:00 de hoy en Bolivia. Una compra
-- de varios productos va en un solo mensaje, y solo si no se pagó
-- ninguna de sus partes (si una ya se entregó, ya pagó).
create or replace function public.avisar_sin_pagar()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token   text;
  v_chat    text;
  v_hoy     timestamptz := date_trunc('day', now() at time zone 'America/La_Paz') at time zone 'America/La_Paz';
  v_compra  record;
  v_texto   text;
  v_estado  integer;
  v_cuantos integer := 0;
begin
  select valor into v_token from public.ajustes where clave = 'telegram_token';
  select valor into v_chat  from public.ajustes where clave = 'telegram_chat';

  -- Sin el botón activado no hay cómo cancelar desde el chat
  if v_token is null or v_chat is null
     or not exists (select 1 from public.ajustes
                    where clave = 'telegram_webhook_secreto' and coalesce(valor, '') <> '') then
    return 0;
  end if;

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');

  for v_compra in
    select
      coalesce(p.grupo::text, p.id::text)                          as compra,
      min(p.numero)                                                as numero,
      count(*) filter (where p.estado <> 'cancelado')              as cuantos,
      sum(p.precio) filter (where p.estado <> 'cancelado')         as total,
      min(p.creado_en)                                             as creado,
      max(nullif(p.cliente_nombre, ''))                            as cliente,
      max(nullif(p.cliente_whatsapp, ''))                          as whatsapp,
      max(p.metodo_pago) filter (where p.metodo_pago in ('binance', 'bsc')) as metodo_usdt,
      string_agg(p.producto_nombre, chr(10) || '· ' order by p.numero)
        filter (where p.estado <> 'cancelado')                     as productos
    from public.pedidos p
    where not p.prueba
    group by 1
    having bool_or(p.estado in ('esperando_pago', 'vencido'))
       and bool_and(p.estado in ('esperando_pago', 'vencido', 'cancelado'))
       and min(p.creado_en) < v_hoy
    order by min(p.creado_en)
  loop
    v_texto :=
      'Sigue sin pagar: ' ||
      case when v_compra.cuantos = 1 then 'pedido #' else 'compra #' end || v_compra.numero ||
      ' (' || case
                when (now() at time zone 'America/La_Paz')::date - (v_compra.creado at time zone 'America/La_Paz')::date = 1
                  then 'de ayer'
                else 'de hace ' || ((now() at time zone 'America/La_Paz')::date
                                    - (v_compra.creado at time zone 'America/La_Paz')::date) || ' días'
              end || ', ' || to_char(v_compra.creado at time zone 'America/La_Paz', 'DD/MM HH24:MI') || ')'
      || chr(10) || '· ' || v_compra.productos
      || chr(10) || chr(10)
      || 'Total: ' || to_char(v_compra.total, 'FM999999990.00') || ' Bs · '
      || case when v_compra.metodo_usdt = 'bsc' then 'USDT por red BSC'
              when v_compra.metodo_usdt is not null then 'Binance Pay'
              else 'QR Bolivia' end
      || case when v_compra.cliente is not null or v_compra.whatsapp is not null
              then chr(10) || 'Cliente: ' ||
                   coalesce(v_compra.cliente, 'sin nombre') ||
                   coalesce(' · ' || v_compra.whatsapp, '')
              else '' end
      || chr(10) || chr(10) || '¿Lo cancelás?';

    begin
      select (extensions.http_post(
                'https://api.telegram.org/bot' || v_token || '/sendMessage',
                jsonb_build_object(
                  'chat_id', v_chat,
                  'text',    v_texto,
                  'disable_web_page_preview', true,
                  'reply_markup', jsonb_build_object('inline_keyboard', jsonb_build_array(
                    jsonb_build_array(
                      jsonb_build_object('text', 'Cancelar: nunca pagó', 'callback_data', 'x:' || v_compra.compra),
                      jsonb_build_object('text', 'Cancelar: duplicado',  'callback_data', 'u:' || v_compra.compra)),
                    jsonb_build_array(
                      jsonb_build_object('text', 'Dejarlo',              'callback_data', 'd:' || v_compra.compra)))))::text,
                'application/json')).status
        into v_estado;
    exception when others then
      v_estado := null;
    end;

    if v_estado between 200 and 299 then
      v_cuantos := v_cuantos + 1;
    end if;
  end loop;

  return v_cuantos;
end;
$$;


-- ============================================================
-- 2. LOS DOS "CANCELAR"
-- ============================================================
-- Lo mismo que la X del panel con su motivo: solo lo que sigue esperando
-- el pago. Si mientras tanto pagó (o ya lo cerraste desde el panel), lo
-- dice y no toca nada.
create or replace function public.cancelar_desde_telegram(p_compra uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cancelados integer;
  v_pagados    integer;
begin
  if p_motivo not in ('Nunca pagó', 'Pedido duplicado') then
    return jsonb_build_object('texto', 'Motivo desconocido: no se tocó nada.', 'corto', 'No se tocó nada.');
  end if;

  with cancelados as (
    update public.pedidos set
      estado = 'cancelado',
      motivo = p_motivo
    where (grupo = p_compra or id = p_compra)
      and estado in ('esperando_pago', 'vencido')
    returning 1
  )
  select count(*) into v_cancelados from cancelados;

  if v_cancelados > 0 then
    return jsonb_build_object(
      'texto', 'Cancelado: ' || lower(p_motivo) || '.',
      'corto', 'Cancelado.');
  end if;

  select count(*) into v_pagados from public.pedidos
  where (grupo = p_compra or id = p_compra)
    and estado in ('pagado', 'sin_stock', 'entregado');

  if v_pagados > 0 then
    return jsonb_build_object(
      'texto', 'Este ya se pagó: no se canceló nada.',
      'corto', 'Ya se pagó: no se canceló.');
  end if;

  return jsonb_build_object(
    'texto', 'Ya estaba cancelado.',
    'corto', 'Ya estaba cancelado.');
end;
$$;


-- ============================================================
-- 3. EL RELOJ
-- ============================================================
-- 13:05 UTC = 9:05 en Bolivia, cinco minutos después de los avisos de
-- vencimiento (avisar-renovaciones, 13:00). schedule con el mismo nombre
-- reemplaza el anterior: correr este archivo dos veces no lo duplica.
select cron.schedule('avisar-sin-pagar', '5 13 * * *', 'select public.avisar_sin_pagar()');


-- ============================================================
-- 4. PERMISOS
-- ============================================================
revoke execute on function public.avisar_sin_pagar()                    from public, anon, authenticated;
revoke execute on function public.cancelar_desde_telegram(uuid, text)   from public, anon, authenticated;

-- La Edge Function entra con service_role
grant execute on function public.cancelar_desde_telegram(uuid, text) to service_role;
