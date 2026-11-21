import React from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { ProfileForm } from '@/components/ProfileForm';

export default function ProfileEdit() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <KeyboardAwareScrollViewCompat style={{ flex: 1, backgroundColor: c.background }} keyboardShouldPersistTaps="handled" bottomOffset={40}
      contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 40 }}>
      <ProfileForm cta="Save profile" onDone={() => router.back()} />
    </KeyboardAwareScrollViewCompat>
  );
}
