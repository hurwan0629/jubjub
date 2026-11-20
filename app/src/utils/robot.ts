// 로봇 상태 → 카드에 보여 줄 한국어 문장 (A-01 홈 로봇 카드 · A-13 로봇 목록 카드)
import type { ManagedRobot } from '@/api/types';

import { formatTime } from './date';

// 숫자를 한국어로 읽을 때 받침이 있는지 (0 영, 1 일, 3 삼, 6 육, 7 칠, 8 팔)
const DIGIT_BATCHIM = new Set(['0', '1', '3', '6', '7', '8']);

/** 마지막 글자에 받침이 있는지. 한글이 아니면 숫자 · 영어 읽는 소리로 어림해요 (Jubi 1 → 일 → 받침 있음) */
export function hasBatchim(word: string) {
  const last = word.trim().slice(-1);
  if (!last) return false;
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  if (/\d/.test(last)) return DIGIT_BATCHIM.has(last);
  return /[lmnr]/i.test(last);
}

/** 이/가 · 을/를 · 과/와 를 붙여요. 예) withParticle('Jubi 1', '이', '가') → 'Jubi 1이' */
export function withParticle(word: string, afterBatchim: string, otherwise: string) {
  return `${word}${hasBatchim(word) ? afterBatchim : otherwise}`;
}

/** "Jubi 1이 순찰 중이에요"의 상태 부분 */
const SENTENCE: Record<ManagedRobot['state'], string> = {
  patrolling: '순찰 중이에요',
  paused: '멈춰 있어요',
  returning: '돌아가고 있어요',
  idle: '대기 중이에요',
  charging: '충전 중이에요',
  error: '오류가 생겼어요',
  disconnected: '연결이 끊겼어요',
};

/** 카드 제목. 예) Jubi 1이 순찰 중이에요 · Jubi 1에게 오류가 생겼어요 */
export function robotTitle(robot: Pick<ManagedRobot, 'name' | 'state'>) {
  if (robot.state === 'error') return `${robot.name}에게 ${SENTENCE.error}`;
  if (robot.state === 'disconnected') return `${withParticle(robot.name, '과', '와')} ${SENTENCE.disconnected}`;
  return `${withParticle(robot.name, '이', '가')} ${SENTENCE[robot.state]}`;
}

/** 지금 하는 일 한 줄 (제목 아래 작은 글씨) */
export function robotActivity(robot: ManagedRobot) {
  switch (robot.state) {
    case 'patrolling':
      return robot.nearPoint ? `${withParticle(robot.nearPoint, '을', '를')} 돌고 있어요` : '순찰 지점을 돌고 있어요';
    case 'paused': {
      const at = robot.pausedAt ? `${formatTime(new Date(robot.pausedAt))}에 멈췄어요` : '순찰을 멈췄어요';
      return robot.nearPoint ? `${at} · ${robot.nearPoint} 근처` : at;
    }
    case 'returning':
      return '순찰을 끝냈어요 · 분리수거장으로 가고 있어요';
    case 'idle':
      return '분리수거장에서 다음 순찰을 기다려요';
    case 'charging':
      return '충전 위치에 있어요';
    case 'error':
      return robot.nearPoint ? `현장 확인이 필요해요 · ${robot.nearPoint} 근처` : '현장 확인이 필요해요';
    case 'disconnected':
      return '로봇 전원과 통신 상태를 확인해 주세요';
  }
}

/** 홈 카드 오른쪽 아래 한 줄 */
export function robotSideNote(robot: ManagedRobot) {
  switch (robot.state) {
    case 'patrolling':
      return robot.nextPoint ? `다음 지점 · ${robot.nextPoint}` : `순찰 지점 ${robot.routePointCount}곳`;
    case 'paused':
      return robot.remainingPoints !== null ? `남은 지점 ${robot.remainingPoints}곳` : '남은 지점부터 이어서 돌아요';
    case 'returning':
      return '도착하면 쓰레기를 비워요';
    case 'idle':
    case 'charging':
      return robot.nextPatrolAt ? `다음 순찰 · ${robot.nextPatrolAt}` : '켜진 순찰 시간이 없어요';
    case 'error':
    case 'disconnected':
      return '현장 복구가 필요해요';
  }
}

/** 배터리 글자. 아직 보고가 없으면 '--' */
export const batteryText = (robot: ManagedRobot) => (robot.battery === null ? '--' : String(robot.battery));
