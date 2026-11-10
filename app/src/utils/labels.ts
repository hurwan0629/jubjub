// 서버 값(영문 코드) → 화면에 보여 줄 한국어 이름
import type { NotificationType, Slot } from '@/api/types';

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
};

/** 적재율이 이 값 이상이면 주의 색으로 강조해요 (운영 설정 확장 전까지 고정값) */
export const SLOT_WARN_PERCENT = 80;
