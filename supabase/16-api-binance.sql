-- ============================================================
-- TIAGO STORE · La API de Binance (solo lectura)
-- ============================================================
-- Panel → Ventas → Cobros → API de Binance. Con una API de SOLO LECTURA
-- se pueden leer los pagos que te entran por Binance Pay. Por ahora se
-- guarda y se prueba la conexión; confirmar los pagos de Binance solos
-- con esto es el paso siguiente.
--
-- Las claves viven en ajustes, igual que el token de Telegram: esa tabla
-- tiene RLS sin políticas, así que desde afuera no la lee nadie. La
-- Secret Key nunca vuelve al navegador: el panel solo sabe si está
-- cargada y los últimos 4 caracteres de la API Key.
--
--   binance_api_key      la API Key
--   binance_api_secret   la Secret Key
--   binance_api_estado   cómo salió la última prueba (jsonb como texto)
-- ============================================================


-- ------------------------------------------------------------
-- 1. Cómo está (solo el admin)
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
    'prueba',      v_estado
  );
end;
$$;

revoke execute on function public.estado_api_binance() from public, anon;
grant  execute on function public.estado_api_binance() to authenticated;


-- ------------------------------------------------------------
-- 2. Guardarla (solo el admin)
-- ------------------------------------------------------------
-- Las dos vacías = quitar la API. La Secret Key vacía con una API Key =
-- se deja la Secret Key que ya estaba (para no tener que volver a
-- pegarla si solo cambiás la otra).
create or replace function public.guardar_api_binance(p_api_key text, p_api_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key    text := btrim(coalesce(p_api_key, ''));
  v_secret text := btrim(coalesce(p_api_secret, ''));
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.es_admin() then
    raise exception 'Solo el administrador puede cambiar la API de Binance' using errcode = '42501';
  end if;

  if v_key = '' and v_secret = '' then
    delete from public.ajustes
     where clave in ('binance_api_key', 'binance_api_secret', 'binance_api_estado');
    return public.estado_api_binance();
  end if;

  if v_key = '' then
    raise exception 'Falta la API Key';
  end if;
  if v_key !~ '^[A-Za-z0-9]{20,128}$' then
    raise exception 'La API Key no parece válida: copiala de nuevo desde Binance, sin espacios';
  end if;

  if v_secret = '' then
    select valor into v_secret from public.ajustes where clave = 'binance_api_secret';
    if coalesce(v_secret, '') = '' then
      raise exception 'Falta la Secret Key';
    end if;
  elsif v_secret !~ '^[A-Za-z0-9]{20,128}$' then
    raise exception 'La Secret Key no parece válida: copiala de nuevo desde Binance, sin espacios';
  end if;

  insert into public.ajustes (clave, valor) values
    ('binance_api_key',    v_key),
    ('binance_api_secret', v_secret)
  on conflict (clave) do update set valor = excluded.valor, actualizado_en = now();

  -- Claves nuevas: la prueba anterior ya no dice nada de estas
  delete from public.ajustes where clave = 'binance_api_estado';

  return public.estado_api_binance();
end;
$$;

revoke execute on function public.guardar_api_binance(text, text) from public, anon;
grant  execute on function public.guardar_api_binance(text, text) to authenticated;


-- ------------------------------------------------------------
-- 3. Probar la conexión (solo el admin)
-- ------------------------------------------------------------
-- Le pide a Binance el historial de Binance Pay (GET /sapi/v1/pay/transactions),
-- firmado con la Secret Key como pide Binance (HMAC SHA256). Si responde,
-- la API sirve para leer tus pagos. Devuelve { ok, mensaje, en } y lo
-- deja anotado, así el panel lo muestra al volver a abrir Cobros.
create or replace function public.probar_api_binance()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key     text;
  v_secret  text;
  v_query   text;
  v_r       extensions.http_response;
  v_json    jsonb;
  v_codigo  integer;
  v_ok      boolean := false;
  v_mensaje text;
  v_estado  jsonb;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.es_admin() then
    raise exception 'Solo el administrador puede probar la API de Binance' using errcode = '42501';
  end if;

  select valor into v_key    from public.ajustes where clave = 'binance_api_key';
  select valor into v_secret from public.ajustes where clave = 'binance_api_secret';

  if coalesce(v_key, '') = '' or coalesce(v_secret, '') = '' then
    return jsonb_build_object('ok', false, 'mensaje', 'Primero cargá la API Key y la Secret Key.');
  end if;

  v_query := 'timestamp=' || (extract(epoch from clock_timestamp()) * 1000)::bigint
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
    v_mensaje := 'No se pudo hablar con Binance. Probá de nuevo en un rato.';
  end;

  if v_mensaje is null then
    begin
      v_json := v_r.content::jsonb;
    exception when others then
      v_json := null;
    end;
    v_codigo := nullif(v_json ->> 'code', '')::numeric::integer;

    if v_r.status between 200 and 299 then
      v_ok := true;
      v_mensaje := 'Conectada. Binance respondió y se pueden leer tus pagos de Binance Pay.';
    elsif v_codigo in (-2008, -2014) then
      v_mensaje := 'Binance no reconoce esa API Key. Copiala de nuevo desde Binance.';
    elsif v_codigo = -1022 then
      v_mensaje := 'La Secret Key no corresponde a esa API Key. Copiala de nuevo.';
    elsif v_codigo = -2015 then
      v_mensaje := 'Binance rechazó la API: revisá que tenga activado "Habilitar lectura" y que no esté restringida por IP.';
    elsif v_codigo = -1021 then
      v_mensaje := 'Binance rechazó la hora del pedido. Probá de nuevo.';
    elsif v_r.status in (403, 451) then
      v_mensaje := 'Binance no permite la conexión desde el servidor (código ' || v_r.status || ').';
    else
      v_mensaje := 'Binance respondió con un error (código ' || coalesce(v_codigo::text, v_r.status::text)
                || '): ' || coalesce(left(v_json ->> 'msg', 160), left(v_r.content, 160), '');
    end if;
  end if;

  v_estado := jsonb_build_object('ok', v_ok, 'mensaje', v_mensaje, 'en', now());

  insert into public.ajustes (clave, valor) values ('binance_api_estado', v_estado::text)
  on conflict (clave) do update set valor = excluded.valor, actualizado_en = now();

  return v_estado;
end;
$$;

revoke execute on function public.probar_api_binance() from public, anon;
grant  execute on function public.probar_api_binance() to authenticated;
