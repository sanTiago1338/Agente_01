# Validación del kit

Comprobaciones realizadas:
- Sintaxis de src/terror-sprite.js y del JavaScript de demo/index.html.
- Existencia de las rutas de CSS, JS, captura, fondo y sprite utilizadas por la demo.
- Sprite seleccionado: PNG de 1774 × 887 píxeles, con canal alpha; proporción 2:1 para cuadrícula 4 × 2.
- Prueba del reproductor con DOM y temporizadores simulados: orden de los ocho fotogramas, finalización, pausa, bloqueo de reproducción mientras está pausado, detención con pestaña oculta, prefers-reduced-motion y limpieza al destruir.

Pendiente:
- Inspección visual de la demo en un navegador real, alineación final y suavidad perceptual.
- Integración y pruebas en el repositorio real de TIAGO STORE; ese código no fue suministrado en esta tarea.
- Rendimiento en teléfonos físicos y navegadores objetivo.

La prueba simulada no sustituye la verificación en navegador. El kit no modifica ni publica la tienda del usuario.
