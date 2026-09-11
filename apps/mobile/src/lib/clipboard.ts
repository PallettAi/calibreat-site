/** Best-effort copy. Returns false when the OS has no clipboard API we can use. */
export async function copyText(value: string): Promise<boolean> {
  try {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Native APK / denied permission — the caller shows the text instead.
  }
  return false;
}
