# Starter specification data

The first planning seed (13 October 2026), kept as a record. The game does not load these files, and their values are
out of date. The runtime source of every balance and content value is `src/content/` (`balance.ts`, `equipment.ts`, the
mission, boss and encounter files); docs cite those constants ([docs/12](../12-implementation-contract.md)).

- [balance.v0.json](balance.v0.json): the first player, weapon, enemy, economy and endless values.
- [chunk.example.json](chunk.example.json): one illustrative Khepri encounter referencing IDs in the balance file.
- [chunk.schema.json](chunk.schema.json): a JSON Schema for that encounter shape.

Do not copy values back from here. In particular the shield recovery and drop fields predate the current rules: there is
no passive shield regeneration, no per-kill cell chance and no pity refill ([docs/02](../02-combat-and-progression.md)).

The units still match the game: distances in combat-plane world units, `s` the distance ahead of the player's row (not
altitude), time in seconds, shields and lives in whole charges, special charge as a 0–1 fraction, angles in degrees.
