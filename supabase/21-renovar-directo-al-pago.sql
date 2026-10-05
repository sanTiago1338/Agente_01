-- ============================================================
-- TIAGO STORE · 21 · RENOVAR DIRECTO AL PAGO
-- ============================================================
-- Aplicado con la migración:
--   renovar_directo_al_pago   (5/10/2026, después de publicar la tienda)
-- OJO: va DESPUÉS de publicar la tienda que entiende #renovar=
-- (renovarDesdeElLink en js/tienda.js). Con la tienda de antes, el
-- enlace abre la tienda y nada más.
--
-- EL PROBLEMA
--   El mensaje de vencimiento (14-renovar-con-un-toque.sql) traía un
--   enlace, pero abajo de todo, después de los datos de la compra, y el
--   enlace abría el CARRITO: sumaba el producto a lo que hubiera quedado
--   de la compra anterior y todavía faltaban dos pantallas para pagar.
--
-- LO NUEVO
--   · El enlace va arriba, justo después de cuándo vence, con el precio.
--   · Abre la tienda directo en "Pagar" con ese producto solo
--     (#renovar=<producto>): elige cómo pagar, acepta y listo.
--   · Si la otra vez pidió que le recordemos, el enlace lleva su número
--     (&wa=<8 números>) y el recordatorio ya sale prendido: así le
--     avisamos también el mes que viene.
--   · Las compras de prueba (20-modo-prueba.sql) no avisan.
--
-- Cómo queda (el producto todavía se vende):
--
--   Hola Ana, te escribimos de Tiago Store.
--
--   Tu suscripción de Netflix Premium 4K (1 pantalla) vence mañana, 06/10/2026.
--
--   Renovala con un toque: abrí este enlace, pagás con QR (30.90 Bs) y listo.
--   https://santiago1338.github.io/Agente_01/#renovar=<producto>&wa=72309304
--
--   Datos de tu compra:
--   Pedido: #123
--   ...
--
--   ¿Dudas? Respondé este mensaje y te ayudamos.
--
-- Reemplaza textos_de_vencimiento() de 14-renovar-con-un-toque.sql.
-- avisar_renovaciones() (11) no cambia: sigue mandando aviso + mensaje.
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
  v_renovar  text;
  v_cierre   text;
  v_celular  text;
  v_precio   text;
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

    v_saludo := 'Hola' || coalesce(' ' || split_part(v_fila.cliente, ' ', 1), '') || ', te escribimos de Tiago Store.';
    v_cuenta := public.tapar_cuenta(coalesce(v_fila.cred ->> 'usuario', v_fila.cred ->> 'email'));
    v_clave  := public.tapar_texto(coalesce(v_fila.cred ->> 'clave', v_fila.cred ->> 'password'), 3, 2);

    -- Lo que le mandás al cliente: primero cuándo vence y cómo renovar
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
