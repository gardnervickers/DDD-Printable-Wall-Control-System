"""Independent checks against upstream triangles, not just declared dimensions."""
import hashlib
import math
import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from catalog import ROOT, vertices, generate
CATALOG = json.loads((ROOT / 'configurator/catalog/parts.json').read_text())
def sub(a, b): return tuple(x - y for x, y in zip(a, b))
def dot(a, b): return sum(x * y for x, y in zip(a, b))
def cross(a, b): return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
def inside(triangles, point):
    direction = (1, .137, .079)
    hits = []
    for i in range(0, len(triangles), 3):
        a, b, c = triangles[i:i+3]
        e1, e2 = sub(b, a), sub(c, a)
        h = cross(direction, e2)
        determinant = dot(e1, h)
        if abs(determinant) < 1e-7: continue
        inv = 1 / determinant
        s = sub(point, a)
        u = inv * dot(s, h)
        if not 0 <= u <= 1: continue
        q = cross(s, e1)
        v = inv * dot(direction, q)
        if v < 0 or u + v > 1: continue
        t = inv * dot(e2, q)
        if t > 1e-6: hits.append(t)
    return len(set(round(t, 5) for t in hits)) % 2 == 1
def normalized_vertices(part):
    # Normalize the print orientation, including horizontal shelf plates.
    angle = math.radians(part['transform']['rotation'][1])
    cosine, sine = math.cos(angle), math.sin(angle)
    tr = part['transform']['translation']
    ax = math.radians(part['transform']['rotation'][0])
    cx, sx = math.cos(ax), math.sin(ax)
    points = [(x, cx*y-sx*z, sx*y+cx*z) for x,y,z in vertices(ROOT / part['asset']['file'])]
    return [(cosine*x+sine*z+tr[0], y+tr[1], -sine*x+cosine*z+tr[2]) for x,y,z in points]

class MeshChecks(unittest.TestCase):
    def test_upstream_assets_have_not_changed(self):
        for part in CATALOG['parts']:
            self.assertEqual(hashlib.sha256((ROOT / part['asset']['file']).read_bytes()).hexdigest(), part['asset']['sha256'])
    def test_import_is_reproducible(self):
        self.assertEqual(generate(), CATALOG)
    def test_flat_socket_datums_are_in_real_voids_with_solid_walls(self):
        for part in CATALOG['parts']:
            if part['kind'] != 'sidepiece': continue
            vs = normalized_vertices(part)
            for port in part['ports']:
                x, y, z = port['position']
                self.assertFalse(inside(vs, (x, y, z)), (part['id'], 'socket center'))
                if 'depth' not in part:
                    self.assertFalse(inside(vs, (x, y + 4.5, z)), (part['id'], 'socket height'))
                    self.assertTrue(inside(vs, (x, y + 6, z)), (part['id'], 'socket end wall'))
                    self.assertTrue(inside(vs, (x, y, z + 3)), (part['id'], 'socket backing'))
                else:
                    self.assertFalse(inside(vs, (x, y, z + 4.5)), (part['id'], 'horizontal socket length'))
                    self.assertTrue(inside(vs, (x, y, z + 6)), (part['id'], 'horizontal socket end wall'))
                    self.assertTrue(inside(vs, (x, y + 3, z)), (part['id'], 'horizontal socket backing'))
                normal = port['normal'][0]
                self.assertFalse(inside(vs, (x + normal * 3.5, y, z)), (part['id'], 'socket must open along the pin axis'))
    def test_catches_extend_behind_the_panel_and_blades_align_with_slots(self):
        for part in CATALOG['parts']:
            if part['kind'] != 'sidepiece': continue
            vs = normalized_vertices(part)
            self.assertAlmostEqual(min(v[2] for v in vs), -10, places=2)
            self.assertAlmostEqual(max(v[2] for v in vs), 8.7 if 'depth' not in part else part['depth'] * 25.4 + 6.35, places=2)
            self.assertEqual(len(part['panelAttachments']), (part['height'] + 1) // 2)
            for hook in part['panelAttachments']:
                x, y, _ = hook['position']
                self.assertTrue(inside(vs, (x, y, -.6)), (part['id'], 'blade crosses panel plane'))
                self.assertFalse(inside(vs, (x + 1.2, y, -.6)), (part['id'], 'blade width'))

    def test_integral_pin_centers_are_in_the_centerpiece_mesh(self):
        for part in CATALOG['parts']:
            if part['kind'] != 'centerpiece' or part['family'] == 'Belt clip holder': continue
            vs = normalized_vertices(part)
            for port in part['ports']:
                _, y, _ = port['position']
                x = (-1 if port['side'] == 'left' else 1) * (part['width'] * 25.4 / 2 + .75)
                point = (x, y, 4.45) if part['mounts'][0] == 'upright' else (x, y, port['position'][2])
                self.assertTrue(inside(vs, point), (part['id'], port['side'], y))
    def test_shelf_surface_is_horizontal_and_flush_with_support_tops(self):
        for part in CATALOG['parts']:
            if part.get('family') != 'Shelf': continue
            vs = normalized_vertices(part)
            self.assertAlmostEqual(max(v[1] for v in vs), 76.0, places=2)
            self.assertAlmostEqual(min(v[2] for v in vs), 6.35, places=2)
            self.assertAlmostEqual(max(v[2] for v in vs), 6.35 + part['height'] * 25.4 - .2, places=2)

    def test_clip_on_declared_pin_sockets_are_open(self):
        for part in CATALOG['parts']:
            if part.get('family') != 'Belt clip holder': continue
            vs = normalized_vertices(part)
            for dep in part['dependencies']:
                x, y, _ = dep['position']
                inward = 2 if x < 0 else -2
                self.assertFalse(inside(vs, (x + inward, y, 4.35)), (part['id'], 'pin socket'))
                self.assertTrue(inside(vs, (x + inward, y + 6, 4.35)), (part['id'], 'pin socket end wall'))
if __name__ == '__main__': unittest.main()
