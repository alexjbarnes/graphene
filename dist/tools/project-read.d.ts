import type { GrapheneDatabase } from "../db.js";
interface ProjectFact {
    id: number;
    category: string;
    subject: string;
    content: string;
    created_at: string;
    updated_at: string;
}
export declare function handleProjectRead(db: GrapheneDatabase, repoId: number, args: Record<string, unknown>): {
    facts: ProjectFact[];
};
export {};
