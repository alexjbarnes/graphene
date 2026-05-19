import { describe, it, expect, beforeEach } from "vitest";
import type { GrapheneDatabase } from "../../src/db.js";
import { createTestGlobalDb } from "../helpers.js";
import { handleGlobalRead } from "../../src/tools/global-read.js";
import { handleGlobalWrite } from "../../src/tools/global-write.js";
import { handleGlobalDelete } from "../../src/tools/global-delete.js";

describe("global tools", () => {
  let db: GrapheneDatabase;

  beforeEach(async () => {
    db = await createTestGlobalDb();
  });

  describe("global_write", () => {
    it("writes a fact", () => {
      const result = handleGlobalWrite(db, {
        category: "preference",
        subject: "testing",
        content: "TDD only",
      });

      expect(result).toEqual({ category: "preference", subject: "testing" });

      const facts = db.prepare("SELECT * FROM facts").all() as Array<Record<string, unknown>>;
      expect(facts).toHaveLength(1);
      expect(facts[0].content).toBe("TDD only");
    });

    it("overwrites existing fact with same category+subject", () => {
      handleGlobalWrite(db, {
        category: "preference",
        subject: "testing",
        content: "TDD only",
      });
      handleGlobalWrite(db, {
        category: "preference",
        subject: "testing",
        content: "BDD preferred",
      });

      const facts = db.prepare("SELECT * FROM facts").all() as Array<Record<string, unknown>>;
      expect(facts).toHaveLength(1);
      expect(facts[0].content).toBe("BDD preferred");
    });

    it("allows same category with different subjects", () => {
      handleGlobalWrite(db, {
        category: "preference",
        subject: "testing",
        content: "TDD",
      });
      handleGlobalWrite(db, {
        category: "preference",
        subject: "go",
        content: "encoding/json only",
      });

      const facts = db.prepare("SELECT * FROM facts").all();
      expect(facts).toHaveLength(2);
    });
  });

  describe("global_delete", () => {
    it("deletes an existing fact", () => {
      handleGlobalWrite(db, { category: "preference", subject: "testing", content: "TDD" });
      const result = handleGlobalDelete(db, { category: "preference", subject: "testing" });
      expect(result.deleted).toBe(true);

      const facts = db.prepare("SELECT * FROM facts").all();
      expect(facts).toHaveLength(0);
    });

    it("returns false for non-existent fact", () => {
      const result = handleGlobalDelete(db, { category: "preference", subject: "nope" });
      expect(result.deleted).toBe(false);
    });

    it("only deletes the matching category+subject", () => {
      handleGlobalWrite(db, { category: "preference", subject: "testing", content: "TDD" });
      handleGlobalWrite(db, { category: "preference", subject: "go", content: "std only" });
      handleGlobalDelete(db, { category: "preference", subject: "testing" });

      const facts = db.prepare("SELECT * FROM facts").all();
      expect(facts).toHaveLength(1);
    });
  });

  describe("global_read", () => {
    beforeEach(async () => {
      handleGlobalWrite(db, {
        category: "preference",
        subject: "testing",
        content: "TDD only",
      });
      handleGlobalWrite(db, {
        category: "preference",
        subject: "go",
        content: "Use encoding/json",
      });
      handleGlobalWrite(db, {
        category: "expertise",
        subject: "go",
        content: "10 years experience",
      });
    });

    it("returns all facts with no filters", () => {
      const result = handleGlobalRead(db, {});
      expect(result.facts).toHaveLength(3);
    });

    it("filters by category", () => {
      const result = handleGlobalRead(db, { category: "preference" });
      expect(result.facts).toHaveLength(2);
      expect(result.facts.every((f) => f.category === "preference")).toBe(true);
    });

    it("filters by subject", () => {
      const result = handleGlobalRead(db, { subject: "go" });
      expect(result.facts).toHaveLength(2);
      expect(result.facts.every((f) => f.subject === "go")).toBe(true);
    });

    it("filters by both category and subject", () => {
      const result = handleGlobalRead(db, {
        category: "preference",
        subject: "go",
      });
      expect(result.facts).toHaveLength(1);
      expect(result.facts[0].content).toBe("Use encoding/json");
    });
  });
});
