import { Redirect } from 'expo-router';

/** Community was removed. Old links land on Fields; saved local data is left untouched. */
export default function CommunityRedirect() {
  return <Redirect href="/fields" />;
}
