import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { GrapheneDatabase } from "./db.js";
export interface ServerContext {
    db: GrapheneDatabase;
    repoId: number | null;
    repoRoot: string | null;
}
export declare function createServer(ctx: ServerContext): Server;
