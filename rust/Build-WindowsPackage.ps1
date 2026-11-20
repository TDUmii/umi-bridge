param(
    [Parameter(Mandatory)][string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$output = [IO.Path]::GetFullPath($OutputDirectory)
$crate = Join-Path $PSScriptRoot 'umi-tokenizer'
$target = Join-Path $repo '.local-data\windows-release-target'
New-Item -ItemType Directory -Path $output -Force | Out-Null

$hostTriple = ((rustc -vV | Select-String '^host: ').Line -replace '^host: ', '')
if ($LASTEXITCODE -ne 0 -or $hostTriple -notin @('x86_64-pc-windows-msvc', 'x86_64-pc-windows-gnu')) {
    throw 'Building the package requires an x64 Windows Rust toolchain.'
}
cargo build --locked --release --manifest-path "$crate\Cargo.toml" --target-dir $target
if ($LASTEXITCODE -ne 0) { throw 'Tokenizer build failed.' }
$native = Join-Path $output 'umi_tokenizer.node'
Copy-Item -LiteralPath "$target\release\umi_tokenizer.dll" -Destination $native -Force
node -e 'if (require(process.argv[1]).countTokenPieces(["hello", " world"]) !== 2) process.exit(1)' $native
if ($LASTEXITCODE -ne 0) { throw 'Tokenizer smoke test failed.' }

$zip = Join-Path $output 'UmiBridge-Windows.zip'
git -C $repo archive --format=zip --output=$zip HEAD -- scripts extensions package.json package-lock.json UmiBridge.cmd UmiBridge-Setup.cmd README.md LICENSE THIRD_PARTY_NOTICES.md
if ($LASTEXITCODE -ne 0) { throw 'Git archive failed.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::Open($zip, [IO.Compression.ZipArchiveMode]::Update)
try {
    foreach ($entry in @('umi_tokenizer.node', 'TOKENIZER_LICENSES.txt')) {
        $source = if ($entry -eq 'umi_tokenizer.node') { $native } else { Join-Path $crate $entry }
        [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $source, "scripts/native/$entry", 'Optimal')
    }
} finally { $archive.Dispose() }

Copy-Item -LiteralPath "$repo\scripts\windows\Install-UmiBridge.ps1", "$repo\UmiBridge-Setup.cmd" -Destination $output -Force
$hashes = foreach ($asset in @('UmiBridge-Windows.zip', 'Install-UmiBridge.ps1', 'UmiBridge-Setup.cmd')) {
    '{0}  {1}' -f (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $output $asset)).Hash.ToLowerInvariant(), $asset
}
[IO.File]::WriteAllLines((Join-Path $output 'SHA256SUMS.txt'), $hashes, [Text.UTF8Encoding]::new($false))
$hashes
