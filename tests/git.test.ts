import { describe, it, expect, afterEach } from "vitest";
import { getRepoRoot, getHead, getChangedFiles } from "../src/git.js";
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
});
