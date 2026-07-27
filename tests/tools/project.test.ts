import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFact, factsDir } from "../../src/store.js";
import { createTestRepo, type TestRepoDir } from "../helpers.js";
import { handleProjectRead } from "../../src/tools/project-read.js";
import { handleProjectWrite } from "../../src/tools/project-write.js";
import { handleProjectDelete } from "../../src/tools/project-delete.js";

describe("project tools", () => {
  let repo: TestRepoDir;

  beforeEach(() => {
    repo = createTestRepo();
  });

  afterEach(() => {
    repo.cleanup();
  });

  describe("project_write", () => {
    it("writes a project fact", () => {
      const result = handleProjectWrite(repo.repoRoot, {
        category: "convention",
        subject: "node-env",
        content: "NODE_ENV must not be set for next build",
      });
      expect(result).toEqual({ category: "convention", subject: "node-env" });

      expect(readFact(factsDir(repo.repoRoot), "convention", "node-env")).not.toBeNull();
    });

    it("overwrites existing fact with same category+subject", () => {
      handleProjectWrite(repo.repoRoot, { category: "convention", subject: "lockfile", content: "Use Node 20" });
      handleProjectWrite(repo.repoRoot, { category: "convention", subject: "lockfile", content: "Use Node 22" });

      expect(readFact(factsDir(repo.repoRoot), "convention", "lockfile")!.content).toBe("Use Node 22");
    });
  });

  describe("project_read", () => {
    beforeEach(() => {
      handleProjectWrite(repo.repoRoot, {
        category: "convention",
        subject: "lockfile",
        content: "Regenerate on Node 22",
      });
      handleProjectWrite(repo.repoRoot, {
        category: "convention",
        subject: "node-env",
        content: "Must not be set",
      });
      handleProjectWrite(repo.repoRoot, { category: "decision", subject: "auth", content: "JWT not sessions" });
    });

    it("returns all project facts with no filters", () => {
      const result = handleProjectRead(repo.repoRoot, {});
      expect(result.facts).toHaveLength(3);
    });

    it("filters by category", () => {
      const result = handleProjectRead(repo.repoRoot, { category: "convention" });
      expect(result.facts).toHaveLength(2);
    });

    it("filters by both category and subject", () => {
      const result = handleProjectRead(repo.repoRoot, { category: "convention", subject: "lockfile" });
      expect(result.facts).toHaveLength(1);
      expect(result.facts[0].content).toBe("Regenerate on Node 22");
    });
  });

  describe("project_delete", () => {
    it("deletes an existing project fact", () => {
      handleProjectWrite(repo.repoRoot, { category: "convention", subject: "lockfile", content: "Node 22" });
      const result = handleProjectDelete(repo.repoRoot, { category: "convention", subject: "lockfile" });
      expect(result.deleted).toBe(true);

      expect(readFact(factsDir(repo.repoRoot), "convention", "lockfile")).toBeNull();
    });

    it("returns false for non-existent fact", () => {
      const result = handleProjectDelete(repo.repoRoot, { category: "convention", subject: "nope" });
      expect(result.deleted).toBe(false);
    });
  });
});
