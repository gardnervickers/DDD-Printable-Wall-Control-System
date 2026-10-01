# Wall Control Assembly Studio

Select a centerpiece, choose a compatible left/right bracket pair, inspect its assembled or exploded preview, and download a complete print kit. The ZIP includes original upstream STLs, quantities, an assembly guide, SHA-256 provenance, and the upstream MIT license. No account, backend, external CDN, or CAD regeneration is required.

## Run locally

From the repository root:

```sh
nix develop
python3 configurator/scripts/build.py
python3 -m http.server 8765 --bind 127.0.0.1 --directory configurator/dist
```

Open http://127.0.0.1:8765. `dist` is a self-contained static site suitable for a static host; publishing is a separate step. Use HTTP rather than opening index.html directly because mesh fetches and cryptographic asset checks require an HTTP origin. All library code is vendored.

## Current coverage

96 centerpiece variants, including 21 shelf sizes: blank plates, belt-clip plates, vertical-panel locking plates, and horizontal-panel locking plates. Sizes are 1–4 height units and 1–7 width units where upstream variants exist. Matching flat brackets cover 1–8 height units. Shelves use 3-inch-high angle supports with 2/3/4-inch depths; the shallowest compatible pair is recommended. Separate connector pins and one locking screw per locking assembly are included automatically.

The catalog covers upright assemblies and horizontal shelves. Other angle variants, square, U, multi-centerpiece, and shared-center-bracket arrangements are not yet catalogued. They are excluded from results. The illustrated panel is contextual and is not a measured panel model.

## Add a part

See [the catalog contract](catalog/README.md). Runtime matching consumes declared connection frames, panel patterns, mounting arrangements, and paired bracket variants. It does not parse filenames or compare nominal dimensions to establish fit.

Add new part records and interface definitions to `catalog/custom-parts.json`, then run `python3 configurator/scripts/catalog.py`. This merges the reviewed upstream families with your authored additions into `catalog/parts.json`, the generated runtime catalog. The importer rejects duplicate IDs and interface overrides. Do not hand-edit the generated file.

## Checks

```sh
nix develop --command node --test configurator/tests/assembly.test.js
nix develop --command python3 -m unittest discover -s configurator/tests -p 'test_*.py'
nix develop --command python3 configurator/scripts/build.py
```

The Python tests independently ray-test socket voids, insertion-axis openings, and surrounding walls; verify pin rows and clip-on sockets; confirm catches extend behind the panel; compare all asset hashes; and check reproducible import. Node checks verify all seated catches align with the panel slot grid. The panel has actual through-openings, and the Rear view control exposes the engagement. They verify geometric samples, not complete collision freedom, printability, load ratings, or physical fit.

Optional browser acceptance tests use Playwright 1.62.1. With Playwright available to Node, and the built site running:

```sh
node configurator/tests/browser.cjs
```

`PLAYWRIGHT_MODULE` can point to an existing Playwright installation. `UI_TEST_URL` overrides the local URL. Screenshots and a downloaded kit are saved in `.local/ui-tests/`, or in `UI_TEST_OUTPUT`. The browser test checks desktop/mobile layouts, switching dimensions, panel exclusions, exploded mode, ZIP quantities, and byte-for-byte correspondence between downloaded and source STLs.

## Design limits

The v1 solver translates already oriented connection frames; mesh normalization declares the orientation beforehand. Adding a conventional centerpiece or paired bracket with the same interface requires metadata and an asset, not UI code. New assembly topologies or mounting modes need their own oriented part records and reviewed placement rules. Geometry inference from arbitrary meshes is deliberately outside this contract.

A port match alone cannot detect a custom tool cradle colliding with a bracket or prove load capacity. Contributors must review clearance and pin geometry before publishing catalog records. DDD connectors have intentional press-fit tolerances; test-print a small assembly first.
