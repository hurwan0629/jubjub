import type { ImageSource } from 'expo-image';

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
  | 'idle' // 대기 (분리수거장에서 다음 순찰을 기다려요)
  | 'paused' // 멈춤 (관리자가 순찰을 멈췄어요)
  | 'returning' // 순찰을 끝내고 분리수거장으로 돌아가는 중
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

/** GET /robots 의 로봇 상태 (서버가 알 수 있는 값만) */
export type ManagedRobotState = Extract<
  RobotState,
  'patrolling' | 'paused' | 'returning' | 'idle' | 'charging' | 'error' | 'disconnected'
>;

/** GET /robots : 내 공원에 배정된 로봇 (A-01 홈 로봇 칩 · A-13 로봇 목록) */
export type ManagedRobot = {
  id: string;
  name: string; // 10자 이내 · 공원 안에서 겹치지 않아요
  state: ManagedRobotState;
  battery: number | null; // 0~100. 로봇이 아직 보고하지 않았으면 null
  nearPoint: string | null; // 가까운 순찰 지점 이름
  nextPoint: string | null; // 다음 순찰 지점 이름
  remainingPoints: number | null; // 이번 순찰에서 남은 지점 수
  pausedAt: string | null; // 멈춘 시각 (ISO)
  nextPatrolAt: string | null; // 다음 순찰 시각 'HH:mm'
  routePointCount: number; // 순찰 지점 수
  patrolsPerDay: number; // 오늘 순찰 횟수
  todayPickups: number; // 오늘 수거 개수
};

/** POST /robots/{id}/pause : stay 그 자리에서 멈추기 · return 이번 순찰 끝내고 돌아가기 */
export type PauseMode = 'stay' | 'return';

/** 로봇 배정 · 추가 요청 (A-01 · A-13) */
export type RobotRequestStatus = 'pending' | 'approved' | 'rejected' | 'canceled';

export type RobotRequest = {
  id: string;
  count: number; // 1~5대
  memo: string | null;
  status: RobotRequestStatus;
  createdAt: string; // ISO
};

/** POST /robot-requests 요청 */
export type RobotRequestInput = { count: number; memo?: string };

/** POST /auth/register 요청 (server/AUTH.md). 비밀번호 확인 · 개인정보 동의는 앱에서만 확인하고 보내지 않아요. */
export type SignUpRequest = {
  loginId: string; // 영문 · 숫자 4~16자 (대소문자 구분)
  password: string; // 영문 · 숫자 포함 8~128자
  name: string; // 1~100자
  phone: string; // 숫자만 ('01012345678'). 서버도 하이픈 · 공백을 지워요
  email: string; // 서버가 소문자로 저장해요
  catalogId: string; // 회원가입 신청과 함께 지정할 담당 공원 ID
};

/** POST /auth/register 응답 (201). 비밀번호는 돌려주지 않아요 */
export type SignUpResponse = { id: string; name: string; email: string; registrationStatus: 'pending' };

/** POST /auth/login 요청 */
export type LoginRequest = { loginId: string; password: string };

/** POST /auth/login 응답 */
export type LoginResponse = {
  accessToken: string; // 다음 요청부터 Authorization: Bearer 로 붙여요
  tokenType: 'bearer';
  expiresIn: number; // 초 (기본 3600). 만료되면 다시 로그인해요
  /** 순찰 경로 처음 설정(C-03)을 아직 안 끝냈으면 true → C-03, 아니면 A-01 홈 */
  isFirstLogin: boolean;
  role: 'manager' | 'super_admin';
  parkStatus: 'pending' | 'approved' | 'rejected' | null;
  registrationStatus: 'pending' | 'approved' | 'rejected' | null;
  routeSetupDone: boolean;
};

/** 위도 · 경도 (WGS84) */
export type LatLng = { latitude: number; longitude: number };

/** 공원 범위 (남서쪽 · 북동쪽 모서리). 지도는 이 사각형 안에서만 움직여요. */
export type ParkBounds = { southWest: LatLng; northEast: LatLng };

/**
 * 공원 경계 (다각형). 사각형 범위 안에도 도로 · 아파트 같은 공원 아닌 곳이 있어서,
 * 꾹 눌러 위치를 정할 때는 이 경계 안인지 봐요.
 * 여의도한강공원처럼 섬을 둘러싼 띠 모양 공원은 바깥 경계(outer) 안에서 구멍(holes: 섬 안쪽 도시)을 뺀 곳이 공원이에요.
 */
export type ParkArea = {
  outer: LatLng[];
  holes?: LatLng[][];
};

/** GET /parks?query= : 공원 검색 결과 (C-03 공원 찾기) */
export type Park = {
  id: string;
  name: string;
  address: string;
  distance: string; // 표시용 거리 ('2.1km')
  hasManager?: boolean; // 이미 승인된 담당 관리자가 있으면 true (공원 변경 요청에서 고를 수 없어요)
  bounds: ParkBounds;
  area: ParkArea;
};

/** GET /park: 신청한 공원과 승인 상태 */
export type ManagedPark = Omit<Park, 'distance'> & {
  catalogId: string;
  status: 'pending' | 'approved' | 'rejected';
  routeSetupDone: boolean;
  rejectReason: string | null;
};

/** 순찰 지점 (C-03 처음 설정 · A-04 경로 편집) */
export type PatrolPoint = {
  id: string;
  name: string; // 알림 · 기록에 쓰는 장소 이름
  position: LatLng;
};

/** 순찰 시간 반복 */
export type ScheduleRepeat = 'daily' | 'weekdays' | 'weekends';

/** 순찰 시간표 항목 */
export type PatrolSlot = {
  id: string;
  time: string; // 'HH:mm'
  label: string; // 예: 점심 시간 순찰
  on: boolean;
  repeat: ScheduleRepeat;
};

/** GET · PUT /route : 지금 쓰는 순찰 경로 (A-04 경로 편집) */
export type RouteConfig = {
  parkName: string;
  bounds: ParkBounds;
  area: ParkArea;
  station: LatLng | null; // 분리수거장
  points: PatrolPoint[]; // 도는 순서대로
  schedule: PatrolSlot[];
};

/** 지도 마커 종류 (A-02 지도 범례) */
export type MapMarkerType = 'robot' | 'station' | 'unpickable';

export type MapMarker = {
  id: string;
  type: MapMarkerType;
  label: string;
  position: LatLng;
  /** 집기 불가 마커를 누르면 보이는 지점 상세 (A-03) */
  detail?: {
    place: string; // 순찰 지점 이름 (예: 벤치 쉼터)
    material: string; // 판단한 재질 (예: 유리)
    confidence: number; // 확신도 0~100
    lastSeen: string; // 마지막 촬영 'HH:mm'
    photoUrl: string | null;
    notificationId: string | null; // 연결된 알림 (알림 보기)
  };
};

/** GET /map/overview: A-02 지도 한 화면에 필요한 것 */
export type MapOverview = {
  parkName: string;
  bounds: ParkBounds; // 공원 범위 (처음에 이 범위가 꽉 차게 보여요)
  area: ParkArea; // 공원 경계
  markers: MapMarker[];
  route: LatLng[]; // 순찰 경로 (처음 지점으로 돌아오는 순서)
  heat: { position: LatLng; weight: number }[]; // 최근 7일 쓰레기가 나온 자리 (weight 0~1)
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
export type NotificationType = 'robotError' | 'unpickable' | 'lowBattery' | 'dailyReport' | 'parkChange';

/** GET /me: 로그인한 관리자 (C-02 설정 계정 카드) */
export type Profile = {
  name: string;
  email: string;
  role: LoginResponse['role'];
  parkStatus: LoginResponse['parkStatus'];
  registrationStatus: LoginResponse['registrationStatus'];
  routeSetupDone: boolean;
};

/**
 * GET /settings/notifications: 유형별 알림 받기 (C-02 설정)
 * 로봇 오류는 안전을 위해 항상 받아서 끌 수 없어요.
 */
export type NotificationSettings = {
  unpickable: boolean;
  dailyReport: boolean;
};

/** C-02 공원 변경 요청 (총관리자가 승인하면 공원과 로봇이 같이 옮겨 가요) */
export type ParkChangeRequest = {
  id: string;
  fromPark: string; // 지금 공원 이름
  toPark: string; // 요청한 공원 이름
  toCatalogId: string;
  memo: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'canceled';
  createdAt: string; // ISO
};

/** GET /stations : 분리수거장 (C-02 분리수거장 관리). 공원마다 여러 곳일 수 있어요. */
export type Station = {
  id: string;
  name: string; // 20자 이내 (예: 남문 분리수거장)
  position: LatLng;
  primary: boolean; // 경로가 기준으로 삼는 기본 분리수거장
  robots: { id: string; name: string }[]; // 이 분리수거장을 비우러 가는 로봇
};

/** GET · PUT /settings/operation : A-12 운영 설정 */
export type OperationSettings = {
  chargeAt: number; // 이 배터리(%) 아래면 충전하러 가요
  emptyAt: number; // 칸 적재율(%)이 이 이상이면 분리수거장에 가요
  agentPaused: boolean; // 에이전트 일시 정지 (켜면 로봇이 대기 상태로 멈춰요)
};

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
  note?: string | null; // 다음 행동 안내 (예: 현장 확인이 필요해요)
  pinned?: boolean; // 로봇 오류처럼 맨 위에 고정
};

/** 로봇 재확인 진행 (A-06 집기 불가: 재확인 요청 · 그대로 있음 · 치워짐) */
export type RecheckState = {
  status: 'requested' | 'stillThere' | 'cleared';
  queuePosition: number | null; // 대기열 몇 번째
  eta: string | null; // 예정 시각 'HH:mm'
  checkedAt: string | null; // 재확인한 시각 'HH:mm'
  photoUrl: string | null; // 재확인 사진
};

/** GET /notifications/{id} : 알림 상세 (A-06). 유형마다 채워지는 묶음이 달라요. */
export type NotificationDetailResponse = AppNotification & {
  happenedAt: string; // 표시용 '오늘 09:50'
  photoUrl: string | null; // 로봇이 찍은 사진 (서버 경로)
  /** 집기 불가: 판단한 재질 · 확신도 */
  detection: { label: string; confidence: number } | null;
  recheck: RecheckState | null;
  /** 로봇 오류 · 배터리 부족 */
  robotIssue: {
    kind: string; // 오류 종류 (뒤집힘 · 고립 …)
    since: string; // 'HH:mm'
    lastPlace: string; // 마지막 위치 이름
    battery: number | null;
    chargerDistanceM: number | null; // 충전 위치까지 거리
  } | null;
  /** 공원 변경 반려 · 승인 */
  parkChange: {
    result: 'approved' | 'rejected';
    requestedOn: string; // '11월 17일'
    currentPark: string;
    requestedPark: string;
    reasonKind: string | null; // 반려 사유 종류
    reason: string | null;
    robotNames: string; // 'Jubi' · 'Jubi 1 · Jubi 2'
  } | null;
};

/** 앱에서 쓰는 알림 상세. 사진은 화면에 바로 넣을 수 있는 이미지 소스로 바꿔 둬요. */
export type NotificationDetail = Omit<NotificationDetailResponse, 'photoUrl' | 'recheck'> & {
  photo: ImageSource | null;
  recheck: (Omit<RecheckState, 'photoUrl'> & { photo: ImageSource | null }) | null;
};

/** 판단 로그 유형 (A-08 필터) */
export type DecisionType = 'plan' | 'recapture' | 'pick' | 'store' | 'empty' | 'notify' | 'route' | 'teleop' | 'report';

/** GET /logs : 판단 로그 목록 항목 (A-08 · 홈 "에이전트가 방금 한 일") */
export type Decision = {
  id: string;
  type: DecisionType;
  time: string; // 'HH:mm'
  title: string;
  summary: string; // 목록 한 줄 (예: 페트(확신도 98%))
  details: string[]; // 홈 카드에 쓰는 두 줄 설명
  photoUrl?: string | null; // 사진 있는 판단 (목록에 크게 보여요)
};

/** GET /logs?date=&order= 의 정렬 */
export type DecisionOrder = 'desc' | 'asc';

/** GET /logs/{id} : 판단 로그 상세 (A-09). 판단 종류마다 채워지는 묶음이 달라요. */
export type DecisionDetailResponse = Decision & {
  happenedAt: string; // '오늘 10:20'
  heading: string | null; // 상세 제목 (없으면 목록 제목을 써요. 예: 각도를 바꿔 다시 촬영했어요)
  tag: string | null; // 사진 아래 상태 태그 (예: 줍기 완료)
  kicker: { text: string; tone: 'brand' | 'warn' } | null; // 제목 위 작은 줄 (예: 재촬영 · 오늘 10:15)
  headline: { text: string; tone: 'brand' | 'body' } | null; // 제목 아래 줄 (예: 페트 · 확신도 98%)
  photoSlot: boolean; // 사진 자리를 보여 줄지 (사진이 없으면 빈 자리)
  shots: { photoUrl: string | null; caption: string; highlight: boolean }[]; // 재촬영 전후 사진
  facts: { label: string; value: string }[]; // "이렇게 판단했어요" 표
  reason: string | null; // "이렇게 판단했어요" 설명 상자
  boxes: { title: string; body: string }[]; // 옅은 파랑 정보 상자 (바꾼 주체 · 적용 시점)
  cards: { title: string; lines: string[]; emphasis: string | null }[]; // 흰 정보 카드
  footer: string | null; // 맨 아래 굵은 한 줄 (예: 담은 칸 · 담지 못했어요)
};

export type DecisionDetail = Omit<DecisionDetailResponse, 'photoUrl' | 'shots'> & {
  photo: ImageSource | null;
  shots: { photo: ImageSource | null; caption: string; highlight: boolean }[];
};

/** GET /reports?from=&to= : 기간 보고 (A-10 오늘 · 이번 주 · 이번 달 · 직접 선택) */
export type PeriodReport = {
  from: string; // 'YYYY-MM-DD' (포함)
  to: string; // 'YYYY-MM-DD' (포함)
  pickups: number; // 수거 개수
  changePercent: number | null; // 바로 앞 같은 길이 기간보다 몇 % 늘었는지 (줄면 음수, 비교할 기록이 없으면 null)
  pickSuccessRate: number | null; // 집기 성공률 0~100 (시도가 없으면 null)
  patrols: number;
  stationVisits: number;
  byMaterial: { slot: Slot; count: number }[];
  byPoint: { name: string; percent: number }[]; // 순찰 지점별 수거 비율 (큰 순서)
  unresolved: { kind: 'unpickable' | 'robotError' | 'missedPoint'; title: string; body: string }[];
};
