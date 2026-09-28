/**
 * Dev-only: quiets a third-party warning that React raises on the web preview.
 *
 * react-native-svg's web build spreads React Native responder props
 * (onStartShouldSetResponder, onResponderRelease, …) onto the DOM `<path>`
 * elements it renders, and react-native-body-highlighter attaches onPress to
 * every muscle path unconditionally. React ignores the props and logs
 * "Unknown event handler property" per path — enough that Expo's dev LogBox
 * raises a red banner that covers the Train screen.
 *
 * Nothing is actually broken: the taps still work on web (svg maps onPress
 * through a click handler) and the warning does not exist on native, where the
 * responder props are real. So we drop only these messages rather than leave a
 * false alarm sitting over the figure.
 *
 * react-native-web's own LogBox is a no-op, so the patterns go straight to
 * Expo's LogBox store. Everything here is web + dev only, lazily required and
 * guarded: if Expo ever moves the module we lose the filter, not the app.
 */

const WEB_SVG_NOISE = [
  'Unknown event handler property',
  'Received `true` for a non-boolean attribute `accessible`',
];

type IgnorePatterns = { ignoreLogs?: (patterns: string[]) => void };

export function silenceWebSvgWarnings(): void {
  if (process.env.NODE_ENV === 'production') return;
  if (typeof window === 'undefined') return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const expoLogBox = require('@expo/log-box/src/LogBox') as { default?: IgnorePatterns };
    expoLogBox?.default?.ignoreLogs?.(WEB_SVG_NOISE);
  } catch {
    // Expo moved the module — the banner stays, nothing else changes.
  }
}
