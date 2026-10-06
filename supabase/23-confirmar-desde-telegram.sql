-- ============================================================
-- TIAGO STORE · 23 · CONFIRMAR DESDE TELEGRAM
-- ============================================================
-- Aplicado con las migraciones (6/10/2026):
--   confirmar_desde_telegram              todo
--   confirmar_desde_telegram_mensaje_wa   el mensaje para el cliente, sin
--                                         paréntesis dentro de paréntesis
-- Va junto con la Edge Function supabase/functions/telegram-boton/, que
-- es la que recibe los toques. Se activó una vez con:
--   select public.activar_boton_telegram();
--
-- EL PROBLEMA
--   Todas las compras por QR se confirmaban a mano desde el panel:
--   llegaba el aviso por Telegram ("Esperando que lo apruebes en el
--   panel"), veías el pago en el banco, abrías el panel, buscabas el
--   pedido y tocabas "Confirmar y entregar". En el último mes, las 79.
--
-- LO NUEVO (solo QR Bolivia: lo de Binance se confirma solo con la API)
--   El aviso trae un botón, según haya stock o no:
--
--   CON STOCK  "Confirmar y entregar"
--     → "Sí, ya cobré" / "No, todavía no" (un toque sin querer,
--       scrolleando el chat, no regala una cuenta)
--     → lo mismo que el botón del panel (confirmar_compra): el cliente ve
--       su cuenta en la página del QR y el mensaje queda "Entregado".
--
--   SIN STOCK  "Confirmar pago (va por WhatsApp)"
--     → "Sí, ya cobré" / "No, todavía no"
--     → el pago queda registrado y el mensaje trae:
--         · "WhatsApp del cliente", con el mensaje ya escrito (si dejó
--           su número)
--         · "Ya lo entregué por WhatsApp": lo da por entregado, igual
--           que "Listo" en el panel (confirmado_por 'panel-wa:telegram',
--           en Ventas sale "Entregado por WhatsApp")
--         · "Reintentar entrega", por si cargaste cuentas
--
--   Si la compra ya estaba entregada o cancelada, lo dice y no toca nada.
--   Una compra de Binance no se confirma desde acá aunque alguien toque.
--
-- QUIÉN PUEDE TOCAR
--   Telegram le pasa cada toque a la Edge Function con una clave que
--   solo conocen Telegram y la base (ajustes.telegram_webhook_secreto).
--   La función, además, solo acepta toques de TU chat
--   (ajustes.telegram_chat). Las funciones de abajo no las puede llamar
--   nadie de afuera: solo el servidor (service_role).
--
-- SECCIONES
--   1. avisar_pedidos_nuevos(): el aviso con el botón
--   2. confirmar_desde_telegram(): el "Sí, ya cobré"
--   3. entregado_por_whatsapp_desde_telegram(): el "Ya lo entregué"
--   4. activar_boton_telegram(): le dice a Telegram a dónde mandar los toques
--   5. configurar_telegram(): sigue andando con el botón prendido
--   6. Permisos
-- ============================================================


-- ============================================================
-- 1. EL AVISO, CON EL BOTÓN
-- ============================================================
-- Igual que en 20-modo-prueba.sql, más:
--   · el botón, solo en las compras por QR y solo si está activado (hay
--     clave): si no, sería un botón que no hace nada
--   · con QR, si alguna no tiene cuenta libre, lo dice: va por WhatsApp
--   · con Binance, que se confirma solo
-- callback_data lleva la compra (el grupo, o el pedido si es de los
-- viejos sin grupo): "c:<uuid>" (con stock) o "p:<uuid>" (sin stock), 38
-- caracteres de los 64 que deja Telegram.
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
  v_boton := exists (select 1 from public.ajustes
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
           when not v_boton then
             'Esperando que lo apruebes en el panel.'
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
-- 2. EL "SÍ, YA COBRÉ"
-- ============================================================
-- Lo mismo que "Confirmar y entregar" del panel: confirmar_compra() con
-- la compra entera (o confirmar_pago() si es un pedido viejo sin grupo).
-- Lo que tiene stock se entrega; lo que no, queda pagado y sin stock.
-- Devuelve lo que la Edge Function pone en el mensaje:
--   texto        va al pie del aviso
--   corto        el cartelito de arriba (Telegram deja 200 caracteres)
--   sin_stock    si quedó algo para entregar por WhatsApp
--   whatsapp     el número del cliente como lo pide wa.me, si lo dejó
--   mensaje_wa   lo que se le escribe al abrir su WhatsApp
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
-- 3. EL "YA LO ENTREGUÉ POR WHATSAPP"
-- ============================================================
-- Lo mismo que "Listo" en el panel (admin-ventas.js): da por entregado
-- lo que quedó pagado y sin stock, sin tocar el stock. Queda con la
-- marca de las entregas a mano ('panel-wa:'), así en Ventas sale
-- "Entregado por WhatsApp".
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
-- 4. ACTIVAR EL BOTÓN
-- ============================================================
-- Le dice a Telegram que mande los toques a la Edge Function, con la
-- clave. La clave se crea la primera vez y después se reusa. Solo pide
-- los toques de botones (callback_query): los mensajes que le escribas
-- al bot no le llegan a nadie.
create or replace function public.activar_boton_telegram()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c_url     constant text := 'https://doydkjztynjqecwdvoto.supabase.co/functions/v1/telegram-boton';
  v_token   text;
  v_secreto text;
  v_r       extensions.http_response;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.es_admin() then
    raise exception 'Solo para el panel' using errcode = '42501';
  end if;

  select valor into v_token from public.ajustes where clave = 'telegram_token';
  if v_token is null then
    return 'Primero configurá Telegram: select public.configurar_telegram(''TU_TOKEN'');';
  end if;

  select valor into v_secreto from public.ajustes where clave = 'telegram_webhook_secreto';
  if coalesce(v_secreto, '') = '' then
    v_secreto := encode(extensions.gen_random_bytes(24), 'hex');
    insert into public.ajustes (clave, valor) values ('telegram_webhook_secreto', v_secreto)
    on conflict (clave) do update set valor = excluded.valor, actualizado_en = now();
  end if;

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');
  begin
    select * into v_r from extensions.http_post(
      'https://api.telegram.org/bot' || v_token || '/setWebhook',
      jsonb_build_object(
        'url',             c_url,
        'secret_token',    v_secreto,
        'allowed_updates', jsonb_build_array('callback_query'))::text,
      'application/json');
  exception when others then
    return 'No se pudo hablar con Telegram: ' || sqlerrm;
  end;

  if v_r.status between 200 and 299 then
    return 'Listo: los avisos nuevos por QR traen el botón para confirmar.';
  end if;

  return 'Telegram no lo aceptó (código ' || v_r.status || '): ' ||
         coalesce(left(v_r.content, 200), '');
end;
$$;


-- ============================================================
-- 5. CONFIGURAR TELEGRAM, CON EL BOTÓN PRENDIDO
-- ============================================================
-- configurar_telegram() (06-avisos.sql) busca tu chat con getUpdates, y
-- Telegram no deja usar getUpdates mientras los toques van a la Edge
-- Function. Ahora:
--   · apaga eso un momento (deleteWebhook) antes de buscar
--   · si es el mismo bot y no encuentra mensajes nuevos, se queda con
--     el chat de siempre
--   · al final vuelve a activar el botón
create or replace function public.configurar_telegram(p_token text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text := trim(p_token);
  v_r     extensions.http_response;
  v_chat  text;
begin
  if v_token is null or v_token = '' or v_token like 'ACA\_%' or v_token like 'EL\_TOKEN%' then
    return 'Pegá el token que te dio @BotFather, ese texto largo con dos puntos en el medio.';
  end if;

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');

  -- Si el botón estaba prendido, getUpdates no anda: se apaga un momento
  begin
    perform extensions.http_post(
      'https://api.telegram.org/bot' || v_token || '/deleteWebhook', '{}', 'application/json');
  exception when others then
    null;   -- si falla, getUpdates lo va a decir
  end;

  -- ¿Quien le escribio al bot? Telegram lo sabe, no hace falta preguntartelo.
  begin
    select * into v_r from extensions.http_get(
      'https://api.telegram.org/bot' || v_token || '/getUpdates');
  exception when others then
    return 'No se pudo hablar con Telegram: ' || sqlerrm;
  end;

  if v_r.status in (401, 404) then
    return 'Ese token no le sirve a Telegram (código ' || v_r.status || '). ' ||
           'Copialo entero, tal como lo mandó @BotFather.';
  end if;

  if v_r.status not between 200 and 299 then
    return 'Telegram respondió ' || v_r.status || ': ' || coalesce(left(v_r.content, 200), '');
  end if;

  -- El ultimo que le hablo al bot: si probaste con varias cuentas, gana la
  -- que usaste recien.
  select (m->'message'->'chat'->>'id')
    into v_chat
  from jsonb_array_elements(coalesce(v_r.content::jsonb->'result', '[]'::jsonb)) m
  where m->'message'->'chat'->>'id' is not null
  order by (m->>'update_id')::bigint desc
  limit 1;

  -- El mismo bot de antes y nadie le escribió desde entonces: el chat de
  -- siempre sigue valiendo
  if v_chat is null and v_token = (select valor from public.ajustes where clave = 'telegram_token') then
    select valor into v_chat from public.ajustes where clave = 'telegram_chat';
  end if;

  if v_chat is null then
    return 'El token anda, pero nadie le escribió al bot todavía. ' ||
           'Abrí el chat con tu bot, mandale un "hola" y volvé a ejecutar esto.';
  end if;

  insert into public.ajustes (clave, valor) values
    ('telegram_token', v_token),
    ('telegram_chat',  v_chat)
  on conflict (clave) do update
    set valor = excluded.valor, actualizado_en = now();

  perform public.activar_boton_telegram();

  return public.probar_telegram();
end;
$$;


-- ============================================================
-- 6. PERMISOS
-- ============================================================
revoke execute on function public.avisar_pedidos_nuevos()                      from public, anon, authenticated;
revoke execute on function public.confirmar_desde_telegram(uuid)               from public, anon, authenticated;
revoke execute on function public.entregado_por_whatsapp_desde_telegram(uuid)  from public, anon, authenticated;
revoke execute on function public.activar_boton_telegram()                     from public, anon, authenticated;
revoke execute on function public.configurar_telegram(text)                    from public, anon, authenticated;

-- La Edge Function entra con service_role
grant execute on function public.confirmar_desde_telegram(uuid)              to service_role;
grant execute on function public.entregado_por_whatsapp_desde_telegram(uuid) to service_role;
