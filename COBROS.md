# Cobros con entrega automática

Cómo funciona lo que ya está construido, y qué falta para que el pago se
detecte solo.

---

## Lo que ya anda hoy

El cliente compra, paga con tu QR, vos confirmás desde el panel, y **la cuenta
le aparece sola en su pantalla** sin que le mandes nada.

```
Cliente elige un plan
      ↓
Se crea el pedido (#1043) y se le muestra el QR
      ↓
Paga desde la app de su banco
      ↓
Te manda el comprobante por WhatsApp        ← el único paso manual
      ↓
Panel → 💳 Ventas → "Confirmar pago"
      ↓
La cuenta le aparece sola al cliente, al instante
```

El único paso manual es enterarte de que pagó. Eso es lo que resuelve el
webhook, más abajo.

---

## Cargar stock

**Panel → 🔑 Stock → `+ Cargar cuentas`**

Una cuenta por línea:

```
usuario | clave | perfil | pin | nota
```

Solo **usuario** y **clave** son obligatorios.

```
netflix.lote3@gmail.com | Xk9#mPq2 | Perfil 1 | 1234
netflix.lote3@gmail.com | Xk9#mPq2 | Perfil 2 | 5678
juan.disney@gmail.com   | Ab7$nRt4 |          |
```

**Mirá la vista previa antes de guardar.** Si una contraseña tenía el
separador adentro, ahí se ve partida mal y cambiás de separador.

### Las tres reglas

**Una línea = una venta.** Cinco líneas de Netflix = las próximas cinco
compras se entregan solas. La sexta cae en "sin stock" y la atendés a mano.

**El stock es por producto, no por plataforma.** "Netflix Cuenta Completa" y
"Netflix 1 pantalla" son productos distintos. Si vendés los 4 perfiles de una
cuenta por separado, cargás 4 líneas en el producto "1 pantalla", con el mismo
usuario y clave y distinto perfil.

**No todo se puede stockear.** Lo que va "a correo del cliente" se crea recién
cuando alguien compra. Las recargas de juegos nunca: se cargan al ID del
jugador.

### Qué pasa al guardar

Aparece el **⚡ Entrega inmediata** en ese plan, la página de pago promete la
entrega al instante, y al confirmar el pago la cuenta se entrega sola.

Sin stock nada se rompe: la página avisa honestamente que se la mandás por
WhatsApp, y el pedido queda marcado `sin_stock` para que lo atiendas.

---

## Lo que falta: que el pago se detecte solo

Tu QR de hoy es una **imagen fija**. No lleva monto ni referencia de pedido, y
el banco no le avisa a nadie. Con ese QR la detección automática es imposible
— no hay forma de saber que ese depósito es de ese pedido.

Se arregla sin cambiarle nada al cliente: sigue siendo un QR, tu plata sigue
cayendo en tu cuenta, en Bs. Lo que cambia es que **cada pedido genera su
propio QR** con monto y referencia únicos. Eso lo da una pasarela con API.

### Opciones (septiembre 2026)

| | Costo inicial | Por transacción | Documentación |
|---|---|---|---|
| **OpenBCB** (Banco Central) | Gratis | Gratis | Solo comunicados de prensa |
| **BCP** · APIs Pagos QR Simple | Consultar | Consultar | Por formulario en bcp.com.bo/Desarrollo |
| **CUCU** | Bs 1.200 único | — | Al contratar |
| **PagosNet** | ~Bs 1.800 único | 3 – 3,5 % | Al contratar |

Ninguna publica su documentación técnica abierta. Hay que contactarlas.

**PayPal, Stripe y las extranjeras: descartadas.** En Bolivia PayPal sirve
para pagar, no para cobrar — es el único país de Latinoamérica con esa
limitación.

### Las cinco preguntas

En este orden. La primera puede cerrar la conversación:

1. **¿Me aceptan sin NIT, como persona natural?**
2. ¿Comisión por transacción? *(con tickets de 30–120 Bs, una comisión fija
   duele más que un porcentaje)*
3. ¿El dinero cae en mi cuenta de BancoSol? ¿En cuántos días?
4. ¿Me dan **QR dinámico por transacción con referencia propia** y **webhook**?
5. ¿El webhook manda un secreto tal cual, o firma con HMAC?

La quinta es la única pregunta técnica que hace falta para terminar el código.

### Qué darles

Esta URL, para que te avisen cuando entra plata:

```
https://doydkjztynjqecwdvoto.supabase.co/functions/v1/webhook-pago
```

---

## Cuando tengas las credenciales

### 1. Poner el secreto

**Supabase → Edge Functions → webhook-pago → Secrets**

```
WEBHOOK_SECRETO = una clave larga inventada por vos
```

La misma que le cargás a la pasarela. **Hasta que esto esté, la función
rechaza todo con 503** — a propósito: es preferible que no ande a que ande sin
protección.

### 2. Descubrir el formato sin que te lo expliquen

La función **guarda en el log todo lo que le llega**, incluso lo que rechaza.

Pedile a la pasarela que mande un aviso de prueba y andá a
**Supabase → Edge Functions → webhook-pago → Logs**. Ahí vas a ver el JSON
exacto que manda. Con eso se completa la función `leerAviso()` de
`supabase/functions/webhook-pago/index.ts` sin adivinar nada.

Es también tu alarma: si alguien anda probando la URL, aparece ahí.

### 3. Probar sin plata de verdad

Con el secreto ya puesto:

```bash
curl -X POST https://doydkjztynjqecwdvoto.supabase.co/functions/v1/webhook-pago \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: TU-SECRETO" \
  -d '{"referencia":"1043","monto":100,"estado":"pagado"}'
```

Cambiá `1043` por el número de un pedido real que esté esperando y `100` por
su precio exacto. Si la cuenta se entrega, el circuito está cerrado.

---

## Lo que protege tu plata

**El monto se verifica en la base, no en el webhook.** Un webhook es un POST
que llega de afuera. Aunque esté firmado, el día que la firma falle o se filtre
el secreto, lo único que separa *"me pagaron 120 Bs"* de *"alguien dijo que me
pagaron"* es comparar contra lo que el pedido cuesta.

- Pagaron **de menos** → **no se entrega**, y queda el motivo escrito en el pedido
- Pagaron **de más** → **sí se entrega**; el cliente cumplió, la diferencia se la devolvés vos

**Nadie vende dos veces la misma cuenta.** Si dos personas pagan en el mismo
segundo, la base entrega una distinta a cada una (`FOR UPDATE SKIP LOCKED`).

**Los reintentos no regalan cuentas.** Las pasarelas reintentan el aviso si no
contestás rápido. Confirmar dos veces el mismo pedido no entrega una segunda.

**Una sola puerta de entrega.** El botón del panel y el webhook llaman a la
misma función. No hay dos caminos que puedan quedar desincronizados.

---

## Si algo sale mal

**"Pagó y no había stock"** → el pedido queda en `sin_stock` con el pago
registrado. Cargá cuentas de ese producto y tocá **Reintentar** en el panel.

**"Pagó tarde y el pedido figura vencido"** → vencer es solo una etiqueta para
que la lista de pendientes no se llene. Tocá **"Pagó tarde: entregar"**; el
pedido se entrega igual.

**"El cliente perdió la cuenta"** → el link de su pedido quedó en el mensaje de
WhatsApp que te mandó con el comprobante. Ahí la vuelve a ver. Y desde el panel
podés copiar el mensaje listo para reenviárselo.

**"El cliente dice que pagó y no aparece"** → mirá los logs de la Edge
Function. Si el aviso llegó pero no se entendió, el JSON está ahí y se arregla
en `leerAviso()`. Si no llegó, el problema es de la pasarela.

---

## Anotado para más adelante: "Mis compras" con link mágico

**No está construido, y es a propósito.** Queda escrito acá para cuando
haga falta, con el disparador que indica que llegó el momento.

### Por qué no hay login para comprar

Se evaluó pedirle usuario y contraseña a cada cliente, y se decidió que no.

Obligar a registrarse antes de comprar es de las cosas que más ventas
matan. Los clientes vienen de WhatsApp a comprar una cuenta de 30 a 120 Bs:
pedirles email y contraseña agrega un paso donde hoy hay dos clics, y cada
paso pierde gente. Además el soporte cae sobre vos — "no me llega el
correo", "olvidé mi contraseña" — todo por WhatsApp.

**Y no resolvería ningún problema de seguridad, porque no hay uno.**
Cada cuenta ya es privada de su comprador. Verificado contra la base real,
desde el navegador con la clave pública:

```
Ana con su token ve         → su cuenta, nada de Beto
listar pedidos sin token    → 0 filas
listar cuentas sin token    → 0 filas
probar con el nº de pedido  → "token invalido"
5 tokens al azar            → 0 aciertos
```

El token tiene 64 caracteres hexadecimales: 16⁶⁴ combinaciones.

### Lo que sí falta, y no es seguridad

Si el cliente pierde el link, no puede volver solo a su cuenta.

Hoy eso se resuelve en diez segundos: el link está en el mensaje de
WhatsApp que él mismo te mandó con el comprobante, y si igual lo perdió,
el panel tiene **"Copiar para mandar"**, que arma el mensaje con sus
credenciales listo para pegar.

### El plan, cuando haga falta

Cliente compra y recibe su cuenta, igual que ahora. Abajo aparece
*"¿Querés poder volver a ver tus compras? Dejanos tu correo"*. Escribe el
email, le llega un link, lo toca y entra a **Mis compras**. Sin contraseña:
el link es la prueba de que ese correo es suyo. Todo **después** de pagar;
el que no quiere ni se entera.

Cuatro piezas:

1. **Vincular el pedido al correo verificado.** `pedidos.cliente_email` ya
   existe pero es texto libre sin verificar. Se vincula cuando el cliente
   lo pide **desde su propia pantalla de entrega**, no con lo que escribió
   al comprar — si no, alguien podría poner el correo de otro en el
   checkout y sus pedidos le aparecerían a esa persona.
2. **Una política nueva:** un usuario logueado ve los pedidos cuyo correo
   verificado coincide con el suyo. Unas pocas líneas.
3. **La página `mis-compras.html`.**
4. **SMTP propio.**

### Los dos obstáculos, que son los que deciden el momento

**El correo es el verdadero costo.** Supabase manda correos gratis pero
pocos por hora y desde un remitente genérico que cae en spam seguido. Hace
falta SMTP propio (Resend, Brevo). Hay planes gratis suficientes, pero es
una cuenta más, un dominio que verificar, y **si el correo no llega el
cliente te escribe igual**: habrías agregado un paso que puede fallar para
resolver algo que hoy se resuelve en diez segundos.

**Hay que reabrir el registro.** Está apagado a propósito
(*Allow new users to sign up*). El link mágico crea usuarios, así que
habría que prenderlo. No es grave —la tabla `admins` es la que decide quién
escribe, y alguien que se registre solo vería únicamente los pedidos que
coincidan con su propio correo, o sea ninguno— pero es un cambio
consciente.

### El disparador

**No es "sería lindo". Es que te escriban seguido pidiendo su cuenta de
nuevo.** Llevá la cuenta de cuántas veces por semana te piden reenviar
credenciales. Cuando sean varias, el link mágico se paga solo.

Medio día de trabajo, más el trámite del SMTP.
