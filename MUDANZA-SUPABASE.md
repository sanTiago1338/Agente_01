# Mudanza de Firestore a Supabase

> ## Dónde estás
>
> | Paso | Estado |
> |---|---|
> | 1 · Crear el proyecto | ✅ `Tiago Store` · región `sa-east-1` (São Paulo) |
> | 2 · Crear las tablas | ✅ 5 tablas · 15 políticas · 3 en realtime · 11 funciones |
> | 2b · Cobro con entrega automática | ✅ base, panel y página de pago · probado de punta a punta el 7/9/2026 · **prendido desde el paso 5** |
> | 3 · Tu usuario y darte de alta como admin | ✅ 7/9/2026 · `santosvargas266@gmail.com`, confirmado y en `admins` · falta apagar el registro (3c) |
> | 4 · Pegar las credenciales | ✅ ya están en `js/supabase-base.js` |
> | 5 · Copiar el catálogo | ✅ 7/9/2026 · 226 productos y 27 juegos, comparados campo por campo contra Firestore |
> | 6 · Probar en local | 🟡 tienda, planes, recargas y una compra real: ✅ · el panel por dentro (entrar, editar, realtime) todavía no: **ojo, la prueba va en localhost, no en la tienda publicada, que sigue en Firestore** |
> | 7 · Publicar | ⬜ |
> | 8 · Limpieza final | ⬜ |
>
> **Los cuatro interruptores ya apuntan a Supabase**, en la rama
> `mudanza-supabase`. Publicado todavía no. Firestore sigue intacto como
> vuelta atrás.

Todo está preparado y **nada está encendido todavía**. La tienda sigue
funcionando igual que ayer, contra Firestore. Este archivo es el paso a paso
para cuando quieras hacer el cambio.

La mudanza **copia, no mueve**: Firestore queda intacto de punta a punta. Si
algo sale mal, volvés atrás cambiando cuatro líneas y no perdiste nada.

---

## Cómo está armado

En el medio de todo hay cuatro **interruptores**. Son archivos sin lógica: lo
único que hacen es decidir de dónde salen los datos.

| Interruptor | Lo usan |
|---|---|
| `js/productos-service.js` | `index.html`, `planes.html`, **y el panel** |
| `js/juegos-service.js` | `recarga-juegos.html` |
| `js/panel-datos.js` | el CRUD del panel (crear, editar, borrar) |
| `js/panel-auth.js` | el login del panel |

Cada uno tiene dos líneas: una activa y otra comentada.

```js
// --- FIRESTORE (lo de siempre) -------------------------------
export * from './productos-service-firebase.js';

// --- SUPABASE (lo nuevo) -------------------------------------
// export * from './productos-service-supabase.js';
```

**Los cuatro se mueven juntos.** Si el panel escribe en Supabase pero lee de
Firestore, guardás un precio y no lo ves cambiar nunca.

Gracias a esto, `index.html` (172 KB), `planes.html`, `recarga-juegos.html` y
las 2.200 líneas del panel **no se tocan**. Ya está verificado que el código de
Supabase no se descarga siquiera mientras los interruptores estén en Firebase.

---

## Los pasos

### 1 · Crear el proyecto en Supabase

En [supabase.com](https://supabase.com) → New project.

- **Region:** la más cercana a Bolivia (normalmente `South America (São Paulo)`).
  Esto se elige una vez y no se puede cambiar después; es lo que decide cuánto
  tarda cada carga del catálogo.
- **Database password:** guardala en algún lado. No es la del panel, es la de
  Postgres, y no te la vuelven a mostrar.

### 2 · Crear las tablas

Supabase → **SQL Editor** → New query. Pegá y corré, **en este orden**:

1. `supabase/01-esquema.sql` — las tablas
2. `supabase/02-seguridad.sql` — quién puede leer y escribir
3. `supabase/03-realtime.sql` — que la tienda se actualice sola
4. `supabase/05-cobros.sql` — pedidos, stock de cuentas y la entrega automática

(`04-storage.sql` es para más adelante, ver el final de este archivo.)

Los cuatro se pueden correr dos veces sin romper nada.

### 3 · Crear tu usuario y darte de alta como admin

**a)** Authentication → Users → **Add user** → Create new user.
Poné tu email y una contraseña. Marcá **Auto Confirm User**.

**b)** Volvé al SQL Editor y corré esto con tu email:

```sql
insert into public.admins (id, email, nota)
select id, email, 'dueño de la tienda' from auth.users
where email = 'TU-EMAIL@gmail.com'
on conflict (id) do nothing;
```

**c)** Authentication → Sign In / Providers → Email →
**"Allow new users to sign up"** → **APAGADO**.

> **Por qué el paso (b) existe.** Con Firestore alcanzaba con estar logueado
> para escribir. Acá hace falta además estar en la tabla `admins`. Es un
> candado más: si alguna vez se te queda abierto el registro, que alguien se
> cree una cuenta no le sirve de nada.

### 4 · Pegar las credenciales

Settings → API. Copiá los dos valores y pegalos en **`js/supabase-base.js`**:

```js
export const SUPABASE_URL      = "https://xxxxxxxx.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGci...";
```

Se completan **una sola vez y en un solo archivo**: el cliente del panel los
importa de ahí.

> La clave `anon` va en el código y está bien: es pública por diseño, igual
> que lo era la config de Firebase. Lo que te protege son las políticas RLS
> del paso 2, no esconder la clave.
>
> **La que NUNCA va en un archivo del navegador es `service_role`.** Esa se
> saltea todas las políticas. Si se te escapa, Settings → API → Reset.

### 5 · Copiar el catálogo

Levantá el servidor local:

```bash
powershell -File servidor.ps1
```

Y abrí <http://localhost:8099/backup/migrar-a-supabase.html>.

La herramienta:

1. Te pide entrar con el usuario de Supabase y **verifica que seas admin**
   antes de escribir nada.
2. Te muestra cuántos productos y juegos hay de cada lado.
3. Avisa si hay **campos que el mapeo no conoce** (se perderían en silencio).
4. Copia todo, en tandas armadas por peso, con una barra de progreso.

Se puede correr **las veces que quieras**: usa el `firestore_id` de cada
documento como clave, así que la segunda corrida actualiza en vez de duplicar.
Si se corta a la mitad, volvés a entrar y le das de nuevo.

**Verificá que los números coincidan** antes de seguir.

> **Cómo se hizo el 7/9/2026:** sin la herramienta. Postgres trajo las dos
> colecciones directo de la API REST de Firestore (extensión `http`, ya
> quitada), las mapeó con las mismas reglas que la herramienta y se comparó
> fila por fila: 226 productos y 27 juegos, cero diferencias. La herramienta
> sigue sirviendo si algún día hay que volver a sincronizar: como usa
> `firestore_id` como clave, actualiza en vez de duplicar.

### 6 · Probar sin que lo vea nadie

Antes de tocar los interruptores, probá en tu máquina:

1. Movelos los cuatro a Supabase.
2. `powershell -File servidor.ps1` y recorré:
   - la tienda: ¿están los 226 productos, con precios, ofertas e imágenes?
   - `planes.html`: ¿sale la tabla de planes?
   - `recarga-juegos.html`: ¿están los juegos y sus paquetes?
   - `admin/`: ¿entrás? ¿podés editar un precio? **¿se actualiza sola la
     tienda abierta en otra pestaña?** (eso prueba que Realtime quedó bien)
   - el cobro: en `admin/` → 🔑 Stock cargale una cuenta de prueba a un
     producto barato. Compralo desde la tienda con "Pagar con QR": la página
     de pago tiene que decir "Pedido #N" en vez de "Ref: ZV-...". En
     💰 Ventas tocá **Confirmar pago**: la cuenta aparece sola en la página
     de pago, sin recargar.
3. Si algo falla, volvé los interruptores a Firebase y arreglalo con calma.
   **Nadie se enteró de nada.**

### 7 · Publicar

Cuando ande todo en local, `git commit` y `git push`.

En Supabase agregá tu dominio real:
**Authentication → URL Configuration → Site URL y Redirect URLs**
(el equivalente de los "dominios autorizados" de Firebase; sin esto el
"recuperar contraseña" no vuelve a tu sitio).

### 8 · Limpieza final (un rato después)

Dejá Firestore prendido unos días. No cuesta nada y es tu vuelta atrás.

**Ya borrado** (no esperaba a la mudanza — estaba muerto desde antes): el
backend de Express + SQLite. `server.js`, `src/` entera, `admin.html` (el
panel viejo de la raíz), `package.json` y `package-lock.json`. Nada lo
llamaba: `pagar-qr.html` arma el QR con una imagen estática (`Img/Qr.jpg`) y
no hay un solo `fetch` a `/api/` en la tienda.

> Si alguna vez querés revivir el cobro automático por QR, está entero en el
> historial: `git log --diff-filter=D -- server.js` te dice en qué commit se
> fue, y `git checkout <commit>^ -- server.js src/` lo trae de vuelta.
>
> `node_modules/` quedó en el disco (está en `.gitignore`, git no lo ve).
> Ya no sirve para nada: borrala a mano y recuperás bastante espacio.

**Cuando Supabase esté confirmado, se puede borrar:**

| Qué | Por qué |
|---|---|
| `js/firebase-base.js`, `js/firebase-config.js` | la conexión vieja |
| `js/productos-service-firebase.js`, `js/juegos-service-firebase.js` | los servicios viejos |
| `js/panel-datos-firebase.js`, `js/panel-auth-firebase.js` | el panel viejo |
| `backup/migrar.html`, `migrar-juegos.html`, `marcar-planes.html`, `migrar-imagenes.html` | migradores a Firestore, ya cumplieron |
| `backup/catalogo-original.js`, `backup/juegos-original.js` | las semillas del catálogo pre-Firestore |
| `backup/migrar-a-supabase.html` | cuando la copia esté verificada |

Y los cuatro interruptores dejan de tener sentido: `productos-service.js`,
`juegos-service.js`, `panel-datos.js` y `panel-auth.js` pasan a exportar
directo desde su versión de Supabase, sin la línea comentada.

En la base, las columnas puente:

```sql
alter table public.productos drop column firestore_id;
alter table public.juegos    drop column firestore_id;
```

**Y el proyecto de Firebase.** Recién cuando no vayas a volver: Firebase
Console → Configuración del proyecto → Eliminar proyecto. Bajate antes una
exportación de Firestore si querés quedarte con el respaldo.

---

## Si algo sale mal

### "Volvé todo como estaba"

Comentá la línea de Supabase y descomentá la de Firebase en los cuatro
interruptores. Nada más. Firestore nunca se tocó.

### "No se pudo guardar: tu usuario no tiene permiso"

No estás en la tabla `admins`. Volvé al paso 3b.

### La tienda carga pero no se actualiza sola

Realtime no quedó encendido. Corré `supabase/03-realtime.sql` y comprobá:

```sql
select tablename from pg_publication_tables where pubname = 'supabase_realtime';
```

Tienen que salir `productos`, `juegos` y `pedidos`.

### El correo de "recuperar contraseña" no llega

Con el plan gratis Supabase manda pocos correos por hora, desde un remitente
genérico que suele caer en spam. Para producción:
**Authentication → Emails → SMTP**, y poné tu propio proveedor.

---

## Lo que cambió y lo que no

**No cambió nada de:** `planes.html`, `recarga-juegos.html`, ni los modales,
formularios, validaciones o el compresor de imágenes del panel.

**Cambió:**

| Archivo | Qué |
|---|---|
| `js/productos-service.js`, `js/juegos-service.js` | pasaron a ser interruptores; su código está ahora en `*-firebase.js` |
| `admin/js/admin-productos.js`, `admin-juegos.js` | dos líneas de `import` |
| `admin/index.html`, `admin/login.html` | las líneas de `import`, un aviso si no sos admin, y las vistas 💰 Ventas y 🔑 Stock |
| `admin/cambiar-clave.html` | **nuevo** — Firebase alojaba esta pantalla, Supabase no |
| `index.html` | tres líneas: el carrito lleva el id real del producto (`fid`) para que la página de pago pueda crear el pedido |
| `pagar-qr.html` | un módulo aparte al final, el de la entrega automática; el resto de la página está igual |

**Nuevo:** `supabase/*.sql`, `js/supabase-*.js`, `js/mapeo.js`,
`js/panel-datos*.js`, `js/panel-auth*.js`, `js/pedido-automatico.js`,
`admin/js/admin-ventas.js`, `admin-stock.js`, `admin-permiso.js`,
`backup/migrar-a-supabase.html`, `supabase/prueba-entrega.sql`.

---

## Dos decisiones que conviene conocer

### Los nombres de los campos

Postgres usa `precio_oferta`, el front usa `precioOferta`. La traducción vive
**entera en `js/mapeo.js`**, en una sola lista.

Para agregar un campo nuevo: una línea en esa lista y una columna en
`01-esquema.sql`. No hay un segundo lugar que actualizar.

### El puente del panel (`js/supabase-compat.js`)

El CRUD del panel le sigue hablando a la base en idioma Firestore
(`updateDoc(doc(db, 'productos', id), {...})`). Ese archivo traduce eso a
Supabase.

Se hizo así porque de esas 1.600 líneas, **13 son de base de datos**: el resto
es interfaz ya probada. Reescribir todo para cambiar 13 llamadas era cambiar
mucha superficie para arreglar poca.

Es un **puente, no un destino**. Mientras el panel hable en Firestore no vas a
poder usar lo bueno de SQL. Cuando la mudanza esté asentada, las llamadas se
van cambiando de a una, sin apuro:

```js
await updateDoc(doc(db, 'productos', id), { precio: 99 });
// pasa a ser:
await sbAdmin.from('productos').update({ precio: 99 }).eq('id', id);
```

El puente y las llamadas nativas conviven sin problema, así que se puede ir
haciendo de a poco.

---

## El cobro con entrega automática

Ya está construido y probado, pero **se prende solo en el paso 5**: la página
de pago crea el pedido con el id real del producto, y hoy ese id es de
Firestore. Mientras el catálogo no viva en Supabase, todo esto queda quieto y
el cliente ve el QR y el WhatsApp de siempre.

**Cómo funciona cuando está prendido**

1. El cliente toca "Pagar con QR". La página crea un pedido en Supabase y se
   queda preguntando cada 4 segundos si ya lo confirmaron.
2. Paga con el QR y te manda el comprobante por WhatsApp, como siempre. En
   ese mensaje va el link de su pedido (`pagar-qr.html#t=...`): es su única
   llave a la cuenta, y en su chat no se pierde nunca.
3. Vos entrás a `admin/` → 💰 Ventas y tocás **Confirmar pago**.
4. La cuenta le aparece sola en la página, sin recargar. Si no había stock,
   ve "recibimos tu pago, te la mandamos por WhatsApp" y el pedido queda en
   *sin stock* para que lo atiendas a mano: cargás una cuenta en 🔑 Stock y
   tocás **Reintentar**.

El precio lo lee la base, nunca el navegador. Las credenciales salen solo por
`ver_mi_pedido(token)` y solo con el pedido entregado. Todo está en
`supabase/05-cobros.sql`, comentado línea por línea.

**Probarlo sin mover los interruptores:** `supabase/prueba-entrega.sql`
tiene cuatro bloques para el SQL Editor. Crean un producto de prueba con una
cuenta, confirman el pago y limpian. El link para abrir la página de pago con
ese producto está en el mismo archivo. Así se probó el 7/9/2026.

**Lo que todavía no hace**

- Un pedido es un producto, una unidad. Un carrito con varios artículos sigue
  por WhatsApp.
- Las recargas de juegos no entran, a propósito: no se entrega una cuenta, se
  carga saldo al ID del jugador. Siguen con su flujo.
- Nadie llama a `vencer_pedidos()` todavía. Los pedidos que nunca se pagan
  quedan en *esperando pago* hasta que la corras desde el SQL Editor
  (`select public.vencer_pedidos();`) o la programes con pg_cron.
- La confirmación la das vos. Un webhook de pasarela entraría por la misma
  `confirmar_pago()`, sin tocar nada más.

---

## Fase 2 (recomendada antes de publicar): las imágenes

Hoy cada imagen viaja **adentro** del producto, como texto base64. Eso venía
del límite de 1 MB por documento de Firestore. Entre todas pesan **17 MB**.

El 7/9/2026 eso hizo que el panel no cargara: un `select *` de 17 MB se
pasaba del tiempo límite de Supabase (8 segundos) y la lista quedaba vacía
con un error 500. Se resolvió cambiando cómo se lee el catálogo, en
`js/productos-service-supabase.js`: primero todo menos la imagen, que llega
en un segundo, y después las imágenes aparte, en tandas de 10. La tienda y
el panel se ven enseguida y las fotos van apareciendo. Pero los 17 MB
siguen viajando: con una conexión lenta las últimas fotos tardan minutos, y
el navegador no puede cachearlas por separado ni cargarlas de a poco, porque
no son archivos, son texto adentro del JSON.

`supabase/04-storage.sql` deja todo listo para pasarlas a archivos de verdad.
Después de eso, `imagen` pasa a ser una URL normal, el catálogo pesa unos
pocos KB y el `loading="lazy"` que ya tienen las tarjetas por fin sirve.

La herramienta te dice cuánto pesan hoy tus imágenes, así podés decidir con el
número a la vista.
