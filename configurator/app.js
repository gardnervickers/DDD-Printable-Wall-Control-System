import * as THREE from 'three';
import {STLLoader} from './vendor/three/STLLoader.js';
import {OrbitControls} from './vendor/three/OrbitControls.js';
import {validateCatalog, compatibleAssemblies, billOfMaterials} from './assembly.js';

const $ = id => document.getElementById(id);
const status = message => { $('preview-status').textContent = message; };
const assetURL = file => './assets/' + file.split('/').map(encodeURIComponent).join('/');
const degrees = values => values.map(n => n * Math.PI / 180);
const colors = {centerpiece: 0xb4bf95, sidepiece: 0xc5c9b5, accessory: 0xab7552};
let catalog, center, assembly, choices = [], family, exploded = false, revision = 0;
let renderer, scene, camera, controls, assemblyGroup, wallGroup;
const dataCache = new Map();

async function assetData(part) {
  const file = part.asset.file;
  if (!dataCache.has(file)) dataCache.set(file, (async () => {
    const response = await fetch(assetURL(file));
    if (!response.ok) throw new Error(`Could not load ${part.label}`);
    const buffer = await response.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
    if (hash !== part.asset.sha256) throw new Error(`Asset verification failed: ${part.label}`);
    return buffer;
  })().catch(error => {dataCache.delete(file); throw error;}));
  return dataCache.get(file);
}

function disposeGroup(group) {
  if (!group) return;
  group.traverse(object => {object.geometry?.dispose(); object.material?.dispose();});
  scene?.remove(group);
}
function setupPreview() {
  const container = $('viewport');
  renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0xeeeee7, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .85;
  container.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', 'Rotate and zoom the assembled Wall Control parts');
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 1, .1, 5000);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 70;
  controls.maxDistance = 1800;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9b82, 1.8));
  const key = new THREE.DirectionalLight(0xffffff, 2.5);
  key.position.set(-150, 250, 300); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 1.2);
  fill.position.set(250, 20, 100); scene.add(fill);
  new ResizeObserver(() => {
    const {width, height} = container.getBoundingClientRect();
    renderer.setSize(width, height); camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix();
  }).observe(container);
  renderer.setAnimationLoop(() => {controls.update(); renderer.render(scene, camera);});
}
function wall(width, height) {
  disposeGroup(wallGroup);
  wallGroup = new THREE.Group();
  const w = Math.max(width + 80, 180), h = Math.max(height + 75, 170);
  const plane = new THREE.Mesh(new THREE.BoxGeometry(w, h, 2), new THREE.MeshStandardMaterial({color: 0xd9dcce, roughness: .85}));
  plane.position.set(0, height / 2, -3); wallGroup.add(plane);
  const slots = new THREE.InstancedMesh(new THREE.BoxGeometry(2.5, 20, .2), new THREE.MeshBasicMaterial({color: 0xb9bfae}), 400);
  const holes = new THREE.InstancedMesh(new THREE.CircleGeometry(2.7, 16), new THREE.MeshBasicMaterial({color: 0xb9bfae}), 400);
  let count = 0;
  const matrix = new THREE.Matrix4();
  for (let x = -Math.floor(w / 50.8) * 25.4; x < w / 2 - 8; x += 25.4) for (let y = -25.4; y < height / 2 + h / 2 - 10; y += 25.4) {
    if (count >= 400) break;
    matrix.makeTranslation(x, y, -1.9); slots.setMatrixAt(count, matrix);
    matrix.makeTranslation(x + 12.7, y + 12.7, -1.85); holes.setMatrixAt(count, matrix); count++;
  }
  slots.count = holes.count = count;
  wallGroup.add(slots, holes); scene.add(wallGroup);
}
function resetCamera() {
  if (!assemblyGroup) return;
  const box = new THREE.Box3().setFromObject(assemblyGroup);
  const target = box.getCenter(new THREE.Vector3());
  const span = Math.max(box.getSize(new THREE.Vector3()).length(), 85);
  controls.target.copy(target);
  camera.position.copy(target).add(new THREE.Vector3(span * .8, span * .48, span * 1.8));
  camera.lookAt(target); controls.update();
}
function pose() {
  if (!assemblyGroup) return;
  for (const mesh of assemblyGroup.children) {
    mesh.position.copy(mesh.userData.assembled);
    if (exploded) {
      const {part} = mesh.userData;
      if (part.kind === 'centerpiece') mesh.position.z += 28;
      if (part.kind === 'sidepiece') mesh.position.x += part.side === 'left' ? -24 : 24;
      if (part.kind === 'accessory') mesh.position.z += 42;
    }
  }
}
async function preview() {
  const thisRevision = ++revision;
  if (!renderer) return;
  status('Loading models…');
  if (!assembly) { disposeGroup(assemblyGroup); assemblyGroup = null; status('No reviewed assembly for this configuration.'); return; }
  if (!renderer) return;
  let group;
  try {
    const selected = assembly;
    const data = await Promise.all(selected.parts.map(occurrence => assetData(occurrence.part)));
    if (thisRevision !== revision) return;
    group = new THREE.Group();
    for (const [index, occurrence] of selected.parts.entries()) {
      const {part, position, rotation} = occurrence;
      const geometry = new STLLoader().parse(data[index]);
      const transform = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...degrees(part.transform.rotation)));
      transform.setPosition(...part.transform.translation); geometry.applyMatrix4(transform);
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({color: colors[part.kind], metalness: .02, roughness: .64}));
      mesh.rotation.set(...degrees(rotation)); mesh.position.set(...position);
      mesh.userData = {part, assembled: mesh.position.clone()};
      group.add(mesh);
    }
    disposeGroup(assemblyGroup); assemblyGroup = group; scene.add(group);
    wall(center.width * 25.4, selected.parts[1].part.height * 25.4);
    pose(); resetCamera(); status('');
    window.__previewReady = thisRevision;
  } catch (error) {disposeGroup(group); disposeGroup(assemblyGroup); assemblyGroup = null; status(error.message);}
}

function familyList() {
  const query = $('search').value.trim().toLowerCase();
  const families = [...new Set(catalog.parts.filter(p => p.kind === 'centerpiece').map(p => p.family))];
  const visible = families.filter(name => name.toLowerCase().includes(query));
  $('families').replaceChildren(...visible.map(name => {
    const button = document.createElement('button');
    button.className = 'family' + (family === name ? ' selected' : '');
    button.setAttribute('aria-pressed', String(family === name));
    button.setAttribute('aria-label', name);
    const icon = document.createElement('span'); icon.className = 'icon'; icon.textContent = name.includes('clip') ? '⊏' : name.includes('locking') || name.includes('Locking') ? '⊞' : '▱';
    const text = document.createElement('span');
    const strong = document.createElement('strong'); strong.textContent = name;
    const small = document.createElement('small'); small.textContent = name.includes('panel') ? 'For horizontal panels' : name === 'Belt clip holder' ? 'Separate pins included' : name === 'Locking plate' ? 'Locking screw included' : 'Integral connection pins';
    text.append(strong, small); button.append(icon, text);
    button.onclick = () => {family = name; dimensions();};
    return button;
  }));
  $('no-results').hidden = visible.length > 0;
}
function selectValues(select, values, preferred) {
  select.replaceChildren(...values.map(value => {const option = document.createElement('option'); option.value = value; option.textContent = `${value} in`; return option;}));
  select.value = values.includes(Number(preferred)) ? preferred : values[0];
}
function dimensions(preferredHeight = $('height').value || 2, preferredWidth = $('width').value || 3) {
  const parts = catalog.parts.filter(p => p.kind === 'centerpiece' && p.family === family);
  selectValues($('height'), [...new Set(parts.map(p => p.height))].sort((a, b) => a - b), preferredHeight);
  selectValues($('width'), [...new Set(parts.filter(p => p.height === Number($('height').value)).map(p => p.width))].sort((a, b) => a - b), preferredWidth);
  familyList(); selectCenter();
}
function selectCenter() {
  center = catalog.parts.find(p => p.kind === 'centerpiece' && p.family === family && p.height === Number($('height').value) && p.width === Number($('width').value));
  $('description').textContent = center?.description ?? 'No model in this size.';
  choices = center ? compatibleAssemblies(catalog, center.id, $('panel').value) : [];
  assembly = choices[0] ?? null;
  updateAssembly();
}
function updateAssembly() {
  $('pair-count').textContent = choices.length;
  $('sidepieces').replaceChildren(...choices.map((choice, index) => {
    const button = document.createElement('button'); button.className = 'sidepiece' + (assembly?.id === choice.id ? ' selected' : ''); button.setAttribute('aria-pressed', String(assembly?.id === choice.id));
    const text = document.createElement('span'); text.textContent = choice.label;
    const recommended = document.createElement('span'); recommended.className = 'recommendation'; recommended.textContent = index === 0 ? 'BEST FIT' : '✓ FITS';
    button.append(text, recommended); button.onclick = () => {assembly = choice; updateAssembly();}; return button;
  }));
  if (!choices.length) $('sidepieces').textContent = 'This centerpiece needs a different panel orientation.';
  $('assembly-name').textContent = center ? `${center.label} · ${center.height}×${center.width}` : 'Choose a centerpiece';
  $('size-caption').textContent = center ? `${(center.width * 25.4).toFixed(1)} mm grid span` : '';
  $('download').disabled = !assembly;
  $('download-status').textContent = 'Original STL files + assembly guide';
  const bom = assembly ? billOfMaterials(assembly) : [];
  $('bom').replaceChildren(...bom.map(({part, quantity}) => {
    const row = document.createElement('div'); row.className = 'bom-row';
    const icon = document.createElement('span'); icon.className = 'bom-icon'; icon.textContent = part.kind === 'accessory' ? '∙' : part.kind === 'sidepiece' ? '⊏' : '▱';
    const text = document.createElement('div'); const label = document.createElement('strong'); label.textContent = part.label;
    const link = document.createElement('a'); link.href = assetURL(part.asset.file); link.download = part.asset.file.split('/').at(-1); link.textContent = 'Download STL ↙'; text.append(label, link);
    const qty = document.createElement('span'); qty.className = 'bom-qty'; qty.textContent = `×${quantity}`; row.append(icon, text, qty); return row;
  }));
  $('total').textContent = bom.reduce((sum, item) => sum + item.quantity, 0);
  void preview();
}
async function download() {
  if (!assembly) return;
  const selected = assembly;
  $('download').disabled = true; $('download-status').textContent = 'Verifying and packaging your parts…';
  try {
    const zip = new JSZip();
    const bom = billOfMaterials(selected);
    const manifest = {catalogVersion: catalog.version, upstream: catalog.upstream, panel: selected.panel, mount: selected.mount, assembly: selected.id, files: []};
    for (const {part, quantity} of bom) {
      const filename = 'parts/' + part.asset.file.split('/').at(-1);
      zip.file(filename, await assetData(part));
      manifest.files.push({file: filename, source: part.asset.file, sha256: part.asset.sha256, quantity});
    }
    const license = await fetch('./assets/LICENSE');
    if (!license.ok) throw new Error('Could not load upstream license.');
    zip.file('LICENSE-DDD.txt', await license.text());
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    zip.file('ASSEMBLY.md', `# ${selected.center.label} (${selected.center.height}×${selected.center.width})\n\nPanel: ${selected.panel} Wall Control panel\nMounting: ${selected.mount}\n\n## Print these parts\n\n${manifest.files.map(p => `- ${p.quantity} × ${p.file.split('/').at(-1)}`).join('\n')}\n\n## Assembly\n\n1. Print the listed quantities. These files are the original upstream STLs, with their original printing orientations.\n2. If connection pins are listed, press them into the centerpiece edge sockets first.\n3. Press the centerpiece between the matching left and right sidepieces.\n4. Engage the sidepiece catches in the Wall Control slots.\n5. If a locking screw is listed, thread it into a hole aligned with the panel using a quarter-inch square drive.\n\nConnections are intentionally press-fit. Test a small set with your printer before making a large batch. The preview is not a load-rating or physical-fit certification. The background panel is illustrative.\n\n## Provenance\n\nDDD Printable Wall Control System by Allen Derusha\nhttps://github.com/aderusha/DDD-Printable-Wall-Control-System\nUpstream revision: ${catalog.upstream}\nMIT license included. Each STL's SHA-256 and required quantity are in manifest.json.\n`);
    const blob = await zip.generateAsync({type: 'blob', compression: 'DEFLATE'});
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = `wall-control-${selected.center.id}-${selected.parts[1].part.id}.zip`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    $('download-status').textContent = 'Print kit downloaded. Quantities are in the guide.';
  } catch (error) {$('download-status').textContent = error.message;}
  finally {$('download').disabled = !assembly;}
}

try {
  const response = await fetch('./catalog/parts.json');
  if (!response.ok) throw new Error('Could not load the part catalog.');
  catalog = validateCatalog(await response.json());
  try {setupPreview();} catch (error) {status('3D preview unavailable. Part selection and downloads still work.'); console.error(error);}
  family = 'Belt clip holder'; dimensions(2, 3);
  $('coverage').textContent = `${catalog.parts.filter(p => p.kind === 'centerpiece').length} centerpieces · Upright mounts · Flat brackets`;
  $('height').onchange = () => dimensions(); $('width').onchange = selectCenter; $('panel').onchange = selectCenter; $('search').oninput = familyList;
  $('assembled').onclick = () => {exploded = false; $('assembled').classList.add('active'); $('exploded').classList.remove('active'); $('assembled').setAttribute('aria-pressed','true'); $('exploded').setAttribute('aria-pressed','false'); pose();};
  $('exploded').onclick = () => {exploded = true; $('assembled').classList.remove('active'); $('exploded').classList.add('active'); $('assembled').setAttribute('aria-pressed','false'); $('exploded').setAttribute('aria-pressed','true'); pose();};
  $('reset').onclick = resetCamera; $('download').onclick = download;
} catch (error) {status(error.message); $('coverage').textContent = 'Catalog unavailable';}
