# TIAGO STORE — Aparición animada

Kit de horror con la aparición de pelo largo que elegiste. Conserva el diseño y las imágenes de plataformas de tu tienda al integrarlo.

## Archivos
```text
TIAGO-PROYECTO-HORROR/
├── PROMPT-CLAUDE-CODE.md
├── README.md
├── assets/
│   └── images/
│       ├── aparicion-sprite.png   # 8 poses, 4 columnas × 2 filas, PNG transparente
│       └── fondo-pasillo.png      # fondo independiente, sin personajes ni textos
├── src/
│   ├── terror-sprite.js           # reproductor de fotogramas sin dependencias
│   ├── terror-sprite.css          # capas y transiciones
│   └── ambiente.css              # fondo y niebla opcional
├── demo/
│   ├── index.html                # abre para probar la secuencia
│   └── referencia-pagina.png     # tu captura; solo referencia, no publicar
└── docs/
    ├── INTEGRACION.md
    └── VALIDACION.md
```

## Verlo
Abre demo/index.html en Safari o Chrome. Pulsa «Ver personaje de cerca» para inspeccionar los ocho fotogramas. «Ver en mi página» lo muestra sobre tu captura sin reorganizar las tarjetas. «Pausar» detiene el movimiento. Si tu dispositivo tiene «reducir movimiento», se conserva una pose fija.

La captura no es una tienda funcional: sus botones no responden. El archivo de demo no sustituye tu sitio.

## Pasarlo a Claude Code
Entrega la carpeta completa junto con el repositorio real de tu tienda y pídele que siga PROMPT-CLAUDE-CODE.md. No debe reconstruir tu web a partir de la captura.

El sprite es la imagen que seleccionaste; el fondo se generó con IA. La animación reproduce poses ilustradas con cambios de cabeza y mandíbula: no es un GIF ni un video cinematográfico. Tu página pública todavía no ha sido modificada.
