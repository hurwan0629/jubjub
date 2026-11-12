import { Image } from 'expo-image';
import type { ImageSource } from 'expo-image';
import type { StyleProp, ViewStyle } from 'react-native';

type IconProps = {
  /** src/icons.ts 의 아이콘. 예) icons.bot */
  source: ImageSource;
  size?: number;
  width?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
};

/** SVG 아이콘 (assets/icons). 색이 다른 아이콘은 Figma에서 따로 내려받아 icons.ts에 등록해요. */
export function Icon({ source, size, width, height, style }: IconProps) {
  return (
    <Image
      source={source}
      style={[{ width: width ?? size, height: height ?? size }, style as object]}
      contentFit="contain"
    />
  );
}
