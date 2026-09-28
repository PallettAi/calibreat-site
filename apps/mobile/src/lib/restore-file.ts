/**
 * The native half of restore (the web half lives in src/lib/restore-file.web.ts;
 * Metro resolves one per platform, the same way db.ts / db.web.ts and
 * export-share.ts / export-share.web.ts work).
 *
 * Native: opens the system document picker and reads the chosen file's text.
 * The picker is a user-initiated system surface, so this needs no storage
 * permission — the app sees the one file the user hands it, and nothing else.
 *
 * Uses the expo-file-system SDK 57 API (the File / Paths classes; the legacy
 * readAsStringAsync was removed in this SDK), matching export-share.ts.
 */

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

import { RESTORE_MAX_BYTES } from './restore';

export type PickBackupResult =
  | { ok: true; text: string; name: string }
  | { ok: false; cancelled?: boolean; message?: string };

/**
 * Ask for a file and return its text.
 *
 * The MIME list is deliberately loose. Android file providers disagree about
 * what a .json is — variously application/json, text/plain or
 * application/octet-stream — and a filter that only matches the first one hides
 * the user's backup behind a picker that appears to have nothing in it. What
 * the file actually contains is the real gate: parseBackup refuses anything
 * that is not a calibrEAT bundle, with a message saying so.
 */
async function pickText(types: string[], what: string, fallbackName: string): Promise<PickBackupResult> {
  let picked: DocumentPicker.DocumentPickerResult;
  try {
    picked = await DocumentPicker.getDocumentAsync({
      type: types,
      copyToCacheDirectory: true,
      multiple: false,
    });
  } catch {
    return { ok: false, message: 'Could not open the file picker. Try again.' };
  }

  if (picked.canceled) return { ok: false, cancelled: true };
  const asset = picked.assets?.[0];
  if (!asset) return { ok: false, cancelled: true };

  // Checked before the file is read, so an enormous file costs a dialog
  // rather than the app's memory.
  if (typeof asset.size === 'number' && asset.size > RESTORE_MAX_BYTES) {
    return { ok: false, message: `That file is too large to be ${what}. Pick a smaller one.` };
  }

  try {
    const file = new FileSystem.File(asset.uri);
    const text = file.textSync();
    if (text.length > RESTORE_MAX_BYTES) {
      return { ok: false, message: `That file is too large to be ${what}. Pick a smaller one.` };
    }
    return { ok: true, text, name: asset.name ?? fallbackName };
  } catch {
    return { ok: false, message: 'Could not read that file. Try a different one.' };
  }
}

/** A calibrEAT backup, written by this app's own export. */
export function pickBackupText(): Promise<PickBackupResult> {
  return pickText(
    ['application/json', 'text/plain', 'application/octet-stream'],
    'a backup',
    'backup.json',
  );
}

/**
 * A diary export from another tracker (MyFitnessPal, Cronometer).
 *
 * The accepted types are the ones a .csv actually turns up as — text/csv from
 * a browser save, text/plain from an older export, the Microsoft Excel
 * registration, or plain octet-stream from a file manager that does not
 * classify it. Narrowing this to text/csv alone would hide the export in
 * whichever of the other forms the user's phone happened to save it as.
 */
export function pickDiaryText(): Promise<PickBackupResult> {
  return pickText(
    ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/csv', 'application/vnd.ms-excel', 'application/octet-stream'],
    'a diary',
    'diary.csv',
  );
}
