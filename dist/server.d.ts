import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { GrapheneDatabase } from "./db.js";
export interface ServerContext {
    repoDB: GrapheneDatabase | null;
    globalDB: GrapheneDatabase;
    repoRoot: string | null;
}
export declare function createServer(ctx: ServerContext): Server;
