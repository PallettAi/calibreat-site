/**
 * The native half of export (the web half lives in src/lib/export-share.web.ts;
 * Metro resolves one per platform, the same way db.ts / db.web.ts work).
 *
 * Native: writes the payload into the app's cache directory and hands the file
 * to the OS share sheet through expo-sharing. The user picks where it goes —
 * Files, Drive, email, another app. No new permission is needed: the cache
 * directory is app-private and the share sheet is user-initiated.
 *
 * Uses the expo-file-system SDK 57 API (File / Paths classes — the legacy
 * writeAsStringAsync API was removed in this SDK).
 */

import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export type ExportKind = 'backup' | 'diary';

export type ExportResult =
  | { ok: true; method: 'share' }
  | { ok: false; method: 'clipboard' | 'error'; message?: string };

export async function shareExport(_kind: ExportKind, fileName: string, payload: string): Promise<ExportResult> {
  let file: FileSystem.File | null = null;
  try {
    file = new FileSystem.File(FileSystem.Paths.cache, fileName);
    file.write(payload);
    await Sharing.shareAsync(file.uri, {
      mimeType: fileName.endsWith('.csv') ? 'text/csv' : 'application/json',
      dialogTitle: 'Export calibrEAT data',
      UTI: fileName.endsWith('.csv') ? 'public.comma-separated-values-text' : 'public.json',
    });
    return { ok: true, method: 'share' };
  } catch {
    // Best effort: the cache file must never accumulate across exports.
    try {
      if (file?.exists) file.delete();
    } catch {
      // Nothing more we can do — the OS clears the cache directory anyway.
    }
    return { ok: false, method: 'error', message: 'Could not open the share sheet. Try again.' };
  }
}
