-- ============================================================
-- TIAGO STORE · Avisos de vencimiento por Telegram
-- ============================================================
-- Antes (06-avisos.sql): un aviso 3 días antes, solo de los clientes que
-- marcaron "¿Te recordamos renovar?", y solo si el pedido tenía fecha de
-- vencimiento. Y la fecha la anotaba únicamente la entrega automática:
-- lo que entregabas a mano desde el panel quedaba sin fecha y nunca
-- avisaba (11 clientes que pidieron el recordatorio se iban a quedar sin).
--
-- Ahora (pedido del dueño, 1/10/2026):
--   1. La fecha se anota también al entregar a mano: día de entrega más
--      los días del plan. Y se completa la de los que ya quedaron sin.
--   2. Avisa de TODAS las suscripciones, hayan pedido recordatorio o no
--      (el aviso dice si lo pidieron).
--   3. Un aviso 1 día antes ("vence mañana")…
--   4. …y otro el día que vence ("venció hoy").
--   5. Cada aviso trae, aparte, el mensaje listo para mandarle al
--      cliente: producto, fecha de compra, vencimiento y la cuenta con la
--      contraseña tapadas a medias (jbsxxxngs@gmail.com · hgdxxxgs), más
--      un enlace que abre WhatsApp con ese mensaje ya escrito.
-- Sin emojis: el dueño los quiere profesionales.
--
-- Corre solo todos los días a las 9:00 de Bolivia (el trabajo
-- "avisar-renovaciones" de pg_cron, 13:00 UTC, ver 06-avisos.sql).
--
-- OJO: textos_de_vencimiento() se reemplazó en 12-dias-en-los-avisos.sql
-- (suma "Duración: 18 días (de 30)") y después en 14-renovar-con-un-toque.sql
-- (suma el enlace "Renová acá"). Si corrés este archivo de nuevo,
-- corré después el 12 y el 14.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Lo que hace falta guardar
-- ------------------------------------------------------------
-- suscripcion_avisada_en ya existía: ahora marca el aviso de 1 día antes.
-- Esta es la del día que vence.
alter table public.pedidos
  add column if not exists suscripcion_vencida_avisada_en timestamptz;


-- ------------------------------------------------------------
-- 2. La fecha de vencimiento, también al entregar a mano
-- ------------------------------------------------------------
-- confirmar_pago() ya la pone (05-cobros.sql). El panel, al marcar
-- "entregado por WhatsApp", solo cambia el estado: este disparador la
-- completa ahí, con la misma regla. Si ya viene con fecha, no la toca.
create or replace function public.anotar_vencimiento()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.estado in ('entregado', 'sin_stock')
     and new.suscripcion_vence_en is null
     and coalesce(new.plan_dias, 0) > 0 then
    new.suscripcion_vence_en :=
      (coalesce(new.entregado_en, new.pagado_en, now()) at time zone 'America/La_Paz')::date
      + new.plan_dias;
  end if;
  return new;
end;
$$;

drop trigger if exists pedidos_anotar_vencimiento on public.pedidos;
create trigger pedidos_anotar_vencimiento
  before insert or update of estado, entregado_en on public.pedidos
  for each row execute function public.anotar_vencimiento();

-- Los que ya quedaron sin fecha: entrega (o pago) más los días del plan.
-- Si la cuenta que se le dio vence antes, gana esa, igual que en
-- confirmar_pago() (least() ignora la que no tenga fecha).
update public.pedidos p
set suscripcion_vence_en = least(
      (coalesce(p.entregado_en, p.pagado_en, p.creado_en) at time zone 'America/La_Paz')::date + p.plan_dias,
      (select min(c.vence_en) from public.cuentas c where c.pedido_id = p.id))
where p.estado in ('entregado', 'sin_stock')
  and p.suscripcion_vence_en is null
  and coalesce(p.plan_dias, 0) > 0;


-- ------------------------------------------------------------
-- 3. Tapar a medias la cuenta y la contraseña
-- ------------------------------------------------------------
-- "jbsabcdngs@gmail.com" -> "jbsxxxngs@gmail.com" · "hgdabcgs" -> "hgdxxxgs".
-- Alcanza para que el cliente reconozca cuál es, sin mandar la clave.
create or replace function public.tapar_texto(p text, p_inicio integer, p_fin integer)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p is null or btrim(p) = '' then null
    when length(p) <= p_inicio + p_fin then left(p, 1) || 'xxx'
    else left(p, p_inicio) || 'xxx' || right(p, p_fin)
  end
$$;

create or replace function public.tapar_cuenta(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p is null or btrim(p) = '' then null
    when position('@' in p) > 1
      then public.tapar_texto(split_part(p, '@', 1), 3, 3) || '@' || split_part(p, '@', 2)
    else public.tapar_texto(p, 3, 3)
  end
$$;


-- ------------------------------------------------------------
-- 4. Los textos de cada aviso (sin mandar nada)
-- ------------------------------------------------------------
-- Aparte del envío para poder mirarlos antes:
--   select * from public.textos_de_vencimiento();
-- "antes":  vence dentro de p_dias_antes días y todavía no se avisó.
-- "vencio": venció hoy (o hasta 3 días atrás, si el aviso no salió ese
--           día) y todavía no se avisó.
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
begin
  for v_fila in
    select
      p.id,
      p.numero,
      p.producto_nombre                                      as producto,
      p.suscripcion_vence_en                                 as vence,
      p.renovar,
      nullif(btrim(p.cliente_nombre), '')                    as cliente,
      regexp_replace(coalesce(p.cliente_whatsapp, ''), '\D', '', 'g') as tel,
      (p.suscripcion_vence_en - v_hoy)                       as faltan,
      coalesce(p.pagado_en, p.creado_en)                     as comprado,
      c.credenciales                                         as cred,
      p.suscripcion_avisada_en,
      p.suscripcion_vencida_avisada_en
    from public.pedidos p
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


-- ------------------------------------------------------------
-- 5. Mandarlos por Telegram
-- ------------------------------------------------------------
-- Dos mensajes por pedido: el aviso para vos, y abajo el mensaje para el
-- cliente solo, así lo copiás o lo reenviás entero. Se da por avisado
-- solo si Telegram aceptó el primero; si no, se reintenta al otro día.
drop function if exists public.avisar_renovaciones(integer);

create function public.avisar_renovaciones(p_dias_antes integer default 1)
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
begin
  select valor into v_token from public.ajustes where clave = 'telegram_token';
  select valor into v_chat  from public.ajustes where clave = 'telegram_chat';
  if v_token is null or v_chat is null then
    return 0;
  end if;

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');

  for v_fila in select * from public.textos_de_vencimiento(p_dias_antes) loop
    begin
      select (extensions.http_post(
                'https://api.telegram.org/bot' || v_token || '/sendMessage',
                jsonb_build_object(
                  'chat_id', v_chat,
                  'text',    v_fila.aviso,
                  'disable_web_page_preview', true)::text,
                'application/json')).status
        into v_estado;
    exception when others then
      v_estado := null;
    end;

    if v_estado between 200 and 299 then
      begin
        perform extensions.http_post(
          'https://api.telegram.org/bot' || v_token || '/sendMessage',
          jsonb_build_object('chat_id', v_chat, 'text', v_fila.mensaje)::text,
          'application/json');
      exception when others then
        null;   -- el aviso ya salió y trae el enlace con el mensaje
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


-- ------------------------------------------------------------
-- 6. Quién puede llamarlas
-- ------------------------------------------------------------
-- Como las demás de avisos: nadie desde la tienda ni el panel. Las corre
-- pg_cron, que entra como dueño de la base.
revoke execute on function public.avisar_renovaciones(integer)            from public, anon, authenticated;
revoke execute on function public.textos_de_vencimiento(integer)          from public, anon, authenticated;
revoke execute on function public.tapar_texto(text, integer, integer)     from public, anon, authenticated;
revoke execute on function public.tapar_cuenta(text)                      from public, anon, authenticated;
revoke execute on function public.anotar_vencimiento()                    from public, anon, authenticated;
