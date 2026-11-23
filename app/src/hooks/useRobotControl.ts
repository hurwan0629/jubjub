import { useState } from 'react';

import { startPatrol, stopPatrol } from '@/api/robotProtocol';

export function useRobotControl(robotId: string, onChanged: () => void) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const run = async (stop: boolean) => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = stop ? await stopPatrol(robotId) : await startPatrol(robotId);
      setMessage(
        response.accepted
          ? stop
            ? '복귀 명령을 수락했어요'
            : '순찰 시작을 수락했어요'
          : '순찰을 시작하거나 변경하지 못했어요. 로봇 상태를 확인해 주세요',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '명령을 보내지 못했어요');
    } finally {
      setBusy(false);
      onChanged();
    }
  };
  return { busy, message, start: () => run(false), stop: () => run(true) };
}
