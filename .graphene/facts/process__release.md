---
category: process
subject: release
---

Release is two commits, both on main (no PR/branch in this repo's flow). (1) Commit the change INCLUDING rebuilt dist/ (dist is committed; run `npm run build` and `npm test` first) AND the version bump to the next patch in package.json and .claude-plugin/plugin.json. (2) Set .claude-plugin/marketplace.json `version` to match and its `sha` to commit (1)'s full hash, i.e. the bump commit's parent. Commit message: "Bump to vX.Y.Z and update marketplace SHA". Push both to origin/main. The marketplace `sha` is what `/plugin install` actually fetches, so it MUST point at the commit that holds the new dist. Claude Code labels the install with plugin.json's version AT that sha (verified 2026-10-02, Claude Code 2.1.287), so plugin.json must already carry the new version in (1), or the install reports the previous version. Run stale() before pushing: a node whose covered files (1) changed without its node file changing in (1) too reads stale. Never `git add .claude/`. To update a machine afterwards: `claude plugin marketplace update graphene`, then `claude plugin update graphene@graphene`, then restart sessions.
