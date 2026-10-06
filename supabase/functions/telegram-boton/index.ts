// ============================================================
// TIAGO STORE · Botones del aviso de Telegram
// ============================================================
// El aviso de pedido nuevo por QR Bolivia (avisar_pedidos_nuevos, ver
// supabase/23-confirmar-desde-telegram.sql) trae un boton. Cada toque
// Telegram se lo manda a esta funcion. Lo de Binance no trae boton: se
// confirma solo con la API.
//
// LO QUE VIAJA EN CADA BOTON ("letra:compra")
//   c  "Confirmar y entregar"          (hay stock)     → pregunta Si / No
//   p  "Confirmar pago (va por WhatsApp)" (sin stock)  → pregunta Si / No
//   s  "Si, ya cobre" y "Reintentar entrega"           → confirmar_desde_telegram()
//   n  "No, todavia no" despues de c                   → vuelve c
//   o  "No, todavia no" despues de p                   → vuelve p
//   w  "Ya lo entregue por WhatsApp"                   → entregado_por_whatsapp_desde_telegram()
// La pregunta del medio esta a proposito: un toque sin querer,
// scrolleando el chat, no regala una cuenta.
//
// Y los del mensaje de la manana, "Sigue sin pagar" (avisar_sin_pagar,
// ver supabase/24-sin-pagar-desde-ayer.sql):
//   x  "Cancelar: nunca pago"   → cancelar_desde_telegram(motivo "Nunca pagó")
//   u  "Cancelar: duplicado"    → cancelar_desde_telegram(motivo "Pedido duplicado")
//   d  "Dejarlo"                → no toca nada; al otro dia pregunta de nuevo
// Cancelar no regala nada (y si ya pago, la base no lo cancela): por eso
// esos van de una, sin la pregunta del medio.
//
// QUIEN PUEDE
//   1. Telegram manda en cada toque la clave de
//      ajustes.telegram_webhook_secreto (cabecera
//      X-Telegram-Bot-Api-Secret-Token). Sin ella: 401.
//   2. Solo valen los toques de TU chat (ajustes.telegram_chat).
//
// FALLA CERRADA, A PROPOSITO
//   Si falta el token, el chat o la clave, no hace nada y devuelve 503.
//
// A Telegram se le contesta 200 aunque algo salga mal (menos la clave):
// con un error, Telegram reintentaria el mismo toque una y otra vez. El
// problema se ve en el cartelito del chat y en los logs.
//
// CONFIGURACION (una sola vez)
//   select public.activar_boton_telegram();
//   SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya vienen puestas solas.
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CABECERAS_BASE = {
  "Content-Type": "application/json",
  "apikey": SERVICE_KEY,
  "Authorization": `Bearer ${SERVICE_KEY}`
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Lo que se agrega al pie del aviso. Al tocar otra vez se reemplaza lo
// que habia despues de esto, en vez de ir sumando renglones.
const SEPARADOR = "\n\nResultado: ";

type Ajustes = { token: string; chat: string; secreto: string };

// Se leen en cada toque: si cambias el bot o la clave, vale al instante.
async function leerAjustes(): Promise<Ajustes | null> {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/ajustes?clave=in.(telegram_token,telegram_chat,telegram_webhook_secreto)&select=clave,valor`,
      { headers: CABECERAS_BASE });
    if (!r.ok) return null;
    const filas: { clave: string; valor: string | null }[] = await r.json();
    const de = (clave: string) => (filas.find(f => f.clave === clave)?.valor ?? "").trim();
    const a = { token: de("telegram_token"), chat: de("telegram_chat"), secreto: de("telegram_webhook_secreto") };
    return a.token && a.chat && a.secreto ? a : null;
  } catch {
    return null;
  }
}

// Si Telegram no acepta algo (un mensaje muy viejo para editar, por
// ejemplo) queda en el log y se sigue: lo importante ya se hizo en la base.
async function telegram(token: string, metodo: string, datos: Record<string, unknown>): Promise<void> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos)
    });
    if (!r.ok) console.warn(`telegram ${metodo}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  } catch (e) {
    console.warn(`telegram ${metodo}: ${e}`);
  }
}

// Lo que devuelven las funciones de la base (ver los SQL 23 y 24)
type Resultado = {
  texto: string;
  corto?: string;
  sin_stock?: boolean;
  whatsapp?: string | null;
  mensaje_wa?: string;
};

async function base(funcion: string, compra: string, mas: Record<string, unknown> = {}): Promise<Resultado | null> {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${funcion}`, {
      method: "POST",
      headers: CABECERAS_BASE,
      body: JSON.stringify({ p_compra: compra, ...mas })
    });
    const res = await r.json().catch(() => null);
    if (!r.ok || !res?.texto) {
      console.error(`la base no pudo (${funcion})`, compra, r.status, JSON.stringify(res));
      return null;
    }
    console.log(funcion, compra, JSON.stringify(res));
    return res as Resultado;
  } catch (e) {
    console.error(`la base no pudo (${funcion})`, compra, `${e}`);
    return null;
  }
}

type Boton = { text: string; callback_data?: string; url?: string };
const teclado = (filas: Boton[][]) => ({ inline_keyboard: filas });

const botonInicial = (letra: "c" | "p", compra: string) => teclado([[
  letra === "c"
    ? { text: "Confirmar y entregar",             callback_data: `c:${compra}` }
    : { text: "Confirmar pago (va por WhatsApp)", callback_data: `p:${compra}` }
]]);

const botonesSeguro = (letra: "c" | "p", compra: string) => teclado([
  [{ text: "Sí, ya cobré",   callback_data: `s:${compra}` }],
  [{ text: "No, todavía no", callback_data: `${letra === "c" ? "n" : "o"}:${compra}` }]
]);

// Pagado y sin stock: abrir su WhatsApp con el mensaje escrito, darlo
// por entregado, o reintentar si cargaste cuentas
function botonesWhatsapp(compra: string, res: Resultado) {
  const filas: Boton[][] = [];
  if (res.whatsapp) {
    filas.push([{
      text: "WhatsApp del cliente",
      url: `https://wa.me/${res.whatsapp}?text=${encodeURIComponent(res.mensaje_wa ?? "")}`
    }]);
  }
  filas.push([{ text: "Ya lo entregué por WhatsApp", callback_data: `w:${compra}` }]);
  filas.push([{ text: "Reintentar entrega",          callback_data: `s:${compra}` }]);
  return teclado(filas);
}

Deno.serve(async (req: Request) => {
  // ---------- 1. Solo POST ----------
  if (req.method !== "POST") {
    return json({ error: "solo POST" }, 405);
  }

  // ---------- 2. Sin configurar, no se hace nada ----------
  const conf = await leerAjustes();
  if (!conf) {
    console.error("boton sin configurar: falta el token, el chat o la clave (select public.activar_boton_telegram();)");
    return json({ error: "sin configurar" }, 503);
  }

  // ---------- 3. ¿Viene de Telegram? ----------
  const clave = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!comparacionSegura(clave, conf.secreto)) {
    console.warn("toque RECHAZADO: clave invalida", req.headers.get("x-forwarded-for") ?? "?");
    return json({ error: "no autorizado" }, 401);
  }

  // ---------- 4. ¿Es un toque de boton? ----------
  // deno-lint-ignore no-explicit-any
  const update: any = await req.json().catch(() => null);
  const q = update?.callback_query;
  if (!q?.id) return json({ ok: true }, 200);

  // El cartelito que Telegram muestra arriba al tocar (hasta 200 letras)
  const responder = (texto?: string, alerta = false) =>
    telegram(conf.token, "answerCallbackQuery", {
      callback_query_id: q.id,
      ...(texto ? { text: texto.slice(0, 200), show_alert: alerta } : {})
    });

  // ---------- 5. ¿De tu chat? ----------
  // Es un chat privado con el bot: el que toca y el chat son el mismo id.
  const chat  = String(q.message?.chat?.id ?? "");
  const quien = String(q.from?.id ?? "");
  if (chat !== conf.chat || quien !== conf.chat) {
    console.warn(`toque RECHAZADO: no es tu chat (chat ${chat}, de ${quien})`);
    await responder("No autorizado.");
    return json({ ok: true }, 200);
  }

  const [letra, compra] = String(q.data ?? "").split(":");
  if (!UUID.test(compra ?? "")) {
    await responder();
    return json({ ok: true }, 200);
  }

  const mensaje = { chat_id: q.message.chat.id, message_id: q.message.message_id };
  const botones = (reply_markup: unknown) =>
    telegram(conf.token, "editMessageReplyMarkup", { ...mensaje, reply_markup });

  // El aviso queda igual, con el resultado al pie. Sin reply_markup,
  // Telegram saca los botones: ya no hay nada que tocar.
  const alPie = (res: Resultado, reply_markup?: unknown) => {
    const aviso = String(q.message.text ?? "").split(SEPARADOR)[0];
    return telegram(conf.token, "editMessageText", {
      ...mensaje,
      text: `${aviso}${SEPARADOR}${res.texto}`,
      disable_web_page_preview: true,
      ...(reply_markup ? { reply_markup } : {})
    });
  };

  // ---------- 6. Lo que se toco ----------
  switch (letra) {
    case "c":
    case "p":
      await botones(botonesSeguro(letra, compra));
      await responder("¿Ya viste el pago en tu banco?");
      break;

    case "n":
    case "o":
      await botones(botonInicial(letra === "n" ? "c" : "p", compra));
      await responder();
      break;

    case "s": {
      const res = await base("confirmar_desde_telegram", compra);
      if (!res) { await responder("No se pudo confirmar. Hacelo desde el panel.", true); break; }
      await alPie(res, res.sin_stock ? botonesWhatsapp(compra, res) : undefined);
      await responder(res.corto ?? res.texto);
      break;
    }

    case "w": {
      const res = await base("entregado_por_whatsapp_desde_telegram", compra);
      if (!res) { await responder("No se pudo guardar. Hacelo desde el panel.", true); break; }
      await alPie(res);
      await responder(res.corto ?? res.texto);
      break;
    }

    case "x":
    case "u": {
      const motivo = letra === "x" ? "Nunca pagó" : "Pedido duplicado";
      const res = await base("cancelar_desde_telegram", compra, { p_motivo: motivo });
      if (!res) { await responder("No se pudo cancelar. Hacelo desde el panel.", true); break; }
      await alPie(res);
      await responder(res.corto ?? res.texto);
      break;
    }

    case "d":
      await alPie({ texto: "Lo dejaste esperando. Mañana te pregunto de nuevo." });
      await responder("Lo dejaste esperando.");
      break;

    default:
      await responder();
  }

  return json({ ok: true }, 200);
});


// Comparar con === se rinde en el primer caracter distinto, y ese tiempo
// de mas o de menos deja adivinar la clave letra por letra. Esta version
// siempre tarda lo mismo. (La misma que en webhook-pago.)
function comparacionSegura(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let distinto = 0;
  for (let i = 0; i < a.length; i++) distinto |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return distinto === 0;
}

function json(cuerpo: unknown, status: number): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
