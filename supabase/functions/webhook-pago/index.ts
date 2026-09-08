// ============================================================
// TIAGO STORE · Webhook de pagos
// ============================================================
// La URL que le das a la pasarela para que te avise cuando entra plata.
// Cuando llega un aviso valido, entrega la cuenta sola: el cliente la ve
// aparecer en su pantalla sin que vos toques nada.
//
// COMO ESTA PARTIDO Y POR QUE
//   Todo lo de seguridad y entrega esta escrito y probado. Lo unico que
//   depende de la pasarela es UNA funcion, leerAviso(), que traduce SU
//   formato de mensaje al nuestro. Esta marcada bien abajo.
//
//   Se hizo asi porque OpenBCB no publica documentacion tecnica: hay
//   comunicados de prensa del lanzamiento y nada mas. Cuando te den las
//   credenciales y el manual, se completa esa funcion y listo. Y si al
//   final elegis otra pasarela, se cambia esa misma funcion.
//
// COMO AVERIGUAR EL FORMATO SIN QUE TE LO EXPLIQUEN
//   Esta funcion GUARDA el cuerpo de todo lo que le llega en los logs,
//   incluso lo que rechaza. Cuando la pasarela mande su primer aviso de
//   prueba, entra a Supabase, Edge Functions, webhook-pago, Logs, y vas a
//   ver el JSON exacto que manda. Con eso se completa leerAviso() sin
//   adivinar nada.
//
// FALLA CERRADA, A PROPOSITO
//   Si falta el secreto, esta funcion no hace NADA y devuelve 503. Es
//   preferible que no ande a que ande sin proteccion: una URL publica que
//   entrega cuentas sin verificar quien la llama es un regalo.
//
// CONFIGURACION (una sola vez, cuando tengas los datos de la pasarela)
//   Supabase, Edge Functions, webhook-pago, Secrets:
//     WEBHOOK_SECRETO   una clave larga inventada por vos. La misma que
//                       le cargas a la pasarela para que la mande.
//   SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya vienen puestas solas.
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SECRETO      = Deno.env.get("WEBHOOK_SECRETO");

// Las pasarelas reintentan si no contestas rapido, y a veces mandan el
// mismo aviso dos veces por las dudas. Eso no es problema: entregar es
// idempotente del lado de la base (confirmar_pago no entrega dos veces).

Deno.serve(async (req: Request) => {
  const recibido = new Date().toISOString();

  // ---------- 1. Solo POST ----------
  if (req.method !== "POST") {
    return json({ error: "solo POST" }, 405);
  }

  // ---------- 2. Sin secreto configurado, no se hace nada ----------
  if (!SECRETO) {
    console.error("WEBHOOK_SECRETO sin configurar: se rechaza todo hasta que lo pongas");
    return json({ error: "webhook sin configurar" }, 503);
  }

  // ---------- 3. Leer el cuerpo y DEJARLO EN EL LOG ----------
  // Antes de validar nada, porque el log es como vas a descubrir el
  // formato que manda la pasarela. Tambien queda registro de los intentos
  // rechazados, que es lo que te avisa si alguien esta probando la URL.
  const crudo = await req.text();
  console.log("aviso recibido", JSON.stringify({
    recibido,
    ip: req.headers.get("x-forwarded-for") ?? "?",
    headers: Object.fromEntries(
      [...req.headers.entries()].filter(([k]) => !/authorization|cookie/i.test(k))
    ),
    cuerpo: crudo.slice(0, 4000)
  }));

  // ---------- 4. ¿Viene de la pasarela? ----------
  if (!secretoValido(req, crudo)) {
    console.warn("aviso RECHAZADO: secreto invalido");
    // 401 y nada mas. No se explica que fallo: si alguien esta probando,
    // que no aprenda nada de la respuesta.
    return json({ error: "no autorizado" }, 401);
  }

  // ---------- 5. Traducir el aviso ----------
  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(crudo);
  } catch {
    console.warn("aviso RECHAZADO: el cuerpo no es JSON");
    return json({ error: "cuerpo invalido" }, 400);
  }

  const aviso = leerAviso(cuerpo, req.headers);

  if (!aviso) {
    // Se contesta 200 a proposito. Si devolvieramos error, la pasarela lo
    // reintentaria para siempre, y el problema no se arregla reintentando:
    // es que todavia no sabemos leer su formato. El log de arriba tiene lo
    // que hace falta para completarlo.
    console.warn("no se pudo entender el aviso: revisa leerAviso() con el log de arriba");
    return json({ ok: true, nota: "recibido pero no interpretado" }, 200);
  }

  if (!aviso.pagado) {
    // Hay avisos que no son de pago: QR generado, QR vencido, pago
    // rechazado. Se aceptan y se ignoran.
    console.log(`aviso ignorado (no es un pago confirmado): pedido ${aviso.numero}`);
    return json({ ok: true, nota: "no es un pago confirmado" }, 200);
  }

  // ---------- 6. Entregar ----------
  // El monto viaja hasta la base a proposito: ahi se compara contra lo que
  // el pedido dice que cuesta. Si pagaron de menos NO se entrega.
  // Esa comprobacion es lo ultimo que separa "me pagaron" de "alguien dijo
  // que me pagaron", asi que vive en la base y no aca.
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/confirmar_pago_webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SERVICE_KEY,
      "Authorization": `Bearer ${SERVICE_KEY}`
    },
    body: JSON.stringify({
      p_numero:     aviso.numero,
      p_monto:      aviso.monto,
      p_referencia: aviso.referencia,
      p_origen:     aviso.origen
    })
  });

  const resultado = await r.json().catch(() => null);

  if (!r.ok) {
    console.error("la base rechazo la confirmacion", r.status, JSON.stringify(resultado));
    // 500 para que la pasarela reintente: esto SI se puede arreglar solo
    // (un corte momentaneo, por ejemplo).
    return json({ error: "no se pudo procesar" }, 500);
  }

  console.log("confirmacion procesada", JSON.stringify(resultado));
  return json({ ok: true, resultado }, 200);
});


// ============================================================
// SEGURIDAD
// ============================================================
// Compara el secreto que manda la pasarela con el nuestro.
//
// Se aceptan las tres formas mas comunes de mandarlo porque todavia no
// sabemos cual usa OpenBCB. Cuando lo sepas, dejá solo la que corresponda:
// cada forma de mas es una puerta de mas.
//
// ⚠️ Si tu pasarela firma con HMAC (un hash del cuerpo con una clave
//    compartida) en vez de mandar el secreto tal cual, esto NO alcanza:
//    hay que calcular el hash y compararlo. Se hace con crypto.subtle.
//    Preguntales cual de las dos usan; es la primera pregunta tecnica.
function secretoValido(req: Request, _cuerpo: string): boolean {
  const candidatos = [
    req.headers.get("x-webhook-secret"),
    req.headers.get("x-api-key"),
    (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  ];

  return candidatos.some(c => c && comparacionSegura(c, SECRETO!));
}

// Comparar con === se rinde en el primer caracter distinto, y ese tiempo
// de mas o de menos deja adivinar el secreto letra por letra. Esta version
// siempre tarda lo mismo.
function comparacionSegura(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let distinto = 0;
  for (let i = 0; i < a.length; i++) distinto |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return distinto === 0;
}


// ============================================================
// ⚠️⚠️ ACA VA LO DE OPENBCB — ES LO UNICO QUE FALTA COMPLETAR
// ============================================================
// Traduce el mensaje de la pasarela a lo que necesitamos:
//
//   numero      el numero de NUESTRO pedido (#1043 -> 1043). Se lo
//               mandamos a la pasarela como referencia al crear el QR, y
//               nos lo tiene que devolver en el aviso.
//   monto       cuanto pagaron de verdad
//   referencia  el codigo de la transaccion de ellos, para poder cruzarlo
//               despues con el extracto del banco
//   pagado      si este aviso es "se pago" y no "se genero el QR"
//
// Abajo hay un intento generico que prueba los nombres de campo mas
// habituales. Puede que funcione de una; si no, mira el log de un aviso
// real y ajusta los nombres. No pasa nada por equivocarse: mientras no
// entienda el aviso, no entrega nada.
type Aviso = {
  numero: number;
  monto: number | null;
  referencia: string | null;
  pagado: boolean;
  origen: string;
};

function leerAviso(cuerpo: unknown, _headers: Headers): Aviso | null {
  if (!cuerpo || typeof cuerpo !== "object") return null;
  const c = cuerpo as Record<string, unknown>;

  // Algunas pasarelas envuelven todo en "data", "payload" o "transaction".
  const d = (c.data ?? c.payload ?? c.transaction ?? c) as Record<string, unknown>;

  // Nuestro numero de pedido, con los nombres mas usados para "referencia
  // del comercio".
  const numero = aNumero(
    d.referencia ?? d.reference ?? d.referencia_comercio ?? d.external_id ??
    d.merchant_reference ?? d.orderId ?? d.order_id ?? d.pedido ?? d.glosa
  );
  if (numero === null) return null;

  const monto = aNumero(d.monto ?? d.amount ?? d.importe ?? d.total ?? d.valor);

  const referencia = aTexto(
    d.transaccion ?? d.transaction_id ?? d.transactionId ?? d.id ??
    d.codigo ?? d.nroTransaccion
  );

  // Si no dice nada del estado, se asume que avisar = se pago. Muchas
  // pasarelas solo llaman al webhook cuando el pago se acredito.
  const estado = String(d.estado ?? d.status ?? d.state ?? "").toLowerCase();
  const pagado = estado === ""
    || /pagad|pagado|complet|success|approved|confirmad|acredit|paid|ok/.test(estado);

  return { numero, monto, referencia, pagado, origen: "webhook:openbcb" };
}

function aNumero(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  // "#1043" y "PEDIDO 1043" tambien tienen que servir: al crear el QR la
  // referencia puede terminar con adornos.
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function aTexto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s.slice(0, 120);
}

function json(cuerpo: unknown, status: number): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
