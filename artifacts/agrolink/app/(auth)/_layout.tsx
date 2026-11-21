import React, { useState } from 'react';
import { Redirect, Stack } from 'expo-router';
import { useAppAuth } from '@/lib/auth';

export default function AuthLayout() {
  const { isSignedIn } = useAppAuth();
  // Only someone already signed in when opening these screens is sent to Profile; a fresh sign-in navigates by itself.
  const [signedInOnArrival] = useState(isSignedIn);
  if (isSignedIn && signedInOnArrival) return <Redirect href="/profile" />;
  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}
