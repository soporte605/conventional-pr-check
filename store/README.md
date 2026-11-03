# Publicar la extensión en la Chrome Web Store

Material para la ficha de la Chrome Web Store. Esta carpeta no se incluye en el zip de la extensión.

| Archivo | Uso en la ficha |
|---|---|
| `../extension/icons/icon-128.png` | Icono de la tienda (128×128) |
| `screenshot-invalid.png` | Captura 1 (1280×800) |
| `screenshot-valid.png` | Captura 2 (1280×800) |
| `promo-small-440x280.png` | Mosaico promocional pequeño (440×280) |

Las capturas usan una página de demostración, no un repositorio real.

## Pasos

1. Crea una cuenta de desarrollador en el [panel de la Chrome Web Store](https://chrome.google.com/webstore/devconsole) (pago único de 5 USD).
2. Genera el zip con `npm run package:extension`, o descárgalo del último release.
3. En el panel, pulsa **Nuevo elemento** y sube `conventional-pr-check-extension.zip`.
4. Completa las pestañas con los textos de abajo y sube las imágenes de esta carpeta.
5. Envía a revisión. Suele tardar de unos días a un par de semanas.

Cada vez que publiques una actualización, `version` en `extension/manifest.json` tiene que ser mayor que la publicada.

## Ficha de la tienda

**Nombre:** Conventional PR Check

**Categoría:** Herramientas para desarrolladores

**Idioma:** Español (puedes añadir inglés con el texto de más abajo)

**Descripción breve** (máx. 132 caracteres):

> Valida el título de los pull requests de GitHub con Conventional Commits y lo corrige con un clic.

**Descripción:**

> Conventional PR Check muestra un panel en cada pull request de GitHub que indica si el título sigue Conventional Commits (feat:, fix:, docs:, ...).
>
> • Si el título es válido, muestra el próximo bump SemVer (major, minor o patch).
> • Si no lo es, explica el error y propone un título corregido, usando también las etiquetas del PR (bug → fix, enhancement → feat, ...).
> • El título sugerido se puede editar, copiar o aplicar con un clic.
>
> Usa la misma lógica que la GitHub Action Conventional PR Check, así que el panel y el check del CI coinciden.
>
> Para aplicar el título y para repositorios privados, agrega en las opciones un token de GitHub detallado (fine-grained) con permiso "Pull requests: Read and write". El token se guarda solo en tu navegador.
>
> Código abierto (MIT): https://github.com/soporte605/conventional-pr-check

**Descripción en inglés (opcional):**

> Conventional PR Check adds a panel to every GitHub pull request that tells you whether its title follows Conventional Commits (feat:, fix:, docs:, ...).
>
> • If the title is valid, it shows the next SemVer bump (major, minor or patch).
> • If not, it explains the error and suggests a fixed title, also using the PR labels (bug → fix, enhancement → feat, ...).
> • The suggested title can be edited, copied or applied with one click.
>
> It uses the same logic as the Conventional PR Check GitHub Action, so the panel and the CI check agree.
>
> To apply titles and to use it on private repositories, add a fine-grained GitHub token with "Pull requests: Read and write" permission in the options. The token is stored only in your browser.
>
> Open source (MIT): https://github.com/soporte605/conventional-pr-check

**Sitio web:** https://github.com/soporte605/conventional-pr-check

**Asistencia:** https://github.com/soporte605/conventional-pr-check/issues

## Prácticas de privacidad

**Propósito único:**

> Validar el título del pull request de GitHub abierto con Conventional Commits y ayudar a corregirlo.

**Justificación de permisos:**

| Permiso | Justificación |
|---|---|
| `storage` | Guardar en el navegador el token de GitHub que el usuario configura en las opciones. |
| Acceso a `https://api.github.com/*` | Leer el título, la descripción y las etiquetas del pull request abierto y, si el usuario pulsa Aplicar título, cambiar el título. |
| Script de contenido en `https://github.com/*` | Mostrar el panel en las páginas de pull request de GitHub. GitHub cambia de página sin recargar, por eso el script se carga en todo el dominio y solo actúa en las URLs `/<owner>/<repo>/pull/<número>`. |

**¿Usa código remoto?** No.

**Uso de datos:** marca solo **Información de autenticación** (el token de GitHub). Marca también las tres declaraciones: no se venden datos a terceros, no se usan para fines ajenos al propósito único y no se usan para determinar solvencia ni para préstamos.

**URL de la política de privacidad:** https://github.com/soporte605/conventional-pr-check/blob/main/PRIVACY.md
