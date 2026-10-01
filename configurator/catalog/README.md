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
  "position": [-38.1, 12.6, 4.45],
  "normal": [-1, 0, 0]
}
```

Positions are mating-frame datums, not arbitrary bounding-box edges. Normals point out of the part toward its mate. Sidepiece port normals oppose centerpiece port normals. Ports on the same edge must all match distinct sockets, with the declared positional tolerance (0.15mm for this interface). Interface IDs encode the physical connector contract; changing connector geometry requires a new interface version even if the grid pitch stays the same.

For current DDD upright parts:

- Blank body width is `width × 25.4 − 2.4`; integral pins project 3.9mm from each edge. Their centers are at `±(width × 25.4 / 2 + 0.75)`.
- Pin row centers are `12.6 + row × 25.4` above the plate bottom. Pins have a 9.8mm height and 3.8mm thickness before chamfers.
- Sidepieces are printed on their side. Rotate left pieces −90° and right pieces +90° around Y: native X becomes installed depth and native Z becomes installed thickness. The panel face is 10mm inward from the rear tip of the catch; installed catches span Z=−10..0 and bracket bodies extend to Z=8.7.
- Native flat sockets span 4mm in Z (the insertion axis), 10mm in Y, and 4mm in X. After rotation they open toward the centerpiece along installed X, with depth Z=2.35..6.35.
- Port X positions use the nominal panel-column datum, `±width × 25.4 / 2` on centerpieces and `±1.1` on normalized sidepieces. These are mating datums, not the integral pin centers. This seats the 2.2mm catch blades on panel columns 25.4mm apart.
- Blank and clip-on STLs keep their native Z placement. Locking plates are translated so their back is at Z=2.55. Integral pins span Z=2.55..6.35; separate pins start at Z=2.35.
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

`panelAttachments` declares each catch blade center at the panel face, in normalized installed coordinates. The panel preview uses these anchors to phase a 25.4mm column × 50.8mm row grid and cuts real openings through a contextual 1.2mm sheet. This is an illustrative panel, not a manufacturing drawing or tolerance certification.
