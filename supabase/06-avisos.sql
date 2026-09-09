-- ============================================================
-- TIAGO STORE · 06 · AVISO DE PEDIDO NUEVO POR TELEGRAM
-- ============================================================
-- Aplicado con las migraciones:
--   pg_net_para_avisos
--   aviso_de_pedidos_por_telegram
--   reloj_del_aviso_de_pedidos
--
-- EL PROBLEMA
--   No hay pasarela de pago, asi que ningun pedido se entrega solo: alguien
--   lo tiene que aprobar. El panel avisa con sonido, notificacion del
--   sistema y el contador en el titulo, pero todo eso necesita el panel
--   abierto. Un pedido a las 11 de la noche, con la compu apagada, no
--   existia para nadie hasta la manana siguiente.
--
-- LA FORMA
--   La base misma manda el mensaje a Telegram con pg_net. Sin servidor
--   intermedio, sin edge function, sin nada que se pueda caer aparte.
--
-- POR QUE UN RELOJ Y NO UN DISPARADOR EN LA TABLA
--   crear_compra() inserta los pedidos de a uno, en un bucle: un trigger
--   por fila mandaria tres mensajes por una compra de tres productos.
--   Mirando cada minuto se agrupan por compra y sale un mensaje por venta.
--   Se paga con hasta un minuto de espera, que para ir a aprobar algo a
--   mano no cambia nada.
--
--   Ademas es tolerante a fallas: si Telegram no contesta, el pedido queda
--   sin marcar y se reintenta al minuto siguiente.
--
-- COMO SE CONFIGURA (una sola vez, desde el SQL Editor)
--   1. En Telegram, hablarle a @BotFather → /newbot → sale un token.
--   2. Hablarle al bot recien creado (un "hola" alcanza) y despues abrir
--      https://api.telegram.org/bot<TOKEN>/getUpdates para ver el chat id.
--   3. Guardar los dos:
--        insert into public.ajustes (clave, valor) values
--          ('telegram_token', 'EL_TOKEN'),
--          ('telegram_chat',  'EL_CHAT_ID')
--        on conflict (clave) do update set valor = excluded.valor,
--                                          actualizado_en = now();
--   4. Probar:  select public.probar_telegram();
--
--   Opcional, para que el mensaje traiga el link del panel:
--     insert into public.ajustes values ('panel_url', 'https://...../admin/')
--     on conflict (clave) do update set valor = excluded.valor;
-- ============================================================

create extension if not exists pg_net;


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
set search_path = public, net
as $$
declare
  v_token   text;
  v_chat    text;
  v_panel   text;
  v_compra  record;
  v_texto   text;
  v_cuantos integer := 0;
begin
  select valor into v_token from public.ajustes where clave = 'telegram_token';
  select valor into v_chat  from public.ajustes where clave = 'telegram_chat';

  -- Todavia sin configurar: no es un error, simplemente no hay a quien avisar.
  if v_token is null or v_chat is null then
    return 0;
  end if;

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

    perform net.http_post(
      url     := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
      body    := jsonb_build_object(
                   'chat_id', v_chat,
                   'text',    v_texto,
                   'disable_web_page_preview', true),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );

    update public.pedidos set avisado_en = now() where id = any(v_compra.ids);
    v_cuantos := v_cuantos + 1;
  end loop;

  return v_cuantos;
end;
$$;

-- Que no la pueda llamar cualquiera desde la API: manda mensajes.
revoke all on function public.avisar_pedidos_nuevos() from public, anon, authenticated;


-- ============================================================
-- 4. UN MENSAJE DE PRUEBA
-- ============================================================
create or replace function public.probar_telegram()
returns text
language plpgsql
security definer
set search_path = public, net
as $$
declare
  v_token text;
  v_chat  text;
begin
  select valor into v_token from public.ajustes where clave = 'telegram_token';
  select valor into v_chat  from public.ajustes where clave = 'telegram_chat';

  if v_token is null or v_chat is null then
    return 'Falta cargar telegram_token o telegram_chat en la tabla ajustes';
  end if;

  perform net.http_post(
    url     := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
    body    := jsonb_build_object(
                 'chat_id', v_chat,
                 'text', '🦁 Tiago Store: los avisos de pedidos quedaron andando.'),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );

  return 'Mensaje enviado. Si no llega en unos segundos, revisa el token y el chat_id.';
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
