# Starter specification data

These JSON files are historical planning artifacts, not the runtime source. Prototype values now live in src/content/balance.ts; the initial arc proposal here is superseded by the Seeker family in v0.3. Read docs/12-implementation-contract.md and current runtime data before editing gameplay. They make units, initial values, and encounter contracts concrete for agents.

- [balance.v0.json](balance.v0.json): initial player, weapon, enemy, economy, and endless values.
- [chunk.example.json](chunk.example.json): one illustrative Khepri encounter referencing IDs in the balance file.
- [chunk.schema.json](chunk.schema.json): structural JSON Schema for that encounter shape.

During M0, select a runtime schema library or validator, migrate these definitions into the authoritative runtime content source, and add semantic checks. Structural schema validity alone does not prove balance, valid content references, threat-budget compliance, geometric reachability, or fair timing. This example has not been simulated or playtested.

Units: distances in combat-plane world units; time in seconds except explicitly named tick/Hz fields; enemy damage/HP in points; player shields in integer charges; lives in integers; special charge as a 0–1 fraction; currency in integer credits. `s` means distance ahead of the player's fixed row, not world-space y or altitude. Angles are degrees in authoring data and converted at the runtime boundary.

Required semantic validations include unique IDs, existing spawn references, supported pattern/archetype combinations, chronological/in-bounds spawn times, nonnegative rewards, finite numeric values, consistent simultaneous entity ceilings, supported entry/exit tags, and reachability under the movement contract. A known-safe runtime fallback must be tested separately; this example is not automatically that fallback.

The tables in the design docs explain intent. Values in this initial JSON were checked for consistency with those tables. Once implementation begins, avoid hand-editing duplicate balance sources; establish a source-of-truth path and regenerate or check summaries.

## v0.4 override

The v0 JSON below is historical planning data, not loaded by the game. Its shield recovery/drop fields are superseded: there is no passive shield regeneration, no per-kill cell chance, and no pity refill. Use `src/content/balance.ts` and the active simulation for prototype values, and the v0.4 combat document for future design intent. Do not copy old recovery fields back into runtime code.
