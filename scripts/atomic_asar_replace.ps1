# Windows ReplaceFileW: atomically replace live ASAR while retaining its
# previous bytes at a separate backup path. Fail closed if unavailable.
param(
    [Parameter(Mandatory=$true)][string]$Replacement,
    [Parameter(Mandatory=$true)][string]$Live,
    [Parameter(Mandatory=$true)][string]$Previous
)
$ErrorActionPreference = 'Stop'
$interop = @'
using System;
using System.Runtime.InteropServices;
public static class AntigravityAtomicReplace {
    [DllImport("kernel32.dll", EntryPoint="ReplaceFileW", CharSet=CharSet.Unicode, SetLastError=true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool Replace(string target, string replacement, string backup,
        uint flags, IntPtr excluded, IntPtr reserved);
}
'@
Add-Type -TypeDefinition $interop
if (-not [AntigravityAtomicReplace]::Replace(
    $Live, $Replacement, $Previous, 0,
    [IntPtr]::Zero, [IntPtr]::Zero)) {
    $errno = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    throw "ReplaceFileW failed (Win32 error $errno)"
}
