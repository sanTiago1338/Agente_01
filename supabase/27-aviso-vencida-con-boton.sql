-- ============================================================
-- TIAGO STORE · 27 · AVISO DE VENCIMIENTO CON BOTÓN DE WHATSAPP
-- ============================================================
-- Correr en Supabase → SQL Editor, DESPUÉS del 26 (usa wa_normal() y la
-- tabla clientes). Se puede correr de nuevo.
--
-- Todos los días a las 9:00 de Bolivia (el reloj "avisar-renovaciones",
-- 13:00 UTC, que ya existe) llegan por Telegram dos mensajes por cada
-- suscripción que vence mañana o que venció (hoy, o hasta 3 días atrás
-- si el aviso no salió ese día):
--
--   1. EL AVISO, para vos
--        SUSCRIPCIÓN VENCIDA: venció hoy
--        Producto: Netflix Premium 4K (1 pantalla)
--        Cliente: Ana
--        WhatsApp: +591 72309304
--        Pedido: #123
--        Comprado el 13/09/2026 · 30 días
--        Vence el 13/10/2026
--      con un botón "Enviar por WhatsApp a Ana" que abre su chat con el
--      mensaje de abajo ya escrito.
--
--   2. EL MENSAJE PARA EL CLIENTE, solo, para copiar o reenviar: el
--      saludo con su nombre, cuándo vence o venció, el enlace para renovar
--      con el precio, y los datos de su compra con la cuenta y la
--      contraseña tapadas a medias (el mismo de 21-renovar-directo-al-pago.sql).
--
-- LO NUEVO, respecto del 21
--   · El botón. Si Telegram no lo acepta (un enlace demasiado largo, por
--     ejemplo), el aviso sale igual, con el enlace escrito en el texto.
--   · Si el cliente YA RENOVÓ —el mismo producto con el mismo WhatsApp,
--     comprado desde una semana antes del vencimiento o después— no se
--     avisa: sería pedirle que pague algo que ya pagó.
--   · Si el pedido no tenía nombre, se lo saluda con el usuario con el
--     que se registró (26-registro-de-clientes.sql).
--
-- Reemplaza textos_de_vencimiento() del 21 y avisar_renovaciones() del 11.
-- Para mirar los textos de hoy sin mandar nada:
--   select * from public.textos_de_vencimiento();
-- ============================================================


-- ============================================================
-- 1. LOS TEXTOS (sin mandar nada)
-- ============================================================
-- Cambian las columnas que devuelve (se suman cliente, enlace y el aviso
-- con el enlace escrito), y eso no se puede con create or replace.
drop function if exists public.textos_de_vencimiento(integer);

create function public.textos_de_vencimiento(p_dias_antes integer default 1)
returns table (
  pedido_id        uuid,
  tipo             text,     -- 'antes' (vence mañana) o 'vencio'
  aviso            text,     -- para vos, para mandar con el botón
  mensaje          text,     -- para el cliente
  cliente          text,     -- cómo se llama, para el texto del botón
  enlace           text,     -- wa.me con el mensaje escrito (null sin WhatsApp)
  aviso_con_enlace text      -- el aviso con el enlace en el texto, si el botón no va
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_hoy      date := (now() at time zone 'America/La_Paz')::date;
  v_tienda   text;
  v_fila     record;
  v_tipo     text;
  v_cuando   text;
  v_saludo   text;
  v_cuenta   text;
  v_clave    text;
  v_duracion text;
  v_renovar  text;
  v_cierre   text;
  v_celular  text;
  v_precio   text;
  v_tel      text;
  v_cabeza   text;
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
      -- Lo que sale hoy renovar: el mismo precio que va a ver en la tienda
      case when pr.id is not null then public.precio_de_venta(pr) end as precio,
      -- El nombre del pedido o, si llegó sin, el de su registro
      coalesce(nullif(btrim(p.cliente_nombre), ''), cl.usuario) as nombre,
      regexp_replace(coalesce(p.cliente_whatsapp, ''), '\D', '', 'g') as tel,
      (p.suscripcion_vence_en - v_hoy)                       as faltan,
      coalesce(p.pagado_en, p.creado_en)                     as comprado,
      c.credenciales                                         as cred
    from public.pedidos p
    left join public.productos pr on pr.id = p.producto_id
    left join public.clientes  cl on cl.whatsapp = public.wa_normal(p.cliente_whatsapp)
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
      -- Ya renovó: el mismo producto, con el mismo WhatsApp, comprado
      -- desde una semana antes de que se le venza (o después)
      and not exists (
        select 1 from public.pedidos r
        where r.id <> p.id
          and not r.prueba
          and r.estado in ('entregado', 'sin_stock', 'pagado')
          and r.creado_en > p.creado_en
          and public.wa_normal(r.cliente_whatsapp) = public.wa_normal(p.cliente_whatsapp)
          and (r.producto_id = p.producto_id
               or (p.producto_id is null and r.producto_nombre = p.producto_nombre))
          and coalesce(r.pagado_en, r.creado_en)
              >= (p.suscripcion_vence_en - 7)::timestamp at time zone 'America/La_Paz'
      )
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

    -- Su celular sin el 591, solo si pidió que le recordemos: la tienda
    -- prende el recordatorio con ese número para la próxima vez
    v_celular := regexp_replace(v_fila.tel, '^591', '');
    if not (v_fila.renovar and v_celular ~ '^[67][0-9]{7}$') then v_celular := null; end if;

    -- "15 Bs" o "30.90 Bs", como en la tienda
    v_precio := case
      when v_fila.precio is null then null
      when v_fila.precio = trunc(v_fila.precio) then to_char(v_fila.precio, 'FM999999990')
      else to_char(v_fila.precio, 'FM999999990.00')
    end;

    -- Cómo renovar: con el enlace directo al pago si se puede comprar, o
    -- respondiendo el mensaje si no
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

    v_saludo := 'Hola' || coalesce(' ' || split_part(v_fila.nombre, ' ', 1), '') || ', te escribimos de Tiago Store.';
    v_cuenta := public.tapar_cuenta(coalesce(v_fila.cred ->> 'usuario', v_fila.cred ->> 'email'));
    v_clave  := public.tapar_texto(coalesce(v_fila.cred ->> 'clave', v_fila.cred ->> 'password'), 3, 2);

    -- 2. Lo que le mandás al cliente: primero cuándo vence y cómo renovar
    -- (es lo que se lee sin abrir el mensaje entero), después los datos
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

    -- "+591 72309304", como se lee; otros países, tal cual
    v_tel := case
      when v_fila.tel ~ '^591[0-9]{8}$' then '+591 ' || substr(v_fila.tel, 4)
      when v_fila.tel <> ''             then '+' || v_fila.tel
    end;

    -- 1. Lo que te llega a vos
    v_cabeza :=
      case
        when v_tipo = 'antes' and v_fila.faltan = 1 then 'SUSCRIPCIÓN POR VENCER: vence mañana'
        when v_tipo = 'antes'                       then 'SUSCRIPCIÓN POR VENCER: vence en ' || v_fila.faltan || ' días'
        when v_fila.faltan = 0                      then 'SUSCRIPCIÓN VENCIDA: venció hoy'
        else 'SUSCRIPCIÓN VENCIDA: venció hace ' || abs(v_fila.faltan) || ' día(s)'
      end
      || chr(10) || 'Producto: ' || v_fila.producto
      || chr(10) || 'Cliente: ' || coalesce(v_fila.nombre, 'sin nombre')
      || chr(10) || 'WhatsApp: ' || coalesce(v_tel, 'no dejó')
      || chr(10) || 'Pedido: #' || v_fila.numero
      || chr(10) || 'Comprado el ' || to_char(v_fila.comprado at time zone 'America/La_Paz', 'DD/MM/YYYY')
                 || coalesce(' · ' || v_duracion, '')
      || chr(10) || 'Vence el ' || to_char(v_fila.vence, 'DD/MM/YYYY')
      || case when not v_fila.se_vende
              then chr(10) || chr(10) || 'Ojo: el producto ya no está a la venta, el mensaje no lleva enlace para renovar.'
              else '' end;

    if v_fila.tel <> '' then
      enlace := 'https://wa.me/' || v_fila.tel || '?text='
                || replace(extensions.urlencode(mensaje), '+', '%20');
      aviso := v_cabeza || chr(10) || chr(10) ||
               'Tocá el botón para mandarle el mensaje de abajo por WhatsApp.';
      aviso_con_enlace := v_cabeza || chr(10) || chr(10) ||
               'Mandale el mensaje de abajo con este enlace:' || chr(10) || enlace;
    else
      enlace := null;
      aviso := v_cabeza || chr(10) || chr(10) ||
               'No dejó WhatsApp: el mensaje de abajo es para copiar.';
      aviso_con_enlace := aviso;
    end if;

    pedido_id := v_fila.id;
    tipo      := v_tipo;
    cliente   := v_fila.nombre;
    return next;
  end loop;
end;
$$;


-- ============================================================
-- 2. MANDARLOS POR TELEGRAM
-- ============================================================
-- Dos mensajes por suscripción: el aviso (con el botón) y abajo el
-- mensaje para el cliente solo. Se da por avisado solo si Telegram
-- aceptó el aviso; si no, se reintenta al otro día.
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
  v_boton   text;
  v_cuantos integer := 0;
  v_estado  integer;
begin
  select valor into v_token from public.ajustes where clave = 'telegram_token';
  select valor into v_chat  from public.ajustes where clave = 'telegram_chat';
  if v_token is null or v_chat is null then
    return 0;
  end if;

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');

  for v_fila in select * from public.textos_de_vencimiento(p_dias_antes) loop
    v_estado := null;

    -- Con WhatsApp: el aviso con el botón
    if v_fila.enlace is not null then
      v_boton := 'Enviar por WhatsApp a ' ||
                 coalesce(left(nullif(btrim(v_fila.cliente), ''), 40), 'el cliente');
      begin
        select (extensions.http_post(
                  'https://api.telegram.org/bot' || v_token || '/sendMessage',
                  jsonb_build_object(
                    'chat_id', v_chat,
                    'text',    v_fila.aviso,
                    'disable_web_page_preview', true,
                    'reply_markup', jsonb_build_object('inline_keyboard', jsonb_build_array(
                      jsonb_build_array(jsonb_build_object('text', v_boton, 'url', v_fila.enlace)))))::text,
                  'application/json')).status
          into v_estado;
      exception when others then
        v_estado := null;
      end;
    end if;

    -- Sin WhatsApp, o Telegram no aceptó el botón: el aviso con el
    -- enlace escrito en el texto
    if v_estado is null or v_estado not between 200 and 299 then
      begin
        select (extensions.http_post(
                  'https://api.telegram.org/bot' || v_token || '/sendMessage',
                  jsonb_build_object(
                    'chat_id', v_chat,
                    'text',    v_fila.aviso_con_enlace,
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
        null;   -- el aviso ya salió, y el botón (o el enlace) lleva el mensaje
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
-- 3. PERMISOS
-- ============================================================
-- Como las demás de avisos: nadie desde la tienda ni el panel. Las corre
-- pg_cron, que entra como dueño de la base.
revoke execute on function public.textos_de_vencimiento(integer) from public, anon, authenticated;
revoke execute on function public.avisar_renovaciones(integer)   from public, anon, authenticated;
