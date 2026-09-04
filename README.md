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
      cli-version: "0.1.0"
```

This repository is public and its history is reviewable precisely so that trusting a moving tag
is a decision you can audit rather than one you have to take on faith.

## Inputs

| Input | Default | Purpose |
| --- | --- | --- |
| `cli-version` | the version this workflow ships | Pin `@cupel-sh/cli` explicitly. |
| `working-directory` | `.` | Scan a project that is not at the repository root. |

## Reporting a problem

Security issues: see [SECURITY.md](SECURITY.md). Anything else belongs in the product repo.
