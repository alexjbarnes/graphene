import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type Database from "better-sqlite3";
export interface ServerContext {
    repoDB: Database.Database | null;
    globalDB: Database.Database;
    repoRoot: string | null;
}
export declare function createServer(ctx: ServerContext): Server;
