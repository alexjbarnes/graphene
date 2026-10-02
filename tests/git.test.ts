import { describe, it, expect, afterEach } from "vitest";
import { getRepoRoot, getHead, getChangedFiles, getUnreviewedFiles } from "../src/git.js";
import { createTestGitRepo, type TestRepo } from "./helpers.js";

describe("git", () => {
  let repo: TestRepo;

  afterEach(() => {
    repo?.cleanup();
  });

  describe("getRepoRoot", () => {
    it("returns the repo root directory", () => {
      repo = createTestGitRepo();
      const root = getRepoRoot(repo.path);
      expect(root).toBe(repo.path);
    });

    it("throws when not in a git repo", () => {
      expect(() => getRepoRoot("/tmp")).toThrow("Not in a git repository");
    });
  });

  describe("getHead", () => {
    it("returns the current commit hash", () => {
      repo = createTestGitRepo();
      const head = getHead(repo.path);
      expect(head).toMatch(/^[0-9a-f]{40}$/);
    });
  });

  describe("getChangedFiles", () => {
    it("returns empty array when no files changed", () => {
      repo = createTestGitRepo();
      const head = getHead(repo.path);
      const changed = getChangedFiles(repo.path, head, ["."]);
      expect(changed).toEqual([]);
    });

    it("detects changed files since a commit", () => {
      repo = createTestGitRepo();
      const baseCommit = getHead(repo.path);

      repo.writeFile("auth/router.ts", "export const router = {};");
      repo.commit("add auth router");

      const changed = getChangedFiles(repo.path, baseCommit, ["auth/"]);
      expect(changed).toContain("auth/router.ts");
    });

    it("only returns files matching covered paths", () => {
      repo = createTestGitRepo();
      const baseCommit = getHead(repo.path);

      repo.writeFile("auth/router.ts", "export const router = {};");
      repo.writeFile("api/handler.ts", "export const handler = {};");
      repo.commit("add files");

      const changed = getChangedFiles(repo.path, baseCommit, ["auth/"]);
      expect(changed).toContain("auth/router.ts");
      expect(changed).not.toContain("api/handler.ts");
    });

    it("returns empty array for empty paths", () => {
      repo = createTestGitRepo();
      const head = getHead(repo.path);
      const changed = getChangedFiles(repo.path, head, []);
      expect(changed).toEqual([]);
    });
  });

  describe("getUnreviewedFiles", () => {
    const NODE = ".graphene/nodes/auth.md";

    it("counts a covered change as reviewed when the node file changed in the same commit", () => {
      repo = createTestGitRepo();
      const base = getHead(repo.path);
      repo.writeFile("auth/router.ts", "export const router = {};");
      repo.writeFile(NODE, "node v1");
      repo.commit("code and graph together");

      expect(getUnreviewedFiles(repo.path, base, ["auth/"], NODE)).toEqual([]);
    });

    it("reports covered files from a commit that left the node file alone", () => {
      repo = createTestGitRepo();
      const base = getHead(repo.path);
      repo.writeFile("auth/router.ts", "export const router = {};");
      repo.commit("code only");

      expect(getUnreviewedFiles(repo.path, base, ["auth/"], NODE)).toEqual(["auth/router.ts"]);
    });

    it("reports only the unreviewed commit's files when reviewed and unreviewed commits mix", () => {
      repo = createTestGitRepo();
      const base = getHead(repo.path);
      repo.writeFile("auth/router.ts", "export const router = {};");
      repo.writeFile(NODE, "node v1");
      repo.commit("code and graph together");
      repo.writeFile("auth/session.ts", "export const session = {};");
      repo.commit("code only");

      expect(getUnreviewedFiles(repo.path, base, ["auth/"], NODE)).toEqual(["auth/session.ts"]);
    });

    it("reports a reviewed file again once a later commit changes it without the node", () => {
      repo = createTestGitRepo();
      const base = getHead(repo.path);
      repo.writeFile("auth/router.ts", "export const router = {};");
      repo.writeFile(NODE, "node v1");
      repo.commit("code and graph together");
      repo.writeFile("auth/router.ts", "export const router = { v: 2 };");
      repo.commit("code only");

      expect(getUnreviewedFiles(repo.path, base, ["auth/"], NODE)).toEqual(["auth/router.ts"]);
    });

    it("does not let a later node-only commit vouch for an earlier code-only commit", () => {
      repo = createTestGitRepo();
      const base = getHead(repo.path);
      repo.writeFile("auth/router.ts", "export const router = {};");
      repo.commit("code only");
      repo.writeFile(NODE, "unrelated note");
      repo.commit("graph only");

      expect(getUnreviewedFiles(repo.path, base, ["auth/"], NODE)).toEqual(["auth/router.ts"]);
    });

    it("ignores an unreviewed change that a later commit reverted", () => {
      repo = createTestGitRepo();
      repo.writeFile("auth/router.ts", "v1");
      const base = repo.commit("add router");
      repo.writeFile("auth/router.ts", "v2");
      repo.commit("change");
      repo.writeFile("auth/router.ts", "v1");
      repo.commit("revert");

      expect(getUnreviewedFiles(repo.path, base, ["auth/"], NODE)).toEqual([]);
    });

    it("returns empty for a since commit git does not know, like getChangedFiles", () => {
      repo = createTestGitRepo();
      repo.writeFile("auth/router.ts", "export const router = {};");
      repo.commit("code only");

      expect(getUnreviewedFiles(repo.path, "deadbeef", ["auth/"], NODE)).toEqual([]);
    });
  });
});
