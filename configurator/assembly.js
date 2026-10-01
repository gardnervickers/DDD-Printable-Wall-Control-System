// Matching uses declared connection frames, never filenames or nominal dimensions.
const sub = (a, b) => a.map((n, i) => n - b[i]);
const add = (a, b) => a.map((n, i) => n + b[i]);
const distance = (a, b) => Math.hypot(...sub(a, b));

export function validateCatalog(catalog) {
  if (catalog.version !== 1 || catalog.units !== 'mm') throw new Error('Unsupported catalog version or units.');
  for (const [id, definition] of Object.entries(catalog.interfaces ?? {})) {
    if (!Number.isFinite(definition.toleranceMm) || definition.toleranceMm < 0) throw new Error(`Invalid interface tolerance: ${id}`);
  }
  const ids = new Set();
  for (const part of catalog.parts) {
    if (!part.id || ids.has(part.id)) throw new Error(`Duplicate or missing part ID: ${part.id}`);
    ids.add(part.id);
    if (!['centerpiece', 'sidepiece', 'accessory'].includes(part.kind)) throw new Error(`Unknown part kind: ${part.id}`);
    if (!part.asset?.file || !/^[a-f0-9]{64}$/.test(part.asset.sha256)) throw new Error(`Missing asset provenance: ${part.id}`);
    if (part.asset.file.startsWith('/') || part.asset.file.split('/').includes('..')) throw new Error('Asset paths must stay inside the repository.');
    for (const axis of ['rotation', 'translation']) {
      if (part.transform?.[axis]?.length !== 3 || !part.transform[axis].every(Number.isFinite)) throw new Error(`Invalid ${axis}: ${part.id}`);
    }
    if (part.kind !== 'accessory' && (!part.ports?.length || !part.panel?.length || !part.mounts?.length)) throw new Error(`Missing compatibility metadata: ${part.id}`);
    if (part.kind === 'sidepiece' && (!part.pair || !['left', 'right'].includes(part.side))) throw new Error(`Missing sidepiece pair metadata: ${part.id}`);
    if (part.kind !== 'accessory' && (!part.family || !Number.isInteger(part.height) || part.height < 1)) throw new Error(`Missing UI dimensions: ${part.id}`);
    if (part.kind === 'centerpiece' && (!Number.isInteger(part.width) || part.width < 1)) throw new Error(`Missing centerpiece width: ${part.id}`);
    for (const port of part.ports ?? []) {
      if (!catalog.interfaces[port.interface] || !['left', 'right'].includes(port.side)) throw new Error(`Unknown connection: ${part.id}`);
      if (port.position?.length !== 3 || !port.position.every(Number.isFinite) || port.normal?.length !== 3 || !port.normal.every(Number.isFinite) || Math.abs(Math.hypot(...port.normal) - 1) > .001) throw new Error(`Invalid connection frame: ${part.id}`);
    }
  }
  for (const part of catalog.parts) for (const dep of part.dependencies ?? []) {
    if (!ids.has(dep.part) || !Number.isInteger(dep.quantity) || dep.quantity < 1 || dep.position?.length !== 3 || !dep.position.every(Number.isFinite) || dep.rotation?.length !== 3 || !dep.rotation.every(Number.isFinite)) throw new Error(`Invalid dependency: ${part.id}`);
    if (catalog.parts.find(p => p.id === dep.part).kind !== 'accessory') throw new Error(`Dependencies must be accessories: ${part.id}`);
  }
  return catalog;
}

export function findPlacement(required, available, interfaces) {
  if (!required.length) return null;
  for (const anchor of available) {
    if (anchor.interface !== required[0].interface) continue;
    const position = sub(required[0].position, anchor.position);
    const used = new Set();
    const fits = required.every(port => {
      const tolerance = interfaces[port.interface]?.toleranceMm;
      if (!Number.isFinite(tolerance)) return false;
      const i = available.findIndex((candidate, index) => !used.has(index) && candidate.interface === port.interface && candidate.side === port.side && distance(add(candidate.position, position), port.position) <= tolerance && distance(candidate.normal, port.normal.map(n => -n)) < .001);
      if (i < 0) return false;
      used.add(i);
      return true;
    });
    if (fits) return position;
  }
  return null;
}

export function compatibleAssemblies(catalog, centerId, panel = 'vertical', mount = 'upright') {
  const center = catalog.parts.find(p => p.id === centerId && p.kind === 'centerpiece');
  if (!center || !center.panel.includes(panel) || !center.mounts.includes(mount)) return [];
  const candidates = catalog.parts.filter(p => p.kind === 'sidepiece' && p.panel.includes(panel) && p.mounts.includes(mount));
  const placements = side => candidates.filter(p => p.side === side).map(part => ({part, position: findPlacement(center.ports.filter(p => p.side === side), part.ports, catalog.interfaces)})).filter(p => p.position && Math.abs(p.position[2]) < .001);
  const assemblies = [];
  for (const left of placements('left')) for (const right of placements('right')) {
    // A declared pair key constrains asymmetric bracket families, without filename conventions.
    if (left.part.pair !== right.part.pair) continue;
    assemblies.push({id: `${center.id}:${left.part.id}:${right.part.id}:${panel}:${mount}`, center, panel, mount, label: `${left.part.family} · ${left.part.height} in${left.part.depth ? ` high × ${left.part.depth} in deep` : ''}`, parts: [
      {part: center, position: [0, 0, 0], rotation: [0, 0, 0]},
      {part: left.part, position: left.position, rotation: [0, 0, 0]},
      {part: right.part, position: right.position, rotation: [0, 0, 0]},
      ...(center.dependencies ?? []).map(dep => ({part: catalog.parts.find(p => p.id === dep.part), position: dep.position, rotation: dep.rotation, quantity: dep.quantity})),
    ]});
  }
  return assemblies.sort((a, b) => a.parts[1].part.height - b.parts[1].part.height || (a.parts[1].part.depth ?? 0) - (b.parts[1].part.depth ?? 0) || a.id.localeCompare(b.id));
}

export function billOfMaterials(assembly) {
  const items = new Map();
  for (const occurrence of assembly.parts) {
    const {part} = occurrence;
    const existing = items.get(part.id) ?? {part, quantity: 0};
    existing.quantity += occurrence.quantity ?? 1;
    items.set(part.id, existing);
  }
  return [...items.values()];
}
