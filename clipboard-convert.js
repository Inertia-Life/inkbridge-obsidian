'use strict';
const { DOMParser: LinkeDOMParser } = require('linkedom');
global.DOMParser = class {
  parseFromString(html) {
    const fragment = html.match(/<!--StartFragment-->([\s\S]*?)<!--EndFragment-->/i);
    const body = fragment ? fragment[1] : html;
    return new LinkeDOMParser().parseFromString('<!doctype html><html><body>' + body + '</body></html>', 'text/html');
  }
};
const { convertText, convertHtml } = require('./conversion.js');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  const data = JSON.parse(input);
  process.stdout.write(data.html ? convertHtml(data.html, data.text) : convertText(data.text));
});
