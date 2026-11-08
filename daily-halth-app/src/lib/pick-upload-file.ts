import * as DocumentPicker from 'expo-document-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Linking } from 'react-native';

import type { UploadFile } from '@/api/http-client';

/** CLAUDE.md §2: resize uploads to 1600px at ~0.7 quality before sending (slow networks). */
const MAX_SIDE = 1600;
const QUALITY = 0.7;

function permissionDenied(what: string) {
  Alert.alert(
    `${what} ব্যবহারের অনুমতি নেই`,
    `ফোনের সেটিংসে গিয়ে দৈনিক স্বাস্থ্যকে ${what} ব্যবহারের অনুমতি দিন।`,
    [
      { text: 'পরে', style: 'cancel' },
      { text: 'সেটিংস খুলুন', onPress: () => void Linking.openSettings() },
    ]
  );
}

async function compress(asset: {
  uri: string;
  width: number;
  height: number;
}): Promise<UploadFile> {
  const context = ImageManipulator.manipulate(asset.uri);
  const longest = Math.max(asset.width, asset.height);
  if (longest > MAX_SIDE) {
    context.resize(asset.width >= asset.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: QUALITY, format: SaveFormat.JPEG });
  return { uri: saved.uri, name: `photo-${Date.now()}.jpg`, type: 'image/jpeg' };
}

/** A photo from the camera or the gallery, resized and compressed. null if cancelled. */
export async function pickPhoto(
  source: 'camera' | 'library',
  square = false
): Promise<UploadFile | null> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    permissionDenied(source === 'camera' ? 'ক্যামেরা' : 'ছবি');
    return null;
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: square,
    aspect: square ? [1, 1] : undefined,
    quality: 1,
    exif: false,
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  return compress(asset);
}

/** A PDF (or an image file) from the phone's files. null if cancelled. */
export async function pickDocument(): Promise<UploadFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  const type = asset.mimeType ?? 'application/pdf';
  if (type.startsWith('image/') && asset.uri) {
    // Same compression as photos; size is unknown here, so read it via the manipulator.
    const rendered = await ImageManipulator.manipulate(asset.uri).renderAsync();
    return compress({ uri: asset.uri, width: rendered.width, height: rendered.height });
  }
  return { uri: asset.uri, name: asset.name || 'document.pdf', type };
}

/** Asks "camera or gallery?" with the native sheet. */
export function choosePhotoSource(
  onPick: (source: 'camera' | 'library') => void,
  extra?: { label: string; onPress: () => void }
) {
  Alert.alert('ছবি যোগ করুন', undefined, [
    { text: 'ক্যামেরা দিয়ে তুলুন', onPress: () => onPick('camera') },
    { text: 'গ্যালারি থেকে নিন', onPress: () => onPick('library') },
    ...(extra ? [{ text: extra.label, onPress: extra.onPress }] : []),
    { text: 'বাতিল', style: 'cancel' as const },
  ]);
}
