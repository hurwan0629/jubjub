import { useState } from 'react';

import { startPatrol, stopPatrol } from '@/api/robotProtocol';

/** 로봇 순찰 시작 · 멈추기 명령 (POST /robots/{id}/patrol/start · stop). 끝나면 onChanged로 상태를 다시 불러와요. */
export function useRobotControl(robotId: string, onChanged: () => void) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const run = async (stop: boolean) => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      if (stop) {
        const response = await stopPatrol(robotId);
        setMessage(
          response.accepted
            ? '멈추기 명령을 보냈어요'
            : (response.reason ?? '순찰을 멈추지 못했어요. 로봇 상태를 확인해 주세요'),
        );
      } else {
        await startPatrol(robotId);
        setMessage('순찰 시작 명령을 보냈어요');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '명령을 보내지 못했어요');
    } finally {
      setBusy(false);
      onChanged();
    }
  };
  return { busy, message, start: () => run(false), stop: () => run(true) };
}
