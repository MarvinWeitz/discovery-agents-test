# Example: what a CAP project commits to use discovery

These are exactly the files `cap-discovery init` writes into a project's root (here with `--toolkit https://github.example-corp.com/your-org/cap-discovery`) (next to its own `package.json`, `db/`, `srv/`, `app/`):

| File | Purpose |
| --- | --- |
| `.github/workflows/discovery.yml` | runs the action on every pull request and on demand; artifact, job summary, one PR comment |
| `discovery.config.json` | the project's switches, merged over the toolkit defaults (here: Markdown to `docs/discovery`, mutation addon off) |
| `.claude/settings.json` | offers the `cap-discovery` Claude Code plugin (agents + skills for the AI pass) to everyone opening the repo |
| `.gitignore` | keeps `.discovery/` (the full run output) out of git |

Nothing else changes: no dependency in `package.json`, no test files left behind. Details: [PORTABLE.md](../../PORTABLE.md).
