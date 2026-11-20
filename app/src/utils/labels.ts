// 서버 값(영문 코드) → 화면에 보여 줄 한국어 이름
import type { DecisionType, NotificationType, Slot } from '@/api/types';

export const SLOT_LABEL: Record<Slot, string> = {
  pet: '페트',
  can: '캔',
  paper: '종이',
  general: '일반',
};

export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  robotError: '로봇 오류',
  unpickable: '집기 불가',
  lowBattery: '배터리 부족',
  dailyReport: '보고',
  parkChange: '공원 변경',
};

/** 알림 목록 필터 칩 순서 (Figma A-05). 공원 변경은 칩 없이 "전체"에서만 보여요. */
export const NOTIFICATION_FILTERS: NotificationType[] = ['robotError', 'unpickable', 'lowBattery', 'dailyReport'];

/** 적재율이 이 값 이상이면 주의 색으로 강조해요 (운영 설정 확장 전까지 고정값) */
export const SLOT_WARN_PERCENT = 80;

/** 판단 로그 필터 칩 (Figma A-08 "판단 필터") */
export const DECISION_TYPE_LABEL: Record<DecisionType, string> = {
  plan: '계획',
  recapture: '재촬영',
  pick: '줍기',
  store: '칸 투입',
  empty: '분리수거장 비우기',
  notify: '알림',
  route: '경로 변경',
  teleop: '원격 조종',
  report: '보고',
};

/** '남문 분리수거장' → '남문' (지도 이름표는 짧게) */
export const shortStationName = (name: string) => name.replace(/\s*분리수거장$/, '') || name;
