import Database from "better-sqlite3";
import { existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { GrapheneDatabase } from "./db.js";

// Earlier versions kept one SQLite file per repo at <repoRoot>/.graphene/context.db
// and one global file at ~/.graphene/global.db. Everything now lives in a single
// file with a repo_id dimension. These functions fold a legacy file into the new
// db the first time its repo (or the user) is seen, then rename the old file so
// the import never runs twice. Legacy files are plain SQLite, so better-sqlite3
// reads them directly. Inserts use OR IGNORE for rows with natural keys so a
// re-run after an interrupted migration cannot duplicate them.

function tableExists(db: Database.Database, name: string): boolean {
  return !!db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(name);
}

interface LegacyNode {
  name: string;
  type: string;
  summary: string | null;
  entry_points: string | null;
  covers: string | null;
  last_commit: string | null;
  metadata: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface LegacyEdge {
  from_node: string;
  to_node: string;
  type: string;
  reason: string | null;
  created_at: string | null;
}

interface LegacyObservation {
  node_name: string;
  content: string;
  source: string | null;
  created_at: string | null;
}

interface LegacyFact {
  category: string;
  subject: string;
  content: string;
  created_at: string | null;
  updated_at: string | null;
}

export function migrateRepo(
  db: GrapheneDatabase,
  repoId: number,
  repoRoot: string
): void {
  const legacyPath = join(repoRoot, ".graphene", "context.db");
  if (!existsSync(legacyPath)) return;

  const legacy = new Database(legacyPath, { readonly: true });
  try {
    const importAll = db.transaction(() => {
      if (tableExists(legacy, "nodes")) {
        const rows = legacy
          .prepare(
            "SELECT name, type, summary, entry_points, covers, last_commit, metadata, created_at, updated_at FROM nodes"
          )
          .all() as LegacyNode[];
        const ins = db.prepare(
          `INSERT OR IGNORE INTO nodes
           (repo_id, name, type, summary, entry_points, covers, last_commit, metadata, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const r of rows) {
          ins.run(
            repoId,
            r.name,
            r.type,
            r.summary,
            r.entry_points ?? "[]",
            r.covers ?? "[]",
            r.last_commit,
            r.metadata ?? "{}",
            r.created_at,
            r.updated_at
          );
        }
      }

      if (tableExists(legacy, "edges")) {
        const rows = legacy
          .prepare("SELECT from_node, to_node, type, reason, created_at FROM edges")
          .all() as LegacyEdge[];
        const ins = db.prepare(
          `INSERT OR IGNORE INTO edges (repo_id, from_node, to_node, type, reason, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        );
        for (const r of rows) {
          ins.run(repoId, r.from_node, r.to_node, r.type, r.reason, r.created_at);
        }
      }

      if (tableExists(legacy, "observations")) {
        const rows = legacy
          .prepare("SELECT node_name, content, source, created_at FROM observations")
          .all() as LegacyObservation[];
        const ins = db.prepare(
          `INSERT INTO observations (repo_id, node_name, content, source, created_at)
           VALUES (?, ?, ?, ?, ?)`
        );
        for (const r of rows) {
          ins.run(repoId, r.node_name, r.content, r.source, r.created_at);
        }
      }

      if (tableExists(legacy, "project_facts")) {
        const rows = legacy
          .prepare(
            "SELECT category, subject, content, created_at, updated_at FROM project_facts"
          )
          .all() as LegacyFact[];
        const ins = db.prepare(
          `INSERT OR IGNORE INTO project_facts (repo_id, category, subject, content, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        );
        for (const r of rows) {
          ins.run(repoId, r.category, r.subject, r.content, r.created_at, r.updated_at);
        }
      }
    });
    importAll();
  } finally {
    legacy.close();
  }

  renameSync(legacyPath, legacyPath + ".migrated");
}

export function migrateGlobal(db: GrapheneDatabase): void {
  const legacyPath = join(homedir(), ".graphene", "global.db");
  if (!existsSync(legacyPath)) return;

  const legacy = new Database(legacyPath, { readonly: true });
  try {
    if (tableExists(legacy, "facts")) {
      const rows = legacy
        .prepare("SELECT category, subject, content, created_at, updated_at FROM facts")
        .all() as LegacyFact[];
      const ins = db.prepare(
        `INSERT OR IGNORE INTO facts (category, subject, content, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      );
      const importAll = db.transaction(() => {
        for (const r of rows) {
          ins.run(r.category, r.subject, r.content, r.created_at, r.updated_at);
        }
      });
      importAll();
    }
  } finally {
    legacy.close();
  }

  renameSync(legacyPath, legacyPath + ".migrated");
}
