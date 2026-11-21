import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type MciName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Machine pictograms per rental category (Feather has no excavator or crane). */
const CAT_ICON: Record<string, MciName> = {
  earthmoving: 'excavator', trucks: 'dump-truck', lifting: 'crane', concrete: 'tanker-truck', road: 'road-variant', tools: 'tools',
};

export function CatIcon({ cat, size = 20, color }: { cat?: string; size?: number; color: string }) {
  return <MaterialCommunityIcons name={(cat && CAT_ICON[cat]) || 'hard-hat'} size={size} color={color} />;
}
