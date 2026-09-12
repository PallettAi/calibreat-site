/**
 * The web half of export (the native half lives in src/lib/export-share.ts;
 * Metro resolves one per platform, the same way db.ts / db.web.ts work).
 *
 * The web preview has no OS share sheet, so "export" means: copy the payload
 * to the clipboard (best effort, reusing src/lib/clipboard.ts) and offer a
 * browser download via an object URL. No Expo modules are imported here so the
 * web bundle stays clear of native-only code.
 */

import { copyText } from './clipboard';

export type ExportKind = 'backup' | 'diary';

export type ExportResult =
  | { ok: true; method: 'share' | 'download' }
  | { ok: false; method: 'clipboard' | 'error'; message?: string };

export async function shareExport(_kind: ExportKind, fileName: string, payload: string): Promise<ExportResult> {
  const clipboardOk = await copyText(payload);
  try {
    const blob = new Blob([payload], { type: fileName.endsWith('.csv') ? 'text/csv' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return { ok: true, method: 'download' };
  } catch {
    return clipboardOk
      ? { ok: false, method: 'clipboard', message: 'Could not start the download — the export is on your clipboard instead.' }
      : { ok: false, method: 'error', message: 'Could not export in the web preview. Try a device.' };
  }
}
