# Integración técnica

Esto es un kit decorativo, no el código fuente de la tienda. No contiene credenciales ni conecta con pagos.

## 1. Recursos
Copia assets/images a una ruta pública de tu proyecto. Importa o incluye src/terror-sprite.css y src/ambiente.css, ajustando la URL relativa del fondo si tu bundler no la resuelve. Carga src/terror-sprite.js una sola vez. No usa npm ni dependencias.

## 2. Contenedor
Crea un contenedor decorativo con posición absoluta dentro de la franja de fondo libre de tu layout, con dimensiones definidas por tu componente. No crear espacio en el flujo, no cambiar altura del header, no aumentar separación de filtros. La imagen del personaje usa un viewport CUADRADO: dale un contenedor cuadrado dentro de la franja y recorta lo necesario desde el contenedor exterior. No estires el sprite a un rectángulo no cuadrado.

La API no establece tamaños ni cambia posicionamiento del elemento padre. Tú debes definirlo conforme al layout real. Si no hay espacio en móvil, oculta la aparición; no muevas productos para hacerla caber.

## 3. Montaje
```js
const horror = window.TiagoTerror.mount(contenedorDecorativo, {
  image: '/assets/horror/images/aparicion-sprite.png',
  autoplay: true,
  loop: true,
  restMs: 6000,
  onError(error) {
    console.warn('No se pudo mostrar el decorado de horror', error);
  }
});
```
La hoja tiene cuatro columnas y dos filas. El motor usa porcentajes para recortar cada celda: no necesitas dividir ni cambiar el PNG. Son ocho poses ilustradas, con transiciones breves de opacidad. No es video y no articula partes nuevas del cuerpo.

Si prefieres reproducir al abrir un catálogo real:
```js
const horror = window.TiagoTerror.mount(contenedorDecorativo, {
  image: '/assets/horror/images/aparicion-sprite.png',
  autoplay: false,
  loop: false
});
// Llamar desde el callback real que confirma que el panel abrió:
horror.play();
```
Una llamada durante una secuencia activa no reinicia la animación. La precarga debe haber terminado para iniciar la secuencia. No simula eventos ni hace clics.

## 4. Pausa y limpieza
```js
horror.pause(true);
horror.pause(false); // reanuda automáticamente si loop es true
horror.destroy();    // obligatorio al desmontar el componente en una SPA
```
Usa el ajuste real de efectos/animaciones del sitio si existe. Si hay niebla separada, sincroniza su atributo data-paused con esa preferencia y con document.hidden. El sprite se detiene al ocultar la pestaña y con prefers-reduced-motion. En modo de movimiento reducido se muestra la primera pose fija.

## 5. Fondo y marcos
Aplica data-tiago-horror-fondo solo a la superficie de fondo existente elegida, nunca a imágenes comerciales. El archivo ambiente.css no cambia tamaño, flex, grid, tipografía o espacio. Si el proyecto tiene fondos por pseudo-elemento, adapta esas reglas allí.

Atributo data-terror-card sobre tarjetas reales activa el contorno hover/foco de terror-sprite.css. No modifica su posición o contenido. Si ya existen sombras o foco, fusiona los estilos conscientemente para no degradar accesibilidad.

## 6. Verificaciones
Carga correcta de ambas imágenes; secuencia de 1 a 8 sin mostrar celdas vecinas; personaje cuadrado; pausa; reduced motion; cambio de ruta; no listeners duplicados; decoraciones por detrás; controles accesibles; no cambios en posters o layout; sin overflow. Inspecciona escritorio y móvil. DEMO no prueba la integración real.
