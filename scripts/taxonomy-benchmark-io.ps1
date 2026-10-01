param([Parameter(Mandatory=$true)][int]$BenchmarkPid, [Parameter(Mandatory=$true)][string]$BenchmarkRoot,
    [Parameter(Mandatory=$true)][string]$BenchmarkKey)
$ErrorActionPreference = 'Stop'
$scratchRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../Testlauf'))
$resolvedRoot = [IO.Path]::GetFullPath($BenchmarkRoot)
if ($BenchmarkPid -le 0 -or $BenchmarkKey -notmatch '^[a-f0-9-]{36}$' -or [IO.Path]::GetDirectoryName($resolvedRoot) -ne $scratchRoot -or
    [IO.Path]::GetFileName($resolvedRoot) -notmatch '^pipeline-benchmark-[a-zA-Z0-9]+$') { throw 'Unzulaessiges Messziel' }
$metricsDirectory = Join-Path $resolvedRoot 'metrics'
foreach ($directory in @($resolvedRoot, $metricsDirectory)) {
    $entry = Get-Item -LiteralPath $directory
    if (-not $entry.PSIsContainer -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Unzulaessiger Messordner' }
}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class BenchmarkProcessIo {
    [StructLayout(LayoutKind.Sequential)]
    public struct Counters {
        public ulong ReadOperations, WriteOperations, OtherOperations;
        public ulong ReadBytes, WriteBytes, OtherBytes;
    }
    [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr OpenProcess(uint access, bool inherit, int id);
    [DllImport("kernel32.dll", SetLastError=true)] public static extern bool GetProcessIoCounters(IntPtr handle, out Counters counters);
    [DllImport("kernel32.dll")] public static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
}
'@
# Query-limited + synchronize only: no termination, priority or write rights.
$processHandle = [BenchmarkProcessIo]::OpenProcess(0x00101000, $false, $BenchmarkPid)
$result = @{ available = $false; reason = 'process-unavailable'; pid = $BenchmarkPid }
try {
    if ($processHandle -ne [IntPtr]::Zero) {
        $counters = New-Object BenchmarkProcessIo+Counters
        do { $waitResult = [BenchmarkProcessIo]::WaitForSingleObject($processHandle, 250) } while ($waitResult -eq 258)
        if ($waitResult -eq 0 -and [BenchmarkProcessIo]::GetProcessIoCounters($processHandle, [ref]$counters)) {
            $result = @{ available = $true; pid = $BenchmarkPid; scope = 'process-logical-io-not-physical-disk';
                readOperations = $counters.ReadOperations; writeOperations = $counters.WriteOperations;
                otherOperations = $counters.OtherOperations; readBytes = $counters.ReadBytes;
                writeBytes = $counters.WriteBytes; otherBytes = $counters.OtherBytes }
        } else { $result.reason = 'counters-unavailable' }
    }
} finally { if ($processHandle -ne [IntPtr]::Zero) { [void][BenchmarkProcessIo]::CloseHandle($processHandle) } }
$outputPath = Join-Path $metricsDirectory "$BenchmarkKey-io.json"
$stream = [IO.File]::Open($outputPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
try {
    $bytes = [Text.Encoding]::UTF8.GetBytes(($result | ConvertTo-Json -Compress))
    $stream.Write($bytes, 0, $bytes.Length)
} finally { $stream.Dispose() }
