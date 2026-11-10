const assert = require('node:assert/strict');
const { convertText, convertHtml } = require('./conversion.js');
assert.equal(convertText('圆面积 \\(S=\\pi r^2\\)。'), '圆面积 $S=\\pi r^2$。');
assert.equal(convertText('公式：\n\\[\nx^2 + y^2 = z^2\n\\]'), '公式：\n\n$$\nx^2 + y^2 = z^2\n$$');
assert.equal(convertText('```latex\n\\(x\\)\n```\n\n`\\[x\\]`'), '```latex\n\\(x\\)\n```\n\n`\\[x\\]`');
assert.equal(convertText('$$\n\\begin{aligned}x&=1\\end{aligned}\n$$'), '$$\n\\begin{aligned}x&=1\\end{aligned}\n$$');
assert.equal(convertText('\\begin{align}\na&=b\n\\end{align}'), '$$\n\\begin{align}\na&=b\n\\end{align}\n$$');
assert.equal(convertText('| 变量 | 公式 |\n| --- | --- |\n| x | \\(x^2\\) |'), '| 变量 | 公式 |\n| --- | --- |\n| x | $x^2$ |');
assert.equal(convertText('| 变量 | 公式 |\n| --- | --- |\n| x | $$x^2$$ |\n| y | $y^2$ |'), '| 变量 | 公式 |\n| --- | --- |\n| x | $x^2$ |\n| y | $y^2$ |');
const mathExample = '理想目标：\n$$f^* = \\arg\\min_{f \\in \\mathcal{F}} R(f)$$\n找到假设空间 $\\mathcal{F}$ 中期望风险最小的模型。\n实际能做到的：\n$$\\widehat{f} = \\arg\\min_{f \\in \\mathcal{F}} \\widehat{R}_D(f)$$';
const mathExpected = '理想目标：\n\n$$\nf^* = \\arg\\min_{f \\in \\mathcal{F}} R(f)\n$$\n\n找到假设空间 $\\mathcal{F}$ 中期望风险最小的模型。\n实际能做到的：\n\n$$\n\\widehat{f} = \\arg\\min_{f \\in \\mathcal{F}} \\widehat{R}_D(f)\n$$';
assert.equal(convertText(mathExample), mathExpected);
assert.equal(convertText('```js\nconst formula = "$$x$$";\n```'), '```js\nconst formula = "$$x$$";\n```');
assert.equal(convertText('内容\n```\n$$f^*=x$$\n```\n后文\n```python\nprint("$$x$$")\n```'), '内容\n\n$$\nf^*=x\n$$\n\n后文\n```python\nprint("$$x$$")\n```');
assert.equal(convertText('```latex\n$$f^*=x$$\n```'), '```latex\n$$f^*=x$$\n```');
assert.equal(convertHtml('<p>ignored in Node</p>', '\\(x\\)'), '$x$');
const { DOMParser } = require('linkedom');
global.DOMParser = class {
  parseFromString(html) { return new DOMParser().parseFromString('<html><body>' + html + '</body></html>', 'text/html'); }
};
assert.equal(convertHtml('<p>无关前文</p><!--StartFragment--><p>中文 \\(x^2\\)</p><!--EndFragment--><p>无关后文</p>', ''), '中文 $x^2$');
assert.equal(convertHtml('<p aria-hidden="true">隐藏副本</p><p style="display:none">重复内容</p><p>正常中文</p>', ''), '正常中文');
assert.equal(convertHtml('<table><tr><th>变量</th><th>公式</th></tr><tr><td>半径</td><td><span class="katex"><math><semantics><annotation encoding="application/x-tex">\\pi r^2</annotation></semantics></math></span></td></tr></table>', ''), '| 变量 | 公式 |\n| --- | --- |\n| 半径 | $\\pi r^2$ |');
assert.equal(convertHtml('<p>理想目标：</p><pre><code>$$f^* = \\arg\\min_{f \\in \\mathcal{F}} R(f)$$</code></pre><p>找到假设空间 <span class="katex"><math><semantics><annotation encoding="application/x-tex">\\mathcal{F}</annotation></semantics></math></span> 中期望风险最小的模型。</p><p>实际能做到的：</p><pre><code>$$\\widehat{f} = \\arg\\min_{f \\in \\mathcal{F}} \\widehat{R}_D(f)$$</code></pre>', ''), mathExpected.replace('模型。\n实际', '模型。\n\n实际'));
assert.equal(convertHtml('<pre><code class="language-javascript">$$x$$</code></pre>', ''), '```javascript\n$$x$$\n```');
assert.equal(convertHtml('<pre><code>const x = 1;</code></pre>', ''), '```\nconst x = 1;\n```');
console.log('Conversion tests passed');
