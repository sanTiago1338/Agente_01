-- ============================================================
-- TIAGO STORE · 07 · DÓNDE SE CAE LA VENTA
-- ============================================================
-- Aplicado con la migración:
--   embudo_de_ventas
--
-- EL PROBLEMA
--   Se sabía cuántos compraron, pero no cuántos estuvieron a punto. Sin
--   eso no hay forma de saber qué paso mejorar: si la gente abre el
--   carrito y no sigue, el problema es el precio o el carrito; si llega al
--   QR y no paga, es el pago.
--
-- LA FORMA
--   La tienda anota tres pasos de la compra:
--     carrito → abrió el carrito con algo adentro
--     pago    → llegó al paso 3, "Pagar con QR"
--     qr      → tocó "Pagar con QR" y fue a la página del QR
--   Y el cuarto, "pagaron", sale de los pedidos: compras con el pago
--   confirmado. El panel (Inicio) lo muestra como un embudo.
--
-- QUÉ SE GUARDA
--   Un número al azar por navegador (no dice quién es), el día y el paso.
--   Nada más: ni productos, ni montos, ni IP. Cada navegador cuenta una
--   vez por paso y por día, así recargar la página no infla nada.

-- ============================================================
-- 1. LA TABLA
-- ============================================================
-- Con RLS: la tienda no la lee ni la escribe directo (anota con la
-- función de abajo), y del panel solo la ve un admin.
create table if not exists public.embudo (
  id        bigint generated always as identity primary key,
  -- El día de Bolivia, no el de Greenwich: una compra a las 9 de la
  -- noche es de hoy, no de mañana.
  dia       date not null default (now() at time zone 'America/La_Paz')::date,
  sesion    text not null check (length(sesion) between 8 and 64),
  paso      text not null check (paso in ('carrito', 'pago', 'qr')),
  creado_en timestamptz not null default now(),
  unique (dia, sesion, paso)
);

alter table public.embudo enable row level security;

revoke all on public.embudo from anon, authenticated;
grant select on public.embudo to authenticated;

drop policy if exists "solo admin ve el embudo" on public.embudo;
create policy "solo admin ve el embudo"
  on public.embudo for select
  to authenticated
  using (public.es_admin());


-- ============================================================
-- 2. ANOTAR UN PASO (la llama la tienda)
-- ============================================================
-- El mismo paso del mismo navegador en el mismo día se anota una sola
-- vez (on conflict do nothing). Tope de 5.000 anotaciones por día: la
-- tienda no llega ni cerca, y si alguien se pusiera a llamar esto en un
-- bucle, la tabla no crece sin límite.
create or replace function public.anotar_paso(p_sesion text, p_paso text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.embudo (sesion, paso)
  select p_sesion, p_paso
  where p_paso in ('carrito', 'pago', 'qr')
    and length(coalesce(p_sesion, '')) between 8 and 64
    and (select count(*) from public.embudo
         where dia = (now() at time zone 'America/La_Paz')::date) < 5000
  on conflict do nothing;
$$;


-- ============================================================
-- 3. EL RESUMEN (lo pide el panel)
-- ============================================================
-- Cuántos navegadores llegaron a cada paso en los últimos p_dias días
-- (hoy incluido), y cuántas compras se pagaron en ese tiempo.
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
      and (p.pagado_en at time zone 'America/La_Paz')::date >= v_desde;
end;
$$;


-- ============================================================
-- 4. QUIÉN PUEDE LLAMAR A CADA UNA
-- ============================================================
revoke execute on function public.anotar_paso(text, text)  from public, anon, authenticated;
revoke execute on function public.resumen_embudo(integer)  from public, anon, authenticated;

grant execute on function public.anotar_paso(text, text)  to anon, authenticated;
grant execute on function public.resumen_embudo(integer)  to authenticated;
