// 서버와 주고받는 데이터 타입.
// 기준: Confluence "시스템 아키텍처 설계서 v0.1" 8·9장, "화면설계서 v2.3".
// 백엔드 API 명세서(KAN-23)가 나오면 이름·필드를 거기에 맞춰 고쳐요. 화면은 이 타입만 보고 만들어요.

/** 로봇 상태 (화면설계서 A-01 로봇 상태 카드 + 연결 끊김 예외) */
export type RobotState =
  | 'returning'
  | 'patrolling' // 순찰 중
  | 'picking' // 줍는 중
  | 'toStation' // 분리수거장 이동 중
  | 'emptying' // 비우는 중
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

/** 홈에서 선택한 로봇의 상태. 전압만 받은 경우 배터리 비율은 비워 둬요. */
export type HomeRobotStatus = Omit<RobotStatus, 'battery'> & {
  id: string;
  battery: number | null;
  batteryVoltage: number | null;
};

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

export type ReapplicationSession = Omit<SignUpRequest, 'password'> & {
  reapplicationToken: string;
  expiresIn: number;
  rejectReason: string;
  park: Park | null;
};

export type ReapplyRequest = Omit<SignUpRequest, 'loginId'> & { reapplicationToken: string };

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
  bounds: ParkBounds;
  area: ParkArea;
};

/** GET /park: 신청한 공원과 승인 상태 */
export type ManagedPark = Omit<Park, 'distance'> & {
  catalogId: string;
  status: 'pending' | 'approved' | 'rejected';
  routeSetupDone: boolean;
  rejectReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
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
  catalogId?: string;
  robotId?: string | null;
  defaultStationId?: string | null;
  stations?: { id: string; name: string; position: LatLng }[];
  parkName: string;
  bounds: ParkBounds;
  area: ParkArea;
  station: LatLng | null; // 분리수거장
  points: PatrolPoint[]; // 도는 순서대로
  schedule: PatrolSlot[];
};

export type AssignedRobot = {
  id: string;
  name: string;
  serialNo: string;
  parkId: string | null;
  status: 'idle' | 'working' | 'returning' | 'emptying' | 'offline' | 'error';
  slamX: number | null;
  slamY: number | null;
  lat: number | null;
  lng: number | null;
  batteryVoltage: number | null;
  lastSeenAt: string | null;
  slamYaw?: number | null;
  updatedAt?: string | null;
};

/** 지도 마커 종류 (A-02 지도 범례) */
export type MapMarkerType = 'robot' | 'station' | 'unpickable';

export type MapMarker = {
  id: string;
  type: MapMarkerType;
  label: string;
  position: LatLng;
};

/** 로봇 배정 · 추가 요청 (GET/POST /robot-assignment-requests). 총관리자 웹 W-04에서 보고 배정해요. */
export type RobotRequest = {
  id: string;
  parkName: string;
  robotCount: number; // 요청한 로봇 수
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  rejectReason: string | null;
  createdAt: string; // ISO 시각
};

/** POST /robot-assignment-requests 요청 */
export type RobotRequestInput = { robotCount: number; reason: string };

/** A-02 지도에 그리는 로봇 한 대의 저장된 순찰 경로 */
export type SavedRobotRoute = {
  robotId: string | null; // 로봇 배정 전에 정한 경로는 null
  robotName: string;
  station: LatLng | null; // 분리수거장 (경로의 시작과 끝)
  points: PatrolPoint[]; // 도는 순서대로
  position: LatLng | null; // 로봇이 보낸 마지막 위치
  status?: AssignedRobot['status']; // 로봇 상태 (오류면 지도 위 안내가 바뀌어요)
  errorSince?: string | null; // 오류가 난 시각 (ISO)
  errorCode?: string | null;
  batteryVoltage?: number | null;
};

/** A-02 지도: 로봇이 찾은 쓰레기 한 건 (GET /robots/{id}/detections) */
export type MapDetection = {
  id: string;
  robotName: string;
  material: 'plastic' | 'can' | 'glass' | 'general';
  confidence: number; // 0~1
  position: LatLng;
  detectedAt: string; // ISO
  pickupResult: 'collected' | 'failed' | null; // failed = 집기 불가
  failReason: string | null;
};

/** A-02 지도: 관리자가 저장한 순찰 경로 (GET /robots + GET /route?robotId=) */
export type SavedRouteMap = {
  parkName: string;
  bounds: ParkBounds;
  area: ParkArea;
  stations: { id: string; name: string; position: LatLng }[];
  routes: SavedRobotRoute[];
  /** 최근 7일 탐지 (히트맵 · 집기 불가 마커) */
  detections: MapDetection[];
  updatedAt: string; // ISO 시각 (불러온 시각)
};

/** GET /map/overview: A-02 지도 한 화면에 필요한 것 */
export type MapOverview = {
  parkName: string;
  bounds: ParkBounds; // 공원 범위 (처음에 이 범위가 꽉 차게 보여요)
  area: ParkArea; // 공원 경계
  markers: MapMarker[];
  route: LatLng[]; // 순찰 경로 (처음 지점으로 돌아오는 순서)
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
export type NotificationType =
  | 'robotError'
  | 'unpickable'
  | 'lowBattery'
  | 'patrol' // 순찰을 시작하지 못함 (서버 patrol_missed)
  | 'robotAssignment' // 로봇 배정 요청 승인 · 반려
  | 'dailyReport'
  | 'other'; // 앱이 아직 모르는 서버 알림 종류

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
  body?: string; // 서버 알림 본문 (상세에서 보여요)
  robotId?: string | null;
  position?: LatLng | null; // 알림이 난 위치 (지도 표시용)
  occurredAt?: string; // ISO 시각
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
export type ParkChange = {
  id: string;
  parkId: string;
  userId: string;
  applicantName: string;
  applicantLoginId: string;
  currentCatalogId: string;
  currentParkName: string;
  requestedCatalogId: string;
  requestedParkName: string;
  requestedParkAddress: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  rejectReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
  conflictingManagerName: string | null;
};
