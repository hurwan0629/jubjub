import type { ReactNode, Ref } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import type { LatLng, ParkArea, ParkBounds } from '@/api/types';

/** 지도에 그리는 점 종류. 순찰 지점(point)은 순서 번호를 같이 보여 줘요. */
export type ParkMapMarkerKind = 'robot' | 'station' | 'unpickable' | 'point';

export type ParkMapMarker = {
  id: string;
  kind: ParkMapMarkerKind;
  position: LatLng;
  /** 이름 (네이버 지도 캡션, 도식 지도 이름표) */
  label?: string;
  /** 도식 지도에서도 이름표를 보여 줄지 (예: 분리수거장 위치 정하기) */
  showLabel?: boolean;
  /** 순찰 지점 번호 (kind가 point일 때) */
  order?: number;
};

/** 지도 조작 버튼(공원 가운데로 · 확대 · 축소)이 부르는 동작 */
export type ParkMapHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  /** 공원 범위가 꽉 차게 다시 보여 줘요 */
  recenter: () => void;
};

export type ParkMapProps = {
  /** 공원 범위(사각형). 지도는 이 밖으로 나가지 않아요. */
  bounds: ParkBounds;
  /**
   * 공원 경계(다각형). 있으면 지도에 경계를 그리고, 꾹 눌렀을 때 이 경계 안일 때만 onLongPress를 불러요.
   * 없으면 사각형 범위 전체를 공원으로 봐요.
   */
  area?: ParkArea;
  markers?: ParkMapMarker[];
  /** 점선으로 그릴 순찰 경로 (처음 지점으로 돌아오려면 마지막에 처음 좌표를 한 번 더 넣어요) */
  route?: LatLng[];
  /** 공원 안을 꾹 눌렀을 때 그 좌표 */
  onLongPress?: (position: LatLng) => void;
  /** 공원 밖(경계 밖의 도로 · 건물 등)을 꾹 눌렀을 때 (안내 문구를 보여 줄 때 써요) */
  onLongPressOutside?: (position: LatLng) => void;
  onMarkerPress?: (id: string) => void;
  /** 아직 공원을 고르지 않았을 때처럼 지도를 흐리게 */
  faded?: boolean;
  /** 지도 위에 겹쳐 그릴 것 (안내 칩 등). 지도 조작을 막지 않아요. */
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  ref?: Ref<ParkMapHandle>;
};
