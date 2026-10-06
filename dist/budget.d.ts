import type { StoredObservation } from "./store.js";
export declare const READ_BUDGET = 20000;
export declare const OBSERVATION_LIMIT = 1500;
export declare function checkObservationBudget(nodeName: string, existing: StoredObservation[], additions: string[]): void;
