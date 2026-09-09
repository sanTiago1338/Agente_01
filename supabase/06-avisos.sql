-- ============================================================
-- TIAGO STORE · 06 · AVISO DE PEDIDO NUEVO POR TELEGRAM
-- ============================================================
-- Aplicado con las migraciones:
--   pg_net_para_avisos
--   aviso_de_pedidos_por_telegram
--   reloj_del_aviso_de_pedidos
--   avisos_confirmados_antes_de_darlos_por_hecho
--   http_sincrono_para_los_avisos
--   avisos_de_telegram_con_http_sincrono
--   configurar_telegram_en_un_paso
--
-- EL PROBLEMA
--   No hay pasarela de pago, asi que ningun pedido se entrega solo: alguien
--   lo tiene que aprobar. El panel avisa con sonido, notificacion del
--   sistema y el contador en el titulo, pero todo eso necesita el panel
--   abierto. Un pedido a las 11 de la noche, con la compu apagada, no
--   existia para nadie hasta la manana siguiente.
--
-- LA FORMA
--   La base misma manda el mensaje a Telegram. Sin servidor intermedio,
--   sin edge function, sin nada aparte que se pueda caer.
--
-- POR QUE UN RELOJ Y NO UN DISPARADOR EN LA TABLA
--   crear_compra() inserta los pedidos de a uno, en un bucle: un trigger
--   por fila mandaria tres mensajes por una compra de tres productos.
--   Mirando cada minuto se agrupan por compra y sale un mensaje por venta.
--   Se paga con hasta un minuto de espera, que para ir a aprobar algo a
--   mano no cambia nada.
--
-- POR QUE http Y NO pg_net
--   pg_net encola el pedido y lo manda RECIEN cuando termina la
--   transaccion: adentro de la funcion nunca se puede leer la respuesta.
--   Con eso, un pedido se marcaba como avisado aunque el mensaje jamas
--   hubiera salido —token mal escrito, Telegram caido un minuto— y se
--   perdia para siempre. Justo lo que este aviso existe para evitar.
--
--   La extension http es sincrona: manda, espera y devuelve el codigo.
--   Para un trabajo que corre en segundo plano, esperar un segundo no
--   cuesta nada, y a cambio se sabe si el mensaje llego de verdad.
--
-- COMO SE CONFIGURA (una sola vez, desde el SQL Editor)
--   1. En Telegram, hablarle a @BotFather → /newbot → sale un token.
--   2. Abrir el chat con el bot recien creado y mandarle un "hola".
--      Sin ese primer mensaje, Telegram no le deja escribirte.
--   3. select public.configurar_telegram('EL_TOKEN_DE_BOTFATHER');
--
--      El chat id no hay que buscarlo: si ya le escribiste, Telegram lo
--      sabe y la funcion se lo pregunta con getUpdates. Un paso menos es
--      un paso menos donde equivocarse.
--
--   Opcional, para que el mensaje traiga el link del panel:
--     insert into public.ajustes (clave, valor)
--     values ('panel_url', 'https://…/admin/')
--     on conflict (clave) do update set valor = excluded.valor;
-- ============================================================

create extension if not exists http with schema extensions;


-- ============================================================
-- 1. DONDE VIVE EL TOKEN
-- ============================================================
-- Con RLS y SIN ninguna politica: nadie lo lee desde la API, ni el cliente
-- ni un usuario logueado. Solo lo ven las funciones de abajo, que corren
-- como duenias de la tabla (security definer).
create table if not exists public.ajustes (
  clave          text primary key,
  valor          text not null,
  actualizado_en timestamptz not null default now()
);

alter table public.ajustes enable row level security;

revoke all on public.ajustes from anon, authenticated;


-- ============================================================
-- 2. A CUAL YA SE AVISO
-- ============================================================
-- Sin marca = sin avisar = se reintenta solo en la vuelta siguiente.
alter table public.pedidos add column if not exists avisado_en timestamptz;

create index if not exists pedidos_sin_avisar_idx
  on public.pedidos (creado_en)
  where avisado_en is null;


-- ============================================================
-- 3. EL AVISO
-- ============================================================
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

  -- Todavia sin configurar: no es un error, simplemente no hay a quien avisar.
  if v_token is null or v_chat is null then
    return 0;
  end if;

  -- El default de 1 segundo no alcanza ni para conectarse a Telegram.
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');

  select valor into v_panel from public.ajustes where clave = 'panel_url';

  for v_compra in
    -- Una compra = un mensaje. Las lineas de un mismo grupo van juntas.
    select
      coalesce(p.grupo::text, p.id::text)                    as compra,
      min(p.numero)                                          as numero,
      count(*)                                               as cuantos,
      sum(p.precio)                                          as total,
      max(nullif(p.cliente_nombre, ''))                      as cliente,
      max(nullif(p.cliente_whatsapp, ''))                    as whatsapp,
      string_agg(p.producto_nombre, chr(10) || '· ' order by p.numero) as productos,
      array_agg(p.id)                                        as ids
    from public.pedidos p
    where p.avisado_en is null
      -- Si esto estuvo apagado una semana, no se despierta con 200 mensajes
      and p.creado_en > now() - interval '1 day'
    group by 1
    order by 2
  loop
    v_texto :=
      case when v_compra.cuantos = 1
        then '🛒 Pedido nuevo #' || v_compra.numero || chr(10) ||
             v_compra.productos
        else '🛒 Compra nueva #' || v_compra.numero ||
             ' (' || v_compra.cuantos || ' productos)' || chr(10) ||
             '· ' || v_compra.productos
      end
      || chr(10) || chr(10)
      || 'Total: ' || to_char(v_compra.total, 'FM999999990.00') || ' Bs'
      || case when v_compra.cliente is not null or v_compra.whatsapp is not null
              then chr(10) || 'Cliente: ' ||
                   coalesce(v_compra.cliente, 'sin nombre') ||
                   coalesce(' · ' || v_compra.whatsapp, '')
              else '' end
      || chr(10) || chr(10) || 'Esperando que lo apruebes en el panel.'
      || coalesce(chr(10) || v_panel, '');

    -- Si Telegram no contesta o se corta la red, este pedido se saltea y se
    -- reintenta en la proxima vuelta. Que falle uno no puede dejar sin
    -- avisar a los demas.
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

    -- Se da por avisado SOLO si Telegram dijo que si.
    if v_estado between 200 and 299 then
      update public.pedidos set avisado_en = now() where id = any(v_compra.ids);
      v_cuantos := v_cuantos + 1;
    end if;
  end loop;

  return v_cuantos;
end;
$$;

-- Que no la pueda llamar cualquiera desde la API: manda mensajes.
revoke all on function public.avisar_pedidos_nuevos() from public, anon, authenticated;


-- ============================================================
-- 4. CONFIGURAR Y PROBAR
-- ============================================================
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

  if v_chat is null then
    return 'El token anda, pero nadie le escribió al bot todavía. ' ||
           'Abrí el chat con tu bot, mandale un "hola" y volvé a ejecutar esto.';
  end if;

  insert into public.ajustes (clave, valor) values
    ('telegram_token', v_token),
    ('telegram_chat',  v_chat)
  on conflict (clave) do update
    set valor = excluded.valor, actualizado_en = now();

  return public.probar_telegram();
end;
$$;

revoke all on function public.configurar_telegram(text) from public, anon, authenticated;


create or replace function public.probar_telegram()
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
  select valor into v_token from public.ajustes where clave = 'telegram_token';
  select valor into v_chat  from public.ajustes where clave = 'telegram_chat';

  if v_token is null or v_chat is null then
    return 'Falta configurar. Ejecutá: select public.configurar_telegram(''TU_TOKEN'');';
  end if;

  if v_token like 'ACA\_%' or v_token like 'EL\_TOKEN%' then
    return 'Quedó guardado el texto de ejemplo. Ejecutá: select public.configurar_telegram(''TU_TOKEN'');';
  end if;

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');

  begin
    select * into v_r from extensions.http_post(
      'https://api.telegram.org/bot' || v_token || '/sendMessage',
      jsonb_build_object(
        'chat_id', v_chat,
        'text', '🦁 Tiago Store: los avisos de pedidos quedaron andando.')::text,
      'application/json');
  exception when others then
    return 'No se pudo hablar con Telegram: ' || sqlerrm;
  end;

  if v_r.status between 200 and 299 then
    return 'Listo: el mensaje salió y Telegram lo aceptó. Fijate en tu chat.';
  end if;

  return 'Telegram rechazó el mensaje (código ' || v_r.status || '): ' ||
         coalesce(left(v_r.content, 200), '');
end;
$$;

revoke all on function public.probar_telegram() from public, anon, authenticated;


-- ============================================================
-- 5. EL RELOJ
-- ============================================================
-- Cada minuto. Sin pedidos nuevos no hace nada, y sin Telegram configurado
-- sale sin mandar nada.
--
--   select cron.schedule('avisar-pedidos-nuevos', '* * * * *',
--                        'select public.avisar_pedidos_nuevos();');
--
-- Para apagarlo:  select cron.unschedule('avisar-pedidos-nuevos');
