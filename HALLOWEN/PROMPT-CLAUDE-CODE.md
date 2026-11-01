# PROYECTO: FONDO DE HORROR ANIMADO PARA TIAGO STORE

Quiero que integres este kit en MI PÁGINA REAL. El personaje seleccionado es la aparición de pelo largo del archivo assets/images/aparicion-sprite.png. Usa ese personaje, no una monja, momia o criatura diferente. Quiero una atmósfera de horror sobrenatural adulta y cinematográfica, no un tema infantil.

## PRIORIDAD MÁXIMA: NO CAMBIAR MI DISEÑO
Conserva la estructura, distribución, dimensiones, tipografías, textos, columnas, espaciados, imágenes y logos de plataformas, rutas, categorías, productos, precios, planes y funciones actuales. No construyas otra tienda. No agregues un hero, portada, título, promoción, banner, filas de ejemplo ni nuevas tarjetas. No reemplaces productos con placeholders. No uses la captura como página. Solo añade una capa decorativa de fondo y animación en los espacios existentes.

Lee las instrucciones del repositorio. Identifica framework, entrypoints, componentes, estilos, rutas, fuente de catálogo y contenedores decorativos. Trabaja dentro de la arquitectura existente, sin migrarla, sin reinstalar todo ni agregar librerías pesadas. Si este kit está fuera del repositorio, copia sus assets y código a los lugares apropiados del proyecto.

## MATERIAL ENTREGADO
1. assets/images/aparicion-sprite.png: sprite transparente de 8 fotogramas en una cuadrícula exacta de 4 columnas y 2 filas. Es la aparición que elegí. Conserva el archivo.
2. assets/images/fondo-pasillo.png: fondo oscuro de pasillo abandonado, sin personaje ni textos. El personaje se anima por separado.
3. src/terror-sprite.js: reproductor global window.TiagoTerror con mount, play, pause y destroy. Lee el código antes de integrarlo; adapta solo lo necesario al framework.
4. src/terror-sprite.css: estilos acotados a la animación y contorno opt-in de tarjetas.
5. src/ambiente.css: fondo y niebla opcional. Sus rutas relativas pueden requerir ajuste con el bundler.
6. demo/index.html: prueba de referencia sobre mi captura y vista de cerca. NO copiar su HTML, botones, textos ni la captura en mi sitio real.
7. docs/INTEGRACION.md: contrato técnico y ejemplos.

No se entregan nuevos logos comerciales porque se conservan los de mi proyecto. No generes ni extraigas logos desde screenshots.

## UBICACIÓN SIN ALTERAR GEOMETRÍA
En la captura hay una franja de fondo entre el encabezado y la zona de categorías/filtros. Coloca la aparición en el espacio libre real de esa franja, hacia la derecha, usando un contenedor decorativo absoluto. Conserva la altura actual. No pongas la aparición encima de Recomendado, Filtrar, categorías, subfiltros, contacto ni del indicador de modo prueba.

El personaje debe tener un viewport cuadrado para que no se deforme. Puede quedar recortado por la franja: no es necesario mostrarlo entero. Si no hay espacio seguro en un breakpoint, reduce u oculta la aparición en ese breakpoint. NO muevas botones, tarjetas o navegación para crear espacio.

El fondo se aplica debajo de las superficies existentes y queda visible en márgenes/franjas/huecos. No debes volver transparentes los posters ni oscurecerlos para que se vea más el fondo. Conserva los fondos de formularios y checkout con contraste suficiente.

Las decoraciones usan aria-hidden=true, pointer-events:none, no tienen foco y no participan del flujo de layout. Controla stacking contexts; nunca uses un z-index alto encima del contenido interactivo. No impongas alturas de viewport, padding extra, position:fixed al contenido o overflow:hidden al body.

## QUÉ DEBE ANIMARSE
La aparición levanta la cabeza, cambia la dirección de la mirada, abre la mandíbula, vuelve a cerrar y se retira bajando el rostro. Reproduce los ocho fotogramas entregados: no sustituyas el sprite por una imagen con zoom y no muestres la hoja completa de ocho caras como fondo.

El motor ya controla background-size:400% 200% y background-position para recortar una celda. Verifica el resultado: ninguna celda vecina debe asomarse. Mantén una pausa oscura entre secuencias, por ejemplo 6 segundos. La mandíbula abierta aparece durante un tiempo limitado, sin sonidos ni destellos. No prometas video o movimiento articulado nuevo: es una secuencia de poses con transición breve.

Añade niebla tenue y lenta en el fondo, nunca delante de imágenes ni textos. Los bordes de tarjetas pueden iluminarse discretamente al pasar o enfocar, sin alterar tamaño, posición ni colores de los logos.

## MONTAJE
Adapta la ruta pública a mi proyecto. Ejemplo orientativo:
```js
const horror = window.TiagoTerror.mount(contenedorDecorativo, {
  image: '/assets/horror/images/aparicion-sprite.png',
  autoplay: true,
  loop: true,
  restMs: 6000
});
```
No pegues nombres de variables inexistentes: encuentra o crea el contenedor decorativo real. Usa dimensiones derivadas del layout, no coordenadas globales copiadas de la captura. Si trabajas en React/Vue/etc., monta en el ciclo de vida correcto y ejecuta horror.destroy() al desmontar; evita doble montaje y timers duplicados. Carga CSS y script una sola vez.

Si el proyecto tiene configuración de tema, integra allí un atributo como data-theme="horror" y un interruptor para activarlo/desactivarlo. No modifiques el modelo de datos del catálogo.

## REACTIVIDAD CON MI PÁGINA
La animación ambiental puede repetirse con las pausas indicadas. Si optas por activarla al abrir el catálogo, usa autoplay:false y loop:false y llama horror.play() desde el callback real de apertura exitosa, después de que el asset esté cargado. Elige un modo coherente; no dispares ambos a la vez ni reinicies continuamente por mousemove.

No inventes confirmaciones de compra, pedidos o stock. No cambies funciones de pagos, autenticación o carrito para introducir decoraciones. No interceptes enlaces ni hagas que el usuario interactúe con el personaje para comprar.

## CONSERVAR TODOS LOS COMPONENTES
- Header TIAGO STORE, logo y navegación.
- Indicador de modo prueba y Salir.
- Ordenamiento, Filtrar, categorías y todos los subfiltros.
- Catálogo completo, incluido lo que no aparece en la captura.
- Imágenes y logos actuales con el mismo src, srcset, object-fit y proporciones.
- Seis columnas al ancho de mi captura y los breakpoints originales.
- Botones VER CATÁLOGO y planes reales.
- Barra inferior Plataformas/Juegos/Historial/Carro/Usuario con contador y estados reales.
- WhatsApp y enlaces originales.
- Modales, perfil, historial, carrito y checkout.

## ACCESIBILIDAD, MÓVIL Y RENDIMIENTO
Respeta prefers-reduced-motion: usa pose fija cuando esté activo. La animación debe detenerse al ocultar la pestaña. Incluye o reutiliza un ajuste discreto «Pausar efectos» dentro de un espacio apropiado del sistema existente, sin añadir la barra de controles de la demo. Sin flashes, audio automático ni sustos que bloqueen contenido.

Si la niebla va separada, sincroniza también su pausa con la preferencia y la visibilidad de la pestaña. En móvil, reduce efectos u oculta el personaje antes de provocar solapamientos. Usa recursos locales. No añadas frameworks, librerías de partículas o GIF enormes. Puedes generar copias WebP de los nuevos PNG si el entorno lo permite, preservando alpha; no sobrescribas las imágenes originales de mis productos.

## VERIFICACIÓN
Compara antes/después a 375, 768 y el ancho desktop de referencia. Deben permanecer iguales las posiciones, dimensiones, imágenes y contenido del catálogo. Revisa visualmente el recorte de los ocho fotogramas, pausa/reanudación, reduced motion, pestaña oculta, ruta de assets, redimensionado y cleanup al navegar.

Verifica filtros, búsqueda si existe, orden, apertura de planes, carrito, perfil y contacto sin realizar compras reales. Revisa foco, contraste, clicks, consola, overflow y que ningún overlay cubra controles. Ejecuta los checks existentes relevantes; no afirmes pruebas que no ejecutaste.

## ENTREGA ESPERADA
Implementa los cambios en mi proyecto. Entrega un resumen breve con archivos cambiados, ubicación de los assets, comportamiento integrado, validaciones realizadas y límites pendientes. No publiques ni hagas deploy automáticamente.

El resultado debe ser mi misma tienda, con la aparición seleccionada animándose en el fondo y una atmósfera de horror, sin rediseñar mis plataformas ni su distribución.
