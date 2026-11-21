import { Redirect } from 'expo-router';

/** Old Community post links. The feature was removed; local data is not deleted. */
export default function PostRedirect() {
  return <Redirect href="/fields" />;
}
