-- ============================================================
-- TIAGO STORE · 20 · MODO PRUEBA
-- ============================================================
-- Aplicado con las migraciones (en este orden):
--   modo_prueba_marca       secciones 1 y 2
--   modo_prueba             sección 3
--   modo_prueba_sin_avisos  secciones 4 y 5
--
-- EL PROBLEMA
--   Para ver cómo queda la tienda había que comprar de verdad: cada
--   prueba era un pedido como cualquier otro. Te avisaba por Telegram,
--   sonaba en el panel, entraba en el embudo y después había que
--   cancelarla a mano con "Prueba mía" (11 desde el 25/9).
--
-- LA FORMA
--   El panel tiene "Probar la tienda": abre la tienda con una clave
--   (index.html#prueba=<clave>). La tienda la guarda en ese navegador y
--   muestra arriba que está en modo prueba, con un botón para salir.
--   Mientras tanto:
--     · cada compra se crea marcada como prueba (pedidos.prueba)
--     · no te llega aviso por Telegram ni suena el panel
--     · no cuenta en el embudo ni en lo vendido (Inicio, Ventas, Excel)
--     · ningún pago automático de Binance se le asigna
--     · si queda esperando el pago, a las 2 horas se cancela sola
--   En Ventas se ven en "Todos", con el cartel "Prueba".
--
-- POR QUÉ UNA CLAVE Y NO UN ?prueba=1
--   Si cualquiera pudiera prender el modo prueba, un cliente que lo
--   descubriera compraría "de prueba": sin aviso, fuera de las ventas, y
--   capaz que pagando. La clave la sabe solo la base, se la da al panel
--   (al admin) y crear_compra la comprueba. Una equivocada no se toma
--   como compra de verdad: da error, porque el que la mandó cree que está
--   probando.
--
-- Las pruebas de antes quedan marcadas: las canceladas con "Prueba mía"
-- (20 al 5/10/2026) y, a mano, las dos de "Pruebita" que quedaron como
-- entregadas (#131 y #156). Y si de acá en adelante cancelás algo con ese
-- motivo, el panel también lo marca.
-- ============================================================


-- ============================================================
-- 1. LA MARCA
-- ============================================================
alter table public.pedidos add column if not exists prueba boolean not null default false;

-- Las pruebas de antes: las que cancelaste con "Prueba mía"
update public.pedidos set prueba = true where motivo = 'Prueba mía' and not prueba;


-- ============================================================
-- 2. LA CLAVE
-- ============================================================
-- Se genera una vez y vive en ajustes, que no se lee desde afuera (RLS
-- sin políticas): solo la ven las funciones de acá abajo.
insert into public.ajustes (clave, valor)
values ('clave_prueba', replace(gen_random_uuid()::text, '-', ''))
on conflict (clave) do nothing;

-- ¿Esta clave es la del modo prueba? La pregunta la tienda al entrar en
-- modo prueba, para no mostrar el cartel con una clave que no sirve.
-- Son 32 letras al azar: probar claves hasta acertar no es una opción.
create or replace function public.es_clave_de_prueba(p_clave text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    length(p_clave) = 32
    and p_clave = (select valor from public.ajustes where clave = 'clave_prueba'),
    false);
$$;

-- La clave, para el botón "Probar la tienda" del panel. Solo un admin.
create or replace function public.clave_de_prueba()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo para el panel' using errcode = '42501';
  end if;
  return (select valor from public.ajustes where clave = 'clave_prueba');
end;
$$;


-- ============================================================
-- 3. LA COMPRA DE PRUEBA
-- ============================================================
-- crear_compra recibe la clave en p_prueba. Cambia la lista de
-- parámetros, y con dos crear_compra vivas la tienda no sabría a cuál
-- llamar: la de antes se renombra a crear_compra_sin_prueba y queda sin
-- permisos. La tienda que no manda p_prueba (la publicada antes de esto)
-- sigue funcionando igual, con la nueva.
--
-- crear_compra_sin_prueba ya no la llama nadie. Se puede borrar a mano
-- desde el SQL Editor de Supabase:
--   drop function public.crear_compra_sin_prueba(jsonb, text, text, text, boolean);
alter function public.crear_compra(jsonb, text, text, text, boolean) rename to crear_compra_sin_prueba;
revoke execute on function public.crear_compra_sin_prueba(jsonb, text, text, text, boolean) from public, anon, authenticated;

create or replace function public.crear_compra(
  p_items    jsonb,
  p_nombre   text default '',
  p_whatsapp text default '',
  p_email    text default '',
  p_renovar  boolean default false,
  -- La clave del modo prueba (sección 2). Sin ella la compra es de verdad.
  p_prueba   text    default null
)
returns table (token text, grupo uuid, total numeric, cuantos integer)
language plpgsql
security definer
set search_path = public
as $$
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
  v_prueba   boolean := false;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No hay nada que comprar';
  end if;

  -- Tope de lineas distintas. Un carrito de verdad no tiene 50 productos.
  if jsonb_array_length(p_items) > 20 then
    raise exception 'Demasiados productos en un solo pedido';
  end if;

  -- Modo prueba: solo con la clave que da el panel. Una clave que no vale
  -- no se toma como compra de verdad: el que la mandó cree que está
  -- probando, y un pedido real ensuciaría justo lo que se quería cuidar.
  if coalesce(p_prueba, '') <> '' then
    if not public.es_clave_de_prueba(p_prueba) then
      raise exception 'El modo prueba ya no vale: volvé a entrar desde el panel';
    end if;
    v_prueba := true;
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
        renovar, plan_dias, prueba
      ) values (
        v_producto.id, v_producto.nombre, v_precio,
        coalesce(p_nombre,''), coalesce(p_whatsapp,''), coalesce(p_email,''),
        v_token, v_grupo,
        -- Sin número no hay a dónde escribirle: la promesa de avisar no se
        -- guarda como si fuera a cumplirse.
        coalesce(p_renovar, false) and coalesce(p_whatsapp, '') <> '',
        v_dias,
        v_prueba
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
$$;


-- ============================================================
-- 4. LAS PRUEBAS NO AVISAN, NO CUENTAN Y NO COBRAN
-- ============================================================
-- Igual que en 19-usdt-red-bsc.sql, sin las compras de prueba.
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

  if v_token is null or v_chat is null then
    return 0;
  end if;

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');

  select valor into v_panel from public.ajustes where clave = 'panel_url';

  for v_compra in
    select
      coalesce(p.grupo::text, p.id::text)                    as compra,
      min(p.numero)                                          as numero,
      count(*)                                               as cuantos,
      sum(p.precio)                                          as total,
      max(nullif(p.cliente_nombre, ''))                      as cliente,
      max(nullif(p.cliente_whatsapp, ''))                    as whatsapp,
      string_agg(
        p.producto_nombre
        || coalesce(' · ' || p.plan_dias || ' días'
             || case when p.plan_dias < public.dias_del_plan(p.producto_nombre, pr.suscripcion)
                     then ' (de ' || public.dias_del_plan(p.producto_nombre, pr.suscripcion) || ')'
                     else '' end, ''),
        chr(10) || '· ' order by p.numero)                   as productos,
      array_agg(p.id)                                        as ids,
      max(p.metodo_pago) filter (where p.metodo_pago in ('binance', 'bsc')) as metodo_usdt,
      max(p.usdt_bs)    filter (where p.metodo_pago in ('binance', 'bsc')) as usdt_bs,
      max(p.usdt_monto) filter (where p.metodo_pago in ('binance', 'bsc')) as usdt_monto
    from public.pedidos p
    left join public.productos pr on pr.id = p.producto_id
    where p.avisado_en is null
      and not p.prueba                 -- las compras de prueba no te avisan
      and p.creado_en > now() - interval '1 day'
      and p.creado_en < now() - interval '5 seconds'
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
      || case when v_compra.metodo_usdt is not null
              then chr(10) || 'Pago: ' ||
                   case when v_compra.metodo_usdt = 'bsc' then 'USDT por red BSC' else 'Binance Pay' end ||
                   ' · ' ||
                   to_char(coalesce(v_compra.usdt_monto,
                                    ceil(round(v_compra.total / nullif(v_compra.usdt_bs, 0) * 100, 6)) / 100),
                           'FM999999990.00') || ' USDT'
              else '' end
      || case when v_compra.cliente is not null or v_compra.whatsapp is not null
              then chr(10) || 'Cliente: ' ||
                   coalesce(v_compra.cliente, 'sin nombre') ||
                   coalesce(' · ' || v_compra.whatsapp, '')
              else '' end
      || chr(10) || chr(10) || 'Esperando que lo apruebes en el panel.'
      || coalesce(chr(10) || v_panel, '');

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

-- Igual que en 07-embudo.sql: "pagaron" sin las pruebas.
create or replace function public.resumen_embudo(p_dias integer default 7)
returns table (paso text, cantidad integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hoy   date := (now() at time zone 'America/La_Paz')::date;
  v_desde date;
begin
  if not public.es_admin() then
    raise exception 'Solo para el panel';
  end if;

  v_desde := v_hoy - (greatest(1, least(coalesce(p_dias, 7), 365)) - 1);

  return query
    select e.paso, count(distinct e.sesion)::integer
    from public.embudo e
    where e.dia >= v_desde
    group by e.paso

    union all

    -- Una compra de tres productos son tres pedidos del mismo grupo: cuenta
    -- una vez. Los pedidos viejos, de antes de los grupos, cuentan solos.
    select 'pagaron', count(distinct coalesce(p.grupo, p.id))::integer
    from public.pedidos p
    where p.pagado_en is not null
      and not p.prueba
      and (p.pagado_en at time zone 'America/La_Paz')::date >= v_desde;
end;
$$;

-- Igual que en 19-usdt-red-bsc.sql: un pago que entra por Binance se busca
-- solo entre las compras de verdad. Si una prueba esperaba justo ese
-- monto, el pago no se le asigna a ella (queda para revisar a mano).
create or replace function public.conciliar_pagos_usdt(p_movs jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mov     jsonb;
  v_id      text;
  v_monto   numeric;
  v_moneda  text;
  v_nombre  text;
  v_cuando  timestamptz;
  v_pagador text;
  v_compras text[];
  v_compra  text;
  v_pedido  public.pedidos;
  v_res     jsonb;
  v_estado  text;
  v_numeros text;
  v_total   numeric;
  v_cuantos integer := 0;
begin
  for v_mov in
    select m from jsonb_array_elements(coalesce(p_movs, '[]'::jsonb)) m
    order by (m ->> 'cuando')::bigint
  loop
    v_id      := v_mov ->> 'id';
    v_moneda  := v_mov ->> 'moneda';
    v_pagador := nullif(v_mov ->> 'pagador', '');
    v_nombre  := case when v_mov ->> 'origen' = 'bsc' then 'USDT por red BSC' else 'Binance Pay' end;
    begin
      v_monto  := (v_mov ->> 'monto')::numeric;
      v_cuando := to_timestamp((v_mov ->> 'cuando')::bigint / 1000.0);
    exception when others then
      continue;
    end;

    continue when v_id is null or v_monto is null or v_monto <= 0;
    continue when exists (select 1 from public.pagos_binance b where b.transaccion = v_id);

    -- Las compras en USDT que esperan justo ese monto, armadas antes del pago
    v_compras := null;
    if v_moneda = 'USDT' then
      select array_agg(distinct coalesce(p.grupo::text, p.id::text)) into v_compras
      from public.pedidos p
      where p.estado = 'esperando_pago'
        and p.metodo_pago in ('binance', 'bsc')
        and abs(p.usdt_monto - v_monto) < 0.005
        and not p.prueba               -- un pago de verdad nunca va a una prueba
        and p.creado_en <= v_cuando + interval '1 minute'
        and p.creado_en > now() - interval '48 hours';
    end if;

    if coalesce(array_length(v_compras, 1), 0) <> 1 then
      insert into public.pagos_binance (transaccion, monto, moneda, pagado_en, pagador, nota)
      values (v_id, v_monto, coalesce(v_moneda, '?'), v_cuando, v_pagador,
              case when coalesce(array_length(v_compras, 1), 0) = 0 then 'sin pedido' else 'varios pedidos' end);

      perform public.enviar_telegram(
        'Pago por ' || v_nombre || ' para revisar' || chr(10) ||
        trim(to_char(v_monto, 'FM999999990.00999999')) || ' ' || coalesce(v_moneda, '') ||
        coalesce(' de ' || v_pagador, '') || chr(10) || chr(10) ||
        case when coalesce(array_length(v_compras, 1), 0) = 0
             then 'No coincide con ningún pedido que espere pago en USDT. Si es de un cliente, confirmalo a mano en el panel.'
             else 'Coincide con más de un pedido. Confirmá a mano el que corresponde.' end);
      continue;
    end if;

    v_compra := v_compras[1];
    select * into v_pedido from public.pedidos p
    where coalesce(p.grupo::text, p.id::text) = v_compra
    order by p.numero limit 1;

    select string_agg('#' || p.numero, ' · ' order by p.numero), sum(p.precio)
      into v_numeros, v_total
    from public.pedidos p where coalesce(p.grupo::text, p.id::text) = v_compra;

    if v_pedido.grupo is not null then
      v_res := public.confirmar_compra(v_pedido.grupo, v_id, v_nombre || ' automático');
      v_estado := case when (v_res ->> 'sin_stock')::int > 0 then 'sin_stock' else 'entregado' end;
    else
      select c.estado into v_estado
      from public.confirmar_pago(v_pedido.id, v_id, v_nombre || ' automático') c;
    end if;

    insert into public.pagos_binance (transaccion, monto, moneda, pagado_en, pagador, compra, numero, nota)
    values (v_id, v_monto, v_moneda, v_cuando, v_pagador, v_compra, v_pedido.numero, 'confirmado solo');

    v_cuantos := v_cuantos + 1;

    perform public.enviar_telegram(
      'Pago por ' || v_nombre || ' confirmado solo' || chr(10) ||
      'Pedido ' || v_numeros || chr(10) ||
      trim(to_char(v_monto, 'FM999999990.00')) || ' USDT (' || to_char(v_total, 'FM999999990.00') || ' Bs)' ||
      coalesce(chr(10) || 'De: ' || v_pagador, '') || chr(10) || chr(10) ||
      case when v_estado = 'sin_stock'
           then 'No había stock para todo: lo que falta, entregalo a mano desde el panel.'
           else 'La cuenta ya se le entregó en su página.' end);
  end loop;

  return v_cuantos;
end;
$$;

-- Igual que en 17-binance-automatico.sql, más "prueba": la página del QR
-- lo muestra en el pedido.
create or replace function public.ver_mi_compra(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
    'numero',     v_pedido.numero,
    'grupo',      v_pedido.grupo,
    'total',      v_total,
    'descuento',  coalesce(v_descuento, 0),
    'moneda',     v_pedido.moneda,
    'metodo',     coalesce(v_pedido.metodo_pago, 'qr'),
    'usdt_bs',    v_pedido.usdt_bs,
    'usdt_monto', v_pedido.usdt_monto,
    'vence_en',   v_pedido.vence_en,
    'creado_en',  v_pedido.creado_en,
    'prueba',     v_pedido.prueba,
    'lineas',     coalesce(v_lineas, '[]'::jsonb)
  );
end;
$$;


-- ============================================================
-- 5. LAS PRUEBAS QUE QUEDARON ESPERANDO SE CANCELAN SOLAS
-- ============================================================
-- Una prueba no se paga: si a las 2 horas sigue esperando, se cancela
-- con el mismo motivo que le ponías a mano.
create or replace function public.cancelar_pruebas()
returns integer
language sql
security definer
set search_path = public
as $$
  with canceladas as (
    update public.pedidos
    set estado = 'cancelado', motivo = coalesce(motivo, 'Prueba mía')
    where prueba
      and estado = 'esperando_pago'
      and creado_en < now() - interval '2 hours'
    returning 1
  )
  select count(*)::integer from canceladas;
$$;

select cron.schedule('cancelar-pruebas', '23 * * * *', 'select public.cancelar_pruebas()');


-- ============================================================
-- 6. QUIÉN PUEDE LLAMAR A CADA UNA
-- ============================================================
revoke execute on function public.crear_compra(jsonb, text, text, text, boolean, text) from public, anon, authenticated;
revoke execute on function public.es_clave_de_prueba(text)  from public, anon, authenticated;
revoke execute on function public.clave_de_prueba()         from public, anon, authenticated;
revoke execute on function public.cancelar_pruebas()        from public, anon, authenticated;

grant execute on function public.crear_compra(jsonb, text, text, text, boolean, text) to anon, authenticated;
grant execute on function public.es_clave_de_prueba(text)  to anon, authenticated;
grant execute on function public.clave_de_prueba()         to authenticated;
