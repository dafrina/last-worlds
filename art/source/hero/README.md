# Hero ship sources (the user's Tripo models)

Twenty Tripo image-to-3D models the user made on 29 October 2026 from hero concept images (the concepts were never
committed): four chassis × five designs, named
`<chassis>-<n>.glb` (n 1–5 is design a–e). Each is one textured mesh of about two million triangles with 4096 px base
colour, normal and roughness-metal maps, about 70 MB.

The GLBs are not in git (1.4 GB; `.gitignore`). Their SHA-256 hashes are in [SHA256SUMS](SHA256SUMS); the copies the
user supplied were in their Windows Downloads folder. Never edit them.

They are references, not runtime assets (user, 29 October: "remodel them all ourself, just using the model as a style
and size reference"):

1. `tools/blender/lib_hero_tripo.py` levels each one (Tripo read the concepts' three-quarter view partly as depth, so some
   climbed toward the nose), scales it to its chassis and cuts it into hull, wings, propulsion and cockpit.
2. `tools/blender/hero_parts.py` builds clean parts over those references to each chassis's standard joints, and
   bakes the Tripo paint, wear and surface detail onto them. Output: `public/assets/shared/hero/<chassis>-<design>.glb`.

All twenty are built ([docs/31](../../../docs/31-hero-ships.md)). The Crescent (Spectre 2) keeps its model's ring drives tilted about 28° (user: "i liked that they were tilted").
