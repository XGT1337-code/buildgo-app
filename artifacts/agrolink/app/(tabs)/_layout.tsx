import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useAppData } from '@/context/AppData';
import { rentalTasks } from '@/lib/rental';
import { t as tr } from '@/lib/i18n';
import { useAppAuth } from '@/lib/auth';
import { getListChatRequestsQueryKey, getListConversationsQueryKey, useListChatRequests, useListConversations } from '@workspace/api-client-react';

type IconName = React.ComponentProps<typeof Feather>['name'];

/** The menu has three items. Equipment and Fields are opened from Home and keep the menu visible. */
const MENU: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Home', icon: 'home' },
  { name: 'messages', title: 'Messages', icon: 'message-circle' },
  { name: 'profile', title: 'Profile', icon: 'user' },
];
const HIDDEN = ['rent', 'fields'];

export default function TabLayout() {
  const colors = useColors();
  const isIOS = Platform.OS === 'ios';
  const { state } = useAppData();
  const { isSignedIn } = useAppAuth();
  // Unread chats + people waiting for an answer; both caches are kept live by the socket.
  const convs = useListConversations({ query: { queryKey: getListConversationsQueryKey(), enabled: !!isSignedIn, staleTime: 30_000 } });
  const reqs = useListChatRequests({ query: { queryKey: getListChatRequestsQueryKey(), enabled: !!isSignedIn, staleTime: 30_000 } });
  const unread = isSignedIn ? (convs.data ?? []).reduce((a, c) => a + c.unread, 0) + (reqs.data?.incoming.length ?? 0) : 0;
  // Rental steps waiting on the user (requests to answer, handovers, returns, condition checks, reviews).
  const todo = rentalTasks(state.listings, state.bookings).filter((t) => t.kind !== 'wait').length;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.forest,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarLabelStyle: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: isIOS ? 'transparent' : colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          ...(Platform.OS === 'web' ? { height: 84 } : {}),
        },
        tabBarBackground: () => (isIOS
          ? <BlurView intensity={100} tint="light" style={StyleSheet.absoluteFill} />
          : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]} />),
      }}
    >
      {MENU.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: tr(t.title),
            tabBarBadge: t.name === 'messages' && unread ? unread : t.name === 'index' && todo ? todo : undefined,
            tabBarBadgeStyle: { backgroundColor: colors.clay, fontFamily: 'Inter_700Bold', fontSize: 10 },
            tabBarIcon: ({ color }) => <Feather name={t.icon} size={24} color={color} />,
          }}
        />
      ))}
      {HIDDEN.map((name) => <Tabs.Screen key={name} name={name} options={{ href: null }} />)}
    </Tabs>
  );
}
