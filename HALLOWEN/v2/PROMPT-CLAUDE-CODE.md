# TIAGO STORE — EL CATÁLOGO MALDITO
## Instrucción para Claude Code

Implementa un rediseño Halloween completo, aterrador y cinematográfico en MI TIENDA EXISTENTE. Usa la imagen de referencia adjunta como dirección visual, no como una imagen gigante que reemplaza la interfaz. Aplica el tema a TODAS las plataformas reales y a todas las pantallas existentes, no solo a una portada o cinco tarjetas. Mantén el sitio funcional. No publiques ni despliegues sin que yo lo solicite.

### 1. Inspección y alcance real
Antes de editar, inspecciona estructura, stack, componentes, rutas, estilos, catálogo, categorías, datos y flujo de compras. Trabaja con el catálogo real como única fuente de verdad. Crea un inventario de las rutas y tipos de componente que necesitan el tema. Lee las instrucciones del repositorio.

La referencia visual puede mostrar Netflix, Disney+ con ESPN, Disney+ Estándar, Paramount+, Gemini, iQIYI, Max, Prime Video, YouTube Premium, Tele Latino, Spotify, ChatGPT, Canva, VPN y combos. Son ejemplos visuales: incluye cada uno SOLO si ya está en mi catálogo. También incluye automáticamente todas las demás plataformas existentes, aunque no aparezcan en la referencia. No borres, dupliques, renombres ni añadas productos para hacer coincidir el dibujo. Conserva imágenes, logos, planes, duración, stock, moneda, precios, condiciones, enlaces y credenciales existentes.

### 2. Concepto: EL CATÁLOGO MALDITO
La tienda debe parecer un portal de entretenimiento embrujado: mansión abandonada, luna roja, humo bajo, madera quemada, sombras profundas, telarañas finas y calabazas con ojos de brasa. Terror cinematográfico serio, oscuro y elegante. Nada infantil, emojis gigantes o decoración que tape los productos. Sin gore explícito ni sustos repentinos.

Paleta centralizada:
- Fondo global: #08090B.
- Superficie: #141115.
- Superficie elevada: #20151A.
- Borde oscuro: #493039.
- Rojo sangre: #B51F32.
- Naranja brasa: #F07838.
- Texto principal: #F5EBDD.
- Texto secundario: #C2B5AD.
- Éxito, error y advertencia: conservar diferenciación semántica y contraste; no convertir todos los estados en rojo.

Usa una fuente condensada contundente en títulos y la sans serif del proyecto en controles, precios y párrafos. Textura desgastada solo en títulos grandes o assets decorativos. Precios, condiciones y etiquetas deben ser perfectamente legibles. Comprueba contraste WCAG AA; adapta los tokens si una combinación falla.

### 3. Recursos gráficos
Usa referencia-diseno-completo.png como guía de composición, atmósfera y tarjetas. Usa los PNG de logo, emblema y fondo adjuntos como recursos separados. Conserva transparencia y proporción. Integra cada recurso en su componente correspondiente; no conviertas toda la página en un screenshot.

Los logos oficiales de plataformas se toman de los assets actuales. No recortes logos del mockup: el texto generado puede tener imprecisiones. No inventes logos de plataformas. Conserva también los posters comerciales reales de mis tarjetas si ya existen. Añade la ambientación alrededor de ellos con degradados y bordes sin modificar la imagen original.

### 4. Encabezado y navegación
- Logo TIAGO STORE de Halloween con tamaño legible y altura limitada.
- Navegación real: conservar los destinos existentes.
- Búsqueda, usuario y carrito con contador real.
- Fondo oscuro con borde de brasa muy fino, sin un gran bloque naranja.
- Banner breve «EDICIÓN HALLOWEEN», sin ofertas o escasez inventadas.
- Conservar el indicador de modo prueba cuando exista, sin solapamientos.
- Barra inferior existente de móvil: Plataformas, Juegos, Historial, Carro, Usuario. Mantener sus acciones, estado activo, notificaciones y badges reales. No añadir destinos vacíos si no existen.

### 5. Hero compacto
Hero de 360–480 px en escritorio y 260–360 px en móvil, para que el catálogo no quede enterrado. Imagen de mansión y luna a la derecha; degradado oscuro a la izquierda. El título debe ser HTML accesible:

ENTRA SI TE ATREVES.
Tus plataformas favoritas. Una noche de terror.
Botón: EXPLORAR CATÁLOGO → desplaza al catálogo real.

Móvil: reencuadra la imagen sin perder el punto focal ni sacrificar contraste. Nada de cuenta regresiva, ofertas, ventas recientes o reseñas inventadas.

### 6. Catálogo completo, basado en datos
Encabezado «EL CATÁLOGO MALDITO». Conserva todas las categorías existentes: Todos, Streaming, Música, IA & Tools, Combos, VPN, Seguidores y cualquier otra real. Conserva los subfiltros existentes, incluidos Mensual, 1 Pantalla, 1 Dispositivo, Cuenta Completa, Redes Sociales, Premium y Semanal cuando correspondan. Mantén ordenamiento, búsqueda, paginación y carga incremental existentes.

No hardcodees un catálogo reducido en un nuevo componente. Reutiliza los datos y renderizadores actuales. Todo producto actual y futuro debe heredar el tema automáticamente. Si una plataforma no tiene un acento asignado, utiliza el estilo neutro de Halloween sin romper la tarjeta.

Categorías activas: fondo burdeos, borde de brasa y texto marfil. Inactivas: superficie negra, texto claro. En móvil, permitir scroll horizontal de filtros sin overflow de la página. Muestra estados de búsqueda sin resultados y botón para limpiar filtros.

### 7. Sistema visual para TODAS las tarjetas
Crea o modifica un componente reutilizable que cubra todas las plataformas. Misma altura de medios, proporciones consistentes, títulos de hasta dos líneas y botones alineados. Mantén precios y datos reales.

Estructura:
1. Imagen o logo real, con recorte apropiado para posters y contain para logos.
2. Nombre original completo.
3. Descripción o atributos reales del producto, si existen.
4. Precio y disponibilidad reales si ya se muestran.
5. CTA funcional original: «VER CATÁLOGO», «VER PLANES» o el que use la tienda.

Fondo de tarjeta #141115, borde fino, radio 12–16 px, sombra oscura profunda. Telaraña decorativa diminuta en alguna esquina y luz tenue desde abajo. Nunca pongas niebla por encima de títulos o precios. Hover: desplazamiento vertical de hasta 4 px y brillo de borde suave en 180–240 ms. Sin tilt 3D que dificulte pulsar.

Acentos sugeridos SOLO de ambientación; respeta logos oficiales:
- Netflix: rojo carmesí.
- Disney+/ESPN: azul noche y violeta, con acento rojo mínimo.
- Disney+ Estándar: turquesa oscuro.
- Paramount+: azul frío.
- Gemini: azul/violeta con detalles suaves cálidos.
- iQIYI: verde oscuro.
- Max: violeta profundo.
- Prime Video: azul petróleo.
- YouTube: rojo oscuro.
- Tele Latino: ámbar y azul oscuro.
- Spotify y música: verde bruma.
- ChatGPT/IA: verde petróleo o el acento de marca existente.
- Canva/herramientas: turquesa/violeta.
- VPN: azul acero.
- Combos: naranja brasa.
- Seguidores/redes: magenta profundo.
- Cualquier otra plataforma: rojo brasa neutro.
Usa un mapeo opcional de acentos por identificador estable; no acoples el funcionamiento del catálogo a estas marcas.

### 8. Todas las pantallas y estados existentes
Aplica la misma identidad a:
- Catálogo principal y categorías.
- Listas de planes de cada plataforma.
- Detalle de producto y selectores de pantalla, dispositivo, duración o cantidad.
- Combos, música, IA, VPN, seguidores y juegos si existen.
- Carrito, resumen, cupones existentes y checkout.
- Inicio de sesión, registro y recuperación de acceso.
- Perfil, historial, pedidos y detalle de pedido.
- Contacto, ayuda y WhatsApp existentes.
- Modales, menús desplegables, tooltips, toasts y confirmaciones.
- Carga, skeletons, error, agotado, vacío y sin resultados.
No crees páginas ficticias por completar una lista. Modifica las que existan y documenta el alcance final.

En pagos, formularios y condiciones usa fondos casi lisos para evitar distracciones. No cambies lógica de pagos ni integraciones. No sustituyas botones reales por un modal de demo. Conserva los mensajes transaccionales y sus significados. No temas de Halloween dentro de mensajes que impidan entender un error.

### 9. Animaciones y ambiente
Niebla muy tenue en el fondo del hero con ciclo de 25–40 segundos; murciélagos decorativos discretos en la portada; pulso leve de brasa en la calabaza; telarañas en esquinas amplias. Mantén pocos elementos y detén animaciones fuera de viewport si es apropiado.

Toda decoración: pointer-events: none, aria-hidden=true y por detrás de contenido interactivo. Respeta prefers-reduced-motion y elimina efectos no esenciales. Prohibido audio automático, estrobos, parpadeos rápidos, jumpscares, overlays que bloqueen compras y cursores personalizados obligatorios. No añadas canvas o librerías de partículas pesadas para estos detalles.

### 10. Responsive y accesibilidad
- Pantallas amplias: hasta 5 columnas cuando las tarjetas conserven ancho legible.
- Tablet: 3 o 4 según espacio disponible.
- Móvil: 2 columnas, 1 cuando sea necesario por ancho o contenido.
- Texto sin truncar información de planes o precios.
- Controles táctiles de al menos 44 px.
- Foco visible y navegación por teclado.
- Modales con título accesible, cierre con Escape y gestión de foco.
- Barra inferior con safe-area-inset-bottom y espacio reservado para no tapar contenido.
- WhatsApp mantiene su enlace real y no se superpone con carrito o navegación.
- Sin scroll horizontal involuntario a 320, 375, 768, 1024 y 1440 px.

### 11. Arquitectura y rendimiento
Implementa el tema bajo clase o atributo global, como data-theme="halloween", con tokens CSS coherentes para poder desactivarlo fácilmente. No sobrescribas estilos con reglas universales agresivas. No cambies de framework. Evita duplicar componentes y datos. Conserva renderizado, accesibilidad y manejo de estados del proyecto.

Optimiza imágenes a WebP/AVIF cuando proceda, manteniendo PNG o WebP con alpha para logos. Usa srcset si el proyecto lo admite. Dimensiones explícitas para evitar layout shifts. Carga diferida bajo el primer viewport, nunca para la imagen principal si afecta LCP. Fuente local o fallback sólido. No agregues dependencias grandes para decoración.

### 12. Validación y entrega
Ejecuta los checks existentes correspondientes. Prueba con los datos reales: cada categoría, filtros combinados, búsqueda, orden, carga de todo el catálogo, planes, selección, carrito y navegación hasta checkout. No completes transacciones reales. Comprueba también perfil, historial y contacto cuando haya acceso.

Revisa al menos un producto de cada categoría y los estados vacío/error/carga relevantes. Comprueba que el número de productos antes y después coincida y que ninguna plataforma haya desaparecido. Verifica teclado, foco, reduced motion, contraste y solapamientos móviles. Genera capturas de escritorio y móvil si puedes.

Entrega: archivos cambiados, pantallas cubiertas, pruebas realmente ejecutadas y cualquier límite o problema pendiente. No afirmes verificaciones que no hiciste. La meta es mi tienda REAL completa funcionando con una estética de terror convincente, no una landing con tarjetas de muestra.
