import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { View } from 'react-native';
import type { MapFrameHandle, MapFrameProps } from './MapFrame';

/** Web: Leaflet page inside an iframe (srcDoc), talking over postMessage. */
export const MapFrame = forwardRef<MapFrameHandle, MapFrameProps>(function MapFrame({ html, onMessage, testID }, ref) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const cb = useRef(onMessage);
  cb.current = onMessage;
  const chRef = useRef<string>('');
  const m = /"ch":"([^"]+)"/.exec(html);
  chRef.current = m ? m[1] : '';

  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      if (typeof e.data === 'string') cb.current(e.data);
    };
    window.addEventListener('message', h);
    return () => window.removeEventListener('message', h);
  }, []);

  useImperativeHandle(ref, () => ({
    send: (msg) => {
      frame.current?.contentWindow?.postMessage(JSON.stringify({ ...msg, ch: chRef.current }), '*');
    },
  }), []);

  return (
    <View testID={testID} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <iframe
        ref={frame}
        srcDoc={html}
        title="Field map"
        style={{ border: 0, width: '100%', height: '100%', display: 'block' }}
        onError={() => cb.current(JSON.stringify({ type: 'error', reason: 'iframe', ch: '*' }))}
      />
    </View>
  );
});
