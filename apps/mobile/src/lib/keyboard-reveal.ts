/**
 * How far (in px) a scroll view must scroll down so a focused field sits above
 * the on-screen keyboard. Returns 0 when the field already clears the keyboard.
 *
 * All values are window coordinates (as from measureInWindow); `keyboardTop` is
 * the screen Y where the keyboard begins. `margin` keeps some breathing room
 * between the field and the keyboard.
 */
export function revealOffset({
  fieldBottom,
  keyboardTop,
  margin,
}: {
  fieldBottom: number;
  keyboardTop: number;
  margin: number;
}): number {
  const visibleBottom = keyboardTop - margin;
  return Math.max(0, Math.ceil(fieldBottom - visibleBottom));
}
