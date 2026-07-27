import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { type RepoScope } from "./scope.js";
export interface ServerContext {
    scopes: RepoScope[];
    globalDir: string;
}
export declare function createServer(ctx: ServerContext): Server;
export declare function dispatch(ctx: ServerContext, tool: string, args: Record<string, unknown>): unknown;
