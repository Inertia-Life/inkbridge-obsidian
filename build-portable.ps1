$ErrorActionPreference = 'Stop'
$source = $PSScriptRoot
$dist = Join-Path $source 'dist'
$out = Join-Path $dist '墨桥-Windows-x64'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$files = @('index.html','styles.css','app.js','conversion.js','conversion.test.js','clipboard-convert.js','package.json','package-lock.json','app-icon.ico','favicon.png')
foreach ($file in $files) { Copy-Item -LiteralPath (Join-Path $source $file) -Destination $out -Force }
Copy-Item -LiteralPath (Join-Path $source 'node_modules') -Destination $out -Recurse -Force
New-Item -ItemType Directory -Force -Path (Join-Path $out 'runtime') | Out-Null
Copy-Item -LiteralPath (Get-Command node.exe).Source -Destination (Join-Path $out 'runtime\node.exe') -Force
$nodeVersion = & node.exe --version
$license = Join-Path $out 'runtime\NODE-LICENSE.txt'
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/nodejs/node/$nodeVersion/LICENSE" -OutFile $license
$script = Get-Content -Raw -LiteralPath (Join-Path $source 'hotkey.ps1')
$match = [regex]::Match($script, '(?s)\$code = @''\r?\n(.*?)\r?\n''@')
if (!$match.Success) { throw 'Could not extract the hotkey source.' }
$code = $match.Groups[1].Value
$code = $code.Replace('p.StartInfo.FileName = "node.exe";', 'p.StartInfo.FileName = Path.Combine(Path.GetDirectoryName(script), "runtime", "node.exe");')
$code = $code.Replace('var menu = new ContextMenuStrip();', 'var menu = new ContextMenuStrip(); menu.Items.Add("\u6253\u5f00\u8f6c\u6362\u754c\u9762", null, (s,e) => Process.Start(Path.Combine(directory, "index.html")));')
$entry = @'
public static class Program {
  [STAThread] public static int Main(string[] args) {
    string dir = AppDomain.CurrentDomain.BaseDirectory;
    if (args.Length > 0 && args[0] == "--self-test") {
      var info = new ProcessStartInfo(Path.Combine(dir, "runtime", "node.exe"), "\"" + Path.Combine(dir, "conversion.test.js") + "\"");
      info.UseShellExecute = false; info.CreateNoWindow = true;
      using (var test = Process.Start(info)) { test.WaitForExit(); return test.ExitCode; }
    }
    bool created;
    using (var mutex = new Mutex(true, "InkBridgeHotkey", out created)) {
      if (!created) { MessageBox.Show("\u58a8\u6865\u5df2\u5728\u8fd0\u884c\u3002\u8bf7\u4ece\u4efb\u52a1\u680f\u901a\u77e5\u533a\u6253\u5f00\u6216\u9000\u51fa\u65e7\u7248\u540e\u518d\u8bd5\u3002", "\u58a8\u6865"); return 1; }
      try {
        using (var app = new InkBridgeHotkey(dir)) {
          if (!app.Ready) return 1;
          try { Process.Start(Path.Combine(dir, "index.html")); } catch { MessageBox.Show("\u65e0\u6cd5\u6253\u5f00\u754c\u9762\uff0c\u8bf7\u624b\u52a8\u6253\u5f00 index.html\u3002", "\u58a8\u6865"); }
          Application.Run();
        }
      } finally { mutex.ReleaseMutex(); }
    }
    return 0;
  }
}
'@
$tmp = Join-Path $dist 'launcher.cs'
Set-Content -LiteralPath $tmp -Value ($code + "`r`n" + $entry) -Encoding UTF8
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $compiler /nologo /target:winexe /platform:x64 /optimize+ /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll "/win32icon:$source\app-icon.ico" "/out:$out\墨桥.exe" $tmp
if ($LASTEXITCODE -ne 0) { throw 'Compilation failed.' }
Remove-Item -LiteralPath $tmp
Copy-Item -LiteralPath (Join-Path $source '便携版说明.md') -Destination (Join-Path $out '使用说明.md') -Force
$zip = Join-Path $dist '墨桥-Windows-x64.zip'
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip }
Compress-Archive -LiteralPath $out -DestinationPath $zip -CompressionLevel Optimal
