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
      cli-version: "0.2.0"
```

This repository is public and its history is reviewable precisely so that trusting a moving tag
is a decision you can audit rather than one you have to take on faith.

## Inputs

| Input | Default | Purpose |
| --- | --- | --- |
| `cli-version` | the version this workflow ships | Pin `@cupel-sh/cli` explicitly. |
| `working-directory` | `.` | Scan a project that is not at the repository root. |
| `entry` | — | The file your application starts from, when cupel cannot work it out. |

### When you need `entry`

cupel finds your application by looking for `main`, `bin` or `exports` in `package.json`, an
`index.js`, a `start` script, or a `Procfile`. A project built by **Astro, Next, SvelteKit, Nuxt
or Vite declares none of them** — the entry is a convention the framework resolves at build time,
so there is no file in `package.json` to point at.

When cupel finds nothing to start from it says so, loudly, and caps every verdict at `unknown`:

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

## Reporting a problem

Security issues: see [SECURITY.md](SECURITY.md). Anything else belongs in the product repo.
