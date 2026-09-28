import { useState } from 'react';
import {
  Animated,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { hapticLight, hapticSelect } from '@/lib/haptics';

type Props = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  innerStyle?: StyleProp<ViewStyle>;
  haptic?: 'light' | 'select' | 'none';
  scaleTo?: number;
};

/**
 * Instrument press: scales in like a physical key, optional haptic.
 * Opacity-only presses read as unfinished; this is the shared feel.
 */
export function CrispPress({
  children,
  style,
  innerStyle,
  haptic = 'light',
  scaleTo = 0.975,
  disabled,
  onPress,
  onPressIn,
  onPressOut,
  ...rest
}: Props) {
  // Lazy on purpose: `useRef(new Animated.Value(1))` builds a fresh value on
  // every render and throws all but the first away, and every pressable in the
  // app renders at least once. useState's function initializer runs once and
  // keeps the same Animated.Value for the life of the component, which is what
  // the ref was being used for anyway.
  const [scale] = useState(() => new Animated.Value(1));

  function handleIn(...args: Parameters<NonNullable<PressableProps['onPressIn']>>) {
    if (!disabled) {
      Animated.spring(scale, { toValue: scaleTo, useNativeDriver: true, speed: 90, bounciness: 0 }).start();
      if (haptic === 'light') hapticLight();
      if (haptic === 'select') hapticSelect();
    }
    onPressIn?.(...args);
  }

  function handleOut(...args: Parameters<NonNullable<PressableProps['onPressOut']>>) {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 7, tension: 240 }).start();
    onPressOut?.(...args);
  }

  return (
    <Animated.View style={[{ transform: [{ scale }] }, disabled ? { opacity: 0.38 } : null, style]}>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={onPress}
        onPressIn={handleIn}
        onPressOut={handleOut}
        android_ripple={{ color: 'rgba(183,233,60,0.18)', foreground: true }}
        style={innerStyle}
        {...rest}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
