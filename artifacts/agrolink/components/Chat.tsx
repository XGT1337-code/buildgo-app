import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, type AudioPlayer } from 'expo-audio';
import { useColors } from '@/hooks/useColors';
import { Avatar, F, Press } from '@/components/ui';
import { useOnline } from '@/lib/realtime';
import { fmtDuration, voiceSource } from '@/lib/voice';
import { hashNum } from '@/lib/util';
import { t } from '@/lib/i18n';

/** Avatar with a green dot while the person has the app open. */
export function PresenceAvatar({ id, name, online, size = 52 }: { id: string; name: string; online: boolean; size?: number }) {
  const c = useColors();
  const live = useOnline(id, online);
  const dot = Math.max(12, size * 0.26);
  return (
    <View>
      <Avatar name={name} size={size} />
      {live ? <View style={[styles.dot, { width: dot, height: dot, borderRadius: dot / 2, backgroundColor: '#3CC46B', borderColor: c.card }]} /> : null}
    </View>
  );
}

/** Three bouncing dots: "typing…". */
export function TypingDots({ color }: { color: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center', height: 14 }}>
      {[0, 1, 2].map((i) => <Dot key={i} i={i} color={color} />)}
    </View>
  );
}
function Dot({ i, color }: { i: number; color: string }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withDelay(i * 140, withRepeat(withSequence(withTiming(-4, { duration: 260 }), withTiming(0, { duration: 260 })), -1));
  }, [i, y]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }, a]} />;
}

/** Bar heights derived from the message id, so each note has its own stable "waveform". */
export function useBars(seed: string, n = 30) {
  return useMemo(() => {
    let h = hashNum(seed) || 7;
    return Array.from({ length: n }, (_, i) => {
      h = (h * 1103515245 + 12345) & 0x7fffffff;
      const envelope = Math.sin((Math.PI * (i + 1)) / (n + 1));
      return 0.25 + 0.75 * envelope * ((h % 1000) / 1000 * 0.7 + 0.3);
    });
  }, [seed, n]);
}

/** Only one voice note plays at a time across the app. */
let playing: AudioPlayer | null = null;

type VoiceProps = { id: string; audioId?: string | null; localUri?: string; durationMs: number; mine: boolean };

/**
 * A voice note. Until the first tap it is plain views; the native player (and its status updates)
 * is created only then, so a chat full of voice notes scrolls as lightly as text.
 */
export function VoiceBubble(props: VoiceProps) {
  const [active, setActive] = useState(false);
  if (active) return <ActiveVoice {...props} autoPlay />;
  return <VoiceView {...props} onToggle={() => setActive(true)} playing={false} loading={false} failed={false} pos={0} total={props.durationMs} />;
}

function ActiveVoice({ autoPlay, ...props }: VoiceProps & { autoPlay: boolean }) {
  const { audioId, localUri, durationMs } = props;
  const player = useAudioPlayer(null, { updateInterval: 80 });
  const status = useAudioPlayerStatus(player);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const loaded = useRef(false);

  useEffect(() => () => { if (playing === player) playing = null; }, [player]);
  useEffect(() => {
    if (status.didJustFinish) { player.pause(); void player.seekTo(0); }
  }, [status.didJustFinish, player]);
  useEffect(() => { if (autoPlay) void toggle(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const toggle = async () => {
    if (status.playing) { player.pause(); return; }
    try {
      if (!loaded.current) {
        setLoading(true); setFailed(false);
        const src = localUri ? { uri: localUri } : audioId ? await voiceSource(audioId) : null;
        if (!src) throw new Error('no audio');
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
        player.replace(src);
        loaded.current = true;
      }
      if (playing && playing !== player) playing.pause();
      playing = player;
      player.play();
    } catch { setFailed(true); }
    finally { setLoading(false); }
  };

  return (
    <VoiceView {...props} onToggle={toggle} playing={status.playing} loading={loading || (status.playing && status.isBuffering)} failed={failed}
      pos={status.currentTime * 1000} total={status.duration > 0 ? status.duration * 1000 : durationMs} />
  );
}

function VoiceView({ id, durationMs, mine, onToggle, playing: isPlaying, loading, failed, pos, total }: VoiceProps & {
  onToggle: () => void; playing: boolean; loading: boolean; failed: boolean; pos: number; total: number;
}) {
  const c = useColors();
  const bars = useBars(id);
  const progress = total > 0 ? Math.min(1, pos / total) : 0;
  const fg = mine ? c.primaryForeground : c.foreground;
  const on = mine ? c.accent : c.primary;
  const off = mine ? 'rgba(255,255,255,0.28)' : c.input;

  return (
    <View style={styles.voice}>
      <Press onPress={onToggle} haptic={false} accessibilityLabel={isPlaying ? t('Pause') : t('Play voice message')}
        style={[styles.play, { backgroundColor: mine ? c.accent : c.forest }]}>
        {loading
          ? <ActivityIndicator size="small" color={mine ? c.forest : c.accent} />
          : <Feather name={failed ? 'alert-triangle' : isPlaying ? 'pause' : 'play'} size={18} color={mine ? c.forest : c.accent} style={!isPlaying && !failed ? { marginLeft: 2 } : null} />}
      </Press>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.bars}>
          {bars.map((h, i) => (
            <View key={i} style={{ flex: 1, height: `${Math.round(h * 100)}%`, borderRadius: 2, backgroundColor: i / bars.length < progress ? on : off }} />
          ))}
        </View>
        <Text style={[styles.dur, { color: fg, opacity: 0.8 }]}>
          {failed ? t('Could not play') : isPlaying || pos > 0 ? fmtDuration(pos) : fmtDuration(durationMs)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { position: 'absolute', right: -1, bottom: -1, borderWidth: 2.5 },
  voice: { flexDirection: 'row', alignItems: 'center', gap: 10, width: 230 },
  play: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  bars: { height: 26, flexDirection: 'row', alignItems: 'center', gap: 2 },
  dur: { fontFamily: F.s, fontSize: 11 },
});
