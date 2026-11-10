(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ObsidianConverter = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Leave existing code and math untouched while translating common LaTeX delimiters.
  function convertText(input) {
    let text = String(input || '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ');
    const protectedParts = [];
    const protect = value => { const key = '\u0000' + protectedParts.length + '\u0000'; protectedParts.push(value); return key; };
    text = text.replace(/(^|\n)([ \t]*)(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)\n\2\3[ \t]*(?=\n|$)/g, (match, prefix, indent, fence, language, content) => {
      const value = content.trim();
      if (!language.trim() && (/^\$\$[\s\S]+\$\$$/.test(value) || /^\\\[[\s\S]+\\\]$/.test(value))) return prefix + '\n' + value + '\n';
      return protect(match);
    });
    text = text.replace(/(`+)([^\n]*?)\1/g, match => protect(match));
    // Obsidian expects display-math delimiters on their own lines.
    text = text.replace(/(?<!\\)\$\$([\s\S]*?)(?<!\\)\$\$/g, (match, math, offset, source) => {
      const start = source.lastIndexOf('\n', offset - 1) + 1;
      const end = source.indexOf('\n', offset + match.length);
      const line = source.slice(start, end < 0 ? source.length : end);
      const before = line.slice(0, offset - start), after = line.slice(offset - start + match.length);
      if (!match.includes('\n') && (before.includes('|') || after.includes('|'))) return protect('$' + math.trim() + '$');
      return '\n\n' + protect('$$\n' + math.trim() + '\n$$') + '\n\n';
    });
    text = text.replace(/(?<!\\)\$(?!\$)(?:\\.|[^$\n])+?(?<!\\)\$/g, match => protect(match));
    text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => '\n\n$$\n' + math.trim() + '\n$$\n\n');
    text = text.replace(/\\\(([^\n]*?)\\\)/g, (_, math) => '$' + math.trim() + '$');
    text = text.replace(/(^|\n)[ \t]*(\\begin\{(align\*?|aligned|equation\*?|gather\*?|multline\*?)\}[\s\S]*?\\end\{\3\})[ \t]*(?=\n|$)/g,
      (_, prefix, math) => prefix + '$$\n' + math.trim() + '\n$$');
    text = text.replace(/\n{3,}/g, '\n\n').trim();
    return text.replace(/\u0000(\d+)\u0000/g, (_, i) => protectedParts[Number(i)]).trim();
  }

  function convertHtml(html, fallback) {
    if (typeof DOMParser === 'undefined') return convertText(fallback || '');
    const source = String(html || '');
    const fragment = source.match(/<!--\s*StartFragment\s*-->([\s\S]*?)<!--\s*EndFragment\s*-->/i);
    const doc = new DOMParser().parseFromString(fragment ? fragment[1] : source, 'text/html');
    const ignored = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'BUTTON', 'SVG']);
    const hidden = node => node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true' || /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\s*(?:!important\s*)?(?:;|$)/i.test(node.getAttribute('style') || '');
    const clean = value => value.replace(/\s+/g, ' ').trim();
    function formula(node) {
      const annotation = node.querySelector('annotation[encoding="application/x-tex"], annotation[encoding="application/x-latex"]');
      const math = node.matches('math') ? node : node.querySelector('math');
      const value = (annotation && annotation.textContent) || (math && (math.getAttribute('alttext') || math.getAttribute('alt'))) || node.getAttribute('data-latex') || node.getAttribute('data-tex');
      if (!value) return null;
      const display = node.matches('.katex-display, .MathJax_Display, [data-display="block"]') || (math && math.getAttribute('display') === 'block');
      return display ? '\n\n$$\n' + value.trim() + '\n$$\n\n' : '$' + value.trim() + '$';
    }
    function cell(node) { return clean(Array.from(node.childNodes).map(n => render(n)).join('')).replace(/\|/g, '\\|'); }
    function table(node) {
      const rows = Array.from(node.querySelectorAll('tr')).filter(row => !hidden(row)).map(row => Array.from(row.children).filter(c => /^(TD|TH)$/.test(c.tagName) && !hidden(c)).map(cell)).filter(r => r.length);
      if (!rows.length) return '';
      const width = Math.max(...rows.map(r => r.length));
      const line = row => '| ' + Array.from({length: width}, (_, i) => row[i] || '').join(' | ') + ' |';
      return '\n\n' + line(rows[0]) + '\n' + line(Array(width).fill('---')) + (rows.length > 1 ? '\n' + rows.slice(1).map(line).join('\n') : '') + '\n\n';
    }
    function render(node, depth) {
      depth = depth || 0;
      if (node.nodeType === 3) return node.nodeValue.replace(/\u00a0/g, ' ');
      if (node.nodeType !== 1 || ignored.has(node.tagName) || hidden(node)) return '';
      if (node.matches('.katex-display, .katex, .MathJax, .MathJax_Display, math, [data-latex], [data-tex]')) {
        const result = formula(node);
        if (result !== null) return result;
      }
      const tag = node.tagName;
      if (tag === 'TABLE') return table(node);
      if (tag === 'PRE') {
        const code = node.querySelector('code');
        const language = code && (code.className.match(/(?:language|lang)-([\w+-]+)/) || [])[1] || '';
        const content = (code || node).textContent.replace(/\n+$/, '');
        // Some sources wrap an entire display equation in <pre><code> even
        // though it is math, not a code example. Only unwrap fully-delimited
        // display math and never reinterpret an explicitly unrelated language.
        const standaloneMath = content.trim();
        if ((!language || /^(?:math|latex|tex)$/i.test(language)) &&
            (/^\$\$[\s\S]+\$\$$/.test(standaloneMath) || /^\\\[[\s\S]+\\\]$/.test(standaloneMath))) {
          return '\n\n' + standaloneMath + '\n\n';
        }
        const fence = '`'.repeat(Math.max(3, ...Array.from(content.matchAll(/`+/g), m => m[0].length + 1)));
        return '\n\n' + fence + language + '\n' + content + '\n' + fence + '\n\n';
      }
      const inside = () => Array.from(node.childNodes).map(n => render(n, depth + 1)).join('');
      if (tag === 'BR') return '\n';
      if (tag === 'HR') return '\n\n---\n\n';
      if (tag === 'IMG') return node.getAttribute('alt') || '';
      if (tag === 'CODE') { const content = node.textContent; const fence = content.includes('`') ? '``' : '`'; return fence + content + fence; }
      if (/^H[1-6]$/.test(tag)) return '\n\n' + '#'.repeat(Number(tag[1])) + ' ' + inside().trim() + '\n\n';
      if (tag === 'STRONG' || tag === 'B') return '**' + inside() + '**';
      if (tag === 'EM' || tag === 'I') return '*' + inside() + '*';
      if (tag === 'DEL' || tag === 'S') return '~~' + inside() + '~~';
      if (tag === 'A') { const label = inside(); const href = node.getAttribute('href'); return href && !/^javascript:/i.test(href) ? '[' + label + '](' + href + ')' : label; }
      if (tag === 'LI') { const siblings = node.parentElement && node.parentElement.tagName === 'OL'; const num = siblings ? Array.from(node.parentElement.children).filter(n => n.tagName === 'LI').indexOf(node) + 1 + '. ' : '- '; return num + inside().trim() + '\n'; }
      if (tag === 'BLOCKQUOTE') return '\n\n' + inside().trim().split('\n').map(line => '> ' + line).join('\n') + '\n\n';
      if (['P', 'DIV', 'SECTION', 'ARTICLE', 'UL', 'OL'].includes(tag)) return '\n\n' + inside().trim() + '\n\n';
      return inside();
    }
    const rendered = Array.from(doc.body.childNodes).map(n => render(n)).join('');
    return convertText(rendered || fallback || '');
  }
  return { convertText, convertHtml };
});
