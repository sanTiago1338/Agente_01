# Navidad en Tiago Store

El tema de Navidad de la tienda: fondo y aspecto navideño, **sin mover nada**
de la tienda. Se prende solo el **4 de noviembre** y se apaga solo después del
**6 de enero** (Reyes), con la fecha del celular de cada cliente.

## Qué se ve

| Adorno | Dónde |
|---|---|
| Mañana nevada: cielo celeste claro, velo champán, brillitos dorados (la tienda sigue clara) | Fondo de todas las páginas |
| Estrella de Belén que late | Arriba a la derecha del cielo |
| Nieve que cae, con polvo de oro y copos dorados (menos en el celular) | Detrás del contenido |
| El pueblo nevado de día: montañas, pinos, casitas claras, iglesia y el árbol con luces | Abajo de todo, detrás del contenido |
| Escarcha fina sobre el canto de las barras y guirnalda de perlas de luz en tonos de oro, que respiran despacio | Menú de arriba de cada página (y nieve en la barra de abajo) |
| Destello dorado de cuatro puntas que titila | Logo del menú, del pago, de Mis compras y del pie |
| Verde pino con destellos en las puntas y un filo de oro abajo | Franja de arriba |
| "OFERTAS NAVIDEÑAS" en oro laminado con reflejo, y una esfera dorada que cuelga | Título de las ofertas (index.html, `data-navidad`) |
| La marca sigue en su rosa (botones, pestañas, precios); adornos en oro y verde pino | Cinta verde "Navidad -7 %" en las rebajas |

La caja del QR del pago sigue blanca a propósito: el banco lee mejor el código.

## Los archivos

- `navidad.css`: los colores y los adornos. Está enlazado en cada página, pero
  todo empieza con `html.navidad` o `.nv-`: fuera de fecha no toca nada.
- `navidad.js`: lo que se mueve (el cielo, la nieve, las luces de las barras).
  Lo pide `js/temporada.js` solo en fecha; fuera de fecha no se descarga.
- `fondos/pueblo-de-dia.svg`: el pueblo nevado de día, abajo.
- `adornos/`: el destello, la esfera, el copo y la estrella.

## Sin mover nada

Ningún adorno ocupa lugar: el cielo va detrás de todo (`position: fixed`,
`z-index: -1`) y lo demás va suelto (`position: absolute`) encima o debajo de
lo que ya estaba. Medido en noviembre de 2026, con y sin el tema, en compu
(1366 px) y celular (390 px): tienda, Planes, Contacto, Recargas, Pago y Mis
compras quedan en el mismo píxel (0 elementos movidos).

Con "reducir movimiento" no cae nieve y las luces no titilan.

## Para verlo fuera de fecha

En la dirección de la tienda: `?tema=navidad` (ver), `?tema=normal` (apagar
para comparar) y `?tema=auto` (volver a las fechas). La pestaña se acuerda
mientras navegás.

## Cambiar las fechas

En `js/temporada.js`, la lista `TEMPORADAS`:
`{ tema: 'navidad', desde: '11-04', hasta: '01-06', ... }` (mes-día).
