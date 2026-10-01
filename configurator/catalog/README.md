# Part catalog contract (v1)

Add authored records to `custom-parts.json`; the importer merges them into the generated `parts.json`.

All dimensions and positions are millimeters. Installed coordinates use X across the assembly, Y up, and Z away from the illustrative panel. Rotations use degrees and XYZ Euler order. The original STL is always downloaded unchanged.

Each part has a stable `id`, `kind` (`centerpiece`, `sidepiece`, or `accessory`), label, asset, normalization transform, and optional dependencies. Centerpieces and sidepieces also declare supported `panel` and `mounts` values and connection `ports`.

`asset.file` is relative to the repository root; `asset.sha256` pins the exact printable source. `asset.bounds` records source mesh bounds. `transform` rotates the source mesh, then translates it to installed coordinates. This normalization is applied only in the preview.

A port declares:

```json
{
  "interface": "ddd-grid-pin-v1",
  "side": "left",
  "position": [-38.85, 12.6, 2.0],
  "normal": [-1, 0, 0]
}
```

Positions are mating-frame datums, not arbitrary bounding-box edges. Normals point out of the part toward its mate. Sidepiece port normals oppose centerpiece port normals. Ports on the same edge must all match distinct sockets, with the declared positional tolerance (0.15mm for this interface). Interface IDs encode the physical connector contract; changing connector geometry requires a new interface version even if the grid pitch stays the same.

For current DDD upright parts:

- Blank body width is `width × 25.4 − 2.4`; integral pins project 3.9mm from each edge. Their centers are at `±(width × 25.4 / 2 + 0.75)`.
- Pin row centers are `12.6 + row × 25.4` above the plate bottom. Pins have a 9.8mm height and 3.8mm thickness before chamfers.
- Flat sockets are 4mm wide, 10mm high, and 4mm deep. Their X centers are 4.35mm inward from the outermost front rail edge. Their native socket plane is Z=0..4, not the native blank plate printing offset.
- Blank STLs are translated by −2.55mm in Z; clip-on sockets use −2.35mm. Locking plates are normalized from their own minimum Z.
- Flat sidepieces use `maxY − height × 25.4 − 6.4` as the nominal body-bottom datum. This removes printing-layout offsets without scaling meshes.

A sidepiece declares `side` and a `pair` key shared with its matching opposite side. This lets the app generate pairs without a naming convention and prevents mixing different bracket variants. `height`, `width`, `family`, `label`, and `description` are UI metadata; they do not establish mechanical compatibility. Current UI family records should share a label and have unique height/width variants.

Dependencies refer to accessory IDs and include `quantity`, `position`, and `rotation` in the normalized centerpiece coordinate frame. The preview shows the declared occurrence; the bill of materials aggregates quantities by ID. For several spatially distinct pins, provide several occurrences with quantity 1. Dependencies are restricted to accessories in v1.

## Review before adding

1. Preserve the source STL and record its hash and license.
2. Measure connector geometry, normalize the printing offsets, and declare its installed mating frames.
3. Check the intended panel pattern, bracket pair, and mounting arrangement. Do not infer shelf clearance from nominal height.
4. Include required pins or screws and review the assembled and exploded previews.
5. Add a mesh check or independent dimensional evidence appropriate to the new interface. Verify the downloaded kit quantities.

A new part using an established interface needs a catalog record and asset. New interface definitions must specify their geometry and mating tolerances; matching an identifier alone is not physical validation. Parts with unknown metadata are never offered as compatible.
