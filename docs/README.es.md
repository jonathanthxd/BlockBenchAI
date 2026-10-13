# BlockBenchAI — Guía rápida en español

**BlockBenchAI** es un plugin gratuito de código abierto para Blockbench. Incluye un chat nativo que utiliza modelos de IA externos para crear y modificar geometrías editables, generar texturas PNG por procedimientos y organizar componentes del modelo.

La **versión 0.5.1** continúa siendo experimental. Las pruebas automáticas simulan Blockbench y no sustituyen las pruebas con la aplicación real.

## Instalación

1. Descarga el archivo `blockbench_ai.js` de la rama `main` del [repositorio principal](https://github.com/jonathanthxd/BlockBenchAI).
2. Desinstala la versión anterior y **reinicia Blockbench**.
3. En Blockbench Desktop 5.x, carga el archivo desde el administrador de plugins o arrástralo al editor.
4. Crea un proyecto **Generic Model** y abre el panel **Blockbench AI**.

## Corrección 0.5.1 — «Demo Dron» sin API key

Puedes escribir **`Demo Dron`** directamente en el chat o pulsar **Demos → Dron**. Ambos caminos generan el modelo **localmente y sin conexión a una IA**. También funcionan `Demo Espada`, `Demo Androide` y `Demo Cofre`.

Si el chat ya tiene mensajes, el menú **Demos** sigue disponible sobre el historial. Si ves un error solicitando una API key, confirma primero que instalaste **v0.5.1**; la v0.5.0 interpretaba las instrucciones escritas como prompts remotos.

## Probar sin pagar nada y sin API key

En la pantalla inicial del chat encontrarás las demos **androide**, **dron** y **espada**. Hacen modelos con geometría editable, textura PNG interna y grupos organizados, sin conexión a ningún modelo remoto.

Es la manera más fiable de descubrir problemas en texturas o UV, separándolos de errores de las APIs. Usa **Ctrl+Z** para deshacer.

## Usar Cloudflare Qwen

1. Entra a tu cuenta Cloudflare y localiza tu **Account ID**, que tiene 32 caracteres.
2. Crea un **API token** válido para Workers AI. No publiques este token.
3. En el plugin abre **Ajustes → Cloudflare · Qwen Workers AI**.
4. Introduce el Account ID y deja como modelo `@cf/qwen/qwen3.8-27b`.
5. En **API key** introduce tu token secreto.
6. Pulsa **Probar conexión** y luego **Guardar configuración**.

También están disponibles Gemini, Groq, OpenAI y endpoints compatibles. La cuota gratuita varía según proveedor y puede cambiar.

## Qué puedes pedir

- «Crea una espada de energía detallada y texturizada».
- «Diseña un dron de ciencia ficción con motores, rotores, luces y cámara frontal».
- «Crea un aldeano androide con placas mecánicas y ojos luminosos».
- «Pinta el cubo seleccionado con un material metálico y detalles de circuito».

## Limitaciones actuales

- El modelado es principalmente con **cubos**, no escultura orgánica ni mallas poligonales arbitrarias.
- La pintura es **pixel art procedimental** sobre PNG, no una IA especializada de generación artística de imágenes.
- No incluye rigging y animación automáticos.
- En formatos restrictivos puede haber incompatibilidades de UV, tamaño o textura.
- La prueba de conexión solo valida credenciales/API; no garantiza que el modelo siga bien todas las herramientas.
- La API key no se guarda, así que hay que introducirla de nuevo cuando se descarga/reinicia el plugin.

Consulta [README principal](../README.md), [guía de proveedores](PROVIDERS.md), [plan de pruebas](MANUAL_TEST_PLAN.md) y [seguridad](../SECURITY.md).

**Para reportar errores:** indica versión de Blockbench, formato, pasos de reproducción y mensaje sin incluir API keys.
