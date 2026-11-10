Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Web.Extensions
$code = @'
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using System.Web.Script.Serialization;

public class InkBridgeHotkey : NativeWindow, IDisposable {
  [DllImport("user32.dll", SetLastError=true)] static extern bool RegisterHotKey(IntPtr h, int id, uint modifiers, uint key);
  [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr h, int id);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] static extern uint GetClipboardSequenceNumber();
  [DllImport("user32.dll", SetLastError=true)] static extern bool OpenClipboard(IntPtr owner);
  [DllImport("user32.dll")] static extern bool CloseClipboard();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern uint RegisterClipboardFormat(string format);
  [DllImport("user32.dll")] static extern IntPtr GetClipboardData(uint format);
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr GlobalLock(IntPtr memory);
  [DllImport("kernel32.dll")] static extern bool GlobalUnlock(IntPtr memory);
  [DllImport("kernel32.dll")] static extern UIntPtr GlobalSize(IntPtr memory);
  const int WM_HOTKEY = 0x0312;
  readonly NotifyIcon tray;
  readonly System.Drawing.Icon customIcon;
  readonly System.Windows.Forms.Timer timer;
  readonly string script;
  int stage, ticks;
  uint previous;
  bool registered;
  public InkBridgeHotkey(string directory) {
    script = Path.Combine(directory, "clipboard-convert.js");
    CreateHandle(new CreateParams());
    tray = new NotifyIcon();
    string iconPath = Path.Combine(directory, "app-icon.ico");
    if (File.Exists(iconPath)) {
      try { using (var stream = File.OpenRead(iconPath)) { using (var icon = new System.Drawing.Icon(stream)) { customIcon = (System.Drawing.Icon)icon.Clone(); } } }
      catch (Exception) { customIcon = null; }
    }
    tray.Icon = customIcon ?? System.Drawing.SystemIcons.Application;
    tray.Text = "\u58a8\u6865\u5feb\u6377\u952e";
    var menu = new ContextMenuStrip();
    menu.Items.Add("\u9000\u51fa\u58a8\u6865\u5feb\u6377\u952e", null, (s,e) => Application.Exit());
    tray.ContextMenuStrip = menu;
    timer = new System.Windows.Forms.Timer(); timer.Interval = 100; timer.Tick += Tick;
    registered = RegisterHotKey(Handle, 1, 0x0002 | 0x0004 | 0x4000, 0x43);
    if (!registered) {
      MessageBox.Show("Ctrl + Shift + C \u5df2\u88ab\u5176\u4ed6\u8f6f\u4ef6\u5360\u7528\uff0c\u8bf7\u5173\u95ed\u5360\u7528\u8be5\u5feb\u6377\u952e\u7684\u8f6f\u4ef6\u540e\u91cd\u8bd5\u3002", "\u58a8\u6865");
      return;
    }
    tray.Visible = true;
    Tip("\u5df2\u542f\u52a8\uff1a\u9009\u4e2d\u5185\u5bb9\u540e\u6309 Ctrl + Shift + C\uff0c\u518d\u6309 Ctrl + V \u7c98\u8d34\u3002");
  }
  public bool Ready { get { return registered; } }
  // CF_HTML is specified as UTF-8, regardless of the Windows ANSI code page.
  // WinForms' HTML text conversion can decode those bytes using the latter.
  static string ReadClipboardHtml() {
    if (!OpenClipboard(IntPtr.Zero)) return "";
    try {
      IntPtr handle = GetClipboardData(RegisterClipboardFormat("HTML Format"));
      if (handle == IntPtr.Zero) return "";
      ulong size = GlobalSize(handle).ToUInt64();
      if (size == 0 || size > Int32.MaxValue) return "";
      IntPtr pointer = GlobalLock(handle);
      if (pointer == IntPtr.Zero) return "";
      try {
        byte[] bytes = new byte[(int)size];
        Marshal.Copy(pointer, bytes, 0, bytes.Length);
        int end = Array.IndexOf(bytes, (byte)0);
        return new UTF8Encoding(false, true).GetString(bytes, 0, end < 0 ? bytes.Length : end);
      } finally { GlobalUnlock(handle); }
    } catch (DecoderFallbackException) { return ""; }
    finally { CloseClipboard(); }
  }
  void Tip(string text) { tray.ShowBalloonTip(2500, "\u58a8\u6865", text, ToolTipIcon.Info); }
  protected override void WndProc(ref Message m) {
    if (m.Msg == WM_HOTKEY && stage == 0) { stage = 1; ticks = 0; timer.Start(); }
    base.WndProc(ref m);
  }
  void Tick(object sender, EventArgs e) {
    if (++ticks > 50) { timer.Stop(); stage = 0; Tip("\u590d\u5236\u8d85\u65f6\uff0c\u8bf7\u91cd\u8bd5\u3002"); return; }
    if (stage == 1) {
      if ((GetAsyncKeyState(0x10) & 0x8000) != 0 || (GetAsyncKeyState(0x11) & 0x8000) != 0 || (GetAsyncKeyState(0x43) & 0x8000) != 0) return;
      previous = GetClipboardSequenceNumber();
      keybd_event(0x11,0,0,UIntPtr.Zero); keybd_event(0x43,0,0,UIntPtr.Zero);
      keybd_event(0x43,0,2,UIntPtr.Zero); keybd_event(0x11,0,2,UIntPtr.Zero);
      stage = 2; ticks = 0; return;
    }
    if (stage != 2 || GetClipboardSequenceNumber() == previous) return;
    timer.Stop(); stage = 0;
    uint copied = GetClipboardSequenceNumber();
    try {
      string plain = Clipboard.ContainsText(TextDataFormat.UnicodeText) ? Clipboard.GetText(TextDataFormat.UnicodeText) : "";
      string html = ReadClipboardHtml();
      if (String.IsNullOrWhiteSpace(plain) && String.IsNullOrWhiteSpace(html)) { Tip("\u6ca1\u6709\u53ef\u8f6c\u6362\u7684\u6587\u672c\u3002"); return; }
      var serializer = new JavaScriptSerializer(); serializer.MaxJsonLength = Int32.MaxValue;
      var data = new System.Collections.Generic.Dictionary<string,string>(); data["text"] = plain; data["html"] = html;
      var p = new Process(); p.StartInfo.FileName = "node.exe";
      p.StartInfo.Arguments = "\"" + script + "\""; p.StartInfo.UseShellExecute = false; p.StartInfo.CreateNoWindow = true;
      p.StartInfo.RedirectStandardInput = true; p.StartInfo.RedirectStandardOutput = true; p.StartInfo.RedirectStandardError = true;
      p.StartInfo.StandardOutputEncoding = Encoding.UTF8; p.StartInfo.StandardErrorEncoding = Encoding.UTF8;
      p.Start();
      byte[] bytes = Encoding.UTF8.GetBytes(serializer.Serialize(data));
      p.StandardInput.BaseStream.Write(bytes, 0, bytes.Length); p.StandardInput.Close();
      string result = p.StandardOutput.ReadToEnd(); string error = p.StandardError.ReadToEnd(); p.WaitForExit();
      if (p.ExitCode != 0 || String.IsNullOrWhiteSpace(result)) throw new Exception(error);
      if (GetClipboardSequenceNumber() != copied) { Tip("\u526a\u8d34\u677f\u5df2\u53d8\u5316\uff0c\u672a\u8986\u76d6\u65b0\u5185\u5bb9\u3002"); return; }
      Clipboard.SetText(result, TextDataFormat.UnicodeText);
      Tip("\u8f6c\u6362\u5b8c\u6210\uff0c\u6309 Ctrl + V \u7c98\u8d34\u3002");
    } catch (Exception) { Tip("\u8f6c\u6362\u5931\u8d25\uff0c\u5df2\u4fdd\u7559\u539f\u590d\u5236\u5185\u5bb9\u3002"); }
  }
  public void Dispose() { timer.Stop(); if (registered) UnregisterHotKey(Handle, 1); tray.Visible = false; tray.Dispose(); if (customIcon != null) customIcon.Dispose(); DestroyHandle(); }
}
'@
Add-Type -TypeDefinition $code -ReferencedAssemblies System.Windows.Forms,System.Drawing,System.Web.Extensions
$created = $false
$mutex = New-Object System.Threading.Mutex($true, 'InkBridgeHotkey', [ref]$created)
if (-not $created) { [System.Windows.Forms.MessageBox]::Show('Ink Bridge is already running.') | Out-Null; return }
try {
  $app = [InkBridgeHotkey]::new($PSScriptRoot)
  if ($app.Ready) { [System.Windows.Forms.Application]::Run() }
} finally {
  if ($app) { $app.Dispose() }
  $mutex.ReleaseMutex(); $mutex.Dispose()
}
