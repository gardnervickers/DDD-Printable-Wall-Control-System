"""Import reviewed upstream families. Never infer compatibility from unknown filenames."""
from pathlib import Path
import hashlib, json, re, struct

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'configurator/catalog/parts.json'

def vertices(path):
    data = path.read_bytes()
    if len(data) >= 84 and len(data) == 84 + struct.unpack_from('<I', data, 80)[0] * 50:
        return [struct.unpack_from('<3f', data, offset + k) for offset in range(84, len(data), 50) for k in (12, 24, 36)]
    return [tuple(map(float, row)) for row in re.findall(rb'vertex\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)', data)]

def asset(path):
    vs = vertices(path)
    bounds = [[min(v[a] for v in vs), max(v[a] for v in vs)] for a in range(3)]
    return {'file': path.relative_to(ROOT).as_posix(), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'bounds': bounds}

def port(side, row, x=0):
    return {'interface': 'ddd-grid-pin-v1', 'side': side, 'position': [x, 12.6 + 25.4 * row, 4.45], 'normal': [-1 if side == 'left' else 1, 0, 0]}

def generate():
    parts = []
    for path in sorted((ROOT / 'Sidepieces/Flats').glob('*.stl')):
        m = re.fullmatch(r'(\d+)x0 Flat (Left|Right)\.stl', path.name)
        if not m:
            continue
        h, side = int(m[1]), m[2].lower()
        a = asset(path)
        b = a['bounds']
        # Rotate the print-bed profile upright: native X is installed depth,
        # native Z is bracket thickness. The rear catch projects 10mm behind the panel.
        wall_x = b[0][0] + 10 if side == 'left' else b[0][1] - 10
        rotation = [0, -90 if side == 'left' else 90, 0]
        # Main body datum: top of panel catch is 6.4mm above the nominal grid.
        datum_y = b[1][1] - h * 25.4 - 6.4
        parts.append({'id': f'flat-{h}-{side}', 'kind': 'sidepiece', 'label': f'{h}×0 Flat {side.title()}',
                      'family': 'Flat brackets', 'pair': f'flat-{h}', 'height': h, 'side': side, 'panel': ['vertical', 'horizontal'],
                      'mounts': ['upright'], 'asset': a, 'transform': {'rotation': rotation, 'translation': [0, -datum_y, -wall_x if side == 'left' else wall_x]},
                      'panelAttachments': [{'position': [-1.1 if side == 'left' else 1.1, h * 25.4 - 12.8 - r * 50.8, 0], 'bladeWidth': 2.2} for r in range((h + 1) // 2)],
                      'ports': [{**port(side, r, -1.1 if side == 'left' else 1.1), 'normal': [1 if side == 'left' else -1, 0, 0]} for r in range(h)], 'dependencies': []})
    # Shelf supports: reviewed 3-high flat angle brackets, in 2/3/4-inch depths.
    for depth in (2, 3, 4):
        for side in ('left', 'right'):
            path = ROOT / f'Sidepieces/Angle_brackets/3x{depth} Angle Bracket Flat {side.title()}.stl'
            a = asset(path)
            b = a['bounds']
            wall_x = b[0][0] + 10 if side == 'left' else b[0][1] - 10
            datum_y = b[1][1] - 3 * 25.4 - 6.4
            parts.append({'id': f'angle-3-{depth}-{side}', 'kind': 'sidepiece', 'label': f'3×{depth} Angle Support {side.title()}',
                          'family': 'Angle supports', 'pair': f'angle-3-{depth}', 'height': 3, 'depth': depth, 'side': side,
                          'panel': ['vertical', 'horizontal'], 'mounts': ['shelf'],
                          'asset': a, 'transform': {'rotation': [0, -90 if side == 'left' else 90, 0], 'translation': [0, -datum_y, -wall_x if side == 'left' else wall_x]},
                          'panelAttachments': [{'position': [-1.1 if side == 'left' else 1.1, 63.4 - row * 50.8, 0], 'bladeWidth': 2.2} for row in range(2)],
                          'ports': [{'interface': 'ddd-grid-pin-v1', 'side': side, 'position': [-1.1 if side == 'left' else 1.1, 71.75, 18.95 + row * 25.4], 'normal': [1 if side == 'left' else -1, 0, 0]} for row in range(depth)],
                          'dependencies': []})
    for depth in (2, 3, 4):
        for width in range(1, 8):
            a = asset(ROOT / f'Centerpieces/Spacer_blank/{depth}x{width} Spacer blank.stl')
            b = a['bounds']
            front = 6.35 + depth * 25.4 - .2
            parts.append({'id': f'shelf-{depth}-{width}', 'kind': 'centerpiece', 'label': 'Shelf', 'family': 'Shelf',
                          'description': 'A horizontal shelf on paired angle supports. Connection pins are built into the plate.',
                          'height': depth, 'width': width, 'dimensionLabel': 'Depth', 'panel': ['vertical', 'horizontal'], 'mounts': ['shelf'],
                          'asset': a, 'transform': {'rotation': [-90, 0, 0], 'translation': [-(b[0][0]+b[0][1])/2, 67.3, b[1][0]+front]},
                          'ports': [{'interface': 'ddd-grid-pin-v1', 'side': side, 'position': [(-1 if side == 'left' else 1)*width*25.4/2, 71.75, front - (12.6 + row * 25.4)], 'normal': [-1 if side == 'left' else 1, 0, 0]} for side in ('left', 'right') for row in range(depth)],
                          'dependencies': []})
    families = [('Spacer_blank', 'Blank plate', 'A simple upright plate with integral connection pins.', None),
                ('Spacer_clip-on', 'Belt clip holder', 'An offset edge for tape measures and other belt clips.', None),
                ('Locking_spacer', 'Locking plate', 'A threaded plate that locks the assembly to a vertical panel.', 'vertical'),
                ('Locking_spacer_for_horizontal_Wall_Control', 'Horizontal panel locking plate', 'Locking holes aligned for horizontal Wall Control panels.', 'horizontal')]
    for directory, label, description, panel in families:
        for path in sorted((ROOT / 'Centerpieces' / directory).glob('*.stl')):
            m = re.match(r'(\d+)x(\d+) ', path.name)
            if not m:
                continue
            h, w = map(int, m.groups())
            if h > 4 or w > 7:  # First reviewed coverage; wider/other families require another review.
                continue
            a = asset(path)
            b = a['bounds']
            zshift = 2.55 - b[2][0] if panel else 0
            dependencies = []
            if directory == 'Spacer_clip-on':
                for side in ('left', 'right'):
                    for row in range(h):
                        dependencies.append({'part': 'connector-pin', 'quantity': 1, 'position': [(-1 if side == 'left' else 1) * (w * 25.4 - 2.4) / 2, 12.6 + row * 25.4, 2.35], 'rotation': [0, 0, 90]})
            if panel:
                dependencies.append({'part': 'lock-pin', 'quantity': 1, 'position': [0 if w % 2 else 12.7, 12.6, 8.7], 'rotation': [180, 0, 0]})
            parts.append({'id': f'{directory.lower()}-{h}-{w}', 'kind': 'centerpiece', 'label': label, 'description': description,
                          'family': label, 'height': h, 'width': w, 'panel': [panel] if panel else ['vertical', 'horizontal'],
                          'mounts': ['upright'], 'asset': a, 'transform': {'rotation': [0, 0, 0], 'translation': [-(b[0][0] + b[0][1]) / 2, -b[1][0], zshift]},
                          'ports': [port(side, r, (-1 if side == 'left' else 1) * w * 25.4 / 2) for side in ('left', 'right') for r in range(h)], 'dependencies': dependencies})
    for id, filename, label in [('connector-pin', 'Accessories/4x10x8mm Pin.stl', 'Connection pin'), ('lock-pin', 'Centerpieces/Locking_spacer/8mm Lock Pin.stl', '8 mm locking screw')]:
        a = asset(ROOT / filename)
        b = a['bounds']
        parts.append({'id': id, 'kind': 'accessory', 'label': label, 'asset': a,
                      'transform': {'rotation': [0, 0, 0], 'translation': [-(b[0][0] + b[0][1]) / 2, -(b[1][0] + b[1][1]) / 2, -b[2][0]]}, 'dependencies': []})
    result = {'version': 1, 'units': 'mm', 'upstream': '45527e8be89e37db0de31677e57392e9ed1f8d4a',
            'interfaces': {'ddd-grid-pin-v1': {'toleranceMm': 0.15, 'description': 'Virtual grid datum of the DDD 4×10×8 connector; intentional press fit.'}},
            'parts': parts}
    custom = json.loads((OUT.parent / 'custom-parts.json').read_text())
    for key, definition in custom.get('interfaces', {}).items():
        if key in result['interfaces']:
            raise ValueError(f'Custom interface shadows reviewed interface: {key}')
        result['interfaces'][key] = definition
    ids = {p['id'] for p in parts}
    for part in custom.get('parts', []):
        if part['id'] in ids:
            raise ValueError(f'Duplicate custom part ID: {part["id"]}')
        ids.add(part['id'])
        parts.append(part)
    return result

if __name__ == '__main__':
    OUT.write_text(json.dumps(generate(), indent=2) + '\n')
    print(f'Wrote {OUT}')
