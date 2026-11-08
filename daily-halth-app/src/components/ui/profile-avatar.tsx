import { Image } from 'expo-image';
import { View } from 'react-native';

import { BanglaText } from './bangla-text';

import { resolveFileUrl } from '@/lib/file-url';
import { colors } from '@/theme/design-tokens';

const SIZES = {
  sm: { px: 40, text: 'text-[15px] leading-[22px]' },
  md: { px: 48, text: 'text-[18px] leading-[26px]' },
  lg: { px: 72, text: 'text-[26px] leading-[36px]' },
} as const;

interface ProfileAvatarProps {
  name: string;
  /** Signed photo URL (avatarThumbnailUrl for small sizes). */
  photoUrl?: string | null;
  size?: keyof typeof SIZES;
  /** Light ring, for avatars on a coloured background. */
  ringed?: boolean;
}

/** The person's photo, or the first letter of their name on a teal circle. */
export function ProfileAvatar({ name, photoUrl, size = 'md', ringed = false }: ProfileAvatarProps) {
  const { px, text } = SIZES[size];
  const box = {
    width: px,
    height: px,
    borderRadius: px / 2,
    borderWidth: ringed ? 2 : 0,
    borderColor: 'rgba(255,255,255,0.8)',
  };
  if (photoUrl) {
    return (
      <Image
        // Signed URLs change on every fetch: cache by the path, not the query string.
        source={{ uri: resolveFileUrl(photoUrl), cacheKey: photoUrl.split('?')[0] }}
        style={{ ...box, backgroundColor: colors.primary100 }}
        contentFit="cover"
        transition={150}
        accessibilityLabel={`${name}-এর ছবি`}
        recyclingKey={photoUrl.split('?')[0]}
      />
    );
  }
  const initial = [...name.trim()][0] ?? '?';
  return (
    <View
      style={box}
      className="items-center justify-center bg-primary-100"
      accessibilityLabel={name}>
      <BanglaText className={`font-bangla-bold text-primary ${text}`}>{initial}</BanglaText>
    </View>
  );
}
