# Triage Labels

The engineering skills use five canonical triage roles. This file maps those roles to the label strings used in GitHub Issues for this repo.

| Skill role | GitHub label | Meaning |
| --- | --- | --- |
| `needs-triage` | `needs-triage` | Maintainer needs to evaluate or classify the issue |
| `needs-info` | `needs-info` | Waiting on reporter or product owner for missing details |
| `ready-for-agent` | `ready-for-agent` | Fully specified and safe for an AI agent to implement |
| `ready-for-human` | `ready-for-human` | Needs human implementation, product judgment, or manual validation |
| `wontfix` | `wontfix` | Will not be actioned |

If the GitHub repository does not have these labels yet, create them before applying triage automation.

## WT32 Labeling Notes

- Use `ready-for-agent` only when the issue includes expected behavior, affected routes/modules, and the verification command or manual scenario.
- Use `ready-for-human` for clinical/product judgment, ambiguous CT domain language, or work that depends on hardware capability confirmation.
- Use `needs-info` when a test case lacks reproducible steps, expected behavior, or sample data boundaries.
- Do not use labels to imply clinical safety approval. WT32 is a prototype, not clinical software.
