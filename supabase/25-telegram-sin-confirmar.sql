-- ============================================================
-- TIAGO STORE · 25 · TELEGRAM SIN CONFIRMAR
-- ============================================================
-- Correr en Supabase → SQL Editor (pegar todo y "Run"). Se puede correr
-- de nuevo sin romper nada.
--
-- EL PEDIDO (13/10/2026)
--   Apagar la confirmación de pagos desde Telegram
--   (23-confirmar-desde-telegram.sql). Los pagos por QR se confirman
--   desde el panel, como antes.
--
-- LO QUE CAMBIA
--   · El aviso de pedido nuevo sigue llegando igual, pero SIN el botón
--     "Confirmar y entregar" / "Confirmar pago": dice "Confirmalo desde
--     el panel" y trae el enlace al panel.
--   · Si alguien toca un botón de un aviso VIEJO (de antes de esto), la
--     base no confirma nada: contesta "Confirmar desde Telegram está
--     apagado" y no toca el pedido. Lo mismo "Ya lo entregué por
--     WhatsApp". Así no hace falta volver a publicar la Edge Function.
--   · Lo de la mañana (24-sin-pagar-desde-ayer.sql, "Cancelar: nunca
--     pagó / duplicado / Dejarlo") sigue andando: no confirma ni entrega
--     nada, solo cierra compras que nunca se pagaron.
--   · Los avisos de vencimiento siguen igual (y mejoran en el 27).
--
-- SE PRENDE Y SE APAGA DESDE EL PANEL
--   Panel → Ajustes → Telegram → "Confirmar pagos desde Telegram".
--   Queda apagado al correr este archivo. El valor vive en
--   ajustes.telegram_confirmar ('si' / 'no').
--
-- SECCIONES
--   1. telegram_confirma(): ¿está prendido?
--   2. avisar_pedidos_nuevos(): el aviso, con botón solo si está prendido
--   3. confirmar_desde_telegram() y entregado_por_whatsapp_desde_telegram():
--      no hacen nada si está apagado
--   4. Para el panel: estado_telegram(), guardar_confirmar_telegram(),
--      probar_telegram_panel()
--   5. Permisos
-- ============================================================


-- ============================================================
-- 1. ¿ESTÁ PRENDIDO?
-- ============================================================
-- Apagado al correr este archivo. "on conflict do nothing": si ya lo
-- prendiste desde el panel, correr esto de nuevo no lo vuelve a apagar.
insert into public.ajustes (clave, valor) values ('telegram_confirmar', 'no')
on conflict (clave) do nothing;

-- Prendido = el valor dice 'si' Y Telegram ya sabe a dónde mandar los
-- toques (hay clave). Sin clave sería un botón que no hace nada.
create or replace function public.telegram_confirma()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.ajustes where clave = 'telegram_confirmar' and valor = 'si')
     and exists (select 1 from public.ajustes
                 where clave = 'telegram_webhook_secreto' and coalesce(valor, '') <> '');
$$;


-- ============================================================
-- 2. EL AVISO DE PEDIDO NUEVO
-- ============================================================
-- El mismo de 23-confirmar-desde-telegram.sql; cambia solo de dónde sale
-- v_boton (telegram_confirma()) y lo que dice cuando no hay botón.
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
  v_boton := public.telegram_confirma();

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
    -- Lo que no alcanza a salir del stock
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
           when not v_boton then
             case when v_faltan is not null
                  then 'Sin stock de ' || v_faltan || ': va por WhatsApp. '
                  else 'Hay stock. ' end ||
             'Cuando veas el pago en tu banco, confirmalo desde el panel.'
           when v_faltan is not null then
             'Sin stock de ' || v_faltan || ': va por WhatsApp. ' ||
             'Cuando veas el pago en tu banco, tocá Confirmar pago.'
           else
             'Hay stock. Cuando veas el pago en tu banco, tocá Confirmar y entregar.'
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
-- 3. LOS BOTONES VIEJOS NO CONFIRMAN NADA
-- ============================================================
-- Las funciones de 23-confirmar-desde-telegram.sql siguen siendo las
-- mismas; adelante se les pone el control. Para no copiar las dos enteras
-- se renombran las de antes (…_sin_control) y estas las llaman solo si
-- está prendido. Se renombran una sola vez: si ya existe la vieja, no se
-- toca.
do $$
begin
  if to_regprocedure('public.confirmar_desde_telegram_sin_control(uuid)') is null then
    alter function public.confirmar_desde_telegram(uuid)
      rename to confirmar_desde_telegram_sin_control;
  end if;
  if to_regprocedure('public.entregado_por_whatsapp_desde_telegram_sin_control(uuid)') is null then
    alter function public.entregado_por_whatsapp_desde_telegram(uuid)
      rename to entregado_por_whatsapp_desde_telegram_sin_control;
  end if;
end $$;

create or replace function public.confirmar_desde_telegram(p_compra uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.telegram_confirma() then
    return jsonb_build_object(
      'texto', 'Confirmar desde Telegram está apagado: confirmalo desde el panel. No se tocó nada.',
      'corto', 'Apagado: confirmalo desde el panel.');
  end if;
  return public.confirmar_desde_telegram_sin_control(p_compra);
end;
$$;

create or replace function public.entregado_por_whatsapp_desde_telegram(p_compra uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.telegram_confirma() then
    return jsonb_build_object(
      'texto', 'Confirmar desde Telegram está apagado: marcalo desde el panel. No se tocó nada.',
      'corto', 'Apagado: hacelo desde el panel.');
  end if;
  return public.entregado_por_whatsapp_desde_telegram_sin_control(p_compra);
end;
$$;


-- ============================================================
-- 4. PARA EL PANEL (Ajustes → Telegram)
-- ============================================================
-- Solo admins. Nunca devuelven el token ni el chat: solo si están.
create or replace function public.estado_telegram()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo para el panel' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'configurado', exists (select 1 from public.ajustes where clave = 'telegram_token' and coalesce(valor, '') <> '')
               and exists (select 1 from public.ajustes where clave = 'telegram_chat'  and coalesce(valor, '') <> ''),
    'boton',       exists (select 1 from public.ajustes
                           where clave = 'telegram_webhook_secreto' and coalesce(valor, '') <> ''),
    'confirmar',   exists (select 1 from public.ajustes where clave = 'telegram_confirmar' and valor = 'si'),
    'renovaciones', exists (select 1 from cron.job where jobname = 'avisar-renovaciones' and active),
    'sin_pagar',    exists (select 1 from cron.job where jobname = 'avisar-sin-pagar' and active));
exception when undefined_table or invalid_schema_name or insufficient_privilege then
  -- Sin pg_cron a la vista: igual se contesta lo demás
  return jsonb_build_object(
    'configurado', exists (select 1 from public.ajustes where clave = 'telegram_token' and coalesce(valor, '') <> '')
               and exists (select 1 from public.ajustes where clave = 'telegram_chat'  and coalesce(valor, '') <> ''),
    'boton',       exists (select 1 from public.ajustes
                           where clave = 'telegram_webhook_secreto' and coalesce(valor, '') <> ''),
    'confirmar',   exists (select 1 from public.ajustes where clave = 'telegram_confirmar' and valor = 'si'));
end;
$$;

-- Prender o apagar. Al prender, si Telegram todavía no sabe a dónde
-- mandar los toques, se le avisa (activar_boton_telegram, del 23).
create or replace function public.guardar_confirmar_telegram(p_confirmar boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aviso text;
begin
  if not public.es_admin() then
    raise exception 'Solo para el panel' using errcode = '42501';
  end if;

  insert into public.ajustes (clave, valor)
  values ('telegram_confirmar', case when p_confirmar then 'si' else 'no' end)
  on conflict (clave) do update set valor = excluded.valor, actualizado_en = now();

  if p_confirmar and not exists (select 1 from public.ajustes
                                 where clave = 'telegram_webhook_secreto' and coalesce(valor, '') <> '') then
    v_aviso := public.activar_boton_telegram();
  end if;

  return public.estado_telegram() || jsonb_build_object('aviso', v_aviso);
end;
$$;

-- "Mandar mensaje de prueba" del panel: el mismo probar_telegram() del 13,
-- que desde afuera está cerrado.
create or replace function public.probar_telegram_panel()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo para el panel' using errcode = '42501';
  end if;
  return public.probar_telegram();
end;
$$;


-- ============================================================
-- 5. PERMISOS
-- ============================================================
revoke execute on function public.telegram_confirma()                                   from public, anon, authenticated;
revoke execute on function public.avisar_pedidos_nuevos()                               from public, anon, authenticated;
revoke execute on function public.confirmar_desde_telegram(uuid)                        from public, anon, authenticated;
revoke execute on function public.entregado_por_whatsapp_desde_telegram(uuid)           from public, anon, authenticated;
revoke execute on function public.confirmar_desde_telegram_sin_control(uuid)            from public, anon, authenticated, service_role;
revoke execute on function public.entregado_por_whatsapp_desde_telegram_sin_control(uuid) from public, anon, authenticated, service_role;

-- La Edge Function entra con service_role
grant execute on function public.confirmar_desde_telegram(uuid)              to service_role;
grant execute on function public.entregado_por_whatsapp_desde_telegram(uuid) to service_role;

-- El panel
revoke execute on function public.estado_telegram()                    from public, anon;
revoke execute on function public.guardar_confirmar_telegram(boolean)  from public, anon;
revoke execute on function public.probar_telegram_panel()              from public, anon;
grant  execute on function public.estado_telegram()                    to authenticated;
grant  execute on function public.guardar_confirmar_telegram(boolean)  to authenticated;
grant  execute on function public.probar_telegram_panel()              to authenticated;
