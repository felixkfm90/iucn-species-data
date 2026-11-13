#requires -Version 7.4
[CmdletBinding()]
param(
    [switch]$CheckOnly,
    [switch]$InitializeSigning,
    [switch]$Build,
    [string]$ExpectedUserSid
)

$ErrorActionPreference = 'Stop'

function Get-ArtenPlaySettings {
    $workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
    $flutter = if ($env:ARTEN_FLUTTER_ROOT) { $env:ARTEN_FLUTTER_ROOT } else { 'D:\DevTools\flutter' }
    $jdk = if ($env:ARTEN_JAVA_HOME) { $env:ARTEN_JAVA_HOME } else { 'C:\Program Files\Android\Android Studio\jbr' }
    $sdk = if ($env:ARTEN_ANDROID_SDK) { $env:ARTEN_ANDROID_SDK } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
    [pscustomobject]@{
        Workspace = $workspace; Mobile = Join-Path $workspace 'mobile'
        Signing = Join-Path $workspace 'data\mobile-signing'
        Runtime = Join-Path $workspace 'data\mobile-signing\runtime'
        Reports = Join-Path $workspace 'data\mobile-signing\reports'
        Jdk = [IO.Path]::GetFullPath($jdk); Sdk = [IO.Path]::GetFullPath($sdk)
        Flutter = [IO.Path]::GetFullPath($flutter)
        Alias = 'arten-explorer-play-upload'; Package = 'de.fnwildlifetravel.arten_explorer'
        Entropy = [Text.Encoding]::UTF8.GetBytes('FNWildlifeTravel.ArtenExplorer.PlayUpload.v1')
    }
}

function Assert-ArtenPlayPath([string]$Path, [string]$Root) {
    $full = [IO.Path]::GetFullPath($Path)
    $allowed = [IO.Path]::GetFullPath($Root).TrimEnd('\')
    if (-not [IO.Path]::IsPathFullyQualified($Path) -or $Path -match '[\x00-\x1f]' -or
        $Path -match '(^|[\\/])\.{1,2}([\\/]|$)' -or $Path.Substring(2).Contains(':') -or
        ($full -ne $allowed -and -not $full.StartsWith($allowed + '\', [StringComparison]::OrdinalIgnoreCase))) { throw 'ARTEN_PLAY_PATH' }
    foreach ($part in $full.Substring(3).Split('\')) {
        if (-not $part -or $part.EndsWith('.') -or $part.EndsWith(' ') -or $part.Split('.')[0] -match '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$') { throw 'ARTEN_PLAY_PATH' }
    }
    $part = $full
    while ($part) {
        if (Test-Path -LiteralPath $part) {
            if ((Get-Item -LiteralPath $part -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'ARTEN_PLAY_LINK' }
        }
        $part = [IO.Path]::GetDirectoryName($part)
    }
    return $full
}

function Initialize-ArtenPlayNative {
    if ('ArtenPlayNativeV1' -as [type]) { return }
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class ArtenPlayNativeV1 {
 [StructLayout(LayoutKind.Sequential)] struct INFO {
  public uint Attributes; public System.Runtime.InteropServices.ComTypes.FILETIME Creation,Access,Write;
  public uint Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow;
 }
 [StructLayout(LayoutKind.Sequential)] struct SA {
  public int Length; public IntPtr Descriptor; [MarshalAs(UnmanagedType.Bool)] public bool Inherit;
 }
 [StructLayout(LayoutKind.Sequential)] struct DISPOSITION {
  [MarshalAs(UnmanagedType.Bool)] public bool DeleteFile;
 }
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle handle,out INFO info);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafeFileHandle CreateFile(string path,uint access,uint share,IntPtr attributes,uint creation,uint flags,IntPtr template);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetFileInformationByHandle(SafeFileHandle handle,int infoClass,ref DISPOSITION info,uint size);
 [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool ConvertStringSecurityDescriptorToSecurityDescriptor(string sddl,uint revision,out IntPtr descriptor,out uint size);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateDirectory(string path,ref SA attributes);
 [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr memory);
 public static void AssertRegular(SafeFileHandle handle) {
  INFO info; if(!GetFileInformationByHandle(handle,out info)) throw new System.ComponentModel.Win32Exception();
  if((info.Attributes & (0x400|0x10))!=0 || info.Links!=1) throw new InvalidOperationException("ARTEN_PLAY_LINK");
 }
 public static string Identity(SafeFileHandle handle) {
  AssertRegular(handle);
  INFO info; if(!GetFileInformationByHandle(handle,out info)) throw new System.ComponentModel.Win32Exception();
  return info.Volume.ToString("x8")+":"+info.IndexHigh.ToString("x8")+info.IndexLow.ToString("x8");
 }
 public static void DeleteOwned(string path,string identity) {
  // The held original read handle shares DELETE, but this deletion handle does
  // not: after identity validation no other process can rename/replace it.
  using(SafeFileHandle handle=CreateFile(path,0x80010000,1,IntPtr.Zero,3,0x00200000,IntPtr.Zero)) {
   if(handle.IsInvalid) throw new System.ComponentModel.Win32Exception();
   if(Identity(handle)!=identity) throw new InvalidOperationException("ARTEN_PLAY_RUNTIME_CHANGED");
   DISPOSITION disposition=new DISPOSITION {DeleteFile=true};
   if(!SetFileInformationByHandle(handle,4,ref disposition,(uint)Marshal.SizeOf(typeof(DISPOSITION)))) throw new System.ComponentModel.Win32Exception();
  }
 }
 public static void CreatePrivateDirectory(string path,string sid) {
  IntPtr descriptor; uint size;
  string sddl="O:"+sid+"D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;FA;;;"+sid+")";
  if(!ConvertStringSecurityDescriptorToSecurityDescriptor(sddl,1,out descriptor,out size)) throw new System.ComponentModel.Win32Exception();
  try {
   SA attributes=new SA {Length=Marshal.SizeOf(typeof(SA)),Descriptor=descriptor,Inherit=false};
   if(!CreateDirectory(path,ref attributes)) throw new System.ComponentModel.Win32Exception();
  } finally {LocalFree(descriptor);}
 }
}
'@
}

function Get-ArtenPlaySid {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    try {
        $sid = $identity.User.Value
        if ($sid -cnotmatch '^S-1-5-21-[0-9]+-[0-9]+-[0-9]+-[0-9]+$') { throw 'ARTEN_PLAY_USER' }
        return $sid
    } finally { $identity.Dispose() }
}

function Assert-ArtenPlayAcl([string]$Path, [string]$Sid, [bool]$Root = $false) {
    $acl = Get-Acl -LiteralPath $Path
    $allowed = @($Sid, 'S-1-5-18', 'S-1-5-32-544')
    if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin $allowed -or ($Root -and -not $acl.AreAccessRulesProtected)) { throw 'ARTEN_PLAY_ACL' }
    $rights = @{}
    foreach ($rule in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
        $id = $rule.IdentityReference.Value
        if ($id -notin $allowed -or $rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow) { throw 'ARTEN_PLAY_ACL' }
        $rights[$id] = [long]$rights[$id] -bor [long]$rule.FileSystemRights
    }
    foreach ($id in $allowed) {
        if (-not $rights.ContainsKey($id) -or ($rights[$id] -band [long][Security.AccessControl.FileSystemRights]::FullControl) -ne [long][Security.AccessControl.FileSystemRights]::FullControl) { throw 'ARTEN_PLAY_ACL' }
    }
}

function Open-ArtenPlayFile([string]$Path, [string]$Root, [long]$MaximumBytes) {
    $full = Assert-ArtenPlayPath $Path $Root
    $item = Get-Item -LiteralPath $full -Force
    if ($item.PSIsContainer -or $item.Length -le 0 -or $item.Length -gt $MaximumBytes) { throw 'ARTEN_PLAY_FILE_SIZE' }
    Initialize-ArtenPlayNative
    $stream = [IO.File]::Open($full, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    try {
        [ArtenPlayNativeV1]::AssertRegular($stream.SafeFileHandle)
        $null = Assert-ArtenPlayPath $full $Root
        if ($stream.Length -ne $item.Length) { throw 'ARTEN_PLAY_SOURCE_CHANGED' }
        return $stream
    } catch { $stream.Dispose(); throw }
}

function Read-ArtenPlayStream([IO.Stream]$Stream) {
    $Stream.Position = 0
    $memory = [IO.MemoryStream]::new()
    try { $Stream.CopyTo($memory); return ,$memory.ToArray() }
    finally { $Stream.Position = 0; $memory.Dispose() }
}

function Get-ArtenPlayHash([byte[]]$Bytes) {
    return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($Bytes)).ToLowerInvariant()
}

function Write-ArtenPlayNewFile([string]$Path, [byte[]]$Bytes, [string]$Root) {
    $full = Assert-ArtenPlayPath $Path $Root
    $stream = [IO.File]::Open($full, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $stream.Write($Bytes, 0, $Bytes.Length); $stream.Flush($true) }
    finally { $stream.Dispose() }
}

function New-ArtenPlayPrivateDirectory([string]$Path, [string]$Sid, [string]$Root) {
    $full = Assert-ArtenPlayPath $Path $Root
    Initialize-ArtenPlayNative
    [ArtenPlayNativeV1]::CreatePrivateDirectory($full, $Sid)
    Assert-ArtenPlayAcl $full $Sid $true
}

function New-ArtenPlayOwnedRuntimeFile([string]$Path, [byte[]]$Bytes, [string]$Root) {
    $full = Assert-ArtenPlayPath $Path $Root
    if ([IO.Path]::GetDirectoryName($full) -ne [IO.Path]::GetFullPath($Root) -or
        [IO.Path]::GetFileName($full) -cnotmatch '^(upload-[0-9a-f]{32}\.jks|build\.lock)$') { throw 'ARTEN_PLAY_RUNTIME_PATH' }
    Initialize-ArtenPlayNative
    $creator = [IO.File]::Open($full, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try {
        $identity = [ArtenPlayNativeV1]::Identity($creator.SafeFileHandle)
        $creator.Write($Bytes, 0, $Bytes.Length); $creator.Flush($true)
    } finally { $creator.Dispose() }
    $stream = [IO.File]::Open($full, [IO.FileMode]::Open, [IO.FileAccess]::Read, ([IO.FileShare]::Read -bor [IO.FileShare]::Delete))
    try {
        if ([ArtenPlayNativeV1]::Identity($stream.SafeFileHandle) -cne $identity -or
            (Get-ArtenPlayHash (Read-ArtenPlayStream $stream)) -cne (Get-ArtenPlayHash $Bytes)) { throw 'ARTEN_PLAY_RUNTIME_CHANGED' }
        return [pscustomobject]@{ Path = $full; Stream = $stream; Identity = $identity; Sha256 = Get-ArtenPlayHash $Bytes }
    } catch { $stream.Dispose(); throw }
}

function Remove-ArtenPlayOwnedRuntimeFile([object]$Owned, [string]$Runtime) {
    try {
        $full = Assert-ArtenPlayPath $Owned.Path $Runtime
        if ([IO.Path]::GetDirectoryName($full) -ne [IO.Path]::GetFullPath($Runtime) -or
            [IO.Path]::GetFileName($full) -cnotmatch '^(upload-[0-9a-f]{32}\.jks|build\.lock)$' -or
            $Owned.Identity -cnotmatch '^[a-f0-9]{8}:[a-f0-9]{16}$' -or $Owned.Sha256 -cnotmatch '^[a-f0-9]{64}$' -or
            [ArtenPlayNativeV1]::Identity($Owned.Stream.SafeFileHandle) -cne $Owned.Identity -or
            (Get-ArtenPlayHash (Read-ArtenPlayStream $Owned.Stream)) -cne $Owned.Sha256) { throw 'ARTEN_PLAY_RUNTIME_CHANGED' }
        [ArtenPlayNativeV1]::DeleteOwned($full, $Owned.Identity)
    } finally { if ($null -ne $Owned.Stream) { $Owned.Stream.Dispose() } }
    if (Test-Path -LiteralPath $full) { throw 'ARTEN_PLAY_RUNTIME_CLEANUP_FAILED' }
}

function Get-ArtenPlayFailureCode([Exception]$Failure) {
    if ($null -ne $Failure -and $Failure.Message -cmatch '^ARTEN_PLAY_[A-Z_]+$') { return $Failure.Message }
    return 'ARTEN_PLAY_STEP_BLOCKED'
}

function Close-ArtenPlayBuildResources([object]$Context) {
    $cleanupErrors = @()
    foreach ($stream in @($Context.SourceBundle, $Context.ArtifactStream)) {
        if ($null -ne $stream) { try { $stream.Dispose() } catch { $cleanupErrors += $_.Exception } }
    }
    if ($null -ne $Context.RuntimeKey) {
        try {
            if ($Context.Operation -cnotmatch '^[0-9a-f]{32}$' -or $Context.RuntimeKey.Path -cne (Join-Path $Context.Settings.Runtime "upload-$($Context.Operation).jks")) { throw 'ARTEN_PLAY_RUNTIME_CHANGED' }
            Remove-ArtenPlayOwnedRuntimeFile $Context.RuntimeKey $Context.Settings.Runtime
        } catch {
            $cleanupErrors += $_.Exception
            try { $Context.RuntimeKey.Stream.Dispose() } catch { $cleanupErrors += $_.Exception }
        }
    } elseif ($Context.KeyCreationAttempted -and (Test-Path -LiteralPath $Context.PlainKey)) {
        # A failed CreateNew/write without a completed ownership proof is retained.
        $cleanupErrors += [InvalidOperationException]::new('ARTEN_PLAY_RUNTIME_OWNERSHIP_MISSING')
    }
    if ($null -ne $Context.Lock) {
        try {
            if ($Context.Lock.Path -cne (Join-Path $Context.Settings.Runtime 'build.lock') -or
                $Context.Lock.Sha256 -cne (Get-ArtenPlayHash ([Text.Encoding]::UTF8.GetBytes($Context.Operation)))) { throw 'ARTEN_PLAY_RUNTIME_CHANGED' }
            Remove-ArtenPlayOwnedRuntimeFile $Context.Lock $Context.Settings.Runtime
        } catch {
            $cleanupErrors += $_.Exception
            try { $Context.Lock.Stream.Dispose() } catch { $cleanupErrors += $_.Exception }
        }
    } elseif ($Context.LockCreationAttempted -and (Test-Path -LiteralPath (Join-Path $Context.Settings.Runtime 'build.lock'))) {
        $cleanupErrors += [InvalidOperationException]::new('ARTEN_PLAY_RUNTIME_OWNERSHIP_MISSING')
    }
    try { Close-ArtenPlaySigningState $Context.State } catch { $cleanupErrors += $_.Exception }
    $Context.CleanupErrors = @($cleanupErrors)
    $Context.CleanupAttempted = $true
}

function Complete-ArtenPlayBuild([object]$Context) {
    if (-not $Context.CleanupAttempted) { Close-ArtenPlayBuildResources $Context }
    $cleanupErrors = @($Context.CleanupErrors)
    $failure = $Context.Failure
    if ($cleanupErrors.Count) { $failure = [InvalidOperationException]::new('ARTEN_PLAY_CLEANUP_FAILED') }
    $reportPath = Join-Path $Context.Settings.Reports "build-$($Context.Operation).json"
    if ($null -ne $failure) {
        $negative = [ordered]@{ passed = $false; signatureVerified = $false; privateArtifactReadyForReview = $false
            operationId = $Context.Operation; packageName = $Context.Settings.Package; artifact = $Context.Artifact
            bundleSha256 = $Context.ArtifactSha256; certificateSha256 = $Context.State.Metadata.certificateSha256
            cleanupComplete = ($cleanupErrors.Count -eq 0); failureCode = Get-ArtenPlayFailureCode $failure
            buildFailureCode = $(if ($null -ne $Context.Failure) { Get-ArtenPlayFailureCode $Context.Failure } else { $null })
            cleanupFailures = @($cleanupErrors | ForEach-Object { Get-ArtenPlayFailureCode $_ })
            uploadExecuted = $false; readyForUpload = $false }
        try {
            Write-ArtenPlayNewFile $reportPath ([Text.UTF8Encoding]::new($false).GetBytes(($negative | ConvertTo-Json -Depth 12))) $Context.Settings.Reports
        } catch { $failure.Data['negativeReportWritten'] = $false }
        throw $failure
    }
    if ($null -eq $Context.Result -or $Context.Result.passed -ne $true -or $Context.Result.signatureVerified -ne $true) { throw 'ARTEN_PLAY_BUNDLE_CHECK_FAILED' }
    # No positive result or file is emitted before every cleanup step succeeds.
    $Context.Result | Add-Member -NotePropertyName operationId -NotePropertyValue $Context.Operation
    $Context.Result | Add-Member -NotePropertyName cleanupComplete -NotePropertyValue $true
    $Context.Result | Add-Member -NotePropertyName privateArtifactReadyForReview -NotePropertyValue $true
    Write-ArtenPlayNewFile $reportPath ([Text.UTF8Encoding]::new($false).GetBytes(($Context.Result | ConvertTo-Json -Depth 12))) $Context.Settings.Reports
    return $Context.Result
}

function Invoke-ArtenPlayChild([string]$Executable, [string[]]$Arguments, [hashtable]$Environment, [string[]]$Secrets, [int]$TimeoutSeconds = 120) {
    if (-not [IO.Path]::IsPathFullyQualified($Executable) -or -not (Test-Path -LiteralPath $Executable -PathType Leaf)) { throw 'ARTEN_PLAY_TOOL_MISSING' }
    $info = [Diagnostics.ProcessStartInfo]::new()
    $info.FileName = $Executable; $info.WorkingDirectory = (Get-ArtenPlaySettings).Mobile
    $info.UseShellExecute = $false; $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
    foreach ($argument in $Arguments) { $info.ArgumentList.Add($argument) }
    foreach ($key in @($info.Environment.Keys)) {
        if ($key.StartsWith('ARTEN_PLAY_', [StringComparison]::OrdinalIgnoreCase)) { $null = $info.Environment.Remove($key) }
    }
    foreach ($key in $Environment.Keys) { $info.Environment[$key] = [string]$Environment[$key] }
    $process = [Diagnostics.Process]::new(); $process.StartInfo = $info
    try {
        $null = $process.Start()
        $outTask = $process.StandardOutput.ReadToEndAsync(); $errTask = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
            try { $process.Kill($true); $process.WaitForExit() } catch { }
            throw 'ARTEN_PLAY_CHILD_TIMEOUT'
        }
        $output = $outTask.GetAwaiter().GetResult(); $errors = $errTask.GetAwaiter().GetResult()
        foreach ($secret in $Secrets) {
            if ($secret) { $output = $output.Replace($secret, '[REDACTED]'); $errors = $errors.Replace($secret, '[REDACTED]') }
        }
        if ($output.Length + $errors.Length -gt 8MB) { throw 'ARTEN_PLAY_CHILD_OUTPUT_LIMIT' }
        return [pscustomobject]@{ ExitCode = $process.ExitCode; Output = $output; Error = $errors }
    } finally {
        foreach ($key in @($info.Environment.Keys)) {
            if ($key.StartsWith('ARTEN_PLAY_', [StringComparison]::OrdinalIgnoreCase)) { $null = $info.Environment.Remove($key) }
        }
        $process.Dispose()
    }
}

function Open-ArtenPlaySigningState {
    $settings = Get-ArtenPlaySettings; $sid = Get-ArtenPlaySid
    $null = Assert-ArtenPlayPath $settings.Signing $settings.Workspace
    Assert-ArtenPlayAcl $settings.Signing $sid $true
    Assert-ArtenPlayAcl $settings.Runtime $sid $true
    Assert-ArtenPlayAcl $settings.Reports $sid $true
    $streams = @{}
    try {
        foreach ($item in @(@('metadata', 'signing.json', 16384), @('keystore', 'upload-key.dpapi', 1MB), @('password', 'password.dpapi', 65536), @('certificate', 'upload-cert.der', 65536))) {
            $filename = Join-Path $settings.Signing $item[1]
            Assert-ArtenPlayAcl $filename $sid
            $streams[$item[0]] = Open-ArtenPlayFile $filename $settings.Signing $item[2]
        }
        $metadata = [Text.Encoding]::UTF8.GetString((Read-ArtenPlayStream $streams.metadata)) | ConvertFrom-Json
        if ($metadata.formatVersion -ne 1 -or $metadata.packageName -cne $settings.Package -or $metadata.alias -cne $settings.Alias -or
            $metadata.userSid -cne $sid -or $metadata.storeType -cne 'JKS' -or $metadata.algorithm -cne 'RSA' -or $metadata.keyBits -ne 4096) { throw 'ARTEN_PLAY_SIGNING_METADATA' }
        foreach ($pair in @(@('keystore', 'keystoreCiphertextSha256'), @('password', 'passwordCiphertextSha256'), @('certificate', 'certificateSha256'))) {
            if ($metadata.($pair[1]) -cnotmatch '^[a-f0-9]{64}$' -or (Get-ArtenPlayHash (Read-ArtenPlayStream $streams[$pair[0]])) -cne $metadata.($pair[1])) { throw 'ARTEN_PLAY_SIGNING_HASH' }
        }
        return [pscustomobject]@{ Metadata = $metadata; Streams = $streams; UserSid = $sid }
    } catch { foreach ($stream in $streams.Values) { $stream.Dispose() }; throw }
}

function Close-ArtenPlaySigningState([object]$State) {
    $failure = $null
    if ($null -ne $State) {
        foreach ($stream in $State.Streams.Values) {
            try { $stream.Dispose() } catch { if ($null -eq $failure) { $failure = $_.Exception } }
        }
    }
    if ($null -ne $failure) { throw $failure }
}

function Invoke-ArtenPlayCheck {
    $settings = Get-ArtenPlaySettings
    $null = Assert-ArtenPlayPath $settings.Signing $settings.Workspace
    $existing = Test-Path -LiteralPath $settings.Signing
    $certificate = $null
    if ($existing) {
        $state = Open-ArtenPlaySigningState
        try {
            if (@(Get-ChildItem -LiteralPath $settings.Runtime -Filter '*.jks').Count -or (Test-Path -LiteralPath (Join-Path $settings.Runtime 'build.lock'))) { throw 'ARTEN_PLAY_RUNTIME_REVIEW_REQUIRED' }
            $certificate = $state.Metadata.certificateSha256
        }
        finally { Close-ArtenPlaySigningState $state }
    }
    $missing = @()
    foreach ($tool in @((Join-Path $settings.Flutter 'bin\cache\dart-sdk\bin\dart.exe'), (Join-Path $settings.Flutter 'bin\cache\flutter_tools.snapshot'),
        (Join-Path $settings.Jdk 'bin\keytool.exe'), (Join-Path $settings.Jdk 'bin\jarsigner.exe'),
        (Join-Path $settings.Sdk 'platforms\android-36\android.jar'), (Join-Path $settings.Sdk 'build-tools\36.0.0\aapt2.exe'),
        (Join-Path $settings.Sdk 'ndk\28.2.13676358\source.properties'), (Join-Path $settings.Sdk 'platform-tools\adb.exe'),
        (Join-Path $settings.Sdk 'cmake\3.22.1\bin\cmake.exe'), (Join-Path $settings.Sdk 'cmake\3.22.1\bin\ninja.exe'))) {
        if (-not (Test-Path -LiteralPath $tool -PathType Leaf)) { $missing += [IO.Path]::GetFileName($tool) }
    }
    # Flutter needs apkanalyzer for the final release bundle, including when Gradle already built it.
    $cmdlineTools = Join-Path $settings.Sdk 'cmdline-tools'
    $analyzer = Get-ChildItem -LiteralPath $cmdlineTools -Directory -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -match '^(latest|[0-9]+\.[0-9]+(?:\.[0-9]+)?)$' -and
            (Test-Path -LiteralPath (Join-Path $_.FullName 'bin\apkanalyzer.bat') -PathType Leaf)
    } | Select-Object -First 1
    if (-not $analyzer) { $missing += 'apkanalyzer.bat' }
    $gradle = [IO.File]::ReadAllText((Join-Path $settings.Mobile 'android\app\build.gradle.kts'))
    $properties = [IO.File]::ReadAllText((Join-Path $settings.Mobile 'android\gradle.properties'))
    if ($gradle -notmatch 'applicationId\s*=\s*"de\.fnwildlifetravel\.arten_explorer"' -or $gradle -notmatch 'minSdk\s*=\s*26' -or
        $gradle -notmatch 'targetSdk\s*=\s*36' -or $gradle -notmatch 'ARTEN_PLAY_SIGNING_REQUIRED' -or
        $properties -notmatch '(?m)^android\.builder\.sdkDownload=false\s*$') { throw 'ARTEN_PLAY_SOURCE_CONFIGURATION' }
    foreach ($logo in @('assets\arten-explorer.png', 'android\app\src\main\res\drawable-nodpi\arten_explorer.png')) {
        $filename = Assert-ArtenPlayPath (Join-Path $settings.Mobile $logo) $settings.Mobile
        if ((Get-FileHash -LiteralPath $filename -Algorithm SHA256).Hash.ToLowerInvariant() -cne '63922bd5c1735dd4a31aa4d7c721adf2d16cc1b2a8082bf41f55403a6d22651e') { throw 'ARTEN_PLAY_LOGO_CHANGED' }
    }
    return [ordered]@{ checkCompleted = $true; signingInitialized = $existing; certificateSha256 = $certificate
        toolsPresent = ($missing.Count -eq 0); missingTools = $missing; expectedPackageName = $settings.Package
        filesChanged = $false; childProcessesStarted = $false; sdkDownloadsStarted = $false; uploadExecuted = $false; readyForUpload = $false }
}

function Initialize-ArtenPlaySigning([string]$ExpectedSid) {
    $settings = Get-ArtenPlaySettings; $sid = Get-ArtenPlaySid
    if (-not $ExpectedSid -or $ExpectedSid -cne $sid) { throw 'ARTEN_PLAY_EXPECTED_USER_REQUIRED' }
    $null = Assert-ArtenPlayPath $settings.Signing $settings.Workspace
    if (Test-Path -LiteralPath $settings.Signing) { throw 'ARTEN_PLAY_SIGNING_ALREADY_EXISTS' }
    if (-not (Test-Path -LiteralPath (Split-Path -Parent $settings.Signing) -PathType Container)) { throw 'ARTEN_PLAY_DATA_DIRECTORY_REQUIRED' }
    if (-not (Test-Path -LiteralPath (Join-Path $settings.Jdk 'bin\keytool.exe') -PathType Leaf)) { throw 'ARTEN_PLAY_TOOL_MISSING' }
    New-ArtenPlayPrivateDirectory $settings.Signing $sid $settings.Workspace
    New-ArtenPlayPrivateDirectory $settings.Runtime $sid $settings.Signing
    New-ArtenPlayPrivateDirectory $settings.Reports $sid $settings.Signing
    $plainKey = Join-Path $settings.Runtime ('upload-' + [Guid]::NewGuid().ToString('N') + '.jks')
    $passwordBytes = $null; $keyBytes = $null; $password = $null; $environment = @{}
    try {
        $random = [Security.Cryptography.RandomNumberGenerator]::GetBytes(48)
        try { $password = [Convert]::ToBase64String($random) } finally { [Array]::Clear($random) }
        $passwordBytes = [Text.Encoding]::UTF8.GetBytes($password)
        $environment = @{ ARTEN_PLAY_KEYTOOL_PASSWORD = $password }
        $arguments = @('-J-Duser.language=en', '-J-Duser.country=US', '-genkeypair', '-alias', $settings.Alias, '-keyalg', 'RSA', '-keysize', '4096',
            '-validity', '10950', '-dname', 'CN=FN Wildlife Travel Arten-Explorer Upload, OU=Android, O=FN Wildlife Travel, C=DE', '-storetype', 'JKS',
            '-keystore', $plainKey, '-storepass:env', 'ARTEN_PLAY_KEYTOOL_PASSWORD', '-keypass:env', 'ARTEN_PLAY_KEYTOOL_PASSWORD', '-noprompt')
        $generated = Invoke-ArtenPlayChild (Join-Path $settings.Jdk 'bin\keytool.exe') $arguments $environment @($password)
        if ($generated.ExitCode -ne 0) { throw 'ARTEN_PLAY_KEY_GENERATION_FAILED' }
        Assert-ArtenPlayAcl $plainKey $sid
        $stream = Open-ArtenPlayFile $plainKey $settings.Runtime 1MB
        try { $keyBytes = Read-ArtenPlayStream $stream } finally { $stream.Dispose() }
        $certificateFile = Join-Path $settings.Signing 'upload-cert.der'
        $exported = Invoke-ArtenPlayChild (Join-Path $settings.Jdk 'bin\keytool.exe') @('-exportcert', '-alias', $settings.Alias, '-keystore', $plainKey,
            '-storetype', 'JKS', '-storepass:env', 'ARTEN_PLAY_KEYTOOL_PASSWORD', '-file', $certificateFile) $environment @($password)
        if ($exported.ExitCode -ne 0) { throw 'ARTEN_PLAY_CERTIFICATE_EXPORT_FAILED' }
        $keyCiphertext = [Security.Cryptography.ProtectedData]::Protect($keyBytes, $settings.Entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        $passwordCiphertext = [Security.Cryptography.ProtectedData]::Protect($passwordBytes, $settings.Entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        Write-ArtenPlayNewFile (Join-Path $settings.Signing 'upload-key.dpapi') $keyCiphertext $settings.Signing
        Write-ArtenPlayNewFile (Join-Path $settings.Signing 'password.dpapi') $passwordCiphertext $settings.Signing
        $certStream = Open-ArtenPlayFile $certificateFile $settings.Signing 65536
        try { $certificateHash = Get-ArtenPlayHash (Read-ArtenPlayStream $certStream) } finally { $certStream.Dispose() }
        $metadata = [ordered]@{ formatVersion = 1; userSid = $sid; packageName = $settings.Package; alias = $settings.Alias; storeType = 'JKS'
            algorithm = 'RSA'; keyBits = 4096; createdAtUtc = [DateTime]::UtcNow.ToString('o'); keystoreCiphertextSha256 = Get-ArtenPlayHash $keyCiphertext
            passwordCiphertextSha256 = Get-ArtenPlayHash $passwordCiphertext; certificateSha256 = $certificateHash }
        Write-ArtenPlayNewFile (Join-Path $settings.Signing 'signing.json') ([Text.UTF8Encoding]::new($false).GetBytes(($metadata | ConvertTo-Json))) $settings.Signing
        return [ordered]@{ signingInitialized = $true; certificateSha256 = $certificateHash; packageName = $settings.Package; uploadExecuted = $false; readyForUpload = $false }
    } finally {
        if ($null -ne $passwordBytes) { [Array]::Clear($passwordBytes) }
        if ($null -ne $keyBytes) { [Array]::Clear($keyBytes) }
        $environment.Clear(); $password = $null
        if (Test-Path -LiteralPath $plainKey) {
            $null = Assert-ArtenPlayPath $plainKey $settings.Runtime
            Remove-Item -LiteralPath $plainKey -Force
        }
        # Never delete or replace a partially initialized signing directory automatically.
    }
}

function Get-ArtenPlaySdkInventory([string]$Sdk) {
    $rows = @()
    foreach ($family in @('platforms', 'build-tools', 'ndk', 'cmdline-tools', 'cmake', 'platform-tools')) {
        $base = Join-Path $Sdk $family
        if (-not (Test-Path -LiteralPath $base)) { continue }
        $roots = if ($family -eq 'platform-tools') { @((Get-Item -LiteralPath $base)) } else { @(Get-ChildItem -LiteralPath $base -Directory) }
        foreach ($directory in $roots) {
            $descriptors = @()
            foreach ($name in @('source.properties', 'package.xml')) {
                $filename = Join-Path $directory.FullName $name
                if (Test-Path -LiteralPath $filename) { $descriptors += [ordered]@{ name = $name; sha256 = (Get-FileHash -LiteralPath $filename -Algorithm SHA256).Hash.ToLowerInvariant() } }
            }
            $rows += [ordered]@{ component = "$family/$($directory.Name)"; descriptors = $descriptors }
        }
    }
    return ConvertTo-Json -InputObject @($rows | Sort-Object component) -Depth 6 -Compress
}

function Open-ArtenPlayBuildCache {
    $settings = Get-ArtenPlaySettings
    $checksFile = Join-Path $settings.Mobile 'build-evidence\checks.json'
    $stream = Open-ArtenPlayFile $checksFile $settings.Mobile 4MB
    try { $checks = [Text.Encoding]::UTF8.GetString((Read-ArtenPlayStream $stream)) | ConvertFrom-Json }
    finally { $stream.Dispose() }
    if ($null -ne $checks.activeChild -or $checks.sdkUnchanged -ne $true -or $checks.sdkDownloadGuard.passed -ne $true) { throw 'ARTEN_PLAY_PREVIOUS_CHECKS_REQUIRED' }
    foreach ($label in @('analyze', 'test', 'build')) {
        $last = @($checks.checks | Where-Object label -eq $label)[-1]
        if ($null -eq $last -or $last.code -ne 0) { throw 'ARTEN_PLAY_PREVIOUS_CHECKS_REQUIRED' }
    }
    $cache = if ($checks.cacheRoot) { $checks.cacheRoot } else { $checks.session }
    $testsRoot = Join-Path $settings.Workspace 'temp\tests'
    $cache = Assert-ArtenPlayPath $cache $testsRoot
    if ([IO.Path]::GetDirectoryName($cache) -ne $testsRoot -or [IO.Path]::GetFileName($cache) -cnotmatch '^s-[0-9]+-[0-9a-f]{8}$') { throw 'ARTEN_PLAY_CACHE_OWNER' }
    $ownerStream = Open-ArtenPlayFile (Join-Path $cache 'owner.json') $cache 16384
    try { $owner = [Text.Encoding]::UTF8.GetString((Read-ArtenPlayStream $ownerStream)) | ConvertFrom-Json }
    finally { $ownerStream.Dispose() }
    if ($owner.owner -cne 'fn-explorer-tests' -or $owner.session -cne [IO.Path]::GetFileName($cache) -or $owner.pid -le 0) { throw 'ARTEN_PLAY_CACHE_OWNER' }
    if (Get-Process -Id $owner.pid -ErrorAction SilentlyContinue) { throw 'ARTEN_PLAY_CACHE_IN_USE' }
    foreach ($folder in @('pub', 'gradle')) {
        $null = Assert-ArtenPlayPath (Join-Path $cache $folder) $cache
        if (-not (Test-Path -LiteralPath (Join-Path $cache $folder) -PathType Container)) { throw 'ARTEN_PLAY_CACHE_MISSING' }
    }
    return $cache
}

function Resolve-ArtenPlayNode {
    # Get-Command can return every PATH match. Passing their .Source array to a
    # string parameter joins multiple paths into one unusable executable name.
    $command = Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1
    $node = $command.Source
    if (-not $node -or -not [IO.Path]::IsPathFullyQualified($node) -or -not (Test-Path -LiteralPath $node -PathType Leaf)) { throw 'ARTEN_PLAY_TOOL_MISSING' }
    return $node
}

function Invoke-ArtenPlayBuild {
    $settings = Get-ArtenPlaySettings
    $check = Invoke-ArtenPlayCheck
    if (-not $check.signingInitialized -or -not $check.toolsPresent) { throw 'ARTEN_PLAY_PREREQUISITES_MISSING' }
    $cache = Open-ArtenPlayBuildCache
    $state = Open-ArtenPlaySigningState
    $operation = [Guid]::NewGuid().ToString('N')
    $plainKey = Join-Path $settings.Runtime "upload-$operation.jks"
    $lock = $null; $passwordBytes = $null; $keyBytes = $null; $password = $null; $environment = @{}
    $sourceBundle = $null; $runtimeKey = $null; $artifactStream = $null
    $context = [pscustomobject]@{ Settings = $settings; State = $state; Operation = $operation; PlainKey = $plainKey
        Lock = $null; RuntimeKey = $null; SourceBundle = $null; ArtifactStream = $null
        Artifact = $null; ArtifactSha256 = $null; KeyCreationAttempted = $false; LockCreationAttempted = $false
        Result = $null; Failure = $null; CleanupErrors = @(); CleanupAttempted = $false }
    try {
        $lockPath = Assert-ArtenPlayPath (Join-Path $settings.Runtime 'build.lock') $settings.Runtime
        $context.LockCreationAttempted = $true
        $lock = New-ArtenPlayOwnedRuntimeFile $lockPath ([Text.Encoding]::UTF8.GetBytes($operation)) $settings.Runtime
        $context.Lock = $lock
        if (@(Get-ChildItem -LiteralPath $settings.Runtime -Filter '*.jks').Count) { throw 'ARTEN_PLAY_STALE_PLAINTEXT_KEY' }
        $passwordBytes = [Security.Cryptography.ProtectedData]::Unprotect((Read-ArtenPlayStream $state.Streams.password), $settings.Entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        $keyBytes = [Security.Cryptography.ProtectedData]::Unprotect((Read-ArtenPlayStream $state.Streams.keystore), $settings.Entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        $password = [Text.Encoding]::UTF8.GetString($passwordBytes)
        if ($password -cnotmatch '^[A-Za-z0-9+/]{64}$' -or $keyBytes.Length -gt 1MB -or $keyBytes.Length -lt 100) { throw 'ARTEN_PLAY_SECRET_FORMAT' }
        $context.KeyCreationAttempted = $true
        $runtimeKey = New-ArtenPlayOwnedRuntimeFile $plainKey $keyBytes $settings.Runtime
        $context.RuntimeKey = $runtimeKey
        Assert-ArtenPlayAcl $plainKey $state.UserSid
        $environment = @{ ARTEN_PLAY_DISTRIBUTION = 'play'; ARTEN_PLAY_STORE_FILE = $plainKey; ARTEN_PLAY_STORE_PASSWORD = $password
            ARTEN_PLAY_KEY_ALIAS = $settings.Alias; ARTEN_PLAY_KEY_PASSWORD = $password
            JAVA_HOME = $settings.Jdk; ANDROID_HOME = $settings.Sdk; ANDROID_SDK_ROOT = $settings.Sdk
            PUB_CACHE = Join-Path $cache 'pub'; GRADLE_USER_HOME = Join-Path $cache 'gradle'
            FLUTTER_SUPPRESS_ANALYTICS = 'true'; DART_SUPPRESS_ANALYTICS = 'true'; CI = 'true'
            GRADLE_OPTS = '-Dorg.gradle.daemon=false -Dorg.gradle.configuration-cache=false -Dorg.gradle.internal.instrumentation.agent=false'
        }
        $beforeSdk = Get-ArtenPlaySdkInventory $settings.Sdk
        $started = [DateTime]::UtcNow
        $built = Invoke-ArtenPlayChild (Join-Path $settings.Flutter 'bin\cache\dart-sdk\bin\dart.exe') @((Join-Path $settings.Flutter 'bin\cache\flutter_tools.snapshot'),
            '--no-version-check', '--suppress-analytics', 'build', 'appbundle', '--release', '--no-pub', '--target-platform=android-arm,android-arm64,android-x64') $environment @($password) 1200
        if ((Get-ArtenPlaySdkInventory $settings.Sdk) -cne $beforeSdk) { throw 'ARTEN_PLAY_SDK_CHANGED' }
        Write-ArtenPlayNewFile (Join-Path $settings.Reports "build-$operation.log") ([Text.UTF8Encoding]::new($false).GetBytes($built.Output + "`n" + $built.Error)) $settings.Reports
        if ($built.ExitCode -ne 0) { throw 'ARTEN_PLAY_BUILD_FAILED' }
        $source = Join-Path $settings.Mobile 'build\app\outputs\bundle\release\app-release.aab'
        if ((Get-Item -LiteralPath $source).LastWriteTimeUtc -lt $started) { throw 'ARTEN_PLAY_STALE_BUNDLE' }
        $sourceBundle = Open-ArtenPlayFile $source $settings.Mobile 512MB
        $context.SourceBundle = $sourceBundle
        $artifact = Join-Path $settings.Reports "arten-explorer-play-$operation.aab"
        $target = [IO.File]::Open((Assert-ArtenPlayPath $artifact $settings.Reports), [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try { $sourceBundle.CopyTo($target); $target.Flush($true) } finally { $target.Dispose() }
        $artifactStream = Open-ArtenPlayFile $artifact $settings.Reports 512MB
        $context.Artifact = $artifact; $context.ArtifactStream = $artifactStream
        $context.ArtifactSha256 = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($artifactStream)).ToLowerInvariant()
        $artifactStream.Position = 0
        # The verifier's environment is explicitly cleared of signing values.
        $node = Resolve-ArtenPlayNode
        $verified = Invoke-ArtenPlayChild $node @((Join-Path $PSScriptRoot 'release-check.mjs'), '--bundle', $artifact,
            '--jdk', $settings.Jdk, '--certificate', $state.Metadata.certificateSha256) @{} @() 180
        if ($verified.ExitCode -ne 0) { throw 'ARTEN_PLAY_BUNDLE_CHECK_FAILED' }
        $result = $verified.Output | ConvertFrom-Json
        if ($result.passed -ne $true -or $result.signatureVerified -ne $true -or $result.manifest.packageName -cne $settings.Package -or
            $result.certificateSha256 -cne $state.Metadata.certificateSha256 -or $result.bundleSha256 -cne $context.ArtifactSha256) { throw 'ARTEN_PLAY_BUNDLE_CHECK_FAILED' }
        $result | Add-Member -NotePropertyName artifact -NotePropertyValue $artifact
        $result | Add-Member -NotePropertyName sdkUnchanged -NotePropertyValue $true
        $context.Result = $result
    } catch {
        $context.Failure = $_.Exception
    } finally {
        try {
            if ($null -ne $passwordBytes) { [Array]::Clear($passwordBytes) }
            if ($null -ne $keyBytes) { [Array]::Clear($keyBytes) }
            $environment.Clear(); $password = $null
        } finally { Close-ArtenPlayBuildResources $context }
    }
    return Complete-ArtenPlayBuild $context
}

if ($MyInvocation.InvocationName -ne '.') {
    try {
        if (([int][bool]$CheckOnly + [int][bool]$InitializeSigning + [int][bool]$Build) -gt 1) { throw 'ARTEN_PLAY_MODE' }
        if (-not $InitializeSigning -and $ExpectedUserSid) { throw 'ARTEN_PLAY_MODE' }
        $result = if ($InitializeSigning) { Initialize-ArtenPlaySigning $ExpectedUserSid }
            elseif ($Build) { Invoke-ArtenPlayBuild } else { Invoke-ArtenPlayCheck }
        $result | ConvertTo-Json -Depth 12
    } catch {
        # Exceptions from DPAPI/tools can contain private paths or native diagnostics.
        # Only our explicit non-secret failure codes leave the helper.
        $code = if ($_.Exception.Message -cmatch '^ARTEN_PLAY_[A-Z_]+$') { $_.Exception.Message } else { 'ARTEN_PLAY_STEP_BLOCKED' }
        [ordered]@{ passed = $false; failureCode = $code; uploadExecuted = $false; readyForUpload = $false
            partialPrivateStateMayExist = [bool]($Build -or $InitializeSigning); secretsLogged = $false } | ConvertTo-Json
        exit 1
    }
}
