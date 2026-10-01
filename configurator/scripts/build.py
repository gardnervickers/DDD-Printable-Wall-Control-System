"""Build a self-contained static site; only catalogued meshes are shipped."""
from pathlib import Path
import hashlib, json, shutil

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / 'configurator'
DEST = APP / 'dist'

def build():
    catalog = json.loads((APP / 'catalog/parts.json').read_text())
    if DEST.exists():
        shutil.rmtree(DEST)
    DEST.mkdir()
    for name in ('index.html', 'app.js', 'assembly.js', 'style.css'):
        shutil.copy2(APP / name, DEST / name)
    for name in ('vendor', 'catalog'):
        shutil.copytree(APP / name, DEST / name)
    for part in catalog['parts']:
        relative = Path(part['asset']['file'])
        if relative.is_absolute() or '..' in relative.parts:
            raise ValueError('Asset path escapes repository')
        source = ROOT / relative
        if hashlib.sha256(source.read_bytes()).hexdigest() != part['asset']['sha256']:
            raise ValueError(f'Asset changed: {relative}; review and refresh its metadata')
        target = DEST / 'assets' / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    shutil.copy2(ROOT / 'LICENSE', DEST / 'assets/LICENSE')
    print(f'Built {len(catalog["parts"])} parts → {DEST}')

if __name__ == '__main__':
    build()
