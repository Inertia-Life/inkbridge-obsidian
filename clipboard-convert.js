'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DOMParser: LinkeDOMParser } = require('linkedom');
global.DOMParser = class {
  parseFromString(html) {
    const fragment = html.match(/<!--StartFragment-->([\s\S]*?)<!--EndFragment-->/i);
    return new LinkeDOMParser().parseFromString('<!doctype html><html><body>' + (fragment ? fragment[1] : html) + '</body></html>', 'text/html');
  }
};
const { convertText, convertHtml } = require('./conversion.js');
function fail(code) { throw new Error(code); }
function imageBytes(url) {
  const match = /^data:image\/(png|jpeg|gif|webp);base64,([a-z0-9+/=\s]+)$/i.exec(url || '');
  if (!match) return null;
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > 30 * 1024 * 1024) fail('INKBRIDGE_IMAGE_UNAVAILABLE');
  return { bytes, ext: match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase() };
}
function convert(data) {
  if (!data.html) {
    if (data.bitmap && data.text && data.text.trim()) fail('INKBRIDGE_IMAGE_UNAVAILABLE');
    if (data.bitmap) fail('INKBRIDGE_IMAGE_ONLY');
    return convertText(data.text);
  }
  const doc = new DOMParser().parseFromString(data.html, 'text/html');
  const nodes = Array.from(doc.body.querySelectorAll('img'));
  if (!nodes.length && data.bitmap) {
    if (!(data.text || '').trim()) fail('INKBRIDGE_IMAGE_ONLY');
    fail('INKBRIDGE_IMAGE_UNAVAILABLE');
  }
  const bitmap = data.bitmap ? { bytes: Buffer.from(data.bitmap, 'base64'), ext: 'png' } : null;
  const pending = [];
  let unavailable = 0;
  for (const node of nodes) {
    const src = node.getAttribute('src') || '';
    if (/^https?:\/\//i.test(src)) {
      if (nodes.length === 1 && bitmap) pending.push({ node, image: bitmap });
      continue;
    }
    const image = imageBytes(src);
    if (!image) unavailable++;
    pending.push({ node, image });
  }
  // A single clipboard bitmap is only attributable when there is one HTML image.
  if (unavailable && !(unavailable === 1 && nodes.length === 1 && bitmap)) fail('INKBRIDGE_IMAGE_UNAVAILABLE');
  if (pending.length) {
    if (!data.vault) fail('INKBRIDGE_NEEDS_VAULT');
    if (!fs.existsSync(path.join(data.vault, '.obsidian'))) fail('INKBRIDGE_NEEDS_VAULT');
    const output = path.join(data.vault, '墨桥附件');
    fs.mkdirSync(output, {recursive:true});
    const replacements = [];
    for (const item of pending) {
      const image = item.image || bitmap;
      const filename = 'inkbridge-' + crypto.randomBytes(12).toString('hex') + '.' + image.ext;
      fs.writeFileSync(path.join(output, filename), image.bytes, {flag:'wx'});
      const marker = 'INKBRIDGEIMAGE' + crypto.randomBytes(16).toString('hex');
      item.node.replaceWith(doc.createTextNode(marker));
      replacements.push([marker, '![[墨桥附件/' + filename + ']]']);
    }
    let result = convertHtml(doc.body.innerHTML, data.text);
    for (const [marker, link] of replacements) result = result.split(marker).join(link);
    return result;
  }
  return convertHtml(data.html, data.text);
}
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try { process.stdout.write(convert(JSON.parse(input))); }
  catch (error) { process.stderr.write(String(error.message || error)); process.exitCode = 1; }
});
