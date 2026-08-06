# Frontend Development Guidelines

`ui-review` is a React 19, TypeScript, Vite, and Tailwind console prototype.
It renders a touch-first 1024 × 768 workflow rather than controlling clinical
hardware. Start at `ui-review/src/App.tsx` for route ownership, then trace the
screen, feature, and `lib/` state/API helper that own the behavior.

Read [workflow and state](./workflow-and-state.md) before changing scan flows.
For frontend changes, run the focused test, then:

```powershell
cd ui-review
npm.cmd run lint
npm.cmd run build
```
