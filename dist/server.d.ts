import { Server } from "@modelcontextprotocol/sdk/server/index.js";
export interface ServerContext {
    repoRoot: string | null;
    globalDir: string;
}
export declare function createServer(ctx: ServerContext): Server;
