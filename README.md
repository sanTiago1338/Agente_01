# Tiago Store

Tienda de cuentas de streaming, apps premium, herramientas de IA y recargas
de juegos, en Bolivia. Precios en bolivianos, pago por QR y entrega
automática de la cuenta en la misma página.

**En vivo:** <https://santiago1338.github.io/Agente_01/>

---

## Cómo está hecha

Páginas HTML sueltas, sin framework ni compilación: lo que está en el
repositorio es exactamente lo que sirve el navegador. Los datos salen de
**Supabase** (Postgres + Auth + Storage), y GitHub Pages sirve los archivos.

No hay servidor propio. Todo lo que necesita privilegios —cobrar, entregar
una cuenta, avisar por Telegram— vive adentro de la base como funciones, y
las políticas de la base son las que deciden quién puede qué.

---

## Levantarla en tu máquina

```bash
powershell -File servidor.ps1
```

Y abrí <http://localhost:8099/>. Hace falta un servidor de verdad: abriendo
el HTML con doble clic el navegador bloquea los módulos y no carga ni el
catálogo ni el panel.

`servidor.ps1` usa HttpListener, que ya viene con Windows. No hay nada que
instalar.

> Manda `Cache-Control: max-age=60`. Si tocás algo y "no toma", agregá
> `?v=1` a la URL antes de sospechar del código.

---

## Qué hay en cada lado

### Lo que ve el cliente

| Archivo | Qué es |
|---|---|
| `index.html` | La tienda: catálogo, buscador, categorías, carrito |
| `planes.html` | Tablas de precios por modalidad |
| `recarga-juegos.html` | Recargas de juegos, con sus paquetes |
| `pagar-qr.html` | El QR, y donde le aparece la cuenta al confirmarse el pago |
| `mis-compras.html` | Su historial, guardado en su propio navegador |
| `contacto.html` | Contacto |

### El panel

En `admin/`, con login propio. Cuatro vistas: **Productos**, **Juegos**,
**Ventas** y **Stock**. Cada una vive en su archivo de `admin/js/`.

Para entrar hace falta dos cosas: una cuenta en Supabase Auth **y** estar en
la tabla `admins`. Lo primero solo te deja mirar; lo segundo es lo que te
deja guardar.

### El puente con la base

| Archivo | Para qué |
|---|---|
| `js/supabase-base.js` | La conexión de la tienda pública. Sin sesión |
| `js/supabase-config.js` | La del panel. Esta sí guarda sesión |
| `js/productos-service.js`, `js/juegos-service.js` | De dónde salen productos y juegos |
| `js/panel-datos.js`, `js/panel-auth.js` | De dónde salen los datos y el login del panel |
| `js/mapeo.js` | Traduce `precio_oferta` (base) ↔ `precioOferta` (front) |
| `js/pedido-automatico.js` | El pedido y la espera de la confirmación |
| `js/historial.js`, `js/stock-tienda.js` | Historial del cliente y stock visible en la tienda |

### La base

Los `.sql` de `supabase/` son el esquema completo, en orden. Se pueden
correr de nuevo sin romper nada.

| Archivo | Qué crea |
|---|---|
| `01-esquema.sql` | Tablas `productos` y `juegos` |
| `02-seguridad.sql` | Quién puede leer y escribir cada cosa |
| `03-realtime.sql` | Que la tienda se actualice sola al editar |
| `04-storage.sql` | El bucket `imagenes` y sus permisos |
| `05-cobros.sql` | `pedidos`, `cuentas` y la entrega automática |
| `06-avisos.sql` | Los avisos de pedido nuevo por Telegram |
| `functions/webhook-pago/` | La puerta para que la pasarela confirme sola |

---

## Dos decisiones que conviene conocer

### Los nombres de los campos

Postgres usa `precio_oferta`, el front usa `precioOferta`. La traducción
vive **entera en `js/mapeo.js`**, en una sola lista. Para agregar un campo:
una línea ahí y una columna en `01-esquema.sql`. No hay un segundo lugar.

### El panel habla en otro idioma

El CRUD del panel le pide cosas a la base con nombres tipo
`updateDoc(doc(db, 'productos', id), {...})`, que vienen de la biblioteca
con la que se escribió originalmente. `js/supabase-compat.js` los traduce.

Se hizo así porque de esas 1.600 líneas, 13 hablan con la base: el resto es
interfaz ya probada. Es un puente, no un destino — las llamadas se pueden ir
pasando a Supabase nativo de a una, y las dos formas conviven.

---

## Las imágenes

Las fotos de los productos viven en el bucket `imagenes` de Supabase, con
caché de un año. Los logos genéricos son archivos en `Img/opt/`.

`Img/opt/` es la versión liviana de cada logo, y es la **única** que se
sirve: tanto la tienda como el panel reescriben cualquier ruta `Img/algo.jpg`
a `Img/opt/algo.jpg`. Los originales se borraron por peso; si hace falta
volver a generarlos, están en el historial:

```bash
git checkout 4d67da4 -- Img/
powershell -File optimizar-imagenes.ps1
```

Cuando subís una foto desde el panel, el navegador la comprime y al guardar
se va sola al bucket: en la fila del producto queda solo la URL. Si
reemplazás una foto y la anterior no la usa nadie más, se borra del bucket.

`backup/migrar-imagenes-supabase.html` sigue estando por si alguna vez
aparecen fotos pegadas —de una importación, o de una URL pegada a mano— y
hay que moverlas en lote.

---

## El cobro

Está explicado aparte, con detalle, en **[COBROS.md](COBROS.md)**: cómo
cargar stock, qué protege tu plata, y qué falta para que el pago se detecte
solo sin que confirmes a mano.

En resumen: el cliente paga por QR y avisa por WhatsApp, vos tocás
**Confirmar pago** en 💳 Ventas, y la cuenta le aparece sola en su pantalla.
Si no había stock, el pedido queda marcado para atenderlo a mano.

---

## Si algo sale mal

**"No se pudo guardar: tu usuario no tiene permiso"** — tu usuario no está en
la tabla `admins`.

**La tienda carga pero no se actualiza sola** — Realtime no quedó encendido.
Corré `supabase/03-realtime.sql` y comprobá:

```sql
select tablename from pg_publication_tables where pubname = 'supabase_realtime';
```

Tienen que salir `productos`, `juegos` y `pedidos`.

**El correo de "recuperar contraseña" no llega** — con el plan gratis
Supabase manda pocos por hora y suelen caer en spam. Para producción:
Authentication → Emails → SMTP, con tu propio proveedor.

**El catálogo tarda mucho** — mirá si volvieron a guardarse fotos pegadas:

```sql
select count(*) filter (where imagen like 'data:image/p%'
                           or imagen like 'data:image/w%') as pegadas,
       pg_size_pretty(sum(length(imagen))::bigint) as peso
from public.productos;
```

---

## Contacto

WhatsApp **+591 57707335**, todos los días.

---

Proyecto privado · Tiago Store Bolivia
