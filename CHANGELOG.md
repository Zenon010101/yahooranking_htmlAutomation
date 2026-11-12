# Changelog

## 1.1.0 - Electron desktop rewrite

- Added Electron GUI with HTML/CSS/JavaScript; no separate browser service or server needed.
- Root defaults to `G:\Shared drives\Design Team - Local Files\YAHOO GLV\ranking` and can be changed for testing.
- Uses exact CODE cell pairs in the supplied workbook; Excel COM helper performs `PasteSpecial(12)`.
- Added read-only Preview that produces a local HTML draft with CSS/image base path resolved.
- Added verified SHA-256 `rankspnew (N).html` backup, created as the first write before Update.
- Added local original Excel workbook backup and rollback attempt after commit failures.
- Preserves HTML outside category comment markers exactly, including its existing styles and heading IDs.
- Supports Travel's shorter ending marker and Kids & Baby's three legacy comment markers.
- Added 9-category/90-item validation against the product IDs and brands entered in the `0722update` sheet.
- Added Restore previous HTML, with an automatic safety backup of the current version.
- Added current logs, category status, source-folder browser, backup chooser and explicit UPDATE/RESTORE confirmations.
- Added build scripts for no-admin portable Windows executable and automated tests.
- No changes to BrandForge or weekly stocklist automation.
