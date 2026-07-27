import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFact } from "../../src/store.js";
import { createTestGlobalDir, type TestGlobalDir } from "../helpers.js";
import { handleGlobalRead } from "../../src/tools/global-read.js";
import { handleGlobalWrite } from "../../src/tools/global-write.js";
import { handleGlobalDelete } from "../../src/tools/global-delete.js";

describe("global tools", () => {
  let global: TestGlobalDir;

  beforeEach(() => {
    global = createTestGlobalDir();
  });

  afterEach(() => {
    global.cleanup();
  });

  describe("global_write", () => {
    it("writes a fact", () => {
      const result = handleGlobalWrite(global.dir, {
        category: "preference",
        subject: "testing",
        content: "TDD only",
      });

      expect(result).toEqual({ category: "preference", subject: "testing" });
      expect(readFact(global.dir, "preference", "testing")!.content).toBe("TDD only");
    });

    it("overwrites existing fact with same category+subject", () => {
      handleGlobalWrite(global.dir, { category: "preference", subject: "testing", content: "TDD only" });
      handleGlobalWrite(global.dir, { category: "preference", subject: "testing", content: "BDD preferred" });

      expect(readFact(global.dir, "preference", "testing")!.content).toBe("BDD preferred");
    });

    it("allows same category with different subjects", () => {
      handleGlobalWrite(global.dir, { category: "preference", subject: "testing", content: "TDD" });
      handleGlobalWrite(global.dir, { category: "preference", subject: "go", content: "encoding/json only" });

      const result = handleGlobalRead(global.dir, {});
      expect(result.facts).toHaveLength(2);
    });
  });

  describe("global_delete", () => {
    it("deletes an existing fact", () => {
      handleGlobalWrite(global.dir, { category: "preference", subject: "testing", content: "TDD" });
      const result = handleGlobalDelete(global.dir, { category: "preference", subject: "testing" });
      expect(result.deleted).toBe(true);

      expect(readFact(global.dir, "preference", "testing")).toBeNull();
    });

    it("returns false for non-existent fact", () => {
      const result = handleGlobalDelete(global.dir, { category: "preference", subject: "nope" });
      expect(result.deleted).toBe(false);
    });

    it("only deletes the matching category+subject", () => {
      handleGlobalWrite(global.dir, { category: "preference", subject: "testing", content: "TDD" });
      handleGlobalWrite(global.dir, { category: "preference", subject: "go", content: "std only" });
      handleGlobalDelete(global.dir, { category: "preference", subject: "testing" });

      expect(handleGlobalRead(global.dir, {}).facts).toHaveLength(1);
    });
  });

  describe("global_read", () => {
    beforeEach(() => {
      handleGlobalWrite(global.dir, { category: "preference", subject: "testing", content: "TDD only" });
      handleGlobalWrite(global.dir, { category: "preference", subject: "go", content: "Use encoding/json" });
      handleGlobalWrite(global.dir, { category: "expertise", subject: "go", content: "10 years experience" });
    });

    it("returns all facts with no filters", () => {
      const result = handleGlobalRead(global.dir, {});
      expect(result.facts).toHaveLength(3);
    });

    it("filters by category", () => {
      const result = handleGlobalRead(global.dir, { category: "preference" });
      expect(result.facts).toHaveLength(2);
      expect(result.facts.every((f) => f.category === "preference")).toBe(true);
    });

    it("filters by subject", () => {
      const result = handleGlobalRead(global.dir, { subject: "go" });
      expect(result.facts).toHaveLength(2);
      expect(result.facts.every((f) => f.subject === "go")).toBe(true);
    });

    it("filters by both category and subject", () => {
      const result = handleGlobalRead(global.dir, { category: "preference", subject: "go" });
      expect(result.facts).toHaveLength(1);
      expect(result.facts[0].content).toBe("Use encoding/json");
    });
  });
});
