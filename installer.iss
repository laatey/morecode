; =====================================================================
; MoreCode - Inno Setup 6 Script
; Version and source dir are passed in by scripts/build-installer.mjs
; =====================================================================

#ifndef MyAppVersion
  #define MyAppVersion "1.0.0"
#endif
#define MyAppName "MoreCode"
#define MyAppPublisher "MoreCode"
#define MyAppExeName "morecode.exe"
#define MyAppURL "https://morecode.app"
#define SourceDir "dist\win-unpacked"

[Setup]
AppId={{7B3E5A1C-2D4F-4E8A-9C61-0F5A8D2B6E47}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DisableProgramGroupPage=yes
OutputDir=dist
OutputBaseFilename=MoreCode-Setup-{#MyAppVersion}
; Generic installer icon so the setup file is distinguishable from the installed app
SetupIconFile=build\setup.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2/max
SolidCompression=yes
WizardSizePercent=100,100
DisableDirPage=yes
DisableReadyPage=yes
#if Ver >= EncodeVer(6, 6, 0, 0)
WizardStyle=modern dynamic
WizardSmallImageFile=build\setup-wizard.png
#else
WizardStyle=modern
#endif
; Per-user install by default (no admin prompt); user can choose all-users in the dialog
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "contextmenu"; Description: "Add ""Open with MoreCode"" to the folder right-click menu"; GroupDescription: "Windows Explorer:"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
; right-click a folder (or the empty space inside one) -> Open with MoreCode. Removed again on uninstall.
Root: HKA; Subkey: "Software\Classes\Directory\shell\MoreCode"; ValueType: string; ValueName: ""; ValueData: "Open with MoreCode"; Flags: uninsdeletekey; Tasks: contextmenu
Root: HKA; Subkey: "Software\Classes\Directory\shell\MoreCode"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#MyAppExeName}"""; Tasks: contextmenu
Root: HKA; Subkey: "Software\Classes\Directory\shell\MoreCode\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""; Tasks: contextmenu
Root: HKA; Subkey: "Software\Classes\Directory\Background\shell\MoreCode"; ValueType: string; ValueName: ""; ValueData: "Open with MoreCode"; Flags: uninsdeletekey; Tasks: contextmenu
Root: HKA; Subkey: "Software\Classes\Directory\Background\shell\MoreCode"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#MyAppExeName}"""; Tasks: contextmenu
Root: HKA; Subkey: "Software\Classes\Directory\Background\shell\MoreCode\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%V"""; Tasks: contextmenu

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
