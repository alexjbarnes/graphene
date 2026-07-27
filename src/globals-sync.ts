import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { type StoredFact, listFacts, readFact, writeFact, writeFileAtomic, validateSlug } from "./store.js";

const HEADER = "# graphene globals";

// Slug shape mirrors store.ts's SLUG_RE (lowercase letters, digits, "_", ".",
// "-"). Requiring " / " between two slug-shaped tokens means an ordinary
// markdown heading inside fact content (e.g. "## Setup" or "## A / B / C")
// can never be mistaken for a section boundary, so multi-paragraph content
// that happens to contain a heading round-trips unchanged. This regex does
// not reject "__" the way isValidSlug does, so importGlobals re-validates
// each parsed category/subject with validateSlug before writing.
const SECTION_RE = /^## ([a-z0-9_][a-z0-9._-]*) \/ ([a-z0-9_][a-z0-9._-]*)$/;

function expandTilde(path: string): string {
  return path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

export function serializeBundle(facts: StoredFact[]): string {
  const sorted = [...facts].sort((a, b) => {
    if (a.category !== b.category) return a.category < b.category ? -1 : 1;
    if (a.subject !== b.subject) return a.subject < b.subject ? -1 : 1;
    return 0;
  });

  const sections = sorted.map((f) => `## ${f.category} / ${f.subject}\n${f.content}`);
  return [HEADER, ...sections].join("\n\n") + "\n";
}

// Parses what serializeBundle wrote. Content for a section runs until the
// next section header or EOF, and is trimmed of leading/trailing blank lines
// only (see SECTION_RE above for why embedded "## " lines don't split a
// section).
export function parseBundle(text: string): StoredFact[] {
  const lines = text.split("\n");

  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  if (i >= lines.length || lines[i] !== HEADER) {
    throw new Error(`Not a graphene globals bundle (missing "${HEADER}" header)`);
  }
  i++;

  const facts: StoredFact[] = [];
  let current: { category: string; subject: string; lines: string[] } | null = null;

  const flush = (): void => {
    if (current === null) return;
    facts.push({
      category: current.category,
      subject: current.subject,
      content: current.lines.join("\n").trim(),
    });
  };

  for (; i < lines.length; i++) {
    const match = SECTION_RE.exec(lines[i]);
    if (match) {
      flush();
      current = { category: match[1], subject: match[2], lines: [] };
    } else if (current !== null) {
      current.lines.push(lines[i]);
    }
  }
  flush();

  return facts;
}

export function exportGlobals(globalDirPath: string, filePath: string): { path: string; count: number } {
  const resolved = expandTilde(filePath);
  const facts = listFacts(globalDirPath);
  writeFileAtomic(resolved, serializeBundle(facts));
  return { path: resolved, count: facts.length };
}

export interface ImportResult {
  imported: number;
  unchanged: number;
  skipped: string[];
  overwritten: number;
}

// Merges by category+subject: a fact absent locally is written; present with
// identical content is left alone; present with different content is
// overwritten only when `overwrite` is set, otherwise it is skipped and
// reported so the caller can reconcile by hand.
export function importGlobals(globalDirPath: string, filePath: string, overwrite: boolean): ImportResult {
  const resolved = expandTilde(filePath);
  if (!existsSync(resolved)) {
    throw new Error(`Bundle file not found: ${resolved}`);
  }

  let facts: StoredFact[];
  try {
    facts = parseBundle(readFileSync(resolved, "utf-8"));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${message}: ${resolved}`);
  }

  const result: ImportResult = { imported: 0, unchanged: 0, skipped: [], overwritten: 0 };

  for (const fact of facts) {
    // SECTION_RE constrains shape but allows "__"; validateSlug is the same
    // chokepoint store.ts's own writers go through, so a hand-crafted bundle
    // can't sneak a store-invalid slug past this import.
    validateSlug(fact.category, "category");
    validateSlug(fact.subject, "subject");

    const existing = readFact(globalDirPath, fact.category, fact.subject);
    if (existing === null) {
      writeFact(globalDirPath, fact);
      result.imported++;
    } else if (existing.content === fact.content) {
      result.unchanged++;
    } else if (overwrite) {
      writeFact(globalDirPath, fact);
      result.overwritten++;
    } else {
      result.skipped.push(`${fact.category}/${fact.subject}`);
    }
  }

  return result;
}
