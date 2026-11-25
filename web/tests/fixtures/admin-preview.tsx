// Local visual QA only. This entry is excluded from the production build.
import { createRoot } from 'react-dom/client';
import { AdminPage } from '../../src/components/AdminPage';
import '../../src/styles.css';
import '@fontsource-variable/inter';
import '@fontsource-variable/noto-sans-kr';
import '@fontsource/fredoka/700.css';

const registrations = Array.from({ length: 23 }, (_, i) => ({
  id: `park-${i}`,
  catalogId: `catalog-${i}`,
  userId: `user-${i}`,
  name: `테스트 공원 ${i + 1}`,
  applicantName: `관리자 ${i + 1}`,
  applicantLoginId: `manager${i + 1}`,
  applicantEmail: `manager${i + 1}@example.com`,
  applicantPhone: '01012345678',
  registrationStatus: ['approved', 'pending', 'rejected'][i % 3],
  status: 'approved',
  routeSetupDone: true,
  rejectReason: null,
  createdAt: '2026-11-18T00:00:00Z',
}));
const robots = registrations.map((r, i) => ({
  id: `robot-${i}`,
  name: `Jubi ${i + 1}`,
  serialNo: `JUBI-${String(i + 1).padStart(3, '0')}`,
  parkId: i === 22 ? null : r.id,
  parkName: r.name,
  managerName: r.applicantName,
  managerLoginId: r.applicantLoginId,
  status: ['idle', 'working', 'offline'][i % 3],
  batteryVoltage: 24.3,
  lastSeenAt: '2026-11-18T01:00:00Z',
}));
const parks = registrations
  .filter((r) => r.registrationStatus === 'approved')
  .map((r) => ({
    ...r,
    address: '서울특별시 테스트로 123',
    managerName: r.applicantName,
    managerLoginId: r.applicantLoginId,
    robotCount: 1,
  }));
const changes = registrations.map((r, i) => ({
  id: `change-${i}`,
  parkId: r.id,
  userId: r.userId,
  applicantName: r.applicantName,
  applicantLoginId: r.applicantLoginId,
  currentParkName: r.name,
  requestedParkName: '변경 요청 공원',
  requestedParkAddress: '서울특별시 테스트로 456',
  reason: '공원 관리 구역이 변경되어 신청합니다.',
  status: 'pending',
  rejectReason: null,
  conflictingManagerName: null,
  createdAt: '2026-11-18T01:00:00Z',
  reviewedAt: null,
}));
window.fetch = async (input, init) => {
  const url = new URL(String(input), location.origin);
  const path = url.pathname;
  let body: unknown = {};
  if (path.endsWith('/me')) body = { name: '운영 관리자', email: 'admin@example.com', role: 'super_admin' };
  else if (init?.method && init.method !== 'GET') body = {};
  else if (path.endsWith('/registrations')) body = registrations;
  else if (path.endsWith('/robots')) body = robots;
  else if (path.endsWith('/park-change-requests')) body = changes;
  else if (path.endsWith('/parks')) body = parks;
  else if (path.endsWith('/reports'))
    body = [
      {
        id: 'report-1',
        date: '2026-11-18',
        summary: '오늘의 순찰을 완료했습니다. 공원 주요 구역의 수거 상태가 양호합니다.',
        pickups: 124,
        stationVisits: 8,
        patrolsDone: 6,
        patrolsPlanned: 6,
        materials: [
          { material: '플라스틱', count: 60 },
          { material: '캔', count: 40 },
          { material: '유리', count: 24 },
        ],
        hourly: [
          { hour: '09', count: 30 },
          { hour: '10', count: 15 },
          { hour: '11', count: 42 },
          { hour: '12', count: 37 },
        ],
        insights: ['입구 구역의 수거량이 가장 많았어요.', '모든 예정 순찰을 완료했어요.'],
        events: [
          { time: '09:00', title: '순찰 시작', detail: '설정한 경로로 순찰을 시작했어요.' },
          { time: '12:00', title: '수거함 비우기', detail: '정상적으로 완료했어요.' },
        ],
        createdAt: '2026-11-18T04:00:00Z',
      },
    ];
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
};
createRoot(document.getElementById('root')!).render(<AdminPage onLogout={() => location.reload()} />);
