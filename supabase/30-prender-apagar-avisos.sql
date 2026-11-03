-- ============================================================
-- TIAGO STORE · Prender y apagar los avisos de Telegram desde el panel
-- ============================================================
-- En Ajustes → Telegram cada aviso tenía un cartel ("Prendido") que solo
-- se podía cambiar desde el SQL Editor. Con esto, cada uno tiene su
-- interruptor en el panel (admin/js/admin-ajustes.js):
--
--   · Pedidos nuevos (cada minuto), Suscripciones por vencer y vencidas
--     (9:00) y Sin pagar desde ayer (9:05): el interruptor prende o apaga
--     su reloj de pg_cron (cron.alter_job). Apagado no corre; al
--     prenderlo sigue a la hora de siempre.
--       Ojo con Pedidos nuevos: avisar_pedidos_nuevos mira solo el último
--       día. Al volver a prenderlo te llegan los pedidos de las últimas
--       24 horas que no se avisaron; los más viejos ya no.
--
--   · Botones del chat: prendido es lo de siempre (activar_boton_telegram:
--     el webhook de Telegram y su clave). Apagado le pide a Telegram que
--     deje de mandar los toques (deleteWebhook) y borra la clave. Sin la
--     clave la Edge Function telegram-boton no atiende ningún toque (503),
--     los avisos nuevos llegan sin botones y "Sin pagar desde ayer" no
--     manda nada (sin botón no hay cómo cancelar desde el chat). Al
--     prenderlo se arma una clave nueva.
--
-- Desde el panel, solo el admin (es_admin). Se corre UNA vez en Supabase →
-- SQL Editor.
-- No toca ningún pedido ni ningún aviso que ya se mandó.
-- ============================================================

create or replace function public.poner_aviso_telegram(p_aviso text, p_prendido boolean)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_jobid  bigint;
  v_token  text;
  v_status integer;
begin
  -- Desde el panel, solo el admin; desde el SQL Editor (sin sesión), también
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.es_admin() then
    raise exception 'Solo para el panel' using errcode = '42501';
  end if;
  if p_prendido is null then
    raise exception 'Falta decir si se prende o se apaga' using errcode = '22023';
  end if;

  -- ---------- Los botones del chat ----------
  if p_aviso = 'botones' then
    if p_prendido then
      return public.activar_boton_telegram();
    end if;

    select valor into v_token from public.ajustes where clave = 'telegram_token';
    if v_token is not null then
      perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');
      begin
        select (extensions.http_post(
                  'https://api.telegram.org/bot' || v_token || '/deleteWebhook',
                  '{}', 'application/json')).status
          into v_status;
      exception when others then
        v_status := null;
      end;
    end if;

    -- Sin la clave nadie puede usar los botones, aunque Telegram no
    -- hubiera respondido
    delete from public.ajustes where clave = 'telegram_webhook_secreto';

    return case
      when v_token is null or v_status between 200 and 299
        then 'Apagado: los avisos llegan sin botones.'
      else 'Apagado. Telegram no respondió, pero los botones ya no hacen nada.'
    end;
  end if;

  -- ---------- Los tres relojes ----------
  if p_aviso not in ('avisar-pedidos-nuevos', 'avisar-renovaciones', 'avisar-sin-pagar') then
    raise exception 'No conozco ese aviso: %', p_aviso using errcode = '22023';
  end if;

  select jobid into v_jobid from cron.job where jobname = p_aviso;
  if v_jobid is null then
    return 'Ese aviso no está programado en pg_cron: corré su SQL en el SQL Editor.';
  end if;

  begin
    perform cron.alter_job(job_id := v_jobid, active := p_prendido);
  exception when undefined_function then
    -- pg_cron viejo, sin alter_job
    update cron.job set active = p_prendido where jobid = v_jobid;
  end;

  return case when p_prendido then 'Prendido' else 'Apagado' end;
end;
$$;

revoke execute on function public.poner_aviso_telegram(text, boolean) from public, anon;
grant  execute on function public.poner_aviso_telegram(text, boolean) to authenticated;

-- Para probar a mano (desde el panel ya anda solo):
--   select public.poner_aviso_telegram('avisar-sin-pagar', false);
--   select public.poner_aviso_telegram('avisar-sin-pagar', true);
