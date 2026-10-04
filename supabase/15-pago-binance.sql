-- ============================================================
-- TIAGO STORE · Pagar con Binance Pay (USDT)
-- ============================================================
-- Dos formas de pagar: el QR del banco en bolivianos (la de siempre) y
-- Binance Pay en USDT. La tienda muestra los precios en Bs o en USDT (un
-- selector arriba), y en la página de pago el cliente elige cuál de los
-- dos QR usa. Confirmar el pago sigue siendo a mano desde el panel, igual
-- que con el banco.
--
-- Lo que se guarda:
--   · en ajustes, lo que cargás desde el panel (Ventas → Cobros):
--       usdt_bs         cuántos Bs vale 1 USDT (arranca en 10)
--       binance_qr      la imagen de tu QR de Binance Pay
--       binance_pay_id  tu Pay ID, para que el cliente lo pueda copiar
--   · en cada pedido, cómo eligió pagar (metodo_pago: 'qr' o 'binance')
--     y, si fue Binance, a cuánto estaba el USDT (usdt_bs), así el monto
--     que se le pidió queda escrito aunque después cambies el tipo.
-- ============================================================

alter table public.pedidos add column if not exists usdt_bs numeric(10,2);

insert into public.ajustes (clave, valor)
values ('usdt_bs', '10')
on conflict (clave) do nothing;


-- ------------------------------------------------------------
-- 1. Lo que la tienda necesita saber (sin el token de Telegram)
-- ------------------------------------------------------------
-- ajustes no se lee desde la tienda: ahí también vive el token del bot.
-- Esta función devuelve solo lo del cobro.
create or replace function public.datos_de_cobro()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'usdt_bs',        coalesce(nullif((select valor from public.ajustes where clave = 'usdt_bs'), '')::numeric, 10),
    'binance_qr',     nullif((select valor from public.ajustes where clave = 'binance_qr'), ''),
    'binance_pay_id', nullif((select valor from public.ajustes where clave = 'binance_pay_id'), '')
  )
$$;

revoke execute on function public.datos_de_cobro() from public;
grant  execute on function public.datos_de_cobro() to anon, authenticated;


-- ------------------------------------------------------------
-- 2. Guardarlo desde el panel (solo el admin)
-- ------------------------------------------------------------
create or replace function public.guardar_datos_de_cobro(
  p_usdt_bs        numeric,
  p_binance_pay_id text,
  p_binance_qr     text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.es_admin() then
    raise exception 'Solo el administrador puede cambiar los datos de cobro' using errcode = '42501';
  end if;

  if p_usdt_bs is null or p_usdt_bs <= 0 or p_usdt_bs > 1000 then
    raise exception 'El tipo de cambio tiene que ser un número mayor a 0 (por ejemplo 10)';
  end if;

  insert into public.ajustes (clave, valor) values
    ('usdt_bs',        trim(to_char(p_usdt_bs, 'FM999990.00'))),
    ('binance_pay_id', coalesce(btrim(p_binance_pay_id), '')),
    ('binance_qr',     coalesce(btrim(p_binance_qr), ''))
  on conflict (clave) do update set valor = excluded.valor, actualizado_en = now();

  return public.datos_de_cobro();
end;
$$;

revoke execute on function public.guardar_datos_de_cobro(numeric, text, text) from public, anon;
grant  execute on function public.guardar_datos_de_cobro(numeric, text, text) to authenticated;


-- ------------------------------------------------------------
-- 3. El cliente elige cómo paga (desde la página del QR)
-- ------------------------------------------------------------
-- Con el token del pedido, como ver_mi_compra(): quien tiene el link es
-- el dueño del pedido. Cambia toda la compra (todas las líneas del mismo
-- grupo) y solo mientras espera el pago: uno ya pagado no se toca.
create or replace function public.elegir_metodo_pago(p_token text, p_metodo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido public.pedidos;
  v_tasa   numeric;
begin
  if p_metodo not in ('qr', 'binance') then
    raise exception 'Método de pago desconocido';
  end if;

  select * into v_pedido from public.pedidos where token = p_token;
  if not found then
    raise exception 'No existe ese pedido';
  end if;

  v_tasa := (public.datos_de_cobro() ->> 'usdt_bs')::numeric;

  update public.pedidos set
    metodo_pago = p_metodo,
    usdt_bs     = case when p_metodo = 'binance' then v_tasa else null end
  where coalesce(grupo::text, id::text) = coalesce(v_pedido.grupo::text, v_pedido.id::text)
    and estado = 'esperando_pago';

  return jsonb_build_object('metodo', p_metodo,
                            'usdt_bs', case when p_metodo = 'binance' then v_tasa end);
end;
$$;

revoke execute on function public.elegir_metodo_pago(text, text) from public;
grant  execute on function public.elegir_metodo_pago(text, text) to anon, authenticated;


-- ------------------------------------------------------------
-- 4. La página del QR se entera de cómo eligió pagar
-- ------------------------------------------------------------
-- Igual que antes, más 'metodo' y 'usdt_bs': el cliente que vuelve por el
-- link de su pedido ve el mismo QR (y el mismo monto en USDT) que eligió.
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
    'metodo',    coalesce(v_pedido.metodo_pago, 'qr'),
    'usdt_bs',   v_pedido.usdt_bs,
    'vence_en',  v_pedido.vence_en,
    'creado_en', v_pedido.creado_en,
    'lineas',    coalesce(v_lineas, '[]'::jsonb)
  );
end;
$$;


-- ------------------------------------------------------------
-- 5. El aviso de Telegram dice si eligió Binance Pay
-- ------------------------------------------------------------
-- Igual que antes, más el renglón "Pago: Binance Pay · 4.50 USDT", que es
-- lo que tenés que ver entrar en tu Binance. El cliente elige el método un
-- segundo después de crear el pedido: por eso se esperan 5 segundos antes
-- de avisar, así el aviso ya sale con el método bien.
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
      max(p.usdt_bs) filter (where p.metodo_pago = 'binance') as usdt_bs
    from public.pedidos p
    left join public.productos pr on pr.id = p.producto_id
    where p.avisado_en is null
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
      -- Lo mismo que calcula la tienda: hacia arriba, al centavo
      || case when v_compra.usdt_bs > 0
              then chr(10) || 'Pago: Binance Pay · ' ||
                   to_char(ceil(round(v_compra.total / v_compra.usdt_bs * 100, 6)) / 100, 'FM999999990.00') ||
                   ' USDT'
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
