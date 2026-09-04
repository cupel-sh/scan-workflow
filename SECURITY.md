# Security

This repository is a supply-chain component: its `main` branch and its `v1` tag execute inside
other organisations' CI. Treat a defect here as reaching every customer who calls it.

## Reporting

Report privately through GitHub's **Report a vulnerability** on this repository's Security tab.
Please do not open a public issue for anything exploitable.

## What runs, and what it may reach

`.github/workflows/scan.yml` checks out the caller's repository and runs
`npx @cupel-sh/cli@<version> scan --push`. It requests `contents: read` and `id-token: write`
and nothing else, and a caller's own `permissions:` block is a ceiling this file cannot raise —
GitHub intersects the two.

It asks for no `contents: write`, no `pull-requests: write`, and no access to caller secrets.

## Pins

`actions/checkout` is pinned by **commit SHA**, never by tag: a tag is a pointer its owner can
move, and this action runs inside somebody else's repository.

The `@cupel-sh/cli` version is pinned exactly in this workflow. Callers who need a determinable
version of every tool in their CI can override it with the `cli-version` input, or reference
this workflow by commit SHA instead of `@v1`.

## The moving tag

`@v1` moves. That is deliberate — it is what spares customers an edit for every engine release,
and it is why this repository is public and its history reviewable. A customer who prefers
determinism over automatic updates pins the SHA; both are supported and documented.
