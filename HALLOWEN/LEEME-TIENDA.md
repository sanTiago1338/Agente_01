# HALLOWEEN DE TERROR — cómo está puesto en la tienda

Esta carpeta junta los tres kits de terror y lo que los conecta con la
tienda. Solo decora: no cambia productos, precios, textos, fotos, botones
ni el lugar de nada (medido elemento por elemento, con y sin esta
carpeta, en las 6 páginas, en compu y en celular: 0 elementos movidos).

## Cuándo se ve

Lo prende `js/temporada.js` junto con el tema de Halloween, del **24 de
octubre al 2 de noviembre**. El 3 de noviembre se apaga solo y la tienda
ni siquiera descarga esta carpeta.

Para mirarlo fuera de fecha, o compararlo, en la dirección de cualquier
página:

- `?tema=halloween` — prendido
- `?tema=normal` — apagado
- `?tema=auto` — vuelve a las fechas

## Qué se ve

| Pieza | Dónde | De dónde sale |
|---|---|---|
| Pasillo de paredes húmedas con rostros | Fondo de todas las páginas | Kit de garras, `web/fondo-garras.jpg` |
| Mansión con la luna roja, arriba | Todas las páginas; al bajar se funde en el pasillo | Kit v2, `web/fondo-mansion.jpg` |
| Sombras a los costados y dos nieblas lentas | Fondo de todas las páginas | Kit de garras |
| Aparición de pelo largo (8 poses) | Sale cada tanto en el fondo, detrás del contenido (no en celular) | Kit 1 / kit de garras, `web/aparicion-sprite.webp` |
| Garras que agarran el título | En la barra de arriba, a los lados del logo | Kit de garras, `web/garra.webp` |
| Sangre que escurre | En el fondo, detrás del contenido, junto con las garras | Kit de garras, `web/sangre.webp` |
| Logo de terror en lugar de "TIAGO STORE" | Menú, pago, Mis compras y pie | Kit v2, `web/logo-tiago-halloween.webp` |
| Calabaza quemada | Franja de arriba y "DESCUENTO HALLOWEEN" | Kit v2, `web/emblema-calabaza.webp` |
| Borde rojo al pasar el mouse | Tarjetas de plataformas y de ofertas | Kit 1 |
| Vidrio carbón en lugar de violeta | Todas las piezas de vidrio | — |

El evento de las garras y la sangre dura 7 segundos y se repite cada
medio minuto: las dos garras dan tres zarpazos seguidos sobre el logo
mientras escurre la sangre. Entre evento y evento las garras no se quedan
quietas: salen solas a zarpazos, una tras otra (izquierda, derecha, las
dos juntas y un respiro de casi 2 segundos), apretando, temblando y
rasguñando el logo (`horror.js`, `acechar`; `horror.css`, "LOS
ZARPAZOS"). La aparición sale a los 8 segundos y después cada medio
minuto. Todo se detiene con la pestaña oculta y con "reducir movimiento".

## Decisiones de la integración

- **La aparición salió del banner.** El kit de garras pide "no pegues
  una cabeza sobre un banner promocional": ahora es parte del fondo.
- **Las garras van delante del logo, pero solo en sus extremos.** El kit
  las pone detrás del título; acá no se veían, porque el logo de terror
  tiene un halo de espinas oscuras casi opaco. Van en un marco suelto
  junto al título, recortado a la fila del logo: nunca tapan una letra,
  la franja de arriba, la de abajo ni los enlaces del menú.
- **El título sigue siendo el logo de terror del kit v2.** El kit de
  garras pide no reemplazar el texto por una imagen; se dejó el logo
  porque así se pidió para el título. Para volver a las letras, borrar
  la sección "4. EL TÍTULO" de `horror.css`.
- **En el celular** la aparición no sale (lo decide el kit) y su imagen
  no se descarga.

## Archivos

- `horror.css`, `horror.js` — lo que conecta los kits con la tienda.
  Los carga `js/temporada.js`, con la misma versión (`?v=…`).
- `web/` — las imágenes que usa la tienda, optimizadas.
  `fondo-pasillo.jpg` (el pasillo del primer kit) queda de repuesto.
- `garras/` — el kit de garras y sangre tal como vino (su código se usa
  sin cambios desde `garras/src`).
- `v2/` — el kit v2 tal como vino.
- `assets/`, `src/`, `docs/`, `README.md`, `PROMPT-CLAUDE-CODE.md` — el
  primer kit tal como vino.
- `demo/` y `v2/referencia-diseno-completo.png` — referencias, solo en
  esta compu: no se suben (el kit pide no publicar la captura).

## Lo que NO se hizo, a propósito

- El kit v2 (`v2/PROMPT-CLAUDE-CODE.md`) pide rediseñar la tienda entera:
  un banner nuevo con "ENTRA SI TE ATREVES", un título "EL CATÁLOGO
  MALDITO", otra forma para todas las tarjetas. Eso cambia la tienda y
  el pedido fue no modificarla.
- Los kits sugieren un botón "pausar efectos". La tienda no tiene un
  lugar de ajustes para eso y agregar un botón la modifica; los efectos
  ya se detienen solos con "reducir movimiento" del celular o la compu.
