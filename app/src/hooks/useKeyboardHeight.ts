import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * 지금 올라와 있는 키보드 높이(없으면 0).
 * 안드로이드(화면 끝까지 그리는 edge-to-edge)와 모달 안에서는 KeyboardAvoidingView가 동작하지 않아서,
 * 키보드 높이만큼 직접 띄워 올릴 때 써요.
 */
export function useKeyboardHeight() {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    // iOS는 키보드가 올라오기 시작할 때, 안드로이드는 다 올라온 뒤에만 알려 줘요
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}
