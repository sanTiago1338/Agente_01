-- ============================================================
-- TIAGO STORE · Los días que le quedan a una cuenta rebajada
-- ============================================================
-- Aplicado como la migración dias_de_la_rebaja.
--
-- EL PROBLEMA
--   La rebaja automática (05-cobros.sql, sección 13) baja el precio
--   porque la cuenta pasa días en el stock y esos días se le vencen. Pero
--   la tienda no lo decía: el cliente veía "Mensual" y un precio tachado,
--   pagaba pensando en 30 días y recibía 27. Y al entregar se anotaba que
--   le vencía a los 30, así que el aviso de renovación llegaba tarde.
--
-- LO QUE SE HACE AHORA
--   1. dias_de_la_proxima_cuenta(): cuántos días le quedan a la cuenta que
--      se entregaría ahora. Si al cargarla anotaste "Vencen el", es exacto;
--      si no, se estima: los días del plan menos los que lleva en el stock
--      (el mismo reloj de la rebaja).
--   2. rebajas_vigentes() devuelve además esos días y los del plan: la
--      tienda muestra "27 días (de 30)" en los planes rebajados.
--   3. crear_compra() anota en el pedido los días que de verdad le quedan
--      (plan_dias), y confirmar_pago() ya calcula el vencimiento con eso.
--   4. ver_mi_compra() devuelve los días y el vencimiento de cada cuenta,
--      para la página del QR.
--
--   Solo en los productos con la rebaja aplicada: en los demás el cliente
--   paga el precio entero y todo queda como estaba.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Cuántos días le quedan a la próxima cuenta
-- ------------------------------------------------------------
-- La misma cuenta que entregaría confirmar_pago(): la que vence antes y,
-- entre las que no tienen fecha, la más vieja. null si no hay stock.
create or replace function public.dias_de_la_proxima_cuenta(p_producto public.productos)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cuenta public.cuentas%rowtype;
  v_plan   integer := public.dias_del_plan(p_producto.nombre, p_producto.suscripcion);
begin
  select * into v_cuenta
  from public.cuentas c
  where c.producto_id = p_producto.id and c.estado = 'libre'
  order by coalesce(c.vence_en, 'infinity'::date), c.creada_en
  limit 1;

  if not found then
    return null;
  end if;

  -- Con la fecha anotada al cargarla, es exacto
  if v_cuenta.vence_en is not null then
    return greatest(1, least(v_plan, v_cuenta.vence_en - current_date));
  end if;

  -- Sin fecha: los días del plan menos los que ya pasó en el stock
  return greatest(1, least(v_plan,
    v_plan - floor(extract(epoch from now() - v_cuenta.creada_en) / 86400)::integer));
end;
$$;

revoke execute on function public.dias_de_la_proxima_cuenta(public.productos) from public, anon, authenticated;


-- ------------------------------------------------------------
-- 2. La tienda: rebaja de hoy, días que le quedan y días del plan
-- ------------------------------------------------------------
-- Cambia lo que devuelve, así que hay que borrarla y crearla de nuevo
-- (y volver a darle el permiso a la tienda).
drop function if exists public.rebajas_vigentes();

create function public.rebajas_vigentes()
returns table (producto_id uuid, rebaja numeric, dias integer, dias_plan integer)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.rebaja, r.dias, r.dias_plan
  from (
    select p.id,
           public.rebaja_de_stock(p)                     as rebaja,
           public.dias_de_la_proxima_cuenta(p)           as dias,
           public.dias_del_plan(p.nombre, p.suscripcion) as dias_plan
    from public.productos p
    where p.rebaja_auto and p.activo is not false
  ) r
  where r.rebaja > 0;
$$;

revoke execute on function public.rebajas_vigentes() from public, anon, authenticated;
grant  execute on function public.rebajas_vigentes() to anon, authenticated;


-- ------------------------------------------------------------
-- 3. crear_compra(): se anotan los días que de verdad le quedan
-- ------------------------------------------------------------
create or replace function public.crear_compra(p_items jsonb, p_nombre text default ''::text, p_whatsapp text default ''::text, p_email text default ''::text, p_renovar boolean default false)
 returns table(token text, grupo uuid, total numeric, cuantos integer)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_item     jsonb;
  v_producto public.productos%rowtype;
  v_precio   numeric(10,2);
  v_cant     integer;
  v_dias     integer;
  v_grupo    uuid := gen_random_uuid();
  v_token    text;
  v_primero  text := null;
  v_total    numeric(10,2) := 0;
  v_cuantos  integer := 0;
  i          integer;
  -- Descuento combo: 4 Bs fijos con 2 productos o más. El mismo número
  -- está en js/tienda.js (DESCUENTO_COMBO): si cambiás uno, cambiá el otro,
  -- o el carrito va a mostrar un total y el QR otro.
  c_descuento_combo constant numeric(10,2) := 4.00;
  v_mas_caro uuid;
  v_desc     numeric(10,2);
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No hay nada que comprar';
  end if;

  -- Tope de lineas distintas. Un carrito de verdad no tiene 50 productos.
  if jsonb_array_length(p_items) > 20 then
    raise exception 'Demasiados productos en un solo pedido';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_producto
    from public.productos
    where id = (v_item->>'producto_id')::uuid;

    if not found then
      raise exception 'Uno de los productos no existe';
    end if;

    if v_producto.activo = false then
      raise exception 'El producto "%" esta agotado', v_producto.nombre;
    end if;

    v_cant := greatest(1, least(10, coalesce((v_item->>'cantidad')::integer, 1)));

    -- La oferta si está activa, menos la rebaja por stock que no se vende
    -- (sección 13). El que cobra es este, no el que mandó el navegador.
    v_precio := public.precio_de_venta(v_producto);

    -- Cuánto le dura. Se calcula acá y no en el navegador: el cliente
    -- podría mandar cualquier número, y de esta fecha depende cuándo le
    -- avisamos que renueve.
    v_dias := public.dias_del_plan(v_producto.nombre, v_producto.suscripcion);

    -- Rebajado porque la cuenta ya pasó días en el stock: se anota lo que
    -- de verdad le queda, lo mismo que le dijo la tienda ("27 días de 30").
    if public.rebaja_de_stock(v_producto) > 0 then
      v_dias := least(v_dias, coalesce(public.dias_de_la_proxima_cuenta(v_producto), v_dias));
    end if;

    -- Un pedido por unidad: cada uno se lleva su propia cuenta.
    for i in 1..v_cant loop
      v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
      if v_primero is null then v_primero := v_token; end if;

      insert into public.pedidos (
        producto_id, producto_nombre, precio,
        cliente_nombre, cliente_whatsapp, cliente_email, token, grupo,
        renovar, plan_dias
      ) values (
        v_producto.id, v_producto.nombre, v_precio,
        coalesce(p_nombre,''), coalesce(p_whatsapp,''), coalesce(p_email,''),
        v_token, v_grupo,
        -- Sin número no hay a dónde escribirle: la promesa de avisar no se
        -- guarda como si fuera a cumplirse.
        coalesce(p_renovar, false) and coalesce(p_whatsapp, '') <> '',
        v_dias
      );

      v_total   := v_total + v_precio;
      v_cuantos := v_cuantos + 1;
    end loop;
  end loop;

  -- DESCUENTO COMBO: con 2 unidades o más (cualquier producto, aunque sea
  -- el mismo repetido) se descuentan 4 Bs fijos, lleve 2 o 10.
  -- Va entero en el pedido más caro: su precio queda en lo que se cobra de
  -- verdad y "descuento" guarda cuánto se le sacó. Así la suma de precio
  -- del grupo es lo que paga el cliente, y el QR (ver_mi_compra), el aviso
  -- de Telegram y lo vendido del panel quedan bien sin tocarlos.
  -- Todo pasa en esta misma llamada: nadie llega a ver el grupo sin el
  -- descuento aplicado.
  if v_cuantos >= 2 then
    select p.id, least(c_descuento_combo, p.precio)
      into v_mas_caro, v_desc
    from public.pedidos p
    where p.grupo = v_grupo
    order by p.precio desc, p.numero
    limit 1;

    update public.pedidos
    set precio = precio - v_desc, descuento = v_desc
    where id = v_mas_caro;

    v_total := v_total - v_desc;
  end if;

  return query select v_primero, v_grupo, v_total, v_cuantos;
end;
$function$;


-- ------------------------------------------------------------
-- 4. ver_mi_compra(): los días y el vencimiento de cada cuenta
-- ------------------------------------------------------------
--   dias      los que se le prometieron al comprar (plan_dias)
--   dias_plan los del plan entero, para decir "27 días (de 30)"
--   vence     cuándo se le vence, anotado al entregar
create or replace function public.ver_mi_compra(p_token text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pedido    public.pedidos%rowtype;
  v_lineas    jsonb;
  v_total     numeric(10,2);
  v_descuento numeric(10,2);
begin
  if p_token is null or length(p_token) < 32 then
    return jsonb_build_object('error', 'token invalido');
  end if;

  select * into v_pedido from public.pedidos where token = p_token;
  if not found then
    return jsonb_build_object('error', 'no existe');
  end if;

  -- "precio" es lo que se cobra (ya con el descuento combo) y "descuento"
  -- lo que se le sacó: la página del QR muestra el precio normal
  -- (precio + descuento) y aparte la línea del descuento.
  select
    jsonb_agg(jsonb_build_object(
      'numero',       p.numero,
      'producto',     p.producto_nombre,
      'producto_id',  p.producto_id,
      'precio',       p.precio,
      'descuento',    p.descuento,
      'estado',       p.estado,
      'entregado_en', p.entregado_en,
      'dias',         p.plan_dias,
      'dias_plan',    (select public.dias_del_plan(pr.nombre, pr.suscripcion)
                       from public.productos pr where pr.id = p.producto_id),
      'vence',        p.suscripcion_vence_en,
      -- Las credenciales SOLO de los que ya estan entregados.
      'credenciales', case when p.estado = 'entregado' then (
        select c.credenciales from public.cuentas c
        where c.pedido_id = p.id and c.estado = 'entregada' limit 1
      ) else null end
    ) order by p.numero),
    sum(p.precio),
    sum(p.descuento)
  into v_lineas, v_total, v_descuento
  from public.pedidos p
  where (v_pedido.grupo is not null and p.grupo = v_pedido.grupo)
     or (v_pedido.grupo is null     and p.id    = v_pedido.id);

  return jsonb_build_object(
    'numero',    v_pedido.numero,          -- el primero, para nombrar la compra
    'grupo',     v_pedido.grupo,
    'total',     v_total,
    'descuento', coalesce(v_descuento, 0),
    'moneda',    v_pedido.moneda,
    'vence_en',  v_pedido.vence_en,
    'creado_en', v_pedido.creado_en,
    'lineas',    coalesce(v_lineas, '[]'::jsonb)
  );
end;
$function$;
