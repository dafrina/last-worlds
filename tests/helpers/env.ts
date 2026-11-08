/** The environment of a Node test run (report switches such as DECK_REPORT); empty where there is no `process`. */
export const env: Record<string, string | undefined> = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
