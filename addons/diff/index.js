// Addon "diff": compares two discovery runs and writes the PR comment (addons/diff/cli.js).
// It has no pipeline hooks; .github/workflows/discovery-diff.yml runs it on every PR.
// Off: "diff": false in discovery.config.json (the workflow skips). Remove: delete addons/diff and the workflow.
module.exports = {}
