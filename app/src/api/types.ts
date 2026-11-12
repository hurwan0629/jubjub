// 서버와 주고받는 데이터 타입.
// 기준: Confluence "시스템 아키텍처 설계서 v0.1" 8·9장, "화면설계서 v2.3".
// 백엔드 API 명세서(KAN-23)가 나오면 이름·필드를 거기에 맞춰 고쳐요. 화면은 이 타입만 보고 만들어요.

/** 로봇 상태 (화면설계서 A-01 로봇 상태 카드 + 연결 끊김 예외) */
export type RobotState =
  | 'patrolling' // 순찰 중
  | 'picking' // 줍는 중
  | 'toStation' // 분리수거장 이동 중
  | 'emptying' // 비우는 중
  | 'charging' // 충전 중
  | 'idle' // 대기
  | 'teleop' // 원격 조종 중 (확장)
  | 'error' // 오류 (뒤집힘·고립 등)
  | 'disconnected'; // 연결 끊김

/** 적재함 안 재질별 칸 */
export type Slot = 'pet' | 'can' | 'paper' | 'general';

export type SlotFill = {
  slot: Slot;
  percent: number; // 적재율 0~100
  count: number; // 담은 개수
};

/** GET /robot/status */
export type RobotStatus = {
  name: string; // 로봇 이름 (예: Jubi)
  state: RobotState;
  activity: string; // 지금 하는 일 한 줄
  nearPoint: string; // 가까운 순찰 지점 이름
  nextPoint: string; // 다음 지점 이름
  battery: number; // 0~100
  slots: SlotFill[];
  updatedAt: string; // ISO 시각
};

/** GET /tasks/queue 의 항목 */
export type TaskType = 'empty' | 'patrol' | 'charge' | 'recheck' | 'visit' | 'recover';

export type Task = {
  id: string;
  type: TaskType;
  label: string;
  eta: string; // 예상 시각 'HH:mm'
};

/** 오늘 요약 (A-01) */
export type TodaySummary = {
  pickups: number; // 로봇 수거 개수
  stationVisits: number; // 분리수거장 비운 횟수
  patrolsDone: number;
  patrolsPlanned: number;
};

/** 알림 유형 (핵심 범위. 수거함 가득 참은 확장 구현 때 추가) */
export type NotificationType = 'robotError' | 'unpickable' | 'lowBattery' | 'dailyReport';

/** 새로(안 읽음) → 확인 → 처리 완료 */
export type NotificationStatus = 'new' | 'acked' | 'resolved';

/** GET /notifications */
export type AppNotification = {
  id: string;
  type: NotificationType;
  status: NotificationStatus;
  title: string;
  place: string; // 순찰 지점 이름 또는 짧은 설명
  time: string; // 표시용 시각 ('11:02', '어제 22:00')
  note?: string; // 다음 행동 안내 (예: 현장 확인이 필요해요)
  pinned?: boolean; // 로봇 오류처럼 맨 위에 고정
};

/** 판단 로그 유형 (A-08 필터) */
export type DecisionType = 'plan' | 'recapture' | 'pick' | 'store' | 'empty' | 'notify' | 'route' | 'teleop' | 'report';

/** GET /logs */
export type Decision = {
  id: string;
  type: DecisionType;
  time: string; // 'HH:mm'
  title: string;
  details: string[];
};

/** GET /reports/{date} */
export type DailyReport = {
  date: string; // 'YYYY-MM-DD'
  summary: string;
  pickups: number;
  pickSuccessRate: number; // 0~100
  patrols: number;
  stationVisits: number;
  byMaterial: { slot: Slot; count: number }[];
  hourly: { range: string; count: number }[];
  unresolved: { kind: 'unpickable' | 'robotError' | 'missedPoint'; title: string; body: string }[];
};
