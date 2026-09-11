import type { TextStyle } from 'react-native';

// Use the same bundled faces in native, web, and the brand-asset build.
export function applyTypography<T extends Record<string, object>>(styles: T): T {
  return Object.fromEntries(Object.entries(styles).map(([name, style]) => {
    if ('fontFamily' in style || !('fontSize' in style || 'lineHeight' in style || 'fontWeight' in style)) return [name, style];
    const weight = String((style as TextStyle).fontWeight ?? '400');
    const family = weight === 'bold' || Number(weight) >= 700 ? 'RobotoBold' : Number(weight) >= 600 ? 'RobotoSemiBold' : Number(weight) >= 500 ? 'RobotoMedium' : 'RobotoRegular';
    return [name, { ...style, fontFamily: family, fontWeight: 'normal' }];
  })) as T;
}
