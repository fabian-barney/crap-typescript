# Contributing

All changes in this repository are expected to be issue-linked.

## Workflow

1. Create or confirm the GitHub issue first.
2. Create a branch named `codex/<issue-number>-<slug>`.
3. Reference the issue number in every commit message.
4. Open a pull request that closes the issue.
5. Keep the pull request green, reply to review comments, and resolve threads only after the fix or an explicit invalidation response.
6. Merge only after the latest review is newer than the latest push and all required checks are green.

## TypeScript

The shared TypeScript configuration enables `strict` and `noUncheckedIndexedAccess`.
Handle indexed array and object access explicitly with a fallback, guard, or narrow non-null assertion.
