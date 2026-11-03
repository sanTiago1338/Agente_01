# Navidad en Tiago Store

El tema de Navidad de la tienda: fondo y aspecto navideño, **sin mover nada**
de la tienda. Se prende solo el **4 de noviembre** y se apaga solo después del
**6 de enero** (Reyes), con la fecha del celular de cada cliente.

## Qué se ve

| Adorno | Dónde |
|---|---|
| Noche de invierno: azul profundo, aurora verde y celeste, estrellas | Fondo de todas las páginas |
| Estrella de Belén que late | Arriba a la derecha del cielo |
| Nieve que cae (menos copos en el celular) | Detrás del contenido |
| El pueblo nevado: montañas, pinos, casitas con luz, iglesia y el árbol con luces | Abajo de todo, detrás del contenido |
| Nieve sobre el canto de las barras y guirnalda de luces que titila | Menú de arriba de cada página (y nieve en la barra de abajo) |
| Gorro de Papá Noel sobre la T | Logo del menú, del pago, de Mis compras y del pie |
| Copos en las puntas | Franja de arriba |
| "OFERTAS NAVIDEÑAS" con un regalo | Título de las ofertas (index.html, `data-navidad`) |
| Dorado de las luces como color de la marca, verde pino de acento | Botones, pestañas, precios, descuentos ("Navidad -7 %") |

La caja del QR del pago sigue blanca a propósito: el banco lee mejor el código.

## Los archivos

- `navidad.css`: los colores y los adornos. Está enlazado en cada página, pero
  todo empieza con `html.navidad` o `.nv-`: fuera de fecha no toca nada.
- `navidad.js`: lo que se mueve (el cielo, la nieve, las luces de las barras).
  Lo pide `js/temporada.js` solo en fecha; fuera de fecha no se descarga.
- `fondos/pueblo-nevado.svg`: el pueblo de abajo.
- `adornos/`: el gorro, el regalo, el copo y la estrella.

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
