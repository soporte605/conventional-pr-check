# Conventional PR Check

GitHub Action que valida que el título de cada pull request siga [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/), sugiere un título corregido cuando no lo hace y reporta el próximo bump de [SemVer](https://semver.org/lang/es/).

- ✅ Valida títulos como `feat: ...`, `fix(api): ...`, `feat!: ...`.
- 💬 Si el título es inválido, falla el check y deja **un** comentario en el PR con un título sugerido. El comentario se actualiza en cada intento y se borra cuando el título queda bien.
- 🏷️ Deduce el tipo sugerido a partir de las etiquetas del PR (`bug` → `fix`, `enhancement` → `feat`, ...), de prefijos mal escritos (`Feature:`, `[FIX]`, `bugfix -`) o de palabras clave (`Add ...`, `Fix ...`).
- 🔢 Expone el próximo bump SemVer: `major`, `minor`, `patch` o `none`.
- 📒 Incluye una segunda Action, [`changelog`](#changelog), que arma las notas de versión desde el último release y calcula la siguiente versión.
- Sin dependencias: JavaScript plano que corre en el runtime `node24` de Actions.

## Uso

```yaml
# .github/workflows/pr-title.yml
name: PR title

on:
  pull_request:
    types: [opened, edited, synchronize, reopened, labeled, unlabeled]

permissions:
  pull-requests: write # para comentar el título sugerido

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: soporte605/conventional-pr-check@v0.2.0
        id: pr
      - run: |
          echo "Próximo bump: ${{ steps.pr.outputs.bump }}"
```

Incluye `edited` en los `types` para que el check se vuelva a correr cuando alguien corrige el título, y `labeled`/`unlabeled` para que la sugerencia se actualice al cambiar etiquetas.

### Configuración avanzada

```yaml
      - uses: soporte605/conventional-pr-check@v0.2.0
        with:
          types: feat,fix,docs,refactor,perf,test,ci,chore
          scopes: api,web,cli
          require-scope: true
          max-length: 72
          label-map: 'bug:fix,enhancement:feat,type/docs:docs'
          default-type: chore
          comment: true
```

## Reglas de bump SemVer

| Título | Bump |
|---|---|
| Cualquier tipo con `!` (`feat!:`, `fix(api)!:`) o `BREAKING CHANGE:` en la descripción del PR | `major` |
| `feat` | `minor` |
| `fix`, `perf` | `patch` |
| Cualquier otro (`docs`, `chore`, `ci`, ...) | `none` |

## Inputs

| Nombre | Por defecto | Descripción |
|---|---|---|
| `github-token` | `${{ github.token }}` | Token para comentar. Necesita `pull-requests: write`. |
| `types` | `feat,fix,docs,style,refactor,perf,test,build,ci,chore,revert` | Tipos permitidos. |
| `scopes` | _(vacío)_ | Scopes permitidos. Vacío = cualquiera. |
| `require-scope` | `false` | Exigir scope. |
| `max-length` | `0` | Longitud máxima del título. `0` = sin límite. |
| `label-map` | ver abajo | Mapa `etiqueta:tipo` para sugerir el tipo. |
| `default-type` | `chore` | Tipo sugerido si no se puede deducir. |
| `comment` | `true` | Comentar el título sugerido en el PR. |
| `title` | _(vacío)_ | Validar este título en lugar del del PR (pruebas, otros eventos). |
| `labels` | _(vacío)_ | Etiquetas a usar junto con `title`. |

Mapa de etiquetas por defecto: `bug`, `fix` → `fix`; `enhancement`, `feature` → `feat`; `documentation`, `docs` → `docs`; `performance` → `perf`; `refactor` → `refactor`; `test`, `tests` → `test`; `ci` → `ci`; `build` → `build`; `dependencies`, `chore` → `chore`. Una etiqueta `breaking` o `breaking-change` agrega `!` a la sugerencia.

## Outputs

| Nombre | Descripción |
|---|---|
| `valid` | `true` / `false`. |
| `type` | Tipo del título, p. ej. `feat`. |
| `scope` | Scope, si tiene. |
| `breaking` | `true` si es un cambio incompatible. |
| `bump` | `major`, `minor`, `patch` o `none`. |
| `suggested-title` | Título corregido (igual al actual si ya es válido). |

## PRs desde forks

En PRs desde forks, `GITHUB_TOKEN` es de solo lectura y el comentario no se puede publicar. La Action lo avisa con un warning y el check sigue fallando o pasando según el título, con la sugerencia en los logs y en el resumen del job.

## Changelog

La Action `soporte605/conventional-pr-check/changelog` junta los PRs mergeados desde el último tag de versión (por ejemplo `v0.1.0`), los agrupa por tipo usando sus títulos y calcula la siguiente versión con las mismas reglas de bump. Opcionalmente crea el release de GitHub con ese changelog como notas.

```yaml
# .github/workflows/release.yml
name: Release

on:
  workflow_dispatch:

permissions:
  contents: write # para crear el release

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: soporte605/conventional-pr-check/changelog@v0.2.0
        id: cl
        with:
          create-release: true
          draft: true # revisas el borrador y lo publicas desde GitHub
      - run: |
          echo "Siguiente versión: ${{ steps.cl.outputs.next-tag }}"
```

Ejemplo de notas generadas:

```markdown
## v0.2.0 (2026-10-24)

### ✨ Nuevas funciones

- **ui:** modo oscuro ([#12](https://github.com/acme/app/pull/12)) @ana

### 🐛 Correcciones

- error con títulos vacíos ([#11](https://github.com/acme/app/pull/11)) @luis
```

Si solo hubo cambios que no generan versión (`docs`, `chore`, `ci`, ...), el bump es `none` y no se crea release. Los commits empujados directo a la rama, sin PR, aparecen con su primera línea; los que no siguen la convención van a "Otros cambios".

### Inputs de `changelog`

| Nombre | Por defecto | Descripción |
|---|---|---|
| `github-token` | `${{ github.token }}` | Necesita `contents: write` si `create-release` es `true`. |
| `from` | _(último tag de versión)_ | Tag desde el que se arma el changelog. |
| `to` | _(commit del workflow)_ | Commit, rama o tag hasta donde se arma. |
| `tag-prefix` | `v` | Prefijo de los tags de versión. |
| `exclude-types` | _(vacío)_ | Tipos a ocultar, p. ej. `chore,ci`. `other` oculta los títulos que no siguen la convención. |
| `create-release` | `false` | Crear el release con la siguiente versión. |
| `draft` | `false` | Crear el release como borrador. |

### Outputs de `changelog`

| Nombre | Descripción |
|---|---|
| `previous-tag` | Tag desde el que se armó (vacío si no había). |
| `bump` | `major`, `minor`, `patch` o `none`. |
| `next-version` | Siguiente versión sin prefijo, p. ej. `0.2.0`. |
| `next-tag` | Siguiente tag, p. ej. `v0.2.0`. |
| `changelog` | Changelog en Markdown. |
| `pr-count` | PRs incluidos. |
| `release-url` | URL del release creado, si se creó. |

## Desarrollo

```bash
npm test
```

El workflow [`ci.yml`](.github/workflows/ci.yml) corre las pruebas unitarias y pruebas de humo que ejecutan las dos Actions (`uses: ./` y `uses: ./changelog`). El workflow [`pr-title.yml`](.github/workflows/pr-title.yml) valida los títulos de los PRs de este mismo repositorio.

Para publicar una versión: correr el workflow [`release.yml`](.github/workflows/release.yml) desde la pestaña Actions. Crea un release borrador con el changelog; al publicarlo desde GitHub se puede marcar "Publish this release to the GitHub Marketplace". Después, actualizar las referencias del README a la nueva versión.

## Licencia

MIT
