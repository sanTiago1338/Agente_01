-- ============================================================
-- TIAGO STORE · El último emoji de Telegram
-- ============================================================
-- Todo profesional, sin emojis (pedido del dueño, 1/10/2026). Los avisos
-- de pedido nuevo y de vencimiento ya salen sin (12-dias-en-los-avisos.sql
-- y 11-avisos-de-vencimiento.sql); quedaba el mensaje de prueba de
-- probar_telegram() (06-avisos.sql), que empezaba con un león.
-- ============================================================

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
        'text', 'Tiago Store: los avisos de pedidos quedaron andando.')::text,
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
