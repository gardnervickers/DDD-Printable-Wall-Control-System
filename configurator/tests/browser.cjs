// Optional browser acceptance test. Build and serve dist first (see README).
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const JSZip = require('../vendor/jszip.min.js');
const root = path.resolve(__dirname, '../..');
const out = process.env.UI_TEST_OUTPUT || path.join(root, '.local/ui-tests');

(async () => {
 await fs.mkdir(out, {recursive:true});
 const browser = await chromium.launch({headless:true});
 try {
  const page = await browser.newPage({viewport:{width:1440,height:1080}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const waitPreview = async () => {
    await page.waitForFunction(() => document.getElementById('preview-status').textContent === '' && window.__previewReady > 0);
    await page.waitForTimeout(150);
  };
  await page.goto(process.env.UI_TEST_URL || 'http://127.0.0.1:8765'); await waitPreview();
  assert.equal(await page.locator('#total').textContent(), '7');
  assert.equal(await page.locator('.sidepiece').count(), 7);
  await page.screenshot({path:path.join(out, 'desktop.png'), fullPage:true});
  await page.getByRole('button',{name:'Rear view',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Front view',exact:true}).count(),1);
  await page.screenshot({path:path.join(out,'rear.png'),fullPage:true});
  await page.getByRole('button',{name:'Front view',exact:true}).click();
  await page.locator('#height').selectOption('3');
  await page.locator('#width').selectOption('4'); await waitPreview();
  assert.equal(await page.locator('#total').textContent(), '9');
  const downloaded = page.waitForEvent('download'); await page.locator('#download').click();
  const download = await downloaded; const zipPath = path.join(out, 'print-kit.zip'); await download.saveAs(zipPath);
  const zip = await JSZip.loadAsync(await fs.readFile(zipPath));
  const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
  assert.equal(manifest.files.reduce((n,f)=>n+f.quantity,0), 9);
  assert.equal(manifest.files.filter(f=>f.source==='Accessories/4x10x8mm Pin.stl')[0].quantity,6);
  for (const file of manifest.files) {
    const bytes = await zip.file(file.file).async('nodebuffer');
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), file.sha256);
    assert.deepEqual(bytes, await fs.readFile(path.join(root,file.source)));
  }
  assert.ok(zip.file('LICENSE-DDD.txt')); assert.ok(zip.file('ASSEMBLY.md'));
  assert.equal(Object.keys(zip.files).filter(f=>f.endsWith('.stl')).length,4);
  await page.locator('#exploded').click();
  assert.equal(await page.locator('#exploded').getAttribute('aria-pressed'),'true');
  await page.screenshot({path:path.join(out,'exploded.png'),fullPage:true});
  await page.locator('#assembled').click();
  await page.getByRole('button',{name:/^Blank plate/}).click();
  await page.locator('#height').selectOption('4'); await page.locator('#width').selectOption('7'); await waitPreview();
  assert.equal(await page.locator('#total').textContent(),'3');
  assert.equal(await page.locator('.sidepiece').count(),5);
  assert.match(await page.locator('.sidepiece').first().textContent(), /4 in/);
  await page.getByRole('button',{name:/^Horizontal panel locking plate/}).click();
  assert.equal(await page.locator('#download').isDisabled(),true);
  assert.match(await page.locator('#sidepieces').textContent(),/different panel orientation/);
  await page.locator('#panel').selectOption('horizontal'); await waitPreview();
  assert.equal(await page.locator('#total').textContent(),'4');
  await page.locator('#search').fill('unfindable');
  assert.equal(await page.locator('#no-results').isVisible(),true);
  await page.locator('#search').fill('');
  await page.getByRole('button',{name:/^Belt clip holder/}).click();
  await page.locator('#height').selectOption('2'); await page.locator('#width').selectOption('3'); await waitPreview();
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);
  await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});
  assert.deepEqual(errors, []);
  console.log('PASS: selection, panel compatibility, exploded view, mobile layout, ZIP quantities and original mesh hashes.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
