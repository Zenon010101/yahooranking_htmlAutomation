# Yahoo GLV Ranking HTML Assistant v1.1

An **Electron desktop application** built with HTML, CSS, and JavaScript to automate the existing Yahoo GLV ranking HTML workflow. A small Windows PowerShell helper uses the installed Microsoft Excel desktop app to perform the **exact Excel COM Paste Special > Values and Number Formats** action. It does not require Python or administrator privileges at runtime.

**This ZIP contains the COMPLETE SOURCE PROJECT, not a precompiled EXE.** Build the portable Windows EXE on a Windows PC that has Node.js/npm and internet access to download Electron dependencies. Once built, the portable EXE can be copied to a standard company PC without installing Python or Node.js. Microsoft Excel desktop must be installed on the PC that actually runs the ranking automation.

## Fixed initial folder

`G:\Shared drives\Design Team - Local Files\YAHOO GLV\ranking`

The folder must contain:

```text
ranking/
  rankspnew.html
  YAHOO-RANKING COPYPASTE.xlsx
  [REP]/
  css/
  img/
```

The folder can be changed in the UI if testing on a separate directory. No internet service is used for the ranking update itself; Google Drive for Desktop must be connected if using G:.

## Weekly usage

1. You manually open the matching weekly sales and Stocks Excel files, complete your lookups, verify category membership, and choose 10 products for each category.
2. In `YAHOO-RANKING COPYPASTE.xlsx`, update all product IDs and brand names in the `0722update` worksheet.
3. **Save and CLOSE** the COPYPASTE workbook. Also save the weekly source Excel files. The HTML automation does not touch the weekly stocklists.
4. Open Yahoo Ranking Assistant.
5. Choose **Preview Ranking**. The tool creates a private working copy of Excel, recalculates `CODE`, pastes formula results into the next static value cells, and generates a temporary preview. It does NOT update the live Excel or HTML and creates no backup.
6. Review all nine categories, 10 products each, with their correct links/images/names.
7. Choose **Backup & Update HTML** and type `UPDATE`. The FIRST write is a new verified `rankspnew (N).html` backup in `[REP]`, e.g. 24 -> 25. A separate persistent backup of the COPYPASTE workbook is also made in the app's local user-data folder.
8. It refreshes `CODE`, saves the workbook's static HTML cells, then replaces ONLY the existing ranking text between the exact HTML comment markers. Both outputs are SHA-256 checked.
9. Open the active `rankspnew.html` in a browser and review it.
10. **You** upload it to Yahoo Store Creator Pro. The app never logs in or uploads/publishes anything.

## Excel CODE sheet behavior

For every category, the FIRST J-column cell is a formula, and the NEXT cell is the static HTML text. The helper executes the COM equivalent of pressing Ctrl+C on the formula cell, selecting the second cell, and Excel Paste Special -> Values and Number Formats (PasteSpecial 12). The text of the SECOND cell is then used in `rankspnew.html`.

| Category | Formula source | Static HTML destination |
|---|---|---|
| Kitchen | J14 | J15 |
| Home Living | J30 | J31 |
| Travel | J46 | J47 |
| Beauty | J62 | J63 |
| Sports | J78 | J79 |
| Outdoor | J94 | J95 |
| Bags & Accessories | J110 | J111 |
| Fashion | J126 | J127 |
| Kids & Baby | J142 | J143 |

The app reads the ten source ID/brand pairs per category from `0722update`, validates generated links and images, and uses the complete generated HTML from each second cell. It does not invent new HTML markup or edit the ranking item template.

## HTML safety boundaries

- Uses the existing comments such as `<!-- PASTE KITCHEN HERE -->` to identify the exact insertion boundaries.
- Travel's legacy end comment is literally `<!-- PASTE TRAVEL -->`, without `HERE`. This is respected.
- The uploaded Kids & Baby HTML has three identical comment markers and two old 10-card lists. The tool replaces from the FIRST to the LAST marker, removing the redundant interior data while retaining the outer comments. All content outside these markers remains identical.
- No changes are made to HTML headers, CSS links, navigation, footer, scripts, or other page content outside the marker bounds.
- An existing Fashion anchor issue (`ctg6` duplicated instead of `ctg7`) is ONLY reported as a warning. This tool does NOT modify it, because it is outside the approved content boundaries.
- Stops if a marker is missing/extra, blocks overlap, product ID/image mismatch occurs, expected card count is not 10, or the live workbook changes during processing.
- Update checks exact outside-marker text equality before committing.
- A verified numbered HTML backup is REQUIRED before updating any live file.
- On a commit error, the tool attempts rollback from the verified HTML + workbook backups. If Google Drive disconnects during rollback, the local logs show the recovery locations.

## Restore

Choose **Restore previous HTML**, select a numbered backup from `[REP]`, then type `RESTORE` to confirm. The app also creates the next numbered backup of the CURRENT active HTML before restoring another version. Excel is not touched during HTML restoration.

## Build a portable Windows EXE

Required on the BUILD PC: Windows 10/11, Node.js 20+ with npm, network access to download Electron, and permission to run `npm`. Build commands from a terminal in this project folder:

```bat
npm install
npm test
npm run dist:portable
```

Or double-click `BUILD_WINDOWS.cmd`. The output will be under `dist/Yahoo_Ranking_Assistant_v1.1.0_Portable.exe` when the Windows build succeeds. This is a no-admin portable executable. **An EXE is not already included in this source ZIP.**

For development, run `npm install`, then `npm start`, or `RUN_DEVELOPMENT.cmd` after the packages have been installed.

## Windows runtime requirements

- Windows 10 or 11, with a logged-in desktop user session.
- Microsoft Excel desktop installed and functioning. The user must have permission to create temporary files and save in the ranking root.
- Google Drive for Desktop mounted as G:, with the relevant Shared Drive folders accessible and synced.
- `YAHOO-RANKING COPYPASTE.xlsx` must not be open while running Preview or Update. Close it after saving.
- The organization must allow PowerShell execution and Excel automation. The helper executes with `-NoProfile -NonInteractive -ExecutionPolicy Bypass`, which does not override restrictive company Group Policy. A locked-down company PC may require an approved build or IT permission.

## Troubleshooting

- **Cannot find ranking folder:** verify G: is mounted or select the correct folder in the UI.
- **Workbook in use:** close Excel and check for a leftover `~$YAHOO-RANKING COPYPASTE.xlsx` lock file only after Excel has actually been closed.
- **Excel COM fails:** verify Excel desktop opens on this Windows user session. Web Excel is not sufficient.
- **CONCAT formula fails:** ensure the Excel version supports `CONCAT` and that `CODE` formulas still exist in the expected cells. The tool will stop before updating HTML.
- **Incorrect IDs/brands:** fix them manually in the `0722update` sheet, save, close, then Preview again.
- **HTML markers changed:** the tool will refuse to update; fix the comments in a safe copy first.
- **Live HTML still shows old content:** Preview never updates live files. Run Update, then check the browser cache. HTML upload is still manual.
- **Backup already at (25):** the next update creates (26), it will not reuse (25).
- **Errors after commit:** use Restore in the UI. Logs and persistent backups are stored under the local app data folder (`%APPDATA%\yahoo-ranking-html-assistant\` or the Electron app's userData location).

## Testing and limitations

The project includes Node.js automated tests (`npm test`) that check markers, per-item validation, backup numbering, preview vs update, restore, and failure safety. The HTML generator was also checked against the supplied 1109 COPYPASTE workbook's cached CODE values and rankspnew HTML: all nine categories and 90 products matched, with the outside-marker HTML unchanged. **Excel COM, Electron runtime, and the real G: Google Drive mount cannot be exercised inside this non-Windows build environment.** Perform the first Update on a copy of the ranking folder on Windows before operating on shared files.
