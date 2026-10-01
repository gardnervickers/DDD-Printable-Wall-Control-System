"""Independent checks against upstream triangles, not just declared dimensions."""
import hashlib
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
class MeshChecks(unittest.TestCase):
    def test_upstream_assets_have_not_changed(self):
        for part in CATALOG['parts']:
            self.assertEqual(hashlib.sha256((ROOT / part['asset']['file']).read_bytes()).hexdigest(), part['asset']['sha256'])
    def test_import_is_reproducible(self):
        self.assertEqual(generate(), CATALOG)
    def test_flat_socket_datums_are_in_real_voids_with_solid_walls(self):
        for part in CATALOG['parts']:
            if part['kind'] != 'sidepiece': continue
            tr = part['transform']['translation']
            vs = [tuple(v[a] + tr[a] for a in range(3)) for v in vertices(ROOT / part['asset']['file'])]
            for port in part['ports']:
                x, y, z = port['position']
                self.assertFalse(inside(vs, (x, y, z)), (part['id'], 'socket center'))
                self.assertFalse(inside(vs, (x, y + 4.5, z)), (part['id'], 'socket height'))
                self.assertTrue(inside(vs, (x, y + 6, z)), (part['id'], 'socket end wall'))
                self.assertTrue(inside(vs, (x, y, z + 3)), (part['id'], 'socket backing'))
    def test_integral_pin_centers_are_in_the_centerpiece_mesh(self):
        for part in CATALOG['parts']:
            if part['kind'] != 'centerpiece' or part['family'] == 'Belt clip holder': continue
            tr = part['transform']['translation']
            vs = [tuple(v[a] + tr[a] for a in range(3)) for v in vertices(ROOT / part['asset']['file'])]
            for port in part['ports']:
                x, y, _ = port['position']
                self.assertTrue(inside(vs, (x, y, 1.9)), (part['id'], port['side'], y))
    def test_clip_on_declared_pin_sockets_are_open(self):
        for part in CATALOG['parts']:
            if part.get('family') != 'Belt clip holder': continue
            tr = part['transform']['translation']
            vs = [tuple(v[a] + tr[a] for a in range(3)) for v in vertices(ROOT / part['asset']['file'])]
            for dep in part['dependencies']:
                x, y, _ = dep['position']
                inward = 2 if x < 0 else -2
                self.assertFalse(inside(vs, (x + inward, y, 2)), (part['id'], 'pin socket'))
                self.assertTrue(inside(vs, (x + inward, y + 6, 2)), (part['id'], 'pin socket end wall'))
if __name__ == '__main__': unittest.main()
