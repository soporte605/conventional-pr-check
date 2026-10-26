# Conventional PR Check

**English** | [Español](README.es.md)

GitHub Action that checks that every pull request title follows [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), suggests a corrected title when it does not, and reports the next [SemVer](https://semver.org/) bump.

- Validates titles such as `feat: ...`, `fix(api): ...`, `feat!: ...`.
- If the title is invalid, the check fails and leaves **one** comment on the PR with a suggested title. The comment is updated on every attempt and deleted once the title is fixed.
- Infers the suggested type from the PR labels (`bug` → `fix`, `enhancement` → `feat`, ...), from misspelled prefixes (`Feature:`, `[FIX]`, `bugfix -`) or from keywords (`Add ...`, `Fix ...`).
- Outputs the next SemVer bump: `major`, `minor`, `patch` or `none`.
- Ships a second Action, [`changelog`](#changelog), that builds release notes since the last release and computes the next version.
- Ships a [browser extension](#browser-extension) that shows the suggested title on the PR page and applies it with one click.
- No dependencies: plain JavaScript running on the Actions `node24` runtime.

Messages, PR comments, generated release notes and the extension UI are in Spanish.

## Usage

```yaml
# .github/workflows/pr-title.yml
name: PR title

on:
  pull_request:
    types: [opened, edited, synchronize, reopened, labeled, unlabeled]

permissions:
  pull-requests: write # to comment the suggested title

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: soporte605/conventional-pr-check@v0.2.0
        id: pr
      - run: |
          echo "Next bump: ${{ steps.pr.outputs.bump }}"
```

Include `edited` in `types` so the check runs again when someone fixes the title, and `labeled`/`unlabeled` so the suggestion is refreshed when labels change.

### Advanced configuration

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

## SemVer bump rules

| Title | Bump |
|---|---|
| Any type with `!` (`feat!:`, `fix(api)!:`) or `BREAKING CHANGE:` in the PR description | `major` |
| `feat` | `minor` |
| `fix`, `perf` | `patch` |
| Anything else (`docs`, `chore`, `ci`, ...) | `none` |

## Inputs

| Name | Default | Description |
|---|---|---|
| `github-token` | `${{ github.token }}` | Token used to comment. Needs `pull-requests: write`. |
| `types` | `feat,fix,docs,style,refactor,perf,test,build,ci,chore,revert` | Allowed types. |
| `scopes` | _(empty)_ | Allowed scopes. Empty = any. |
| `require-scope` | `false` | Require a scope. |
| `max-length` | `0` | Maximum title length. `0` = no limit. |
| `label-map` | see below | `label:type` map used to suggest the type. |
| `default-type` | `chore` | Suggested type when none can be inferred. |
| `comment` | `true` | Comment the suggested title on the PR. |
| `title` | _(empty)_ | Validate this title instead of the PR title (tests, other events). |
| `labels` | _(empty)_ | Labels to use together with `title`. |

Default label map: `bug`, `fix` → `fix`; `enhancement`, `feature` → `feat`; `documentation`, `docs` → `docs`; `performance` → `perf`; `refactor` → `refactor`; `test`, `tests` → `test`; `ci` → `ci`; `build` → `build`; `dependencies`, `chore` → `chore`. A `breaking` or `breaking-change` label adds `!` to the suggestion.

## Outputs

| Name | Description |
|---|---|
| `valid` | `true` / `false`. |
| `type` | Title type, e.g. `feat`. |
| `scope` | Scope, if any. |
| `breaking` | `true` for a breaking change. |
| `bump` | `major`, `minor`, `patch` or `none`. |
| `suggested-title` | Corrected title (same as the current one if it is already valid). |

## PRs from forks

On PRs from forks, `GITHUB_TOKEN` is read-only and the comment cannot be posted. The Action logs a warning and the check still passes or fails based on the title, with the suggestion in the logs and in the job summary.

## Changelog

The `soporte605/conventional-pr-check/changelog` Action collects the PRs merged since the last version tag (for example `v0.1.0`), groups them by type using their titles and computes the next version with the same bump rules. Optionally it creates the GitHub release with that changelog as its notes.

```yaml
# .github/workflows/release.yml
name: Release

on:
  workflow_dispatch:

permissions:
  contents: write # to create the release

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: soporte605/conventional-pr-check/changelog@v0.2.0
        id: cl
        with:
          create-release: true
          draft: true # review the draft and publish it from GitHub
      - run: |
          echo "Next version: ${{ steps.cl.outputs.next-tag }}"
```

Example of generated notes:

```markdown
## v0.2.0 (2026-10-24)

### Nuevas funciones

- **ui:** modo oscuro ([#12](https://github.com/acme/app/pull/12)) @ana

### Correcciones

- error con títulos vacíos ([#11](https://github.com/acme/app/pull/11)) @luis
```

If there were only changes that do not produce a version (`docs`, `chore`, `ci`, ...), the bump is `none` and no release is created. Commits pushed directly to the branch, without a PR, appear with their first line; those that do not follow the convention go under "Otros cambios" (other changes).

### `changelog` inputs

| Name | Default | Description |
|---|---|---|
| `github-token` | `${{ github.token }}` | Needs `contents: write` when `create-release` is `true`. |
| `from` | _(last version tag)_ | Tag to build the changelog from. |
| `to` | _(workflow commit)_ | Commit, branch or tag to build up to. |
| `tag-prefix` | `v` | Prefix of version tags. |
| `exclude-types` | _(empty)_ | Types to hide, e.g. `chore,ci`. `other` hides titles that do not follow the convention. |
| `create-release` | `false` | Create the release with the next version. |
| `draft` | `false` | Create the release as a draft. |

### `changelog` outputs

| Name | Description |
|---|---|
| `previous-tag` | Tag the changelog was built from (empty if there was none). |
| `bump` | `major`, `minor`, `patch` or `none`. |
| `next-version` | Next version without prefix, e.g. `0.2.0`. |
| `next-tag` | Next tag, e.g. `v0.2.0`. |
| `changelog` | Changelog in Markdown. |
| `pr-count` | Number of PRs included. |
| `release-url` | URL of the created release, if any. |

## Browser extension

The [`extension/`](extension) folder is an extension for Chrome, Edge and other Chromium-based browsers. On every GitHub pull request page it shows a panel in the bottom right corner:

- If the title is valid, it shows the next SemVer bump.
- If it is not, it lists the errors and a suggested title (using the same logic as the Action, including the PR labels) that can be edited, copied or **applied with one click**.

### Installation

1. Download `conventional-pr-check-extension.zip` from the [latest release](https://github.com/soporte605/conventional-pr-check/releases/latest) and unzip it.
2. Open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode** and choose **Load unpacked** with the folder.
3. In the extension options, paste a GitHub token.

The token is needed to apply the title and to see private repositories. Use a [fine-grained token](https://github.com/settings/personal-access-tokens/new) with **Pull requests: Read and write** permission only on the repositories where you will use it. It is stored only in that browser. Without a token, the panel works on public repositories and the Copy button is still available.

## Development

```bash
npm test
npm run package:extension   # builds conventional-pr-check-extension.zip
```

`extension/lint.js` is a copy of `src/lint.js` so the extension uses exactly the same logic; `npm run build:extension` refreshes it and the tests fail if they drift apart.

The [`ci.yml`](.github/workflows/ci.yml) workflow runs the unit tests and smoke tests that execute both Actions (`uses: ./` and `uses: ./changelog`). The [`pr-title.yml`](.github/workflows/pr-title.yml) workflow checks the PR titles of this repository.

To publish a version: run the [`release.yml`](.github/workflows/release.yml) workflow from the Actions tab. It creates a draft release with the changelog and the extension attached; when publishing it from GitHub you can tick "Publish this release to the GitHub Marketplace". Then update the README references to the new version.

## License

MIT
