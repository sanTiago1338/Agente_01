# MEJORAR TODO EL FONDO — TIAGO STORE HORROR V2

Me gusta la dirección de garras y sangre. Mejora ahora TODO EL FONDO con más profundidad y tensión, manteniendo esa base. Quiero paredes húmedas con rostros apenas insinuados, sombras laterales que se acercan, niebla baja y una aparición ocasional integrada detrás del contenido. No pegues una cabeza sobre un banner promocional.

Trabaja sobre mi proyecto existente. Conserva exactamente distribución, dimensiones, imágenes comerciales, logos, textos, precios, productos, planes, filtros, carrito y navegación. No agregues un hero ni reorganices la página. No publiques automáticamente.

## Archivos
- assets/garra.png: mano espectral transparente; espejar para el lado derecho.
- assets/sangre.png: textura transparente de sangre de utilería para el fondo.
- assets/fondo.png: fondo oscuro independiente.
- src/efecto.css y src/efecto.js: garras y sangre.
- assets/aparicion-sprite.png: ocho poses de la aparición de pelo largo seleccionada anteriormente.
- src/terror-sprite.css y src/terror-sprite.js: reproductor de la secuencia.
- src/ambiente.css y src/ambiente.js: coordinador V2 de fondo, niebla, sombras, aparición, garras y sangre. Sin dependencias.
- VER.html: demostración aislada, NO reemplaza mi página ni su diseño.

Estos son PNG animados por código, no un GIF. Se eligió código para poder ubicar las garras alrededor del título REAL y controlar la sangre detrás de los productos, con pausa y accesibilidad.

## Corrección concreta
1. Quita la aparición que quedó incrustada como una cabeza pequeña en el banner promocional. Desmonta sus listeners/timers antes de retirarla; no borres el banner ni su contenido comercial.
2. Encuentra el contenedor real del título/logo TIAGO STORE. Usa ese mismo elemento; no reemplaces su texto por una imagen nueva ni cambies su tamaño, fuente, alineación o enlaces.
3. Coloca una garra a cada lado, por detrás y alrededor del título. La izquierda entra desde fuera hacia dentro y la derecha se refleja. Ambas cierran lentamente como si sujetaran el nombre. No tapar ninguna letra ni navegación adyacente. Si el título no tiene espacio suficiente, reduce las manos o muestra solo los dedos visibles mediante recorte, sin mover otros componentes.
4. Una fracción de segundo después del agarre, haz aparecer una mancha de sangre oscura en el borde superior del fondo y que escurra hacia abajo. Debe sentirse como un evento de terror, no como un rojo uniforme ni confeti.
5. Sangre solamente en la capa decorativa detrás del contenido, visible en márgenes y espacios libres. Nunca teñir fotos de plataformas, precios, botones o formularios; no colocar una capa roja sobre el viewport entero.
6. Usa el pasillo oscuro como fondo de las superficies decorativas existentes. Sustituye el púrpura decorativo por negro carbón y burdeos donde sea parte del tema, sin recolorear posters o banners comerciales incrustados como imagen. Mantén las imágenes originales intactas.
7. Conserva toda la legibilidad y el funcionamiento. El miedo lo aportan las garras, sangre y ambiente; no deformes la interfaz.

## Secuencia
- Entrada: garras avanzan hacia el título durante aproximadamente 0,8 s.
- Agarre: dedos se cierran unos pocos píxeles, sin mover las letras.
- Sangre: aparece rápidamente alrededor del segundo 1,2 y escurre en 2–3 s.
- Retirada: todo se desvanece lentamente.
- Descanso: mínimo 18 s antes de repetir. No reinicies constantemente al mover el cursor.
No audio automático, destellos, pantallas rojas completas ni bloqueo de controles. El usuario pidió sangre ficticia como ambientación, no daño a personas ni imágenes de heridas.

## Integración
Lee los archivos e integra en el framework real. No copies el markup, textos o tamaños de VER.html. Ejemplo de API, con elementos y rutas que debes adaptar:

```js
const efecto = window.TiagoHorrorFondo.mount({
  wall: '/assets/horror/fondo.png',
  sprite: '/assets/horror/aparicion-sprite.png',
  title: contenedorRealDeLaMarca,
  background: contenedorDecorativoDeFondo,
  hand: '/assets/horror/garra.png',
  blood: '/assets/horror/sangre.png',
  onError: error => console.warn('Asset decorativo no disponible', error)
});
```

Carga los tres CSS y luego, en este orden: efecto.js, terror-sprite.js, ambiente.js. Monta SOLO TiagoHorrorFondo: este ya crea TiagoGarras y TiagoTerror internamente. No montes también los módulos por separado. Si hay un kit anterior instalado, destruye su instancia antes de montar V2.

El fondo debe ser un contenedor decorativo posicionado, fuera del flujo, con tamaño apropiado a la sección real y detrás del contenido. Su geometría no la define el kit. No lo crees encima de todo con un z-index alto. No conviertas contenedores de checkout en overlays.

El módulo añade elementos absolutos al título y establece position:relative solo si era static, además de isolation:isolate. Verifica cómo interactúa con los stacking contexts de tu proyecto. Si el título es un img o un elemento que no admite hijos, pasa su contenedor real existente. No añadas hijos a img/input ni un wrapper que cambie geometría sin comprobarlo.

Ajusta los offsets/tamaños de las manos en CSS al espacio libre real, preservando el título y sus enlaces. El script no conoce la estructura de tu web. Si necesitas un wrapper decorativo, que sea absoluto y sin participación en flex/grid.

Pausa: efecto.pause(true/false). Reproducir una vez: efecto.play(). Desmontar en SPA: efecto.destroy(). Carga archivos una vez, limpia timers y no montes múltiples instancias sobre la misma marca. Integra el control de pausa en los ajustes de efectos existentes, sin copiar la barra de la demo.

## Móvil y accesibilidad
Respeta prefers-reduced-motion: no reproducir el evento si está activo. Detén los efectos con la pestaña oculta. En móvil, garras pequeñas o recortadas al margen disponible; si no caben sin tapar controles, omítelas y conserva el fondo. Todos los adornos aria-hidden, pointer-events:none, sin foco. Sin cambios en tab order ni mensajes transaccionales.

## Validación
Comprueba en navegador real:
- Título y navegación sin desplazamiento ni letras ocultas.
- Imágenes/URLs, precios, filtros y catálogo intactos.
- Manos visibles en ambos lados y sangre visible SOLO en el fondo.
- La animación inicia, termina y respeta la pausa entre ciclos.
- Pausa, reduced motion, pestaña oculta, cleanup SPA y assets cargados.
- 375 px, 768 px y escritorio; sin overflow ni solapamientos.
- Carrito, planes, enlaces y contacto siguen funcionando. No efectuar compras reales.

Si la vista previa reporta document.hidden incorrectamente, informa el límite y prueba en una pestaña visible real. No quites permanentemente el respeto a visibilityState del código de producción para hacer pasar una prueba.

Entrega los cambios implementados y verificaciones realmente realizadas. No afirmar que una captura estática demuestra la animación. No publicar hasta que yo lo pida.


## Coordinación del ambiente V2
- Fondo de paredes húmedas y profundidad: visible en las superficies decorativas existentes. Nunca aplique el fondo sobre un poster.
- Sombras laterales: ciclo lento de 17 segundos, baja opacidad, detrás de contenido.
- Niebla: capas de 33 y 41 segundos, sin cubrir textos.
- Aparición: aparece tras unos segundos y ejecuta su secuencia de ocho poses, luego desaparece y descansa. Es parte del fondo, no del carrusel comercial. Limita su zona a espacio decorativo libre; el código contiene posiciones de partida que DEBES adaptar a la franja real sin mover componentes.
- Garras y sangre: evento de unos 7 segundos con 24 segundos de descanso en V2. No saturar toda la página de rojo.
- No añadir más efectos encima de estos. La prioridad es la legibilidad y la tensión visual.
- El coordinador expone pause, play y destroy. play reproduce el evento de garras/sangre; las apariciones tienen su temporización independiente. Pausa y destroy afectan todos los módulos.
- La demo muestra el ambiente en un espacio de prueba. No copies su tamaño ni contenido en la tienda. En la tienda real la decoración quedará parcialmente oculta por los paneles, de forma deliberada.
