# Vendored browser libraries

- Three.js 0.180.0: three.module.min.js, three.core.min.js, STLLoader.js, OrbitControls.js. From the published npm tarball (https://registry.npmjs.org/three/-/three-0.180.0.tgz). MIT license in three/LICENSE.
- JSZip 3.10.1: jszip.min.js from its published distribution. License in JSZIP-LICENSE.md.

No CDN requests are made at runtime. The package.json marks the UMD ZIP library as CommonJS for the optional Node browser test; browser module imports are unaffected.
