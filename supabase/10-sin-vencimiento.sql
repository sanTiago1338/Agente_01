-- ============================================================
-- TIAGO STORE · Los pedidos ya no se vencen solos
-- ============================================================
-- Hasta acá, un pedido que esperaba pago pasaba solo a 'vencido' a las
-- 24 horas (el trabajo "vencer-pedidos" de pg_cron, cada 15 minutos; ver
-- 05-cobros.sql, 8b). Así se fue de "Para atender" el #121 sin que nadie
-- lo mirara, y el cliente todavía podía estar por pagar.
--
-- Ahora un pedido que espera pago se queda esperando hasta que lo cierres
-- vos desde el panel con la X (cancelar, con su motivo). Nada lo saca
-- solo de la lista.
--
-- Se apaga solo el trabajo programado. La función vencer_pedidos() queda
-- en la base sin que nadie la llame, por si algún día se la quiere correr
-- a mano (select public.vencer_pedidos(); desde el SQL Editor).
--
-- Los que ya estaban vencidos no se tocan: siguen en 'vencido'. El panel
-- los sigue dejando confirmar si el cliente paga tarde.
-- ============================================================

-- unschedule tira error si el trabajo ya no existe: el bloque deja correr
-- este archivo dos veces sin romperse.
do $$
begin
  perform cron.unschedule('vencer-pedidos');
exception
  when others then null;
end;
$$;

-- Para comprobar que ya no está:
--   select jobname, schedule, active from cron.job;
