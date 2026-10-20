import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, type KeyboardEvent, type NativeScrollEvent, type ScrollView } from 'react-native';

import { revealOffset } from '@/lib/keyboard-reveal';

/** Gap kept between a revealed field and the top of the keyboard. */
const REVEAL_MARGIN = 24;

type Measurable = { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void };

/** Props that register a TextInput with the reveal hook under a name. */
export type KeyboardFieldProps = { ref: (node: Measurable | null) => void; onFocus: () => void };
export type KeyboardField = (name: string) => KeyboardFieldProps;

/**
 * Keeps the field being typed into visible while the on-screen keyboard is open.
 *
 * Android runs edge-to-edge, so the OS does not resize the window for the keyboard;
 * the keyboard simply covers the bottom of the screen. This hook scrolls the focused
 * field above it, and reports the keyboard height so the scroll content can grow
 * enough to reach the last field.
 *
 * Usage: spread `scrollProps` on the ScrollView, add `bottomInset` to its bottom
 * padding, and spread `field(name)` on each TextInput.
 */
export function useKeyboardReveal() {
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const fields = useRef(new Map<string, Measurable>());
  const focusedField = useRef<string | null>(null);
  const keyboardTop = useRef<number | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const revealFocused = useCallback(() => {
    const name = focusedField.current;
    const top = keyboardTop.current;
    const field = name ? fields.current.get(name) : undefined;
    if (!field || top == null) return;
    field.measureInWindow((_x, y, _w, h) => {
      const delta = revealOffset({ fieldBottom: y + h, keyboardTop: top, margin: REVEAL_MARGIN });
      if (delta > 0) scrollRef.current?.scrollTo({ y: scrollY.current + delta, animated: true });
    });
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e: KeyboardEvent) => {
      keyboardTop.current = e.endCoordinates.screenY;
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener(hideEvent, () => {
      keyboardTop.current = null;
      setKeyboardHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Runs after the keyboard's bottom inset is committed, so the content is tall
  // enough for the scroll target to be reachable.
  useEffect(() => {
    if (keyboardHeight > 0) revealFocused();
  }, [keyboardHeight, revealFocused]);

  const field: KeyboardField = (name) => ({
    ref: (node: Measurable | null) => {
      if (node) fields.current.set(name, node);
      else fields.current.delete(name);
    },
    onFocus: () => {
      focusedField.current = name;
      revealFocused();
    },
  });

  const scrollProps = {
    ref: scrollRef,
    scrollEventThrottle: 16,
    keyboardShouldPersistTaps: 'handled' as const,
    onScroll: (e: { nativeEvent: NativeScrollEvent }) => {
      scrollY.current = e.nativeEvent.contentOffset.y;
    },
  };

  return { field, scrollProps, bottomInset: keyboardHeight };
}
