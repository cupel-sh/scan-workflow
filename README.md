# cupel scan — the reusable workflow

The GitHub Actions half of [cupel](https://cupel.sh). Your repository holds a pointer to this
workflow; this repository holds the implementation, so an engine upgrade never requires you to
edit a file.

## Use it

`.github/workflows/cupel.yml`, in your repository:

```yaml
name: cupel
on:
  push:
  workflow_dispatch:

jobs:
  scan:
    uses: cupel-sh/scan-workflow/.github/workflows/scan.yml@v1
    permissions:
      contents: read
      id-token: write
```

That is the whole integration. Connect the repository in the dashboard first, so the scan has
somewhere to report to.

### Why `workflow_dispatch`

Without it the workflow can only be triggered by a push, and the dashboard's **Scan now**
button has nothing to call.

### Why `id-token: write`

Findings are pushed with a GitHub-signed OIDC assertion that names your repository, so there
is **no long-lived credential to store in your CI**. If your CI is not GitHub Actions, the
dashboard can issue a project token instead.

### If your organisation restricts which actions may run

Allow one name:

```
cupel-sh/scan-workflow@*
```

That is the whole requirement. This workflow uses no third-party action: the only other actions
it runs are `actions/checkout` and, with Go scanning on, `actions/setup-go`. Both are GitHub's own
and covered by "Allow actions created by GitHub". The Python installer it needs (`uv`) is installed
from PyPI, pinned to an exact version and its wheel's hash, into a throwaway environment.

An action this list does not name makes GitHub refuse the workflow **before any job starts**: the
run shows as *Startup failure*, no scan happens, and the dashboard can only report that the
repository has not been scanned recently. Keeping the list to one name is why the installer is not
an action.

## What it can and cannot do

The permissions in *your* file are a ceiling this workflow cannot raise — GitHub intersects the
two. So the four lines above are the complete extent of what cupel's CI integration can reach,
readable from your own repository without reading this one.

It asks for **no** `contents: write`, **no** `pull-requests: write`, and **no** access to your
secrets. cupel never writes to your repository.

**Your code never leaves your runner.** The engine builds a call graph locally and posts
findings — advisory ids, package names and versions, verdicts, and path anchors. Never source,
never ASTs, never archives.

## Versioning

| Ref | What you get |
| --- | --- |
| `@v1` | Engine updates automatically. Recommended. |
| `@<commit-sha>` | Frozen. Nothing changes until you move it. |

`@v1` is a moving tag: cupel advances it as the engine improves, which is what spares you an
edit for every release. If your organisation requires a determinable version of every tool that
runs in CI, pin the SHA instead — or keep `@v1` and pin only the engine:

```yaml
    uses: cupel-sh/scan-workflow/.github/workflows/scan.yml@v1
    with:
      cli-version: "0.6.1"
```

This repository is public and its history is reviewable precisely so that trusting a moving tag
is a decision you can audit rather than one you have to take on faith.

## Inputs

| Input | Default | Purpose |
| --- | --- | --- |
| `cli-version` | the version this workflow ships | Pin `@cupel-sh/cli` explicitly. |
| `working-directory` | `.` | Scan a project that is not at the repository root. |
| `entry` | — | The file your application starts from, when cupel cannot work it out. |
| `exclude` | — | Files to leave out of the source-file count, `.gitignore` syntax, one per line. |
| `x-go` | `true` | Scan Go modules, at package level; `false` keeps the scan before Go. Needs engine 0.14.0 or later. See [Go](#go-x-go). |
| `go-private` | `github.com/<owner>/*` in a private repository | With `x-go`: Go modules never sent to a proxy or downloaded. See [Go](#go-x-go). |

### When you need `entry`

cupel finds your application by looking for `main`, `bin` or `exports` in `package.json`, an
`index.js`, a `start` script, or a `Procfile`. It also finds the module scripts a Vite app's
`index.html` loads, and the route files of Astro, Next, SvelteKit and Nuxt, `.astro`, `.vue` and
`.svelte` pages included. You need `entry` when your application starts somewhere none of those
point.

When cupel finds nothing to start from it says so, loudly, and every finding is
_potentially reachable_ (`potentially-reachable-not-analysed`):

```
🛑 No entrypoint analyzed — this scan is NOT a clean bill of health.
```

That is honest — it will not tell you a dependency is unreachable when it never looked — but it
is not much use. Point `entry` at the file your start script runs:

```yaml
    uses: cupel-sh/scan-workflow/.github/workflows/scan.yml@v1
    with:
      entry: src/server.ts
```

One per line if your app has several roots:

```yaml
    with:
      entry: |
        src/server.ts
        src/worker.ts
```

Listing a root never narrows the scan: cupel unions what you give it with anything it found on
its own.

### The source-file count, and `exclude`

Every scan reports how many source files your repository holds per language, how many cupel
scanned, and what happened to each of the rest. The count follows your `.gitignore` files and
skips dependency and build directories. To leave out anything else, list patterns in a
`.cupelignore` file, or pass them here:

```yaml
    with:
      exclude: |
        legacy/
        **/*.generated.ts
```

### Go (`x-go`)

Go scanning is **on by default** from engine 0.15.0, and it needs engine **0.14.0 or later**. A Go
advisory reads **not-reachable** when its reviewed vulnerable packages are compiled by no build of
your program. To keep the scan before Go, turn it off:

```yaml
    uses: cupel-sh/scan-workflow/.github/workflows/scan.yml@v1
    with:
      x-go: false
```

With `x-go` on, the job does two things before the scan:

1. **The right Go.** It reads every `go.mod` and `go.work` in the tree, each for its `toolchain`
   line, else its `go` line. When the newest of them is newer than the runner's Go,
   `actions/setup-go` installs it. The runner's Go is never replaced by an older one: the scan
   needs Go 1.21 or later, and a newer Go reads an older module fine.
2. **The modules.** `go mod download` runs in every directory that holds a `go.mod`, except
   `vendor`, `testdata`, `node_modules` and names beginning with `_` or `.`. It fetches each module
   from `proxy.golang.org`, checks it against your `go.sum` and the public checksum database, and
   runs none of its code. A module with a committed `vendor/` is read from there instead, and
   nothing is fetched for it. When one module cannot be fetched, the others still are. The step
   can reach `proxy.golang.org`, the storage it redirects large modules to
   (`storage.googleapis.com`) and `sum.golang.org`, and no other host.

The scan itself fetches nothing. It reads the modules from disk with `go list`.

**Private modules, and `go-private`.** `go mod download` asks the proxy for each module by its
path, so the path itself reaches `proxy.golang.org`. `go-private` lists the modules that must never
be sent there: module path patterns, comma-separated, in `GOPRIVATE` syntax. A module it matches is
never asked of any proxy or of the checksum database, and never downloaded or looked up anywhere
else. The scan reports it as a module it could not read: a coverage gap, counted as potentially
reachable, never a clean result.

- **Unset, in a private or internal repository**, it is your own organisation's,
  `github.com/<owner>/*`, in the owner's spelling and in lower case. Module paths are
  case-sensitive, so list any other spelling yourself.
- **Unset, in a public repository**, it is none: every module path your `go.mod` and `go.sum`
  name is public already, so nothing is withheld and your organisation's own public modules are
  read. A run whose repository visibility cannot be told is treated as private.
- **Every module outside the patterns is sent to the public proxy.** Private modules hosted
  elsewhere (`go.example.com/...`, another organisation) need their own patterns:

  ```yaml
      with:
        x-go: true
        go-private: github.com/acme/*,go.acme.dev/*
  ```

- **`none`** sends every module to the public proxy. Use it in a private repository when your
  organisation's modules are public and you want them scanned.

This workflow holds none of your credentials, so a private module is never read here. To have
it read, commit `vendor/` (`go mod vendor`), or run cupel in a job of your own after your own
`go mod download`.

**What it needs from your repository:** `go` lines that name a released Go (the job installs the
newest one asked for), and modules the public proxy serves or a committed `vendor/`.

**What a Go result says:**

- **Package level only:** whether a vulnerable package is in your build at all. cupel does not
  follow calls in Go code yet, so no Go finding reads reachable. A vulnerable package in your build
  reads potentially reachable, not analysed. An advisory whose reviewed packages no build compiles
  reads not-reachable. That needs a verified record of the vulnerable code, the module on disk, and
  no `replace` of it.
- **One build configuration:** the runner's (Linux, amd64) and the default build tags. A package
  only another configuration imports is never ruled out. Tests and tools are outside the build.
- **The standard library is judged against your `go` line,** the oldest Go that may build your
  program, not the Go that ran the scan. Raising the `go` line past a fix settles such a finding.

With a `cli-version` older than 0.14.0, or one that is not an exact version, `x-go` fails the run
before anything is scanned. With `x-go: false` the scan is given `--no-go`, except under an exact
`cli-version` below 0.14.0, which scans no Go anyway. Older engines can call a Go dependency clean when it is not, and a
failed run is the honest outcome.

## Reporting a problem

Security issues: see [SECURITY.md](SECURITY.md). Anything else belongs in the product repo.
