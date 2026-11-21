import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

export interface MapFrameHandle { send: (msg: Record<string, unknown>) => void }
export interface MapFrameProps { html: string; onMessage: (data: string) => void; testID?: string }

/** Native: Leaflet page inside react-native-webview. */
export const MapFrame = forwardRef<MapFrameHandle, MapFrameProps>(function MapFrame({ html, onMessage, testID }, ref) {
  const wv = useRef<WebView>(null);
  useImperativeHandle(ref, () => ({
    send: (msg) => {
      wv.current?.injectJavaScript(`window.__cmd && window.__cmd(${JSON.stringify(msg)}); true;`);
    },
  }), []);
  return (
    <WebView
      ref={wv}
      testID={testID}
      originWhitelist={['*']}
      source={{ html, baseUrl: 'https://agrolink.local/' }}
      onMessage={(e) => onMessage(e.nativeEvent.data)}
      onError={() => onMessage(JSON.stringify({ type: 'error', reason: 'webview', ch: '*' }))}
      javaScriptEnabled
      domStorageEnabled
      setSupportMultipleWindows={false}
      nestedScrollEnabled
      style={StyleSheet.absoluteFill}
      containerStyle={{ backgroundColor: 'transparent' }}
    />
  );
});
