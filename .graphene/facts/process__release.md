---
category: process
subject: release
---

Release is two commits, both on main (no PR/branch in this repo's flow). (1) Commit the change INCLUDING rebuilt dist/ (dist is committed; run `npm run build` and `npm test` first). (2) Bump version to the next patch in package.json, .claude-plugin/plugin.json, and .claude-plugin/marketplace.json, AND set marketplace.json `sha` to commit (1)'s hash, i.e. the bump commit's parent. Commit message: "Bump to vX.Y.Z and update marketplace SHA". Push both to origin/main. The marketplace `sha` is what `/plugin install` actually fetches, so it MUST point at the commit that holds the new dist; the version field and sha always move together. Never `git add .claude/`. Verified pattern against v0.9.7/v0.9.8/v0.9.9.
