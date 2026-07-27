import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { execSync, execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { type StoredFact, writeFact, readFact } from "../src/store.js";
import { serializeBundle, parseBundle, exportGlobals, importGlobals } from "../src/globals-sync.js";
import { createTestGlobalDir, type TestGlobalDir } from "./helpers.js";

const REPO_ROOT = join(import.meta.dirname, "..");
const DIST_INDEX = join(REPO_ROOT, "dist", "index.js");

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

describe("serializeBundle / parseBundle", () => {
  const FACTS: StoredFact[] = [
    { category: "expertise", subject: "go", content: "Assume deep Go proficiency." },
    { category: "preference", subject: "communication", content: "Be terse. Skip the preamble." },
  ];

  it("round-trips: parse(serialize(facts)) deep-equals facts, sorted by category then subject", () => {
    const shuffled = [FACTS[1], FACTS[0]];
    expect(parseBundle(serializeBundle(shuffled))).toEqual(FACTS);
  });

  it("produces the documented header/section format", () => {
    expect(serializeBundle(FACTS)).toBe(
      "# graphene globals\n\n" +
        "## expertise / go\n" +
        "Assume deep Go proficiency.\n\n" +
        "## preference / communication\n" +
        "Be terse. Skip the preamble.\n"
    );
  });

  it("survives multi-paragraph content", () => {
    const facts: StoredFact[] = [
      { category: "convention", subject: "multi", content: "Paragraph one.\n\nParagraph two, second line." },
    ];
    expect(parseBundle(serializeBundle(facts))).toEqual(facts);
  });

  it("does not split on an ordinary markdown heading embedded in fact content", () => {
    const facts: StoredFact[] = [
      {
        category: "convention",
        subject: "docs",
        content: "Use headings like this in our docs:\n\n## Setup\nRun npm install.",
      },
      { category: "convention", subject: "zzz", content: "a second fact, to prove the heading did not split" },
    ];
    expect(parseBundle(serializeBundle(facts))).toEqual(facts);
  });

  it("throws a header-guard error unless the first non-empty line is the bundle header", () => {
    expect(() => parseBundle("not a bundle\n")).toThrow(/graphene globals/);
    expect(() => parseBundle("")).toThrow(/graphene globals/);
    // Leading blank lines before the header are tolerated.
    expect(() => parseBundle("\n\n  \n# graphene globals\n\n## a / b\nok\n")).not.toThrow();
  });
});

describe("exportGlobals / importGlobals", () => {
  let src: TestGlobalDir;
  let dest: TestGlobalDir;
  let bundleDir: string;
  let bundlePath: string;

  beforeEach(() => {
    src = createTestGlobalDir();
    dest = createTestGlobalDir();
    bundleDir = tempDir("graphene-globals-bundle-");
    bundlePath = join(bundleDir, "bundle.md");
  });

  afterEach(() => {
    src.cleanup();
    dest.cleanup();
    rmSync(bundleDir, { recursive: true, force: true });
  });

  it("exportGlobals writes a bundle and reports the fact count", () => {
    writeFact(src.dir, { category: "preference", subject: "communication", content: "Be terse." });
    writeFact(src.dir, { category: "expertise", subject: "go", content: "Deep Go proficiency." });

    const result = exportGlobals(src.dir, bundlePath);
    expect(result).toEqual({ path: bundlePath, count: 2 });
    expect(parseBundle(readFileSync(bundlePath, "utf-8"))).toHaveLength(2);
  });

  it("classifies facts as imported, unchanged, or skipped, and lists skipped keys", () => {
    writeFact(dest.dir, { category: "convention", subject: "same", content: "unchanged content" });
    writeFact(dest.dir, { category: "convention", subject: "clash", content: "local version" });

    writeFileSync(
      bundlePath,
      serializeBundle([
        { category: "convention", subject: "new", content: "brand new fact" },
        { category: "convention", subject: "same", content: "unchanged content" },
        { category: "convention", subject: "clash", content: "bundle version" },
      ])
    );

    const result = importGlobals(dest.dir, bundlePath, false);
    expect(result).toEqual({ imported: 1, unchanged: 1, skipped: ["convention/clash"], overwritten: 0 });
    expect(readFact(dest.dir, "convention", "new")?.content).toBe("brand new fact");
    // Skipped means untouched: the local version survives.
    expect(readFact(dest.dir, "convention", "clash")?.content).toBe("local version");
  });

  it("overwrites a clashing fact when overwrite is true", () => {
    writeFact(dest.dir, { category: "convention", subject: "clash", content: "local version" });
    writeFileSync(
      bundlePath,
      serializeBundle([{ category: "convention", subject: "clash", content: "bundle version" }])
    );

    const result = importGlobals(dest.dir, bundlePath, true);
    expect(result).toEqual({ imported: 0, unchanged: 0, skipped: [], overwritten: 1 });
    expect(readFact(dest.dir, "convention", "clash")?.content).toBe("bundle version");
  });

  it("throws a clear error naming the path when the bundle file is missing", () => {
    const missingPath = join(bundleDir, "does-not-exist.md");
    expect(() => importGlobals(dest.dir, missingPath, false)).toThrow(missingPath);
  });

  it("wraps the header-guard error with the bundle path for a malformed file", () => {
    writeFileSync(bundlePath, "just some text, not a bundle\n");
    expect(() => importGlobals(dest.dir, bundlePath, false)).toThrow(/graphene globals/);
    expect(() => importGlobals(dest.dir, bundlePath, false)).toThrow(bundlePath);
  });

  it("throws when a hand-crafted bundle contains a slug invalid per validateSlug", () => {
    // "__" is banned by isValidSlug/validateSlug but not by parseBundle's
    // section regex (which only constrains character shape), so this line
    // parses cleanly and must be caught by importGlobals's own validateSlug
    // call, before anything is written.
    writeFileSync(bundlePath, "# graphene globals\n\n## a__b / c\nsome content\n");
    expect(() => importGlobals(dest.dir, bundlePath, false)).toThrow(/"__"/);
  });
});

describe("tilde expansion", () => {
  it("expands a leading ~/ via the current HOME, for both export and import", () => {
    const originalHome = process.env.HOME;
    const fakeHome = tempDir("graphene-globals-tilde-home-");
    const src = createTestGlobalDir();
    const dest = createTestGlobalDir();
    try {
      process.env.HOME = fakeHome;
      writeFact(src.dir, { category: "preference", subject: "editor", content: "vim" });

      const exported = exportGlobals(src.dir, "~/g.md");
      expect(exported.path).toBe(join(fakeHome, "g.md"));
      expect(existsSync(join(fakeHome, "g.md"))).toBe(true);

      const imported = importGlobals(dest.dir, "~/g.md", false);
      expect(imported).toEqual({ imported: 1, unchanged: 0, skipped: [], overwritten: 0 });
      expect(readFact(dest.dir, "preference", "editor")?.content).toBe("vim");
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      src.cleanup();
      dest.cleanup();
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });
});

// Spawns the compiled CLI directly, so dist/index.js must reflect the current
// source. Scoped to this describe (rather than a module-level beforeAll)
// since it is the only block here that runs compiled output; the tests
// above exercise src/globals-sync.ts directly through vitest's own transform.
describe("CLI: globals export / import", () => {
  beforeAll(() => {
    execSync("node node_modules/typescript/bin/tsc", { cwd: REPO_ROOT, stdio: "inherit" });
  }, 60000);

  it("exports via one HOME and imports via another, printing the documented result lines", () => {
    const homeA = tempDir("graphene-globals-cli-home-a-");
    const homeB = tempDir("graphene-globals-cli-home-b-");
    const bundleDir = tempDir("graphene-globals-cli-bundle-");
    const bundlePath = join(bundleDir, "g.md");

    try {
      const srcGlobalDir = join(homeA, ".graphene", "global");
      writeFact(srcGlobalDir, { category: "preference", subject: "communication", content: "Be terse." });

      const exportOut = execFileSync(process.execPath, [DIST_INDEX, "globals", "export", bundlePath], {
        env: { ...process.env, HOME: homeA },
        encoding: "utf-8",
      });
      expect(exportOut.trim()).toBe(`Exported 1 global facts to ${bundlePath}`);
      expect(existsSync(bundlePath)).toBe(true);

      const importOut = execFileSync(process.execPath, [DIST_INDEX, "globals", "import", bundlePath], {
        env: { ...process.env, HOME: homeB },
        encoding: "utf-8",
      });
      expect(importOut.trim()).toBe("Imported 1, unchanged 0, overwritten 0.");

      const destGlobalDir = join(homeB, ".graphene", "global");
      expect(readFact(destGlobalDir, "preference", "communication")?.content).toBe("Be terse.");
    } finally {
      rmSync(homeA, { recursive: true, force: true });
      rmSync(homeB, { recursive: true, force: true });
      rmSync(bundleDir, { recursive: true, force: true });
    }
  }, 20000);

  it("prints usage to stderr and exits 1 when the path is missing", () => {
    const home = tempDir("graphene-globals-cli-home-");
    try {
      const result = spawnSync(process.execPath, [DIST_INDEX, "globals", "export"], {
        env: { ...process.env, HOME: home },
        encoding: "utf-8",
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Usage:");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
