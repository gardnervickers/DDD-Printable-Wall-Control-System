# Extending Assembly Studio

A new centerpiece or left/right support pair using an existing mounting arrangement needs STL assets and catalog metadata. The UI discovers families and sizes, the solver finds matching ports, and the print kit includes declared accessories. No UI changes are needed for those additions.

## Try the complete example

[`examples/custom-parts.json`](examples/custom-parts.json) contains a centerpiece and paired supports using unchanged upstream meshes. It demonstrates a new family, stable IDs, pairing, source hashes, and connection frames without inventing geometry.

From the repository root, enter `nix develop`, then merge the example into your authored catalog:

```sh
python3 - <<'PY'
import json
from pathlib import Path
path = Path('configurator/catalog/custom-parts.json')
custom = json.loads(path.read_text())
example = json.loads(Path('configurator/examples/custom-parts.json').read_text())
ids = {part['id'] for part in custom['parts']}
assert not ids.intersection(part['id'] for part in example['parts']), 'Example already installed'
custom['parts'].extend(example['parts'])
path.write_text(json.dumps(custom, indent=2) + '\n')
PY
python3 configurator/scripts/catalog.py
node --test configurator/tests/assembly.test.js
python3 -m unittest discover -s configurator/tests -p 'test_*.py'
python3 configurator/scripts/build.py
python3 -m http.server 8765 --bind 127.0.0.1 --directory configurator/dist
```

If your local server is already running, rebuild and reload it instead of starting a second server. Open http://127.0.0.1:8765, choose **Example centerpiece**, and find **Example supports** among compatible pairs. Download the kit: it should contain one plate, one left support, and one right support. The example adds records to your catalog only when you run these commands; it is not enabled by default. To remove it, delete the three `example-*` records from `custom-parts.json`, regenerate, and rebuild.

## Add your actual centerpiece

1. Save the original printable STL inside the repository, for example `Custom/Caliper cradle.stl`. Use millimeters. Keep editable CAD sources beside it if available. Record authorship and ensure the asset can be distributed under the repository's MIT license; the current ZIP includes that license and does not collect additional per-asset licenses.
2. Copy the closest **centerpiece** record from `catalog/parts.json` into `catalog/custom-parts.json`. Give it a new stable `id`, a descriptive `label`, `family`, and `description`. A family's variants must have unique `(height, width)` combinations and a consistent label. `height`/`width` are positive integer UI size selectors, not measurements used to infer fit. For shelves, `height` is depth and `dimensionLabel` is `Depth`.
3. Replace `asset` with the new file's hash and native mesh bounds. This helper uses the same STL reader as the importer:

```sh
python3 - <<'PY'
import json, sys
from pathlib import Path
sys.path.insert(0, 'configurator/scripts')
from catalog import asset
print(json.dumps(asset(Path('Custom/Caliper cradle.stl').resolve()), indent=2))
PY
```

4. Measure the new geometry and set `transform.rotation` and `transform.translation`. The transform rotates the source mesh in XYZ Euler order, then translates it into installed coordinates: X across the wall, Y upward, Z outward, panel face Z=0. It affects the preview only; downloads retain the original print orientation. Copy a transform only if the new mesh has the same source origin and orientation.
5. Declare the **actual mating datums** in `ports`, using normalized installed coordinates. Each port has an interface ID, left/right edge, position, and outward unit normal. Existing upright DDD datums and shelf datums are detailed in [the catalog contract](catalog/README.md). Copying a reference record is valid only when the new part preserves those connector locations and geometry.
6. Set `panel` to supported orientations (`vertical`, `horizontal`) and `mounts` to one supported arrangement (`upright` or `shelf`). The current UI uses the first mount entry; represent alternative orientations as separate records.
7. Add `dependencies` for separate pins or screws. For each physical occurrence, declare `part`, `quantity: 1`, installed `position`, and `rotation`. The referenced record must be an accessory. The solver currently reads dependencies from the centerpiece; sidepiece dependencies are not included in kits. Integral pins need no dependency.

Commit authored metadata, source assets, and regenerated `catalog/parts.json` together. Do not edit `parts.json` by hand: regeneration replaces it. A changed STL requires a reviewed hash update.

## Add a support pair

Copy suitable left and right sidepiece records into `custom-parts.json`. Each needs its own ID, asset, normalization, and measured socket ports. Set `side` to `left` or `right`, and give both records the same new `pair` key. That key prevents mixing your left support with a different right variant. Set the family and dimensions for the pair's label and recommendation order; optional `depth` distinguishes shelf supports.

Declare `panelAttachments` for catch blade centers at Z=0, with their measured `bladeWidth`. These anchors place the illustrative panel slots. Verify the catch geometry itself crosses the panel plane and extends behind it. The matching solver keeps support translation in Z at zero so matching a port cannot pull the catches out of the panel.

The solver translates each already oriented support to match every required centerpiece port to a distinct socket, with opposite normals and the interface's position tolerance. Extra support sockets are allowed. Panel orientation, mount, and pair key must also agree. It recommends the smallest compatible height, then depth. Nominal size or an appealing preview alone cannot establish clearance.

## Accessories, interfaces, and larger changes

An accessory record contains `id`, `kind: "accessory"`, `label`, `asset`, and `transform`. A centerpiece dependency places that normalized accessory in the assembly. Repeated occurrences aggregate into the kit quantity; the STL is downloaded once with the quantity recorded in `manifest.json` and `ASSEMBLY.md`.

Reuse `ddd-grid-pin-v1` only when the physical connector geometry is preserved. New physical interfaces need a new ID in `custom-parts.json`'s `interfaces`, a finite nonnegative `toleranceMm`, and a description of the geometry. Both mates must declare it. The importer rejects overriding existing interfaces and duplicate part IDs. A tolerance describes datum matching, not printer clearance or a reason to accept different connectors.

New assembly topologies (shared brackets, several centerpieces, angled mounting, or support accessories) require changes to placement/BOM rules in `assembly.js`, controls and assembly instructions in `app.js`, and tests. The current contract is one centerpiece between a declared left/right pair. It does not infer rotations or connections from arbitrary meshes.

## Verify an extension

Regenerate the catalog, run Node and Python checks, and build using the commands above. Node checks validate metadata and matching; build verifies every STL hash. The independent Python geometry checks assume the reviewed DDD pin/socket/catch geometry. Extend their applicability and measurements when introducing different geometry rather than forcing new parts through those assumptions.

Add a case that proves the intended assembly matches and a negative case for a wrong interface, socket location, panel, or mount. Check installed pin/socket alignment and clearance using independent mesh samples or CAD measurements. Inspect front, rear, and exploded previews, then download a kit and verify its filenames, quantities, hashes, and any accessory occurrences. The optional browser checks in `tests/browser.cjs` exercise the complete UI and ZIP flow.

When nothing matches, check the selected panel and mount, interface IDs, opposite normals, port coordinates, and matching pair keys. When the preview looks wrong despite a match, check normalization and catch anchors: a datum match cannot detect body collisions. Test-print the connectors and verify the physical fit before publishing a new part as reviewed.
