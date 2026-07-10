Option Explicit

Dim fso, shell, scriptDir, repoRoot, electronCmd, mainScript, logDir, logFile, command

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
repoRoot = fso.GetParentFolderName(fso.GetParentFolderName(scriptDir))
electronCmd = fso.BuildPath(repoRoot, "node_modules\.bin\electron.cmd")
mainScript = fso.BuildPath(repoRoot, "species-explorer\desktop\main.mjs")
logDir = fso.BuildPath(repoRoot, "species-explorer\logs")
logFile = fso.BuildPath(logDir, "desktop-launch.log")

If Not fso.FileExists(electronCmd) Then
  MsgBox "Electron wurde nicht gefunden." & vbCrLf & vbCrLf & _
    "Bitte im Projektordner einmal ausfuehren:" & vbCrLf & _
    "npm.cmd install", vbExclamation, "Arten-Explorer"
  WScript.Quit 1
End If

If Not fso.FileExists(mainScript) Then
  MsgBox "Desktop-Startdatei wurde nicht gefunden:" & vbCrLf & mainScript, _
    vbCritical, "Arten-Explorer"
  WScript.Quit 1
End If

If Not fso.FolderExists(logDir) Then
  fso.CreateFolder(logDir)
End If

shell.CurrentDirectory = repoRoot
command = "cmd.exe /d /c " & Quote(Quote(electronCmd) & " " & Quote(mainScript) & _
  " >> " & Quote(logFile) & " 2>&1")
shell.Run command, 0, False

Function Quote(value)
  Quote = Chr(34) & value & Chr(34)
End Function
