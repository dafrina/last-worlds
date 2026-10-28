# Campaign progression — ship collection and weapon tiers

28 October 2026. Approved user decisions supersede the earlier expansion proposal and old reactor/Flux/rank-three descriptions elsewhere. Runtime sources: `src/content/equipment.ts`, `weapon-tiers.ts`, `src/campaign/profile.ts`.

## Current increment

Four loadout slots: main weapon, special weapon, shield array, ship chassis. No handling upgrades, hidden hull health, fifth slot or new spendable currency. All chassis use the existing Scrapper GLB for now, explicitly requested by the user. Future distinct authored models replace that art without changing the central hit region or handling.

### Main weapons — exactly two upgrades

Projectile damage remains fixed (Pulse 6, Fan 5, Seeker 12). More projectiles increase total damage. Each volley/sequence step still requires a valid target and emits from the current hero position. Pausing freezes sequence progress. No queued projectile is parked at an old muzzle; projectile pool pressure delays a whole step.

| Weapon | Tier 1 | Tier 2 | Tier 3 |
| --- | --- | --- | --- |
| Twin Pulse | Twin straight bolts every .125 s | Twins every 1/12 s | Four alternating straight bolts, one tick apart, then 1/12 s rest |
| Fan Cannon | Five fixed pellets every 1/3 s | Nine pellets over the same ±12° arc | Nine pellets every 2/9 s |
| Seeker Array | One missile every .24 s, alternating left/right | Paired missiles every .32 s | Four alternating missiles .08 s apart, then .24 s rest |

Intervals are quantized to the fixed 60 Hz simulation. The alternating Seeker baseline preserves roughly the old paired weapon's throughput; its new tiers increase volume. Main missiles retain their existing hunter-shield resistance penalty. Special weapons are unchanged.

Campaign purchases each weapon's two upgrades for 150 and 300 credits. Endless uses the **identical** three firing tiers, earned through dedicated upgrade pickups or another pickup of the equipped weapon. Changing weapon type resets to tier 1, even when returning to a previously used weapon. A capped upgrade gives the existing 1,000 score bonus; life loss still removes one tier. Endless always starts with tier-1 Pulse and the same canonical equipment; campaign progression and chassis perks have no effect.

### Shields

All ships in both modes can collect up to **five** charges. Each rare shield pickup adds **one**; no passive recharge, per-kill recharge or refill after life loss. Campaign equipment changes starting reserves: Standard 3 → Bulwark 4 → Aegis 5. Bulwark costs 250 credits; Aegis requires Bulwark and costs another 400. Endless starts with three and can fill to five through its existing budgeted supplies. Supply frequency remains unchanged.

### Collectible ships

Every chassis supports every main and special weapon. Their one named perk applies only to campaign. Identical normal movement and collision radius; all use the same visual model until the art phase.

| Chassis | Perk | Frame | Propulsion | Core |
| --- | --- | --- | --- | --- |
| Scrapper (starter) | 40% wider pickup attraction | Starter | Starter | Starter |
| Ironclad | One extra starting life over the selected difficulty baseline | Training | Rolling Thunder | Cold Vector |
| Interceptor | 50% more special charge from main-weapon kills (same three-kills/second cap; no special-kill charge) | Rolling Thunder | Cold Vector | Deep Bloom |
| Spectre | Activating a special boosts main firing cadence 25% for three active seconds | Deep Bloom | Brood Strike | Final Horizon |

A clear on any difficulty grants its named parts once. Parts derive from persisted mission-clear records, so existing clears count and no duplicate fragments accumulate. Failed/abandoned attempts give no parts. After all three pieces are present, assemble for free in Hangar → Ships, then equip freely. Parts and their source missions are visible there; results name newly recovered parts. First-release collection is deliberately deterministic, not randomized drops or repeated farming. Optional contract routes can be added later without changing combat.

## Save migration

The existing storage key is retained; schema is now version 2. Before replacing any version-1 profile, preserve its exact raw text under `last-worlds.campaign.v1.backup`. Invalid/unknown profiles are never overwritten. If backup or migration writing fails, use the migrated profile only in memory for that session.

- Credits, weapons, specials, mission records and attempt receipts survive.
- Weapon ranks 0/1/2 retain their purchased level. Old rank 3 becomes rank 2 with a 500-credit refund per affected weapon.
- Each retired Vector or Precision reactor purchase refunds 250 credits; the selected chassis becomes Scrapper.
- Flux refunds 250 credits. If equipped, select owned Bulwark or Standard. Standard/Bulwark purchases remain owned; Aegis is the new second upgrade.
- Version 2 prevents repeat migration/refunds on reload. Existing mission clears immediately count toward ship assembly, without fabricating credit awards.

## Follow-up work

Distinct ship models and hangar model previews; additional chassis once the first perks are playtested; observational campaign career/side missions with alternate part sources; more authored sorties. These are not included in this increment. Terrain, enemy attacks and score music remain unchanged.

Validation evidence and any limitations are recorded in `build-status.md`. Browser phone dimensions do not replace actual hardware playtesting or establish perk/economy balance.
