(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const input = $('input'), output = $('output');
  let noticeTimer;
  function notice(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => toast.classList.remove('show'), 3000);
  }
  function counts() {
    $('inputCount').textContent = input.value.length.toLocaleString();
    $('outputCount').textContent = output.value.length.toLocaleString();
  }
  function update() {
    output.value = ObsidianConverter.convertText(input.value);
    counts();
    $('status').textContent = input.value.trim() ? '已转换' : '等待输入';
  }
  function insert(text) {
    input.setRangeText(text, input.selectionStart, input.selectionEnd, 'end');
    update();
  }
  input.addEventListener('input', update);
  output.addEventListener('input', counts);
  input.addEventListener('paste', event => {
    const data = event.clipboardData;
    if (!data) return;
    const html = data.getData('text/html');
    if (!html) return;
    event.preventDefault();
    insert(ObsidianConverter.convertHtml(html, data.getData('text/plain')));
    notice('已识别粘贴内容中的格式');
  });
  $('pasteBtn').addEventListener('click', async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const plain = item.types.includes('text/plain') ? await (await item.getType('text/plain')).text() : '';
          const html = item.types.includes('text/html') ? await (await item.getType('text/html')).text() : '';
          if (html || plain) { insert(html ? ObsidianConverter.convertHtml(html, plain) : plain); input.focus(); return; }
        }
      }
      if (navigator.clipboard && navigator.clipboard.readText) { insert(await navigator.clipboard.readText()); input.focus(); return; }
      throw new Error('Clipboard unavailable');
    } catch (_) { input.focus(); notice('请在左侧输入框按 Ctrl + V 粘贴'); }
  });
  $('copyBtn').addEventListener('click', async () => {
    if (!output.value) { notice('请先粘贴需要转换的内容'); return; }
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(output.value);
    } catch (_) {
      output.focus(); output.select();
      if (!document.execCommand('copy')) { notice('请按 Ctrl + C 复制选中的内容'); return; }
      output.setSelectionRange(0, 0);
    }
    notice('已复制，可以粘贴到 Obsidian');
  });
  $('downloadBtn').addEventListener('click', () => {
    if (!output.value) { notice('请先粘贴需要转换的内容'); return; }
    const url = URL.createObjectURL(new Blob([output.value], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'Obsidian笔记.md'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notice('Markdown 文件已下载');
  });
  $('clearBtn').addEventListener('click', () => { input.value = ''; update(); input.focus(); });
  $('sampleBtn').addEventListener('click', () => {
    input.value = '# 一个简单的例子\n\n勾股定理可以写成 \\(a^2+b^2=c^2\\)。\n\n当我们需要单独展示公式时：\n\n\\[\nE = mc^2\n\\]\n\n| 符号 | 含义 |\n| --- | --- |\n| \\(E\\) | 能量 |\n| \\(m\\) | 质量 |';
    update();
  });
  update();
})();
