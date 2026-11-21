/**
 * BuildGO palette — "Site Safety".
 * Light concrete ground, asphalt-graphite ink for hero surfaces and primary actions, safety yellow as the
 * signal colour, signal orange for warnings, and a plain green kept only for "checked / verified".
 * Tuned for high contrast outdoors, in gloves, in the sun.
 */
const colors = {
  light: {
    text: '#16181C',
    tint: '#23272E',

    background: '#F3F2EE',
    foreground: '#16181C',

    card: '#FFFFFF',
    cardForeground: '#16181C',

    primary: '#23272E',
    primaryForeground: '#FFFFFF',

    secondary: '#E9E7E1',
    secondaryForeground: '#23272E',

    muted: '#ECEAE4',
    mutedForeground: '#6A6E75',

    accent: '#FFC02E',
    accentForeground: '#16181C',

    destructive: '#C62828',
    destructiveForeground: '#FFFFFF',

    border: '#E2DFD7',
    input: '#D2CFC6',

    /** Asphalt: hero, profile card, dark buttons. (Named "forest" from the original palette.) */
    forest: '#16181C',
    forestSoft: '#2C3139',
    /** Signal orange: warnings, pending, deposits. */
    clay: '#E8590C',
    sky: '#2F7FD8',
    /** Amber highlight. */
    wheat: '#F59F00',
    /** Verified / OK. */
    success: '#2E7D32',

    /** Secondary text on asphalt surfaces (hero, profile card). */
    onForestMuted: '#A8ADB5',
    /** Soft amber callout behind notices and demo banners. */
    noticeBg: '#FFF2D3',
    /** Soft green for confirmed / checked states. */
    successBg: '#E3F1E0',
    /** Neutral paper shown behind maps while tiles load. */
    mapBg: '#E7E5DE',
  },

  radius: 16,
};

export default colors;
