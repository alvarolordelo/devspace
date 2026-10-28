$ErrorActionPreference='Stop'
$originalLocalAppData=$env:LOCALAPPDATA
$originalCulture=[Threading.Thread]::CurrentThread.CurrentUICulture
$temp=Join-Path ([IO.Path]::GetTempPath()) ('lao-language-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($temp) | Out-Null
try {
    $env:LOCALAPPDATA=$temp
    . (Join-Path $PSScriptRoot '..\src\lao\windows\lao-start.ps1')

    [Threading.Thread]::CurrentThread.CurrentUICulture=[Globalization.CultureInfo]::GetCultureInfo('en-US')
    $script:uiLanguage=$null
    if ((Get-LaoUiLanguage) -ne 'en-US') { throw 'English must be the default outside Portuguese Windows' }
    if ((Get-LaoUiText 'Active') -ne 'Active') { throw 'English UI dictionary was not selected' }

    [Threading.Thread]::CurrentThread.CurrentUICulture=[Globalization.CultureInfo]::GetCultureInfo('pt-BR')
    $script:uiLanguage=$null
    if ((Get-LaoUiLanguage) -ne 'pt-BR') { throw 'Portuguese Windows must auto-select Portuguese' }
    if ((Get-LaoUiText 'Active') -ne 'Ativo') { throw 'Portuguese UI dictionary was not selected' }

    Set-LaoUiLanguage 'en-US'
    $script:uiLanguage=$null
    if ((Get-LaoUiLanguage) -ne 'en-US') { throw 'Saved English preference must override Portuguese Windows' }

    Set-LaoUiLanguage 'pt-BR'
    [Threading.Thread]::CurrentThread.CurrentUICulture=[Globalization.CultureInfo]::GetCultureInfo('en-US')
    $script:uiLanguage=$null
    if ((Get-LaoUiLanguage) -ne 'pt-BR') { throw 'Saved Portuguese preference must override English Windows' }

    Write-Output 'LAO language preference check passed'
} finally {
    [Threading.Thread]::CurrentThread.CurrentUICulture=$originalCulture
    $env:LOCALAPPDATA=$originalLocalAppData
    Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
}
