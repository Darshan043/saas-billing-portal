# Branching and commits

`main` is always a working, runnable project. Do not merge a half-finished step into `main`.

## Branches

Use one branch per step, named `step-NN-short-name`.

Examples:

- `step-01-setup`
- `step-02-prisma-schema`

Work on the step branch until the step is complete and reviewed, then merge into `main`.

## Commit messages

Start every commit message with one of these prefixes:

- `feat:` a new feature
- `fix:` a bug fix
- `chore:` tooling, dependencies, or housekeeping
- `docs:` documentation only
- `test:` tests only

Examples:

- `chore: add Docker Compose skeleton`
- `feat: add backend /health endpoint`
- `docs: describe first-time setup`

## Review

Merge a step into `main` only after it has been reviewed (the app starts, the step's checks pass, and the README still matches reality).
