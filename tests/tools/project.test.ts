import { describe, it, expect, beforeEach } from "vitest";
import type { GrapheneDatabase } from "../../src/db.js";
import { createTestRepoDb } from "../helpers.js";
import { handleProjectRead } from "../../src/tools/project-read.js";
import { handleProjectWrite } from "../../src/tools/project-write.js";
import { handleProjectDelete } from "../../src/tools/project-delete.js";

describe("project tools", () => {
  let db: GrapheneDatabase;

  beforeEach(async () => {
    db = await createTestRepoDb();
  });

  describe("project_write", () => {
    it("writes a project fact", () => {
      const result = handleProjectWrite(db, {
        category: "convention",
        subject: "node-env",
        content: "NODE_ENV must not be set for next build",
      });
      expect(result).toEqual({ category: "convention", subject: "node-env" });

      const facts = db.prepare("SELECT * FROM project_facts").all();
      expect(facts).toHaveLength(1);
    });

    it("overwrites existing fact with same category+subject", () => {
      handleProjectWrite(db, { category: "convention", subject: "lockfile", content: "Use Node 20" });
      handleProjectWrite(db, { category: "convention", subject: "lockfile", content: "Use Node 22" });

      const facts = db.prepare("SELECT * FROM project_facts").all() as Array<Record<string, unknown>>;
      expect(facts).toHaveLength(1);
      expect(facts[0].content).toBe("Use Node 22");
    });
  });

  describe("project_read", () => {
    beforeEach(() => {
      handleProjectWrite(db, { category: "convention", subject: "lockfile", content: "Regenerate on Node 22" });
      handleProjectWrite(db, { category: "convention", subject: "node-env", content: "Must not be set" });
      handleProjectWrite(db, { category: "decision", subject: "auth", content: "JWT not sessions" });
    });

    it("returns all project facts with no filters", () => {
      const result = handleProjectRead(db, {});
      expect(result.facts).toHaveLength(3);
    });

    it("filters by category", () => {
      const result = handleProjectRead(db, { category: "convention" });
      expect(result.facts).toHaveLength(2);
    });

    it("filters by both category and subject", () => {
      const result = handleProjectRead(db, { category: "convention", subject: "lockfile" });
      expect(result.facts).toHaveLength(1);
      expect(result.facts[0].content).toBe("Regenerate on Node 22");
    });
  });

  describe("project_delete", () => {
    it("deletes an existing project fact", () => {
      handleProjectWrite(db, { category: "convention", subject: "lockfile", content: "Node 22" });
      const result = handleProjectDelete(db, { category: "convention", subject: "lockfile" });
      expect(result.deleted).toBe(true);

      const facts = db.prepare("SELECT * FROM project_facts").all();
      expect(facts).toHaveLength(0);
    });

    it("returns false for non-existent fact", () => {
      const result = handleProjectDelete(db, { category: "convention", subject: "nope" });
      expect(result.deleted).toBe(false);
    });
  });
});
