import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readNode } from "../../src/store.js";
import { createTestRepo, type TestRepoDir } from "../helpers.js";
import { handleUpsertNode } from "../../src/tools/upsert-node.js";

describe("upsert_node", () => {
  let repo: TestRepoDir;

  beforeEach(() => {
    repo = createTestRepo();
  });

  afterEach(() => {
    repo.cleanup();
  });

  it("creates a node with all fields", () => {
    const result = handleUpsertNode(repo.repoRoot, {
      name: "auth",
      type: "subsystem",
      summary: "Handles authentication",
      entry_points: ["auth/router.ts"],
      covers: ["auth/"],
      last_commit: "abc123",
      metadata: { interfaces: ["login", "logout"] },
    });

    expect(result).toEqual({ name: "auth", status: "created" });

    const node = readNode(repo.repoRoot, "auth")!;
    expect(node.type).toBe("subsystem");
    expect(node.summary).toBe("Handles authentication");
    expect(node.entry_points).toEqual(["auth/router.ts"]);
    expect(node.covers).toEqual(["auth/"]);
    expect(node.last_commit).toBe("abc123");
    expect(node.metadata).toEqual({ interfaces: ["login", "logout"] });
  });

  it("creates a node with minimal fields", () => {
    const result = handleUpsertNode(repo.repoRoot, { name: "api", type: "module" });
    expect(result).toEqual({ name: "api", status: "created" });

    const node = readNode(repo.repoRoot, "api")!;
    expect(node.summary).toBeNull();
    expect(node.entry_points).toEqual([]);
  });

  it("throws when type is missing on create", () => {
    expect(() => handleUpsertNode(repo.repoRoot, { name: "auth" })).toThrow(
      "type is required"
    );
  });

  it("updates only provided fields", () => {
    handleUpsertNode(repo.repoRoot, {
      name: "auth",
      type: "subsystem",
      summary: "Original summary",
      entry_points: ["auth/router.ts"],
    });

    handleUpsertNode(repo.repoRoot, { name: "auth", summary: "Updated summary" });

    const node = readNode(repo.repoRoot, "auth")!;
    expect(node.summary).toBe("Updated summary");
    expect(node.type).toBe("subsystem");
    expect(node.entry_points).toEqual(["auth/router.ts"]);
  });

  it("shallow-merges metadata", () => {
    handleUpsertNode(repo.repoRoot, {
      name: "auth",
      type: "subsystem",
      metadata: { interfaces: ["login"], invariants: ["session < token"] },
    });

    handleUpsertNode(repo.repoRoot, {
      name: "auth",
      metadata: { gotchas: ["retry is intentional"] },
    });

    const node = readNode(repo.repoRoot, "auth")!;
    expect(node.metadata.interfaces).toEqual(["login"]);
    expect(node.metadata.invariants).toEqual(["session < token"]);
    expect(node.metadata.gotchas).toEqual(["retry is intentional"]);
  });

  it("does not require type on update", () => {
    handleUpsertNode(repo.repoRoot, { name: "auth", type: "subsystem" });
    const result = handleUpsertNode(repo.repoRoot, {
      name: "auth",
      summary: "Updated",
    });
    expect(result).toEqual({ name: "auth", status: "updated", fields_updated: ["summary"] });
  });

  it("unwraps a fields object (the documented shorthand)", () => {
    handleUpsertNode(repo.repoRoot, { name: "auth", type: "subsystem", last_commit: "old" });
    const result = handleUpsertNode(repo.repoRoot, { name: "auth", fields: { last_commit: "new" } });
    expect(result).toEqual({ name: "auth", status: "updated", fields_updated: ["last_commit"] });
    expect(readNode(repo.repoRoot, "auth")!.last_commit).toBe("new");
  });

  it("unwraps a fields JSON string (the silent-drop bug)", () => {
    handleUpsertNode(repo.repoRoot, { name: "tts", type: "subsystem", last_commit: "0b76f97" });
    const result = handleUpsertNode(repo.repoRoot, { name: "tts", fields: '{"last_commit": "9f9b245"}' });
    expect(result.status).toBe("updated");
    expect(readNode(repo.repoRoot, "tts")!.last_commit).toBe("9f9b245");
  });

  it("merges metadata supplied inside a fields wrapper", () => {
    handleUpsertNode(repo.repoRoot, { name: "tts", type: "subsystem", metadata: { a: "1" } });
    handleUpsertNode(repo.repoRoot, { name: "tts", fields: { metadata: { b: "2" } } });
    expect(readNode(repo.repoRoot, "tts")!.metadata).toEqual({ a: "1", b: "2" });
  });

  it("coerces metadata passed as a JSON string", () => {
    handleUpsertNode(repo.repoRoot, { name: "auth", type: "subsystem" });
    handleUpsertNode(repo.repoRoot, { name: "auth", metadata: '{"k":"v"}' });
    expect(readNode(repo.repoRoot, "auth")!.metadata).toEqual({ k: "v" });
  });

  it("coerces entry_points and covers passed as JSON strings", () => {
    const result = handleUpsertNode(repo.repoRoot, {
      name: "auth",
      type: "subsystem",
      entry_points: '["auth/router.ts"]',
      covers: '["auth/"]',
    });
    expect(result.status).toBe("created");
    const node = readNode(repo.repoRoot, "auth")!;
    expect(node.entry_points).toEqual(["auth/router.ts"]);
    expect(node.covers).toEqual(["auth/"]);
  });

  it("throws on an unknown field", () => {
    handleUpsertNode(repo.repoRoot, { name: "auth", type: "subsystem" });
    expect(() => handleUpsertNode(repo.repoRoot, { name: "auth", lastCommit: "x" })).toThrow(
      "Unknown field"
    );
  });

  it("throws when updating an existing node with no fields", () => {
    handleUpsertNode(repo.repoRoot, { name: "auth", type: "subsystem" });
    expect(() => handleUpsertNode(repo.repoRoot, { name: "auth" })).toThrow(
      "no fields to update"
    );
  });

  it("throws when fields is a string but not valid JSON", () => {
    handleUpsertNode(repo.repoRoot, { name: "auth", type: "subsystem" });
    expect(() => handleUpsertNode(repo.repoRoot, { name: "auth", fields: "not json" })).toThrow(
      "not valid JSON"
    );
  });

  it("throws a loud slug error for an invalid node name instead of silently normalizing", () => {
    expect(() => handleUpsertNode(repo.repoRoot, { name: "Bad Name", type: "subsystem" })).toThrow(
      /lowercase/
    );
  });
});
