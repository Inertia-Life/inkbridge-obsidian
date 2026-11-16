const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'inkbridge-test-vault-'));
fs.mkdirSync(path.join(vault, '.obsidian'));
function run(data) {
  return spawnSync(process.execPath, [path.join(__dirname, 'clipboard-convert.js')], {input: JSON.stringify(data), encoding: 'utf8'});
}
// Complete 1×1 RGBA PNG images, with distinct red and blue pixels.
const red = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';
const blue = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgaPj/HwAEggJ/59habAAAAABJRU5ErkJggg==';
const image = 'data:image/png;base64,' + red;
const image2 = 'data:image/png;base64,' + blue;
const html = `<p>中文 \\(x^2\\)</p><img src="${image}"><p>完成</p>`;
let result = run({html, text: '中文'});
assert.match(result.stderr, /INKBRIDGE_NEEDS_VAULT/);
result = run({html, text: '中文', vault});
assert.equal(result.status, 0, result.stderr);
assert.match(result.stdout, /中文 \$x\^2\$/);
assert.match(result.stdout, /!\[\[墨桥附件\/inkbridge-[\da-f]+\.png\]\]/);
assert.match(result.stdout, /完成/);
let captured = [...result.stdout.matchAll(/!\[\[墨桥附件\/(inkbridge-[\da-f]+\.png)\]\]/g)];
assert.deepEqual(fs.readFileSync(path.join(vault, '墨桥附件', captured[0][1])), Buffer.from(red, 'base64'));
result = run({html: `<p>开头 \\(x^2\\)</p><img src="${image}"><p>中间 \\(y^2\\)</p><img src="${image2}"><p>结尾</p>`, vault});
assert.equal(result.status, 0, result.stderr);
captured = [...result.stdout.matchAll(/!\[\[墨桥附件\/(inkbridge-[\da-f]+\.png)\]\]/g)];
assert.equal(captured.length, 2);
assert.deepEqual(fs.readFileSync(path.join(vault, '墨桥附件', captured[0][1])), Buffer.from(red, 'base64'));
assert.deepEqual(fs.readFileSync(path.join(vault, '墨桥附件', captured[1][1])), Buffer.from(blue, 'base64'));
assert.ok(result.stdout.indexOf('开头 $x^2$') < result.stdout.indexOf(captured[0][0]));
assert.ok(result.stdout.indexOf(captured[0][0]) < result.stdout.indexOf('中间 $y^2$'));
assert.ok(result.stdout.indexOf('中间 $y^2$') < result.stdout.indexOf(captured[1][0]));
assert.ok(result.stdout.indexOf(captured[1][0]) < result.stdout.indexOf('结尾'));
result = run({html: '<p>中文</p><img src="blob:one"><img src="blob:two">', bitmap:red, vault});
assert.notEqual(result.status, 0);
assert.match(result.stderr, /INKBRIDGE_IMAGE_UNAVAILABLE/);
result = run({html: `<img src="${image}"><img src="blob:one">`, bitmap:red, vault});
assert.notEqual(result.status, 0);
assert.match(result.stderr, /INKBRIDGE_IMAGE_UNAVAILABLE/);
result = run({html: '<img src="blob:outside"><!--StartFragment--><p>内容</p><img src="blob:inside"><!--EndFragment-->', bitmap:red, vault});
assert.equal(result.status, 0, result.stderr);
assert.equal((result.stdout.match(/!\[\[/g) || []).length, 1);
result = run({html: '<p>图</p><img src="https://example.com/image.png">', bitmap:red, vault});
assert.equal(result.status, 0, result.stderr);
assert.match(result.stdout, /!\[\[墨桥附件/);
result = run({text: '', bitmap:red});
assert.notEqual(result.status, 0);
assert.match(result.stderr, /INKBRIDGE_IMAGE_ONLY/);
const imageFolder = path.join(vault, '墨桥附件');
for (const filename of fs.readdirSync(imageFolder)) {
  assert.match(filename, /^inkbridge-[\da-f]+\.png$/);
  fs.unlinkSync(path.join(imageFolder, filename));
}
fs.rmdirSync(imageFolder);
fs.rmdirSync(path.join(vault, '.obsidian'));
fs.rmdirSync(vault);
