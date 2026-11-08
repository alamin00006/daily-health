import { Image } from 'expo-image';
import { FileText } from 'lucide-react-native';
import { View } from 'react-native';

import { BanglaText } from '@/components/ui/bangla-text';
import { resolveFileUrl } from '@/lib/file-url';
import type { MedicalFileResponse } from '@/shared-contracts/records.contract';
import { colors } from '@/theme/design-tokens';

/** 200px preview of an image file, or a PDF badge. */
export function FileThumbnail({ file, size = 56 }: { file: MedicalFileResponse; size?: number }) {
  if (file.thumbnailUrl) {
    return (
      <Image
        source={{ uri: resolveFileUrl(file.thumbnailUrl), cacheKey: `${file.id}-200` }}
        style={{ width: size, height: size, borderRadius: 14, backgroundColor: colors.primary50 }}
        contentFit="cover"
        transition={120}
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <View
      style={{ width: size, height: size }}
      className="items-center justify-center rounded-[14px] bg-danger-soft">
      <FileText size={24} color={colors.danger} />
      <BanglaText className="font-bangla-semibold text-[10px] leading-[14px] text-danger">
        PDF
      </BanglaText>
    </View>
  );
}
