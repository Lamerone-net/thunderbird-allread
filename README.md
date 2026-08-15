# Thunderbird All Read

A Thunderbird extension that marks every unread email as read across all configured mail accounts.

## Usage

Click the envelope and checkmark button in the toolbar. The badge displays progress and shows a green checkmark when the operation finishes. Additional clicks are ignored while an operation is running.

In the extension settings, choose a specific mail account or **All accounts** to control which messages are marked as read.

IMAP, POP3, and Local Folders accounts are supported. RSS and newsgroup accounts are not modified. The extension does not transmit data or make network requests of its own.

The user interface is available in all 69 locales supported by the project, matching the locale set used by Thunderbird Archiver.

## Temporary installation

1. Open **Add-ons and Themes** in Thunderbird.
2. Open **Debug Add-ons**.
3. Select **Load Temporary Add-on**.
4. Select `manifest.json` from this directory.

## Building the XPI file

Run the following command from PowerShell:

```powershell
.\build.ps1
```

The package is created in the `dist` directory.
