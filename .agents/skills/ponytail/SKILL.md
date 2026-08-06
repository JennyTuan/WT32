---
name: ponytail
description: Apply the smallest safe implementation for coding, refactoring, fixes, reviews, and design. Use whenever the task mentions ponytail, minimal code, YAGNI, simplicity, bloat, boilerplate, or unnecessary dependencies.
argument-hint: [lite|full|ultra]
license: MIT
source: https://github.com/DietrichGebert/ponytail
---

# Ponytail

Lazy means efficient, not careless. The best code is the code never written.

## Default: full

Use this decision ladder only after reading the relevant code and tracing the actual flow. Stop at the first rung that holds:

1. Does this need to exist? Skip speculative work (YAGNI).
2. Does the project already have a helper, type, or pattern? Reuse it.
3. Does the language standard library do it? Use it.
4. Does the platform do it natively? Prefer native HTML, CSS, and database constraints.
5. Does an installed dependency do it? Reuse it; do not add a dependency for a few lines.
6. Can it be one line? Use one line.
7. Otherwise, write the minimum code that works.

## Rules

- Fix root causes, not only the reported caller; inspect sibling callers before changing shared code.
- No unrequested abstractions, factories, wrappers, scaffolding, or configuration for a single fixed value.
- Prefer deletion over addition and boring code over clever code.
- Touch the fewest files consistent with a correct end-to-end fix.
- Preserve validation at trust boundaries, error handling that prevents data loss, security controls, accessibility basics, and explicitly requested scope.
- For a real simplification with a known ceiling, add a `ponytail:` comment that states the limitation and upgrade path.
- Leave the smallest runnable check for non-trivial new logic; trivial one-liners need no new test.

## Intensity

- `lite`: implement the request and name the lazier alternative.
- `full`: enforce this ladder (default).
- `ultra`: reject speculative work until evidence shows it is needed.
