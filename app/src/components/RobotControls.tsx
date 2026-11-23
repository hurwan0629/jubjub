import { View } from 'react-native';

import { API_URL } from '@/api/client';
import type { HomeRobotStatus } from '@/api/types';
import { useRobotControl } from '@/hooks/useRobotControl';
import { space } from '@/theme';

import { Button } from './Button';
import { Text } from './Text';

export function RobotControls({ robot, onChanged }: { robot: HomeRobotStatus; onChanged: () => void }) {
  const control = useRobotControl(robot.id, onChanged);
  if (!API_URL) return null;
  return (
    <View style={{ gap: space[8] }}>
      <Button label="순찰 시작" disabled={control.busy || robot.state !== 'idle'} onPress={control.start} />
      <Button
        label="순찰 중지 후 복귀"
        disabled={control.busy || robot.state !== 'patrolling'}
        onPress={control.stop}
      />
      {control.message ? (
        <Text variant="12-regular" color="textSub">
          {control.message}
        </Text>
      ) : null}
    </View>
  );
}
