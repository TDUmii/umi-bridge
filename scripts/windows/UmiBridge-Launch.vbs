Option Explicit
Dim shell, files, root, command, argument, appRoot, installedRoot
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
root = files.GetParentFolderName(WScript.ScriptFullName)
appRoot = files.GetParentFolderName(files.GetParentFolderName(root))
installedRoot = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\UmiBridge"
' Normal GUI launches share the installed app's queue; npm start remains source mode.
If Not files.FileExists(appRoot & "\.local-data\installed-release.json") Then
    If files.FileExists(installedRoot & "\.local-data\installed-release.json") And files.FileExists(installedRoot & "\scripts\windows\UmiBridge-Tray.ps1") Then
        root = installedRoot & "\scripts\windows"
    End If
End If
shell.CurrentDirectory = files.GetParentFolderName(files.GetParentFolderName(root))
command = "powershell.exe -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File " & Quote(root & "\UmiBridge-Tray.ps1")
For Each argument In WScript.Arguments
    command = command & " " & Quote(argument)
Next
' WSH owns this hidden process, independent of the caller's CMD console.
shell.Run command, 0, False
Function Quote(value)
    Quote = Chr(34) & Replace(value, Chr(34), Chr(34) & Chr(34)) & Chr(34)
End Function
