# Yahoo Ranking Assistant - Architecture

## Desktop layer (Electron)

- `src/main.js`: trusted Electron main process, IPC, root folder settings, native folder pickers, local logs, task lock, open preview and backups.
- `src/preload.js`: narrow read-only/action methods through Electron `contextBridge` to sandboxed renderer; no Node.js integration in the page.
- `src/renderer/index.html`: single-window dashboard; original Excel/HTML remain separate documents.
- `src/renderer/style.css`: fully local styles; no CDN.
- `src/renderer/renderer.js`: button actions, 9-category status, backup chooser, visible logs and confirmation modals.

## Automation layer

- `src/lib/categories.js`: verified CODE formula/value coordinates, update-sheet row mapping and literal HTML comments.
- `src/lib/html-engine.js`: validates each generated CODE snippet against the ten manually chosen product ID/brand pairs, locates markers, replaces only the approved text spans, checks exact outside-marker equality, and reports structural warnings.
- `src/lib/file-ops.js`: verifies source files and root access; next-number backup naming, SHA-256 verification, strict UTF-8/BOM handling.
- `src/lib/workflow.js`: Preview, Backup-First Update, Restore, staging, commit hash verification and rollback. Calls the minimal PowerShell Excel helper.
- `scripts/Extract-CODE.ps1`: launches Excel via COM, forces VBA macros OFF, loads a PRIVATE temporary xlsx, calculates local formulas, performs `PasteSpecial(12)` on nine pairs, saves only that working copy, emits a UTF-8 JSON manifest. The user must have Excel desktop.

## Write safety

### Preview

1. Verify source exists + COPYPASTE is closed.
2. Copy workbook to OS temp.
3. Excel COM recalc and PasteSpecial on the temp copy only.
4. Extract HTML code and source ID/brand pairs.
5. Build/validate HTML without modifying outside-marker sections.
6. Create temporary browser preview with a base tag only for resolving relative css/img (not written to live HTML).

### Update

1. Verify source paths + hash live HTML and workbook.
2. **Create numbered HTML backup in `[REP]` and verify SHA-256 (first write).**
3. Create separate persistent Excel backup under local userData, verify.
4. Create working copy, use Excel COM, build HTML draft, validate nine sections.
5. Stage both outputs in ranking root and verify SHA-256.
6. Re-check live hash to detect shared-file changes.
7. Commit workbook, verify SHA-256; commit HTML, verify SHA-256.
8. If failure happens after a commit, attempt rollback from backups.

### Restore

1. Select existing numbered HTML backup.
2. Verify selected HTML has all expected markers.
3. Create and verify a NEW numbered backup of current active HTML.
4. Restore selected file; verify SHA-256. On failure, try undo from newly created backup.

No uploads to Yahoo, no schedules, no modifications to the sales-report or Stocks XLSM files.
