import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateCatalog, compatibleAssemblies, billOfMaterials, findPlacement} from '../assembly.js';
const catalog = JSON.parse(readFileSync(new URL('../catalog/parts.json', import.meta.url)));
const centerId = 'spacer_clip-on-2-3';

test('every reviewed centerpiece has a complete assembly for its supported panel', () => {
  validateCatalog(catalog);
  for (const center of catalog.parts.filter(p => p.kind === 'centerpiece')) for (const panel of center.panel) {
    const assemblies = compatibleAssemblies(catalog, center.id, panel);
    assert.ok(assemblies.length, center.id);
    for (const a of assemblies) {
      assert.equal(a.parts[1].part.side, 'left');
      assert.equal(a.parts[2].part.side, 'right');
      assert.equal(a.parts[1].part.pair, a.parts[2].part.pair);
      assert.ok(a.parts[1].part.height >= center.height);
    }
  }
});

test('choosing a clip-on plate includes all separate pins and original print assets', () => {
  const [assembly] = compatibleAssemblies(catalog, centerId);
  assert.equal(assembly.parts[1].part.height, 2);
  const bom = billOfMaterials(assembly);
  assert.equal(bom.find(p => p.part.id === 'connector-pin').quantity, 4);
  assert.equal(bom.reduce((n, p) => n + p.quantity, 0), 7);
  const [tall] = compatibleAssemblies(catalog, 'spacer_clip-on-3-3');
  assert.equal(billOfMaterials(tall).find(p => p.part.id === 'connector-pin').quantity, 6);
});

test('locking plates select only their declared panel pattern and include one screw', () => {
  assert.equal(compatibleAssemblies(catalog, 'locking_spacer-2-3', 'horizontal').length, 0);
  assert.equal(compatibleAssemblies(catalog, 'locking_spacer_for_horizontal_wall_control-2-3', 'vertical').length, 0);
  const [assembly] = compatibleAssemblies(catalog, 'locking_spacer-2-3');
  assert.equal(billOfMaterials(assembly).find(p => p.part.id === 'lock-pin').quantity, 1);
});

test('nominal dimensions never override a missing connection, wrong normal or unknown mount', () => {
  const broken = structuredClone(catalog);
  const center = broken.parts.find(p => p.id === centerId);
  center.ports[0].position[2] += 10;
  assert.equal(compatibleAssemblies(broken, centerId).length, 0);
  assert.equal(compatibleAssemblies(catalog, centerId, 'vertical', 'shelf').length, 0);
  center.ports[0].position[2] -= 10;
  center.ports[0].normal[0] *= -1;
  assert.equal(compatibleAssemblies(broken, centerId).length, 0);
});

test('a new arbitrary-named centerpiece works by adding metadata alone', () => {
  const extended = structuredClone(catalog);
  const part = structuredClone(extended.parts.find(p => p.id === centerId));
  part.id = 'custom-caliper-cradle'; part.label = 'My new caliper cradle';
  extended.parts.push(part);
  validateCatalog(extended);
  assert.equal(compatibleAssemblies(extended, part.id).length, compatibleAssemblies(catalog, centerId).length);
});

test('a new sidepiece pair works by adding metadata alone', () => {
  const extended = structuredClone(catalog);
  for (const side of ['left', 'right']) {
    const part = structuredClone(extended.parts.find(p => p.id === `flat-2-${side}`));
    part.id = `custom-${side}`; part.pair = 'custom-pair'; part.family = 'Custom supports';
    extended.parts.push(part);
  }
  validateCatalog(extended);
  assert.ok(compatibleAssemblies(extended, centerId).some(a => a.parts[1].part.id === 'custom-left' && a.parts[2].part.id === 'custom-right'));
});

test('connection matching does not reuse the same socket twice', () => {
  const port = {interface:'ddd-grid-pin-v1', side:'left', position:[0,0,0],normal:[-1,0,0]};
  assert.equal(findPlacement([port, port], [{...port,normal:[1,0,0]}], catalog.interfaces), null);
});

test('invalid metadata fails closed', () => {
  for (const mutation of [
    c => c.parts.push(c.parts[0]),
    c => c.parts[0].ports[0].interface = 'invented',
    c => c.parts[0].asset.file = '../../outside.stl',
    c => c.parts[0].transform.translation[0] = NaN,
    c => c.parts.find(p => p.id === centerId).dependencies[0].part = 'missing-pin',
  ]) {
    const invalid = structuredClone(catalog); mutation(invalid);
    assert.throws(() => validateCatalog(invalid));
  }
});

// Actual panel engagement is checked separately from centerpiece port matching.
import {panelLayout} from '../panel.js';
test('all seated catches line up with real slot openings on the two-inch row grid', () => {
  for (const center of catalog.parts.filter(p => p.kind === 'centerpiece')) {
    for (const assembly of compatibleAssemblies(catalog, center.id, center.panel[0])) {
      const layout = panelLayout(assembly);
      for (const hook of layout.hooks) {
        assert.equal(hook.position[2], 0);
        const matching = layout.slots.find(slot => Math.abs(slot.x-hook.position[0]) < .001 && Math.abs(slot.y-hook.position[1]) < .001);
        assert.ok(matching, `${assembly.id}: catch without panel slot`);
        assert.ok(matching.width >= hook.bladeWidth);
      }
      assert.equal(layout.thickness,1.2);
    }
  }
});
