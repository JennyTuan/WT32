# Issue Tracker: GitHub

Issues, PRDs, and implementation tickets for this repo live in GitHub Issues.

Repository: `JennyTuan/WT32`
Remote: `https://github.com/JennyTuan/WT32.git`

Use GitHub Issues for planned work, triage, PRD publishing, and test-debt tracking. Run `gh` commands from the repository root so the CLI can infer the repo from `git remote -v`.

## Common Operations

- Create an issue: `gh issue create --title "..." --body "..."`
- Read an issue: `gh issue view <number> --comments`
- List issues: `gh issue list --state open --json number,title,body,labels,comments`
- Comment on an issue: `gh issue comment <number> --body "..."`
- Apply a label: `gh issue edit <number> --add-label "..."`
- Remove a label: `gh issue edit <number> --remove-label "..."`
- Close an issue: `gh issue close <number> --comment "..."`

Use a heredoc or temporary body file for multi-line issue bodies so Markdown stays readable.

## Publishing Rules

When a skill says "publish to the issue tracker", create a GitHub issue.

When a skill says "fetch the relevant ticket", run `gh issue view <number> --comments` and include labels in the review.

When breaking testing work into issues, prefer small vertical slices that each protect one behavior or workflow. Good examples:

- Backend scan-session snapshot preserves protocol template fields.
- Frontend protocol detail edit changes only the active session.
- Dose-related UI copy uses estimated/reference language.

Avoid broad buckets such as "add tests" unless they are used only as tracking epics.
