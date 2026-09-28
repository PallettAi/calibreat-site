/**
 * The web half of restore (the native half lives in src/lib/restore-file.ts;
 * Metro resolves this file for platform=web, the same way db.ts / db.web.ts
 * work). The web preview is a dev aid, not a shipping target, so this is the
 * browser's own file input rather than a picker module.
 *
 * No Expo modules are imported here, so the web bundle stays clear of
 * native-only code.
 */

import { RESTORE_MAX_BYTES } from './restore';

export type PickBackupResult =
  | { ok: true; text: string; name: string }
  | { ok: false; cancelled?: boolean; message?: string };

async function pickText(accept: string, what: string): Promise<PickBackupResult> {
  if (typeof document === 'undefined') {
    return { ok: false, message: 'The web preview cannot open files. Try the app on a device.' };
  }

  return new Promise<PickBackupResult>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    // Loose on purpose, for the same reason as the native half: what the file
    // contains is checked by the parser, not by the browser's filter.
    input.accept = accept;

    let settled = false;
    const finish = (result: PickBackupResult) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(result);
    };

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        finish({ ok: false, cancelled: true });
        return;
      }
      if (file.size > RESTORE_MAX_BYTES) {
        finish({ ok: false, message: `That file is too large to be ${what}. Pick a smaller one.` });
        return;
      }
      file
        .text()
        .then((text) => finish({ ok: true, text, name: file.name }))
        .catch(() => finish({ ok: false, message: 'Could not read that file. Try a different one.' }));
    });

    // A cancelled file dialog fires no event in most browsers, so there is
    // nothing to await — the promise simply never settles and the caller
    // stays where it was. `cancel` covers the browsers that do report it.
    input.addEventListener('cancel', () => finish({ ok: false, cancelled: true }));

    input.click();
  });
}

/** A calibrEAT backup, written by this app's own export. */
export function pickBackupText(): Promise<PickBackupResult> {
  return pickText('.json,application/json,text/plain', 'a backup');
}

/** A diary export from another tracker (MyFitnessPal, Cronometer). */
export function pickDiaryText(): Promise<PickBackupResult> {
  return pickText('.csv,.txt,text/csv,text/plain', 'a diary');
}
