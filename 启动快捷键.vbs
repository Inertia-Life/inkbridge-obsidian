Option Explicit
Dim shell, fs, folder, script
Set shell = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
folder = fs.GetParentFolderName(WScript.ScriptFullName)
script = fs.BuildPath(folder, "hotkey.ps1")
shell.Run "powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File " & Chr(34) & script & Chr(34), 0, False
