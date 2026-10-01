-- ============================================================
-- TIAGO STORE · Renovar con un toque desde el aviso
-- ============================================================
-- El mensaje de vencimiento que se le manda al cliente (11 y 12) ahora
-- trae un enlace "Renová acá": abre la tienda con ese mismo producto ya
-- en el carrito, listo para pagar con QR. Es el mismo enlace que usa
-- "Comprar de nuevo" en Mis compras (index.html#comprar=<producto>, lo
-- arma recomprarDesdeElLink en js/tienda.js).
--
-- Solo va si el producto sigue a la venta y tiene precio: si no, la
-- tienda no lo pondría en el carrito y el cliente vería la tienda vacía.
-- Ahí queda el "respondé este mensaje" de siempre.
--
-- La dirección de la tienda sale de ajustes ('tienda_url') y, si no
-- está, es la de GitHub Pages.
--
-- Reemplaza textos_de_vencimiento() de 12-dias-en-los-avisos.sql.
-- ============================================================

create or replace function public.textos_de_vencimiento(p_dias_antes integer default 1)
returns table (pedido_id uuid, tipo text, aviso text, mensaje text)
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
  v_cierre text;
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

    v_duracion := case
      when v_fila.dias is null then null
      when v_fila.dias_plan > v_fila.dias then v_fila.dias || ' días (de ' || v_fila.dias_plan || ')'
      else v_fila.dias || ' días'
    end;

    -- Cómo renovar: con el enlace a la tienda si se puede comprar, o
    -- respondiendo el mensaje si no
    v_cierre := case
      when v_fila.se_vende then
        '¿Querés renovarla? Hacelo acá con un toque, pagás con QR y listo:' || chr(10) ||
        v_tienda || 'index.html#comprar=' || v_fila.producto_id || chr(10) || chr(10) ||
        'O respondé este mensaje y te ayudamos.'
      else
        '¿Querés renovarla? Respondé este mensaje y te la dejamos lista.'
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
      v_cierre;

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
      || case when not v_fila.se_vende then chr(10) || 'Ojo: el producto ya no está a la venta, el mensaje no lleva enlace para renovar.' else '' end
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

revoke execute on function public.textos_de_vencimiento(integer) from public, anon, authenticated;
