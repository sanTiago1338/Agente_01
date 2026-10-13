-- ============================================================
-- TIAGO STORE · 27 · AVISO DE VENCIDA CON BOTÓN DE WHATSAPP
-- ============================================================
-- Correr en Supabase → SQL Editor (pegar todo y "Run"), DESPUÉS del 26
-- (usa la tabla clientes y wa_normalizado()). Se puede correr de nuevo.
--
-- EL PEDIDO (13/10/2026)
--   "Que me envíe el aviso de que la suscripción caducó y un mensaje para
--   enviar al WhatsApp del cliente; eso me lo enviás por Telegram."
--
-- CÓMO QUEDA (todos los días a las 9:00 de Bolivia)
--   Por cada suscripción que vence mañana, o que venció (hoy, o hasta 3
--   días atrás si el aviso no salió), te llegan dos mensajes:
--
--   1) El aviso, con un botón "Enviar por WhatsApp a Ana": lo tocás, se
--      abre el chat del cliente con el mensaje ya escrito, y enviás.
--
--        SUSCRIPCIÓN VENCIDA: venció hoy
--        Netflix Premium 4K (1 pantalla) · 30 días
--        Cliente: Ana · +591 72309304
--        Pedido #123 · comprado el 13/09/2026 · venció el 13/10/2026
--
--        Tocá "Enviar por WhatsApp": se abre el chat de Ana con el
--        mensaje de abajo ya escrito.
--        [ Enviar por WhatsApp a Ana ]
--
--   2) El mensaje para el cliente, solo, para copiarlo o reenviarlo:
--      cuándo venció, el enlace para renovar con el precio, y los datos
--      de su compra (cuenta y contraseña tapadas a medias).
--
-- LO NUEVO, ADEMÁS DEL BOTÓN
--   · Si el pedido no tiene nombre pero su WhatsApp está registrado
--     (26-registro-de-clientes.sql), lo saluda por su usuario.
--   · Si ya renovó (compró el mismo producto, con el mismo WhatsApp, en
--     la última semana antes de vencer o después), no te avisa: no hace
--     falta escribirle a alguien que ya pagó.
--   · El aviso ya no trae el enlace largo de wa.me pegado en el texto
--     (para eso está el botón). Si Telegram no acepta el botón, sale como
--     antes, con el enlace en el texto.
--   · Se asegura el reloj: 'avisar-renovaciones' a las 13:00 UTC.
--
-- Reemplaza textos_de_vencimiento() (21) y avisar_renovaciones() (11).
-- ============================================================


-- ============================================================
-- 1. LOS TEXTOS (sin mandar nada)
-- ============================================================
-- Para mirarlos antes:  select * from public.textos_de_vencimiento();
-- Cambia lo que devuelve (suma whatsapp_url y cliente), así que se borra
-- y se vuelve a crear.
drop function if exists public.textos_de_vencimiento(integer);

create function public.textos_de_vencimiento(p_dias_antes integer default 1)
returns table (pedido_id uuid, tipo text, aviso text, mensaje text, whatsapp_url text, cliente text)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_hoy    date := (now() at time zone 'America/La_Paz')::date;
  v_tienda text;
  v_fila   record;
  v_tipo   text;
  v_cuando text;
  v_saludo text;
  v_cuenta text;
  v_clave  text;
  v_duracion text;
  v_renovar  text;
  v_cierre   text;
  v_celular  text;
  v_precio   text;
  v_nombre   text;
begin
  select coalesce(
           (select valor from public.ajustes where clave = 'tienda_url'),
           'https://santiago1338.github.io/Agente_01/')
    into v_tienda;
  if right(v_tienda, 1) <> '/' then v_tienda := v_tienda || '/'; end if;

  for v_fila in
    select
      p.id,
      p.numero,
      p.producto_id,
      p.producto_nombre                                      as producto,
      p.suscripcion_vence_en                                 as vence,
      p.renovar,
      p.plan_dias                                            as dias,
      public.dias_del_plan(p.producto_nombre, pr.suscripcion) as dias_plan,
      (pr.id is not null and pr.activo is not false and coalesce(pr.precio, 0) > 0) as se_vende,
      case when pr.id is not null then public.precio_de_venta(pr) end as precio,
      -- El nombre del pedido; si no tiene, el usuario con el que se registró
      coalesce(nullif(btrim(p.cliente_nombre), ''), cl.nombre) as cliente,
      w.tel,
      (p.suscripcion_vence_en - v_hoy)                       as faltan,
      coalesce(p.pagado_en, p.creado_en)                     as comprado,
      c.credenciales                                         as cred
    from public.pedidos p
    left join public.productos pr on pr.id = p.producto_id
    cross join lateral (select public.wa_normalizado(p.cliente_whatsapp) as tel) w
    left join public.clientes cl on cl.whatsapp = w.tel and w.tel <> ''
    left join lateral (
      select c.credenciales from public.cuentas c
      where c.pedido_id = p.id
      order by c.entregada_en desc nulls last
      limit 1
    ) c on true
    where p.estado in ('entregado', 'sin_stock')
      and not p.prueba
      and p.suscripcion_vence_en is not null
      and (
        (p.suscripcion_avisada_en is null
          and p.suscripcion_vence_en >  v_hoy
          and p.suscripcion_vence_en <= v_hoy + greatest(1, p_dias_antes))
        or
        (p.suscripcion_vencida_avisada_en is null
          and p.suscripcion_vence_en <= v_hoy
          and p.suscripcion_vence_en >= v_hoy - 3)
      )
      -- Ya renovó: el mismo producto, el mismo WhatsApp, comprado en la
      -- última semana antes de vencer o después, y pagado
      and not (w.tel <> '' and exists (
        select 1 from public.pedidos q
        where q.id <> p.id
          and not q.prueba
          and q.estado in ('pagado', 'entregado', 'sin_stock')
          and q.creado_en > p.creado_en
          and q.creado_en >= (p.suscripcion_vence_en - 7)::timestamp at time zone 'America/La_Paz'
          and (q.producto_id = p.producto_id
               or (p.producto_id is null and q.producto_nombre = p.producto_nombre))
          and public.wa_normalizado(q.cliente_whatsapp) = w.tel))
    order by p.suscripcion_vence_en, p.numero
  loop
    v_tipo := case when v_fila.vence > v_hoy then 'antes' else 'vencio' end;

    v_cuando := case
      when v_tipo = 'antes' and v_fila.faltan = 1 then 'vence mañana, ' || to_char(v_fila.vence, 'DD/MM/YYYY')
      when v_tipo = 'antes'                       then 'vence el ' || to_char(v_fila.vence, 'DD/MM/YYYY')
      when v_fila.faltan = 0                      then 'venció hoy, ' || to_char(v_fila.vence, 'DD/MM/YYYY')
      else                                             'venció el ' || to_char(v_fila.vence, 'DD/MM/YYYY')
    end;

    v_duracion := case
      when v_fila.dias is null then null
      when v_fila.dias_plan > v_fila.dias then v_fila.dias || ' días (de ' || v_fila.dias_plan || ')'
      else v_fila.dias || ' días'
    end;

    -- Su celular sin el 591, para que la tienda ya lo traiga escrito
    v_celular := regexp_replace(v_fila.tel, '^591', '');
    if v_celular !~ '^[67][0-9]{7}$' then v_celular := null; end if;

    v_precio := case
      when v_fila.precio is null then null
      when v_fila.precio = trunc(v_fila.precio) then to_char(v_fila.precio, 'FM999999990')
      else to_char(v_fila.precio, 'FM999999990.00')
    end;

    if v_fila.se_vende then
      v_renovar :=
        'Renovala con un toque: abrí este enlace, pagás con QR' ||
        coalesce(' (' || v_precio || ' Bs)', '') || ' y listo.' || chr(10) ||
        v_tienda || '#renovar=' || v_fila.producto_id || coalesce('&wa=' || v_celular, '');
      v_cierre := '¿Dudas? Respondé este mensaje y te ayudamos.';
    else
      v_renovar := '¿Querés renovarla? Respondé este mensaje y te la dejamos lista.';
      v_cierre  := null;
    end if;

    v_nombre := nullif(split_part(coalesce(v_fila.cliente, ''), ' ', 1), '');
    v_saludo := 'Hola' || coalesce(' ' || v_nombre, '') || ', te escribimos de Tiago Store.';
    v_cuenta := public.tapar_cuenta(coalesce(v_fila.cred ->> 'usuario', v_fila.cred ->> 'email'));
    v_clave  := public.tapar_texto(coalesce(v_fila.cred ->> 'clave', v_fila.cred ->> 'password'), 3, 2);

    -- Lo que le mandás al cliente
    mensaje :=
      v_saludo || chr(10) || chr(10) ||
      'Tu suscripción de ' || v_fila.producto || ' ' || v_cuando || '.' || chr(10) || chr(10) ||
      v_renovar || chr(10) || chr(10) ||
      'Datos de tu compra:' || chr(10) ||
      'Pedido: #' || v_fila.numero || chr(10) ||
      'Fecha de compra: ' || to_char(v_fila.comprado at time zone 'America/La_Paz', 'DD/MM/YYYY') || chr(10) ||
      coalesce('Duración: ' || v_duracion || chr(10), '') ||
      'Vencimiento: ' || to_char(v_fila.vence, 'DD/MM/YYYY') ||
      coalesce(chr(10) || 'Cuenta: ' || v_cuenta, '') ||
      coalesce(chr(10) || 'Contraseña: ' || v_clave, '') ||
      coalesce(chr(10) || chr(10) || v_cierre, '');

    whatsapp_url := case when v_fila.tel <> ''
      then 'https://wa.me/' || v_fila.tel || '?text=' || replace(extensions.urlencode(mensaje), '+', '%20')
    end;

    -- Lo que te llega a vos
    aviso :=
      case
        when v_tipo = 'antes' and v_fila.faltan = 1 then 'SUSCRIPCIÓN POR VENCER: vence mañana'
        when v_tipo = 'antes'                       then 'SUSCRIPCIÓN POR VENCER: vence en ' || v_fila.faltan || ' días'
        when v_fila.faltan = 0                      then 'SUSCRIPCIÓN VENCIDA: venció hoy'
        else 'SUSCRIPCIÓN VENCIDA: venció hace ' || abs(v_fila.faltan) || ' día(s)'
      end
      || chr(10) || v_fila.producto || coalesce(' · ' || v_duracion, '')
      || chr(10) || 'Cliente: ' || coalesce(v_fila.cliente, 'sin nombre') || ' · '
      || case when v_fila.tel ~ '^591[0-9]{8}$' then '+591 ' || substr(v_fila.tel, 4)
              when v_fila.tel <> '' then v_fila.tel
              else 'sin WhatsApp' end
      || chr(10) || 'Pedido #' || v_fila.numero
      || ' · comprado el ' || to_char(v_fila.comprado at time zone 'America/La_Paz', 'DD/MM/YYYY')
      || case when v_tipo = 'antes' then ' · vence el ' else ' · venció el ' end
      || to_char(v_fila.vence, 'DD/MM/YYYY')
      || case when not v_fila.se_vende
              then chr(10) || 'Ojo: el producto ya no está a la venta, el mensaje no lleva enlace para renovar.'
              else '' end
      || chr(10) || chr(10)
      || case when v_fila.tel <> ''
           then 'Tocá "Enviar por WhatsApp": se abre el chat de '
                || coalesce(v_nombre, 'tu cliente') || ' con el mensaje de abajo ya escrito.'
           else 'No dejó WhatsApp: copiá el mensaje de abajo y mandáselo por donde puedas.'
         end;

    cliente   := v_nombre;
    pedido_id := v_fila.id;
    tipo      := v_tipo;
    return next;
  end loop;
end;
$$;


-- ============================================================
-- 2. MANDARLOS POR TELEGRAM
-- ============================================================
-- Dos mensajes por pedido: el aviso con el botón, y abajo el mensaje
-- para el cliente solo. Si Telegram no acepta el botón (un enlace
-- demasiado largo, por ejemplo), el aviso sale sin botón y con el enlace
-- escrito, como antes. Se da por avisado solo si salió el aviso; si no,
-- se reintenta al otro día.
create or replace function public.avisar_renovaciones(p_dias_antes integer default 1)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token   text;
  v_chat    text;
  v_fila    record;
  v_cuantos integer := 0;
  v_estado  integer;
  v_aviso   jsonb;
begin
  select valor into v_token from public.ajustes where clave = 'telegram_token';
  select valor into v_chat  from public.ajustes where clave = 'telegram_chat';
  if v_token is null or v_chat is null then
    return 0;
  end if;

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');

  for v_fila in select * from public.textos_de_vencimiento(p_dias_antes) loop
    v_estado := null;

    -- Con botón, si tiene WhatsApp
    if v_fila.whatsapp_url is not null then
      v_aviso := jsonb_build_object(
        'chat_id', v_chat,
        'text',    v_fila.aviso,
        'disable_web_page_preview', true,
        'reply_markup', jsonb_build_object('inline_keyboard', jsonb_build_array(jsonb_build_array(
          jsonb_build_object(
            'text', 'Enviar por WhatsApp' || coalesce(' a ' || v_fila.cliente, ''),
            'url',  v_fila.whatsapp_url)))));
      begin
        select (extensions.http_post(
                  'https://api.telegram.org/bot' || v_token || '/sendMessage',
                  v_aviso::text, 'application/json')).status
          into v_estado;
      exception when others then
        v_estado := null;
      end;
    end if;

    -- Sin WhatsApp, o Telegram no aceptó el botón: sin botón, con el
    -- enlace escrito si lo hay
    if v_estado is null or v_estado not between 200 and 299 then
      begin
        select (extensions.http_post(
                  'https://api.telegram.org/bot' || v_token || '/sendMessage',
                  jsonb_build_object(
                    'chat_id', v_chat,
                    'text',    v_fila.aviso ||
                               coalesce(chr(10) || chr(10) || 'Enlace para mandárselo:' || chr(10) ||
                                        v_fila.whatsapp_url, ''),
                    'disable_web_page_preview', true)::text,
                  'application/json')).status
          into v_estado;
      exception when others then
        v_estado := null;
      end;
    end if;

    if v_estado between 200 and 299 then
      begin
        perform extensions.http_post(
          'https://api.telegram.org/bot' || v_token || '/sendMessage',
          jsonb_build_object('chat_id', v_chat, 'text', v_fila.mensaje,
                             'disable_web_page_preview', true)::text,
          'application/json');
      exception when others then
        null;   -- el aviso ya salió y trae el botón con el mensaje
      end;

      if v_fila.tipo = 'antes' then
        update public.pedidos set suscripcion_avisada_en = now() where id = v_fila.pedido_id;
      else
        update public.pedidos set
          suscripcion_vencida_avisada_en = now(),
          suscripcion_avisada_en = coalesce(suscripcion_avisada_en, now())
        where id = v_fila.pedido_id;
      end if;
      v_cuantos := v_cuantos + 1;
    end if;
  end loop;

  return v_cuantos;
end;
$$;


-- ============================================================
-- 3. EL RELOJ
-- ============================================================
-- 13:00 UTC = 9:00 en Bolivia. Con el mismo nombre se reemplaza el que
-- hubiera: correr este archivo dos veces no lo duplica.
select cron.schedule('avisar-renovaciones', '0 13 * * *', 'select public.avisar_renovaciones()');


-- ============================================================
-- 4. PERMISOS
-- ============================================================
-- Como las demás de avisos: nadie desde la tienda ni el panel. Las corre
-- pg_cron, que entra como dueño de la base.
revoke execute on function public.textos_de_vencimiento(integer) from public, anon, authenticated;
revoke execute on function public.avisar_renovaciones(integer)   from public, anon, authenticated;
