// A-01 홈 - 로봇 배정 전 · 로봇 배정 요청 시트 · 로봇 배정 요청 후
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/client';
import { cancelRobotRequest, requestRobots } from '@/api/robotRequests';
import type { RobotRequest } from '@/api/types';
import { Button, Icon, RobotRequestSheet, Text } from '@/components';
import { icons } from '@/icons';
import { colors, radius, softShadow, space } from '@/theme';

function formatRequestedAt(iso: string) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${hh}:${mm}`;
}

type Props = {
  parkName: string;
  pending: RobotRequest | null | undefined;
  onChanged: () => void;
};

/** 배정된 로봇이 없을 때 홈에 보여요. 요약 · 적재 같은 아래 영역은 숨기고 한 줄 안내만 둬요. */
export function NoRobotCard({ parkName, pending, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const send = async (robotCount: number, reason: string) => {
    setBusy(true);
    setError(undefined);
    try {
      await requestRobots({ robotCount, reason });
      setOpen(false);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : '요청을 보내지 못했어요. 다시 시도해 주세요');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!pending) return;
    setBusy(true);
    setError(undefined);
    try {
      await cancelRobotRequest(pending.id);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : '요청을 취소하지 못했어요. 다시 시도해 주세요');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {pending ? (
        <View style={[s.card, s.cardPending]}>
          <View style={s.top}>
            <View style={s.iconCircle}>
              <Icon source={icons.botBrand} size={22} />
            </View>
            <View style={s.title}>
              <View style={s.pendingBadge}>
                <Text variant="10-semibold" color="textWarn">
                  확인 중
                </Text>
              </View>
              <Text variant="18-bold">로봇 배정을 요청했어요</Text>
              <Text variant="11-regular" color="textSub">
                {formatRequestedAt(pending.createdAt)} · 총관리자가 확인하고 있어요
              </Text>
            </View>
          </View>
          <Text variant="11-regular" color="textSub">
            배정되면 알림으로 알려 드릴게요. 요청 내용: 로봇 {pending.robotCount}대
          </Text>
          <Pressable
            style={s.softButton}
            onPress={cancel}
            disabled={busy}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
          >
            <Text variant="15-bold" color="brandText">
              {busy ? '취소하는 중…' : '요청 취소'}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={s.card}>
          <View style={s.top}>
            <View style={s.iconCircle}>
              <Icon source={icons.botBrand} size={22} />
            </View>
            <View style={s.title}>
              <Text variant="18-bold">아직 배정된 로봇이 없어요</Text>
              <Text variant="11-regular" color="textSub">
                총관리자가 로봇을 배정해야 순찰을 시작할 수 있어요
              </Text>
            </View>
          </View>
          <Text variant="11-regular" color="textSub">
            배정되면 홈에 로봇 카드와 경로 설정 안내가 떠요
          </Text>
          <Button label="총관리자에게 배정 요청하기" onPress={() => setOpen(true)} />
        </View>
      )}
      {error && !open ? (
        <Text variant="13-regular" color="error" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Text variant="11-regular" color="textSub" style={s.center}>
        로봇이 배정되면 순찰 현황이 여기에 보여요
      </Text>

      <RobotRequestSheet
        visible={open}
        kind="assign"
        parkName={parkName}
        sending={busy}
        error={open ? error : undefined}
        onClose={() => {
          setOpen(false);
          setError(undefined);
        }}
        onSubmit={send}
      />
    </>
  );
}

const s = StyleSheet.create({
  // 배정 전 카드 (테두리 브랜드 1.5 · 모서리 20 · 안쪽 18 · 간격 14)
  card: {
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.brand,
    borderRadius: radius[20],
    padding: 18,
    gap: 14,
    ...softShadow,
  },
  cardPending: { borderColor: colors.border },
  top: { flexDirection: 'row', alignItems: 'center', gap: space[12] },
  title: { flex: 1, gap: 5 },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bgBrandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.bgWarn,
    borderRadius: radius.pill,
    paddingHorizontal: space[8],
    paddingVertical: 3,
  },
  softButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.bgBrandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { textAlign: 'center' },
});
