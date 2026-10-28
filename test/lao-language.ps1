$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
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

    . (Join-Path $PSScriptRoot '..\src\lao\windows\lao-autostart.ps1')
    . (Join-Path $PSScriptRoot '..\src\lao\windows\lao-settings.ps1')
    function Get-LaoSettingsComponentAction {
        param([string]$Kind,$Snapshot)
        return [pscustomobject]@{Kind=$Kind;Mode='LocalProcess';Operation='Restart';Port=1;ProcessId=1;ProcessPath='mock'}
    }
    $snapshot=[pscustomobject]@{statusAuthenticated=$true;tasksAuthenticated=$true;activeTasks=0;reasons=@()}
    Set-LaoUiLanguage 'en-US'
    $settings=New-LaoSettingsForm $null { $snapshot }
    try {
        if ($settings.Form.Text -notmatch 'Settings' -or $settings.Language.SelectedItem -ne 'English') {
            throw 'Settings form did not initialize in English'
        }
        $settings.Language.SelectedIndex=1
        [Windows.Forms.Application]::DoEvents()
        if ($settings.Form.Text -notmatch 'Configura' -or $settings.Services.Ollama.Text -ne 'Reiniciar Ollama') {
            throw 'Live switch to Portuguese failed'
        }
        $settings.Language.SelectedIndex=0
        [Windows.Forms.Application]::DoEvents()
        if ($settings.Form.Text -notmatch 'Settings' -or $settings.Services.Ollama.Text -ne 'Restart Ollama') {
            throw 'Live switch back to English failed'
        }
    } finally { $settings.Form.Dispose() }

    Write-Output 'LAO language preference check passed'
} finally {
    [Threading.Thread]::CurrentThread.CurrentUICulture=$originalCulture
    $env:LOCALAPPDATA=$originalLocalAppData
    Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
}
