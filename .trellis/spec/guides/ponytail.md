# Ponytail Minimal-Change Guide

WT32 uses Ponytail at the **full** level. Before implementation, inspect the
real flow and then prefer: no change, existing WT32 code, standard library,
native platform feature, an installed dependency, a one-line change, and only
then the smallest custom implementation.

This is a constraint on solution size, not on diligence. Do not simplify away
input validation, error handling, accessibility, security, or this prototype's
CT safety wording. Do not create one-use abstractions, speculative settings,
or scaffolding for later.

For a deliberate shortcut with a known ceiling, add a concise `ponytail:`
comment that names the ceiling and upgrade path. For example:

```ts
// ponytail: localStorage cache is per-browser; move to a shared store only if cross-device continuity is required.
```

Pair this guide with [Code Reuse](./code-reuse-thinking-guide.md) and the
relevant frontend or backend specification.
