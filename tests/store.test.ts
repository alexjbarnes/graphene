import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  type StoredNode,
  type StoredFact,
  parseNodeFile,
  serializeNodeFile,
  parseFactFile,
  serializeFactFile,
  isValidSlug,
  validateSlug,
  observationId,
  grapheneDir,
  nodesDir,
  factsDir,
  nodePath,
  factPath,
  globalDir,
  globalFactPath,
  writeFileAtomic,
  appendLineVerified,
  listNodes,
  readNode,
  writeNode,
  deleteNodeFile,
  listFacts,
  readFact,
  writeFact,
  deleteFactFile,
} from "../src/store.js";

// Fixtures are written flush-left inside the template literals so the string
// content matches the exact spec grammar byte-for-byte (no incidental
// indentation from the surrounding test code).

const FULL_NODE_TEXT = `---
type: subsystem
summary: Streaming chat route with permission checks
entry_points:
  - src/app/api/insights/chat/route.ts
covers:
  - src/app/api/insights/chat/
last_commit: a1f9c02
metadata: {"interfaces":["login"]}
edges:
  - to: message_guardrails type: depends_on reason: runs input through the filter
  - to: other_node type: related_to
---

- Uses checkAnyPermission(), not the per-tenant guard. <!-- id:7c1a -->
- A multi-line observation starts like this
  and continues on lines indented two spaces. <!-- id:b0e4 src:session-2026-01 -->
`;

const FULL_NODE: StoredNode = {
  name: "chat_route",
  type: "subsystem",
  summary: "Streaming chat route with permission checks",
  entry_points: ["src/app/api/insights/chat/route.ts"],
  covers: ["src/app/api/insights/chat/"],
  last_commit: "a1f9c02",
  metadata: { interfaces: ["login"] },
  edges: [
    { to: "message_guardrails", type: "depends_on", reason: "runs input through the filter" },
    { to: "other_node", type: "related_to", reason: null },
  ],
  observations: [
    { id: "7c1a", content: "Uses checkAnyPermission(), not the per-tenant guard.", source: null },
    {
      id: "b0e4",
      content: "A multi-line observation starts like this\nand continues on lines indented two spaces.",
      source: "session-2026-01",
    },
  ],
};

const MINIMAL_NODE_TEXT = `---
type: subsystem
---
`;

const MINIMAL_NODE: StoredNode = {
  name: "bare",
  type: "subsystem",
  summary: null,
  entry_points: [],
  covers: [],
  last_commit: null,
  metadata: {},
  edges: [],
  observations: [],
};

const FACT_TEXT = `---
category: convention
subject: node-env
---

NODE_ENV must not be set when building. It breaks the bundler.
`;

const FACT: StoredFact = {
  category: "convention",
  subject: "node-env",
  content: "NODE_ENV must not be set when building. It breaks the bundler.",
};

describe("parseNodeFile / serializeNodeFile", () => {
  it("round-trips a full node: parse(serialize(n)) deep-equals n", () => {
    expect(parseNodeFile(serializeNodeFile(FULL_NODE), FULL_NODE.name)).toEqual(FULL_NODE);
  });

  it("round-trips a full node: serialize(parse(t)) === t for the canonical fixture", () => {
    expect(serializeNodeFile(parseNodeFile(FULL_NODE_TEXT, "chat_route"))).toBe(FULL_NODE_TEXT);
  });

  it("parses the canonical fixture into the expected structure", () => {
    expect(parseNodeFile(FULL_NODE_TEXT, "chat_route")).toEqual(FULL_NODE);
  });

  it("round-trips a minimal node (type only, no body)", () => {
    expect(parseNodeFile(serializeNodeFile(MINIMAL_NODE), MINIMAL_NODE.name)).toEqual(MINIMAL_NODE);
    expect(serializeNodeFile(parseNodeFile(MINIMAL_NODE_TEXT, "bare"))).toBe(MINIMAL_NODE_TEXT);
  });

  it("throws on an unknown frontmatter key, naming the key", () => {
    const text = `---
type: subsystem
bogus: value
---
`;
    expect(() => parseNodeFile(text, "x")).toThrow(/Unknown frontmatter key "bogus"/);
  });

  it("throws when the required type key is missing", () => {
    const text = `---
summary: no type here
---
`;
    expect(() => parseNodeFile(text, "x")).toThrow(/type/);
  });

  it("parses observation content containing a literal <!-- mid-line", () => {
    const text = `---
type: subsystem
---

- See the <!-- comment marker syntax for docs <!-- id:9f2c -->
`;
    const node = parseNodeFile(text, "x");
    expect(node.observations).toEqual([
      { id: "9f2c", content: "See the <!-- comment marker syntax for docs", source: null },
    ]);
  });

  it("ignores a blank line between bullets", () => {
    const text = `---
type: subsystem
---

- first <!-- id:aaaa -->

- second <!-- id:bbbb -->
`;
    const node = parseNodeFile(text, "x");
    expect(node.observations.map((o) => o.id)).toEqual(["aaaa", "bbbb"]);
  });

  it("replaces internal newlines in summary with a space on serialize", () => {
    const node: StoredNode = { ...MINIMAL_NODE, summary: "line one\nline two" };
    expect(serializeNodeFile(node)).toContain("summary: line one line two");
  });

  it("omits summary, last_commit, metadata, entry_points, covers, and edges when empty", () => {
    const text = serializeNodeFile(MINIMAL_NODE);
    for (const key of ["summary", "last_commit", "metadata", "entry_points", "covers", "edges"]) {
      expect(text).not.toContain(`${key}:`);
    }
  });
});

describe("parseFactFile / serializeFactFile", () => {
  it("round-trips a fact: parse(serialize(f)) deep-equals f", () => {
    expect(parseFactFile(serializeFactFile(FACT))).toEqual(FACT);
  });

  it("round-trips a fact: serialize(parse(t)) === t for the canonical fixture", () => {
    expect(serializeFactFile(parseFactFile(FACT_TEXT))).toBe(FACT_TEXT);
  });

  it("round-trips multi-paragraph content", () => {
    const fact: StoredFact = {
      category: "convention",
      subject: "multi",
      content: "Paragraph one.\n\nParagraph two, second line.",
    };
    expect(parseFactFile(serializeFactFile(fact))).toEqual(fact);
  });

  it("trims leading and trailing blank lines from the body", () => {
    const text = `---
category: c
subject: s
---


content here

`;
    expect(parseFactFile(text).content).toBe("content here");
  });

  it("throws on an unknown frontmatter key", () => {
    const text = `---
category: c
subject: s
extra: nope
---

content
`;
    expect(() => parseFactFile(text)).toThrow(/Unknown frontmatter key "extra"/);
  });

  it("throws when category or subject is missing", () => {
    expect(() =>
      parseFactFile(`---
subject: s
---

x
`)
    ).toThrow(/category/);
    expect(() =>
      parseFactFile(`---
category: c
---

x
`)
    ).toThrow(/subject/);
  });
});

describe("isValidSlug / validateSlug", () => {
  it.each(["_smoke", "task-schema", "v2.api"])("accepts %j", (s) => {
    expect(isValidSlug(s)).toBe(true);
    expect(() => validateSlug(s, "label")).not.toThrow();
  });

  it.each(["Auth", "a:b", "a/b", ""])("rejects %j", (s) => {
    expect(isValidSlug(s)).toBe(false);
    expect(() => validateSlug(s, "label")).toThrow();
  });

  it("names the label and mentions lowercase in the error message", () => {
    expect(() => validateSlug("Bad", "node name")).toThrow(/node name/);
    expect(() => validateSlug("Bad", "node name")).toThrow(/lowercase/);
  });
});

describe("observationId", () => {
  it("hashes known content to a stable, pinned 4-char id", () => {
    // sha256("test content") = 6ae8a755...; confirmed via `sha256sum`.
    expect(observationId("test content", new Set())).toBe("6ae8");
    expect(observationId("test content", new Set())).toBe("6ae8");
  });

  it("appends -2 on collision, -3 on a second collision", () => {
    const existing = new Set(["6ae8"]);
    expect(observationId("test content", existing)).toBe("6ae8-2");
    existing.add("6ae8-2");
    expect(observationId("test content", existing)).toBe("6ae8-3");
  });

  it("derives purely from the existingIds passed in, not from prior calls", () => {
    const second = observationId("test content", new Set(["6ae8"]));
    expect(second).toBe("6ae8-2");

    // Simulate the first duplicate having been removed from the store: a
    // fresh existingIds set that no longer contains the base id reproduces
    // the base id, proving the function keeps no memory of the earlier call.
    const afterRemoval = observationId("test content", new Set());
    expect(afterRemoval).toBe("6ae8");
  });
});

describe("path helpers", () => {
  it("builds repo-relative paths", () => {
    expect(grapheneDir("/repo")).toBe(join("/repo", ".graphene"));
    expect(nodesDir("/repo")).toBe(join("/repo", ".graphene", "nodes"));
    expect(factsDir("/repo")).toBe(join("/repo", ".graphene", "facts"));
    expect(nodePath("/repo", "auth")).toBe(join("/repo", ".graphene", "nodes", "auth.md"));
    expect(factPath("/repo", "convention", "node-env")).toBe(
      join("/repo", ".graphene", "facts", "convention__node-env.md")
    );
  });

  it("builds the global dir and global fact path under $HOME", () => {
    const originalHome = process.env.HOME;
    process.env.HOME = "/fake-home";
    try {
      expect(globalDir()).toBe(join("/fake-home", ".graphene", "global"));
      expect(globalFactPath("convention", "node-env")).toBe(
        join("/fake-home", ".graphene", "global", "convention__node-env.md")
      );
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
    }
  });
});

describe("writeFileAtomic", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "graphene-store-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("creates nested parent directories", () => {
    const path = join(tmp, "a", "b", "c", "file.md");
    writeFileAtomic(path, "hello\n");
    expect(readFileSync(path, "utf-8")).toBe("hello\n");
  });

  it("leaves no .tmp files behind on success", () => {
    const dir = join(tmp, "nodes");
    writeFileAtomic(join(dir, "one.md"), "one\n");
    writeFileAtomic(join(dir, "two.md"), "two\n");
    const files = readdirSync(dir).sort();
    expect(files).toEqual(["one.md", "two.md"]);
    expect(files.some((f) => f.endsWith(".tmp"))).toBe(false);
  });

  it("overwrites an existing file atomically", () => {
    const path = join(tmp, "file.md");
    writeFileAtomic(path, "first\n");
    writeFileAtomic(path, "second\n");
    expect(readFileSync(path, "utf-8")).toBe("second\n");
  });
});

describe("appendLineVerified", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "graphene-store-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("appends to an existing file and the marker survives", () => {
    const path = join(tmp, "node.md");
    writeFileSync(path, "- first <!-- id:aaaa -->\n");
    appendLineVerified(path, "- second <!-- id:bbbb -->\n", "id:bbbb");
    expect(readFileSync(path, "utf-8")).toBe("- first <!-- id:aaaa -->\n- second <!-- id:bbbb -->\n");
  });

  it("repairs via a full atomic rewrite when marker verification fails", () => {
    const path = join(tmp, "node.md");
    writeFileSync(path, "- first <!-- id:aaaa -->\n");

    // A real race (a concurrent writeFileAtomic renaming a new inode over
    // `path` between our append and our verify read) can't be reproduced
    // deterministically in a single-threaded test, and this Vitest version
    // cannot spy on node:fs's ESM named exports ("Module namespace is not
    // configurable in ESM"). Force the same repair branch instead by passing
    // a marker the append can never satisfy: this exercises the exact
    // fallback -- re-read the current file, then writeFileAtomic(current +
    // line) -- with real, unmocked fs calls throughout. Because the real
    // append always lands first here (there is no actual lost write), the
    // repair rewrite appends `line` a second time; that duplication is an
    // artifact of forcing the branch this way, not a defect in
    // appendLineVerified (in a genuine race, `current` would be whatever the
    // concurrent writer left behind, without our line, so the repair would
    // add it exactly once).
    appendLineVerified(path, "- second <!-- id:bbbb -->\n", "id:this-marker-is-never-present");

    expect(readFileSync(path, "utf-8")).toBe(
      "- first <!-- id:aaaa -->\n" +
        "- second <!-- id:bbbb -->\n" +
        "- second <!-- id:bbbb -->\n"
    );
  });
});

describe("node CRUD", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "graphene-store-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("listNodes returns [] when the directory does not exist", () => {
    expect(listNodes(tmp)).toEqual([]);
  });

  it("readNode returns null for a missing node", () => {
    expect(readNode(tmp, "missing")).toBeNull();
  });

  it("writeNode + readNode + listNodes round trip, sorted by name", () => {
    writeNode(tmp, { ...MINIMAL_NODE, name: "b_node" });
    writeNode(tmp, { ...MINIMAL_NODE, name: "a_node" });
    expect(listNodes(tmp)).toEqual(["a_node", "b_node"]);
    expect(readNode(tmp, "a_node")).toEqual({ ...MINIMAL_NODE, name: "a_node" });
  });

  it("writes and reads back a full node through the filesystem", () => {
    writeNode(tmp, FULL_NODE);
    expect(readNode(tmp, FULL_NODE.name)).toEqual(FULL_NODE);
    expect(readFileSync(nodePath(tmp, FULL_NODE.name), "utf-8")).toBe(FULL_NODE_TEXT);
  });

  it("validates the node name as a slug", () => {
    expect(() => writeNode(tmp, { ...MINIMAL_NODE, name: "Bad Name" })).toThrow();
  });

  it("deleteNodeFile removes an existing node and reports false when absent", () => {
    writeNode(tmp, { ...MINIMAL_NODE, name: "gone" });
    expect(deleteNodeFile(tmp, "gone")).toBe(true);
    expect(readNode(tmp, "gone")).toBeNull();
    expect(deleteNodeFile(tmp, "gone")).toBe(false);
  });
});

describe("fact CRUD", () => {
  let tmp: string;
  let dir: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "graphene-store-test-"));
    dir = factsDir(tmp);
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("listFacts returns [] when the directory does not exist", () => {
    expect(listFacts(dir)).toEqual([]);
  });

  it("readFact returns null for a missing fact", () => {
    expect(readFact(dir, "convention", "missing")).toBeNull();
  });

  it("writeFact + readFact + listFacts round trip, sorted by category then subject", () => {
    writeFact(dir, { category: "convention", subject: "node-env", content: "NODE_ENV must not be set." });
    writeFact(dir, { category: "convention", subject: "abc", content: "abc first" });
    writeFact(dir, { category: "aardvark", subject: "z", content: "sorts first by category" });

    const facts = listFacts(dir);
    expect(facts.map((f) => [f.category, f.subject])).toEqual([
      ["aardvark", "z"],
      ["convention", "abc"],
      ["convention", "node-env"],
    ]);
    expect(readFact(dir, "convention", "node-env")).toEqual({
      category: "convention",
      subject: "node-env",
      content: "NODE_ENV must not be set.",
    });
  });

  it("deleteFactFile removes an existing fact and reports false when absent", () => {
    writeFact(dir, { category: "convention", subject: "x", content: "y" });
    expect(deleteFactFile(dir, "convention", "x")).toBe(true);
    expect(readFact(dir, "convention", "x")).toBeNull();
    expect(deleteFactFile(dir, "convention", "x")).toBe(false);
  });

  it("uses the category__subject double-underscore filename", () => {
    writeFact(dir, FACT);
    expect(readFileSync(factPath(tmp, FACT.category, FACT.subject), "utf-8")).toBe(FACT_TEXT);
  });
});

describe("global facts", () => {
  it("global_write/read share writeFact/readFact via globalDir()", () => {
    const originalHome = process.env.HOME;
    const fakeHome = mkdtempSync(join(tmpdir(), "graphene-home-test-"));
    process.env.HOME = fakeHome;
    try {
      const dir = globalDir();
      writeFact(dir, { category: "preference", subject: "editor", content: "vim" });
      expect(readFact(dir, "preference", "editor")).toEqual({
        category: "preference",
        subject: "editor",
        content: "vim",
      });
      expect(readFileSync(globalFactPath("preference", "editor"), "utf-8")).toContain("vim");
    } finally {
      process.env.HOME = originalHome;
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });
});

describe("boundary validation (orchestrator hardening pass)", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "graphene-store-guard-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("rejects traversal-shaped node names at the path chokepoint", () => {
    expect(() => readNode(tmp, "../escape")).toThrow("node name");
    expect(() => deleteNodeFile(tmp, "../../etc/passwd")).toThrow("node name");
    expect(() => nodePath(tmp, "a/b")).toThrow("node name");
  });

  it("rejects invalid fact category and subject on every fact operation", () => {
    const dir = factsDir(tmp);
    expect(() => writeFact(dir, { category: "../x", subject: "y", content: "z" })).toThrow("category");
    expect(() => readFact(dir, "ok", "A")).toThrow("subject");
    expect(() => deleteFactFile(dir, "a:b", "y")).toThrow("category");
    expect(() => factPath(tmp, "ok", "b/c")).toThrow("subject");
  });

  it("bans double underscore in slugs (fact filename separator collision)", () => {
    expect(isValidSlug("a__b")).toBe(false);
    expect(() => validateSlug("a__b", "category")).toThrow('"__"');
    expect(isValidSlug("a_b")).toBe(true);
  });

  it("throws on a malformed observation line instead of silently truncating", () => {
    const text = "---\ntype: subsystem\n---\n\nx not a bullet\n";
    expect(() => parseNodeFile(text, "bad")).toThrow("Malformed observation line");
  });
});
