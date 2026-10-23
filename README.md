# Conventional PR Check

GitHub Action que valida que el título de cada pull request siga [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/), sugiere un título corregido cuando no lo hace y reporta el próximo bump de [SemVer](https://semver.org/lang/es/).

- ✅ Valida títulos como `feat: ...`, `fix(api): ...`, `feat!: ...`.
- 💬 Si el título es inválido, falla el check y deja **un** comentario en el PR con un título sugerido. El comentario se actualiza en cada intento y se borra cuando el título queda bien.
- 🏷️ Deduce el tipo sugerido a partir de las etiquetas del PR (`bug` → `fix`, `enhancement` → `feat`, ...), de prefijos mal escritos (`Feature:`, `[FIX]`, `bugfix -`) o de palabras clave (`Add ...`, `Fix ...`).
- 🔢 Expone el próximo bump SemVer: `major`, `minor`, `patch` o `none`.
- Sin dependencias: un solo archivo JavaScript que corre en el runtime `node24` de Actions.

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
      - uses: soporte605/conventional-pr-check@v0.1.0
        id: pr
      - run: |
          echo "Próximo bump: ${{ steps.pr.outputs.bump }}"
```

Incluye `edited` en los `types` para que el check se vuelva a correr cuando alguien corrige el título, y `labeled`/`unlabeled` para que la sugerencia se actualice al cambiar etiquetas.

### Configuración avanzada

```yaml
      - uses: soporte605/conventional-pr-check@v0.1.0
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

## Desarrollo

```bash
npm test
```

El workflow [`ci.yml`](.github/workflows/ci.yml) corre las pruebas unitarias y una prueba de humo que ejecuta la Action con `uses: ./`. El workflow [`pr-title.yml`](.github/workflows/pr-title.yml) valida los títulos de los PRs de este mismo repositorio.

Para publicar una versión: crear un release en GitHub con un tag nuevo (por ejemplo `v0.2.0`) y actualizar las referencias del README.

## Licencia

MIT
