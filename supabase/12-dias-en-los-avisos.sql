-- ============================================================
-- TIAGO STORE · Los días que compró, en los avisos
-- ============================================================
-- Una cuenta rebajada dura menos que el plan: "18 días (de 30)". El
-- pedido ya guarda los días de verdad (plan_dias, ver 08-dias-de-la-
-- rebaja.sql) y el vencimiento sale de ahí, así que el aviso llega a los
-- 18 días y no a los 30. Lo que faltaba era DECIRLO:
--   · el aviso de pedido nuevo decía "· 18 días": ahora "· 18 días (de 30)",
--     y sin el emoji del carrito;
--   · los avisos de vencimiento (y el mensaje para el cliente) no decían
--     cuánto había comprado: ahora traen "Duración: 18 días (de 30)".
-- (El comprobante que manda el cliente por WhatsApp lo dice desde
-- pagar-qr.html.)
--
-- Reemplaza avisar_pedidos_nuevos() de 06-avisos.sql y
-- textos_de_vencimiento() de 11-avisos-de-vencimiento.sql.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Pedido nuevo
-- ------------------------------------------------------------
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
      -- Cada producto con cuánto tiempo compró: "· 30 días", o en un plan
      -- rebajado "· 18 días (de 30)"
      string_agg(
        p.producto_nombre
        || coalesce(' · ' || p.plan_dias || ' días'
             || case when p.plan_dias < public.dias_del_plan(p.producto_nombre, pr.suscripcion)
                     then ' (de ' || public.dias_del_plan(p.producto_nombre, pr.suscripcion) || ')'
                     else '' end, ''),
        chr(10) || '· ' order by p.numero)                   as productos,
      array_agg(p.id)                                        as ids
    from public.pedidos p
    left join public.productos pr on pr.id = p.producto_id
    where p.avisado_en is null
      -- Si esto estuvo apagado una semana, no se despierta con 200 mensajes
      and p.creado_en > now() - interval '1 day'
    group by 1
    order by 2
  loop
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

    if v_estado between 200 and 299 then
      update public.pedidos set avisado_en = now() where id = any(v_compra.ids);
      v_cuantos := v_cuantos + 1;
    end if;
  end loop;

  return v_cuantos;
end;
$$;


-- ------------------------------------------------------------
-- 2. Vencimiento: los mismos textos de 11, con la duración
-- ------------------------------------------------------------
create or replace function public.textos_de_vencimiento(p_dias_antes integer default 1)
returns table (pedido_id uuid, tipo text, aviso text, mensaje text)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_hoy  date := (now() at time zone 'America/La_Paz')::date;
  v_fila record;
  v_tipo text;
  v_cuando text;
  v_saludo text;
  v_cuenta text;
  v_clave text;
  v_duracion text;
begin
  for v_fila in
    select
      p.id,
      p.numero,
      p.producto_nombre                                      as producto,
      p.suscripcion_vence_en                                 as vence,
      p.renovar,
      p.plan_dias                                            as dias,
      public.dias_del_plan(p.producto_nombre, pr.suscripcion) as dias_plan,
      nullif(btrim(p.cliente_nombre), '')                    as cliente,
      regexp_replace(coalesce(p.cliente_whatsapp, ''), '\D', '', 'g') as tel,
      (p.suscripcion_vence_en - v_hoy)                       as faltan,
      coalesce(p.pagado_en, p.creado_en)                     as comprado,
      c.credenciales                                         as cred
    from public.pedidos p
    left join public.productos pr on pr.id = p.producto_id
    left join lateral (
      select c.credenciales from public.cuentas c
      where c.pedido_id = p.id
      order by c.entregada_en desc nulls last
      limit 1
    ) c on true
    where p.estado in ('entregado', 'sin_stock')
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
    order by p.suscripcion_vence_en, p.numero
  loop
    v_tipo := case when v_fila.vence > v_hoy then 'antes' else 'vencio' end;

    v_cuando := case
      when v_tipo = 'antes' and v_fila.faltan = 1 then 'vence mañana, ' || to_char(v_fila.vence, 'DD/MM/YYYY')
      when v_tipo = 'antes'                       then 'vence el ' || to_char(v_fila.vence, 'DD/MM/YYYY')
      when v_fila.faltan = 0                      then 'venció hoy, ' || to_char(v_fila.vence, 'DD/MM/YYYY')
      else                                             'venció el ' || to_char(v_fila.vence, 'DD/MM/YYYY')
    end;

    -- "18 días (de 30)" si compró una cuenta rebajada, si no "30 días"
    v_duracion := case
      when v_fila.dias is null then null
      when v_fila.dias_plan > v_fila.dias then v_fila.dias || ' días (de ' || v_fila.dias_plan || ')'
      else v_fila.dias || ' días'
    end;

    v_saludo := 'Hola' || coalesce(' ' || split_part(v_fila.cliente, ' ', 1), '') || ', te escribimos de Tiago Store.';
    v_cuenta := public.tapar_cuenta(coalesce(v_fila.cred ->> 'usuario', v_fila.cred ->> 'email'));
    v_clave  := public.tapar_texto(coalesce(v_fila.cred ->> 'clave', v_fila.cred ->> 'password'), 3, 2);

    -- Lo que le mandás al cliente
    mensaje :=
      v_saludo || chr(10) || chr(10) ||
      'Tu suscripción de ' || v_fila.producto || ' ' || v_cuando || '.' || chr(10) || chr(10) ||
      'Datos de tu compra:' || chr(10) ||
      'Pedido: #' || v_fila.numero || chr(10) ||
      'Fecha de compra: ' || to_char(v_fila.comprado at time zone 'America/La_Paz', 'DD/MM/YYYY') || chr(10) ||
      coalesce('Duración: ' || v_duracion || chr(10), '') ||
      'Vencimiento: ' || to_char(v_fila.vence, 'DD/MM/YYYY') ||
      coalesce(chr(10) || 'Cuenta: ' || v_cuenta, '') ||
      coalesce(chr(10) || 'Contraseña: ' || v_clave, '') || chr(10) || chr(10) ||
      '¿Querés renovarla? Respondé este mensaje y te la dejamos lista.';

    -- Lo que te llega a vos
    aviso :=
      case
        when v_tipo = 'antes' and v_fila.faltan = 1 then 'SUSCRIPCIÓN POR VENCER: vence mañana'
        when v_tipo = 'antes'                       then 'SUSCRIPCIÓN POR VENCER: vence en ' || v_fila.faltan || ' días'
        when v_fila.faltan = 0                      then 'SUSCRIPCIÓN VENCIDA: venció hoy'
        else 'SUSCRIPCIÓN VENCIDA: venció hace ' || abs(v_fila.faltan) || ' día(s)'
      end
      || chr(10) || v_fila.producto
      || coalesce(chr(10) || 'Compró ' || v_duracion, '')
      || chr(10) || coalesce(v_fila.cliente, 'Sin nombre') || ' · ' || coalesce(nullif(v_fila.tel, ''), 'sin WhatsApp')
      || chr(10) || 'Pedido #' || v_fila.numero
      || ' · comprado el ' || to_char(v_fila.comprado at time zone 'America/La_Paz', 'DD/MM/YYYY')
      || ' · vence el ' || to_char(v_fila.vence, 'DD/MM/YYYY')
      || chr(10) || case when v_fila.renovar then 'Pidió que le recordemos renovar.' else 'No pidió recordatorio.' end
      || case when v_fila.tel <> ''
           then chr(10) || chr(10) || 'Mandale el mensaje de abajo con este enlace:' || chr(10)
                || 'https://wa.me/' || v_fila.tel || '?text='
                || replace(extensions.urlencode(mensaje), '+', '%20')
           else chr(10) || chr(10) || 'No dejó WhatsApp: el mensaje de abajo es para copiar.'
         end;

    pedido_id := v_fila.id;
    tipo      := v_tipo;
    return next;
  end loop;
end;
$$;

revoke execute on function public.avisar_pedidos_nuevos()          from public, anon, authenticated;
revoke execute on function public.textos_de_vencimiento(integer)   from public, anon, authenticated;
