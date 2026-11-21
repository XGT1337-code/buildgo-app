import React from 'react';
import { Platform, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { isLoaded } from 'expo-font';
import { F } from '@/components/ui';

const YELLOW = '#FFC02E';
const ASPHALT = '#16181C';
// On the web the boot screen shows before Inter has loaded: until then use the system sans-serif, so the
// wordmark is never invisible (the browser hides text while it waits for a web font).
const SYSTEM_SANS = "system-ui, -apple-system, 'Segoe UI', Arial, sans-serif";
const fontFamily = () => (Platform.OS !== 'web' ? F.b : isLoaded(F.b) ? `${F.b}, ${SYSTEM_SANS}` : SYSTEM_SANS);

/** The mark: a safety-yellow hex nut with a tower crane inside. Also used for the app icon. */
export function BrandMark({ size = 40, plate = YELLOW, ink = ASPHALT }: { size?: number; plate?: string; ink?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path d="M24 2.5 42.6 13.25v21.5L24 45.5 5.4 34.75v-21.5Z" fill={plate} stroke={plate} strokeWidth={3} strokeLinejoin="round" />
      {/* Mast, jib with counter-jib, trolley cable and hook, base. */}
      <Rect x={18.5} y={12} width={4} height={23} rx={0.6} fill={ink} />
      <Path d="M11 14.5h26v3.2H11Z" fill={ink} />
      <Path d="M20.5 9.5 14 14.5h13Z" fill={ink} />
      <Rect x={11} y={17.7} width={4.2} height={3.4} rx={0.5} fill={ink} />
      <Rect x={32.4} y={17.7} width={1.4} height={8.6} fill={ink} />
      <Path d="M30.6 26.3h5v4.6h-5Z" fill={ink} />
      <Rect x={14.5} y={34.6} width={12} height={2.6} rx={1.3} fill={ink} />
    </Svg>
  );
}

/**
 * BuildGO logo: the mark plus the wordmark, white "Build" and safety-yellow "GO" — the same everywhere.
 * On light surfaces (`onDark` false) it sits on its own asphalt badge instead of changing colours.
 */
export function BrandLogo({
  width = 148,
  height = 44,
  onDark = false,
  style,
  testID,
}: {
  width?: number;
  height?: number;
  onDark?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const mark = Math.round(height * 0.86);
  const fontSize = Math.round(height * 0.6);
  const badge = !onDark;
  return (
    <View testID={testID} accessibilityLabel="BuildGO" accessibilityRole="image"
      style={[{ height, flexDirection: 'row', alignItems: 'center', gap: Math.round(height * 0.18) },
        badge ? { alignSelf: 'center', backgroundColor: ASPHALT, borderRadius: height / 2, paddingLeft: Math.round(height * 0.2), paddingRight: Math.round(height * 0.45) } : { width },
        style]}>
      <BrandMark size={badge ? Math.round(height * 0.72) : mark} />
      <Text numberOfLines={1} style={{ fontFamily: fontFamily(), fontWeight: '700', fontSize: badge ? Math.round(height * 0.5) : fontSize, letterSpacing: -0.8, color: '#FFFFFF', flexShrink: 1 }}>
        Build<Text style={{ color: YELLOW }}>GO</Text>
      </Text>
    </View>
  );
}
