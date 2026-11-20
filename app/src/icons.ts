// Figma에서 내려받은 아이콘 (assets/icons)
export const icons = {
  jubjub: require('../assets/icons/jubjub.svg'),
  settings: require('../assets/icons/settings.svg'),
  chevronLeft: require('../assets/icons/chevron-left.svg'),
  check: require('../assets/icons/check.svg'),
  unreadDot: require('../assets/icons/unread-dot.svg'),
  timeline: require('../assets/icons/timeline.svg'),
  timelineDot: require('../assets/icons/timeline-dot.svg'), // 판단 로그 시간 흐름 점 (10px)

  // 홈
  bot: require('../assets/icons/bot.svg'),
  hand: require('../assets/icons/hand.svg'),
  triangleAlert: require('../assets/icons/triangle-alert.svg'),
  recycle: require('../assets/icons/recycle.svg'),
  route: require('../assets/icons/route.svg'),
  batteryCharging: require('../assets/icons/battery-charging.svg'),

  // 지도
  parkMap: require('../assets/icons/park-map.svg'),
  markerBot: require('../assets/icons/marker-bot.svg'),
  markerHand: require('../assets/icons/marker-hand.svg'),
  markerRecycle: require('../assets/icons/marker-recycle.svg'),
  legendBot: require('../assets/icons/legend-bot.svg'),
  legendHand: require('../assets/icons/legend-hand.svg'),
  legendRecycle: require('../assets/icons/legend-recycle.svg'),
  radio: require('../assets/icons/radio.svg'),
  locateFixed: require('../assets/icons/locate-fixed.svg'),
  plus: require('../assets/icons/plus.svg'),
  minus: require('../assets/icons/minus.svg'),

  // 알림
  pin: require('../assets/icons/pin.svg'),
  alertTriangleRed: require('../assets/icons/alert-triangle-red.svg'),
  chartBrand: require('../assets/icons/chart-brand.svg'),
  alertParkChange: require('../assets/icons/alert-park-change.svg'), // 36px 주황 받침 포함
  bellEmpty: require('../assets/icons/bell-empty.svg'),
  checkEmpty: require('../assets/icons/check-empty.svg'),
  camera: require('../assets/icons/camera.svg'),
  mapPinSub: require('../assets/icons/map-pin-sub.svg'), // 회색 위치 핀 (알림 상세)
  arrowRight: require('../assets/icons/arrow-right.svg'),
  walkwayA: require('../assets/icons/walkway-a.svg'), // 미니 지도 산책로 (95 × 10)
  walkwayB: require('../assets/icons/walkway-b.svg'), // 미니 지도 산책로 (106 × 10)

  // 보고
  datePrev: require('../assets/icons/date-prev.svg'),
  dateNext: require('../assets/icons/date-next.svg'),
  reportHand: require('../assets/icons/report-hand.svg'),
  reportAlert: require('../assets/icons/report-alert.svg'),
  reportRoute: require('../assets/icons/report-route.svg'),
  buttonRoute: require('../assets/icons/button-route.svg'),

  // 시작화면
  jubjubSplash: require('../assets/icons/jubjub-splash.svg'),

  // 로그인 · 회원가입
  jubjubOnBrand: require('../assets/icons/jubjub-on-brand.svg'),
  userRound: require('../assets/icons/user-round.svg'),
  lockKeyhole: require('../assets/icons/lock-keyhole.svg'),
  eye: require('../assets/icons/eye.svg'),
  eyeOff: require('../assets/icons/eye-off.svg'),
  circleHelp: require('../assets/icons/circle-help.svg'),
  atSign: require('../assets/icons/at-sign.svg'),
  mailInput: require('../assets/icons/mail-input.svg'),
  mailWhite: require('../assets/icons/mail-white.svg'),
  kakao: require('../assets/icons/kakao.svg'),
  google: require('../assets/icons/google.svg'),
  checkDone: require('../assets/icons/check-done.svg'),

  // 순찰 경로 처음 설정 (C-03)
  parkMapBase: require('../assets/icons/park-map-base.svg'), // 순찰 경로 점선이 없는 지도
  search: require('../assets/icons/search.svg'),
  searchSmall: require('../assets/icons/search-small.svg'),
  mousePointer: require('../assets/icons/mouse-pointer.svg'),
  mapPin: require('../assets/icons/map-pin.svg'),
  mapPinWhite: require('../assets/icons/map-pin-white.svg'),
  xCircle: require('../assets/icons/x-circle.svg'),
  checkBrand: require('../assets/icons/check-brand.svg'),
  grip: require('../assets/icons/grip.svg'),
  circleMinus: require('../assets/icons/circle-minus.svg'),
  pencil: require('../assets/icons/pencil.svg'),
  checkWhiteLg: require('../assets/icons/check-white-lg.svg'),

  // 설정 (C-02)
  profileUser: require('../assets/icons/profile-user.svg'),
  chevronRight: require('../assets/icons/chevron-right.svg'),
  lockSmall: require('../assets/icons/lock-small.svg'),
  toggleKnob: require('../assets/icons/toggle-knob.svg'),

  // 홈 순찰 멈추기 · 로봇 목록 (Page 5)
  botOnYellow: require('../assets/icons/bot-on-yellow.svg'), // 파란 로봇 카드의 노란 받침 위
  botGray: require('../assets/icons/bot-gray.svg'), // 로봇 배정 전 카드
  batteryChargingLg: require('../assets/icons/battery-charging-lg.svg'), // 22px (로봇 목록)
  play: require('../assets/icons/play.svg'),
  radioOn: require('../assets/icons/radio-on.svg'),
  radioOff: require('../assets/icons/radio-off.svg'),
  radioDisabled: require('../assets/icons/radio-disabled.svg'),
  editButton: require('../assets/icons/edit-button.svg'), // 28px 원 안 연필 (로봇 이름 수정)
  toastDone: require('../assets/icons/toast-done.svg'), // 토스트 완료 표시 (초록 원)

  // 알림 상세 일러스트 (A-06)
  artRobotError: require('../assets/images/robot-error.png'),
  artRobotBattery: require('../assets/images/robot-battery.png'),

  // 하단 탭
  tab: {
    home: { on: require('../assets/icons/tab-house-on.svg'), off: require('../assets/icons/tab-house-off.svg') },
    map: { on: require('../assets/icons/tab-map-on.svg'), off: require('../assets/icons/tab-map-off.svg') },
    alerts: { on: require('../assets/icons/tab-bell-on.svg'), off: require('../assets/icons/tab-bell-off.svg') },
    report: { on: require('../assets/icons/tab-chart-on.svg'), off: require('../assets/icons/tab-chart-off.svg') },
  },
};
