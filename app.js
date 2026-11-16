(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const input = $('input'), output = $('output');
  let noticeTimer;
  const pendingImages = [];
  let imageSequence = 0;
  const extensions = {'image/png':'png', 'image/jpeg':'jpg', 'image/gif':'gif', 'image/webp':'webp'};
  function addImage(blob, alt) {
    const ext = extensions[blob.type.toLowerCase()];
    if (!ext) return null;
    const id = Date.now().toString(36) + '-' + (++imageSequence).toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    const record = { blob, marker: '[图片待保存 ' + id + ']', name: 'inkbridge-' + id + '.' + ext, alt };
    pendingImages.push(record);
    refreshImages();
    return record.marker;
  }
  function refreshImages(message) {
    const button = $('imageSaveBtn'), status = $('imageStatus');
    if (!button || !status) return;
    button.hidden = !pendingImages.length;
    status.hidden = !pendingImages.length && !message;
    status.textContent = message || (pendingImages.length ? '有 ' + pendingImages.length + ' 张图片待保存。选择 Obsidian 仓库后即可生成图片链接。' : '');
  }
  function dataImage(src) {
    const m = /^data:(image\/(?:png|jpeg|gif|webp));base64,([\s\S]*)$/i.exec(src);
    if (!m) return null;
    try {
      const bytes = atob(m[2].replace(/\s/g, ''));
      const out = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) out[i] = bytes.charCodeAt(i);
      return new Blob([out], {type:m[1].toLowerCase()});
    } catch (_) { return null; }
  }
  function convertedClipboard(html, plain, files) {
    const images = files.slice();
    const singleHtmlImage = html && (html.match(/<img\b/gi) || []).length === 1;
    const result = html ? ObsidianConverter.convertHtml(html, plain, { imageHandler: ({src, alt}) => {
      // A clipboard bitmap cannot reliably be matched to multiple HTML images.
      const blob = dataImage(src) || (singleHtmlImage && files.length === 1 && images.length === 1 ? images.shift() : null);
      return blob ? addImage(blob, alt) || undefined : undefined;
    } }) : plain;
    if (!html || !/<img\b/i.test(html)) {
      const markers = images.map(blob => addImage(blob, '图片') || '[图片：图片数据未能提取]');
      return [result, ...markers].filter(Boolean).join('\n\n');
    }
    return result;
  }
  function replaceSaved(record) {
    const link = '![[墨桥附件/' + record.name + ']]';
    input.value = input.value.split(record.marker).join(link);
    output.value = output.value.split(record.marker).join(link);
    counts();
  }
  function downloadPending() {
    for (const record of pendingImages) {
      const a = document.createElement('a'); const url = URL.createObjectURL(record.blob);
      a.href = url; a.download = record.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      replaceSaved(record);
    }
    pendingImages.length = 0;
    refreshImages('请检查浏览器下载，并把图片放入 Obsidian 仓库的“墨桥附件”文件夹。');
    notice('请将下载的图片放入仓库的“墨桥附件”文件夹');
  }
  const saveButton = $('imageSaveBtn');
  if (saveButton) saveButton.addEventListener('click', async () => {
    if (!pendingImages.length) return;
    if (!window.showDirectoryPicker) {
      downloadPending();
      return;
    }
    try {
      const vault = await window.showDirectoryPicker({mode:'readwrite'});
      try { await vault.getDirectoryHandle('.obsidian'); }
      catch (error) {
        if (error.name === 'NotFoundError' || error.name === 'TypeMismatchError') {
          refreshImages('所选文件夹不是 Obsidian 仓库，请选择包含 .obsidian 的仓库根目录。');
          notice('请选择 Obsidian 仓库的根目录');
          return;
        }
        throw error;
      }
      const folder = await vault.getDirectoryHandle('墨桥附件', {create:true});
      while (pendingImages.length) {
        const record = pendingImages[0];
        const file = await folder.getFileHandle(record.name, {create:true});
        const stream = await file.createWritable();
        await stream.write(record.blob); await stream.close();
        replaceSaved(record); pendingImages.shift();
      }
      refreshImages('图片已保存到所选仓库的“墨桥附件”文件夹。');
      notice('图片已保存，可复制转换结果');
    } catch (error) {
      if (error.name === 'SecurityError' || error.name === 'NotSupportedError') downloadPending();
      else { if (error.name !== 'AbortError') notice('图片保存失败，请重试或检查文件夹权限'); refreshImages(); }
    }
  });
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
    const files = Array.from(data.items || []).filter(item => item.kind === 'file' && item.type.startsWith('image/')).map(item => item.getAsFile()).filter(Boolean);
    if (!html && !files.length) return;
    event.preventDefault();
    const converted = convertedClipboard(html, data.getData('text/plain'), files);
    insert(converted);
    notice(converted.includes('图片数据未能提取') ? '部分图片未能提取，请将原图粘贴到 Obsidian' : pendingImages.length ? '请先保存图片到 Obsidian 仓库' : '已识别粘贴内容中的格式');
  });
  $('pasteBtn').addEventListener('click', async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const plain = item.types.includes('text/plain') ? await (await item.getType('text/plain')).text() : '';
          const html = item.types.includes('text/html') ? await (await item.getType('text/html')).text() : '';
          const imageTypes = item.types.filter(type => Object.hasOwn(extensions, type.toLowerCase()));
          const files = await Promise.all(imageTypes.map(type => item.getType(type)));
          if (html || plain || files.length) { const converted = convertedClipboard(html, plain, files); insert(converted); input.focus(); if (converted.includes('图片数据未能提取')) notice('部分图片未能提取，请将原图粘贴到 Obsidian'); else if (pendingImages.length) notice('请先保存图片到 Obsidian 仓库'); return; }
        }
      }
      if (navigator.clipboard && navigator.clipboard.readText) { insert(await navigator.clipboard.readText()); input.focus(); return; }
      throw new Error('Clipboard unavailable');
    } catch (_) { input.focus(); notice('请在左侧输入框按 Ctrl + V 粘贴'); }
  });
  $('copyBtn').addEventListener('click', async () => {
    if (!output.value) { notice('请先粘贴需要转换的内容'); return; }
    if (pendingImages.some(record => output.value.includes(record.marker))) { notice('请先保存图片到 Obsidian 仓库'); return; }
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
    if (pendingImages.some(record => output.value.includes(record.marker))) { notice('请先保存图片到 Obsidian 仓库'); return; }
    const url = URL.createObjectURL(new Blob([output.value], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'Obsidian笔记.md'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notice('Markdown 文件已下载');
  });
  $('clearBtn').addEventListener('click', () => { input.value = ''; pendingImages.length = 0; refreshImages(); update(); input.focus(); });
  $('sampleBtn').addEventListener('click', () => {
    pendingImages.length = 0; refreshImages();
    input.value = '# 一个简单的例子\n\n勾股定理可以写成 \\(a^2+b^2=c^2\\)。\n\n当我们需要单独展示公式时：\n\n\\[\nE = mc^2\n\\]\n\n| 符号 | 含义 |\n| --- | --- |\n| \\(E\\) | 能量 |\n| \\(m\\) | 质量 |';
    update();
  });
  update();
})();
