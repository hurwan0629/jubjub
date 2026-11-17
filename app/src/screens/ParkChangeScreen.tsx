// C-02 공원 변경 신청 · 승인 내역
import { useFocusEffect, usePreventRemove } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { cancelParkChange, requestParkChange } from '@/api/parks';
import type { Park, ParkChange } from '@/api/types';
import { Button, Header, Text, TextField } from '@/components';
import { useProfile } from '@/hooks/useAccount';
import { useManagedPark, useParkChanges } from '@/hooks/useParkChange';
import type { RootParams } from '@/navigation';
import { colors, radius, space } from '@/theme';

import { StepPark } from './route-setup/steps';

const STATUS: Record<ParkChange['status'], string> = {
  pending: '승인 대기',
  approved: '승인 완료',
  rejected: '반려',
  cancelled: '취소',
};

export function ParkChangeScreen({ navigation }: NativeStackScreenProps<RootParams, 'ParkChange'>) {
  const { data: current, reload: reloadPark, error: parkError } = useManagedPark();
  const { reload: reloadProfile } = useProfile();
  const { data: changes, reload, loading, error } = useParkChanges();
  const [park, setPark] = useState<Park | null>(null);
  const [reason, setReason] = useState('');
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  usePreventRemove(busy, () => {});
  const [message, setMessage] = useState('');
  useFocusEffect(
    useCallback(() => {
      reload();
      reloadPark();
      reloadProfile();
    }, [reload, reloadPark, reloadProfile]),
  );
  const pending = changes?.find((r) => r.status === 'pending');
  const act = async (action: () => Promise<unknown>, success: string) => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setMessage('');
    try {
      await action();
      setMessage(success);
      reload();
      setPark(null);
      setReason('');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '요청하지 못했어요. 다시 시도해 주세요');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <Header
        title={picking ? '새 공원 찾기' : '공원 변경하기'}
        onBack={() => {
          if (!busy) {
            if (picking) setPicking(false);
            else navigation.goBack();
          }
        }}
      />
      {picking ? (
        <>
          <StepPark park={park} onPick={setPark} />
          <View style={s.content}>
            <Button
              label="이 공원 선택"
              disabled={!park || park.id === current?.catalogId}
              onPress={() => setPicking(false)}
            />
          </View>
        </>
      ) : (
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Text variant="18-bold">현재 공원 · {current?.name ?? '불러오는 중이에요'}</Text>
          <Text color="textSub">
            총관리자가 승인할 때까지 현재 공원과 순찰 설정을 유지해요. 승인되면 새 공원의 경로를 다시 설정해 주세요.
          </Text>
          {current?.status === 'approved' && current.routeSetupDone === false ? (
            <Button label="새 공원 경로 설정" disabled={busy} onPress={() => navigation.navigate('RouteSetup')} />
          ) : null}
          {loading ? <Text>신청 내역을 불러오는 중이에요</Text> : null}
          {error || parkError ? (
            <>
              <Text color="error">{(error ?? parkError)?.message}</Text>
              <Button
                label="다시 불러오기"
                variant="soft"
                onPress={() => {
                  reload();
                  reloadPark();
                  reloadProfile();
                }}
              />
            </>
          ) : null}
          {message ? <Text accessibilityLiveRegion="polite">{message}</Text> : null}
          {!pending && !loading && !error && current?.status === 'approved' ? (
            <View style={s.card}>
              <Text variant="16-bold">변경할 공원</Text>
              {park ? (
                <>
                  <Text>{park.name}</Text>
                  <Text color="textSub">{park.address}</Text>
                </>
              ) : null}
              <Button
                label={park ? '다른 공원 찾기' : '공원 찾기'}
                variant="soft"
                disabled={busy}
                onPress={() => setPicking(true)}
              />
              <TextField
                label="변경 사유"
                value={reason}
                onChangeText={setReason}
                multiline
                maxLength={200}
                placeholder="공원을 변경하려는 이유를 알려 주세요"
                editable={!busy}
              />
              <Button
                label={busy ? '신청 중이에요' : '총관리자에게 변경 신청'}
                disabled={busy || !park || !reason.trim() || park.id === current.catalogId}
                onPress={() =>
                  park &&
                  act(
                    () => requestParkChange(park.id, reason.trim()),
                    '변경을 신청했어요. 총관리자의 승인을 기다려 주세요.',
                  )
                }
              />
            </View>
          ) : null}
          <Text variant="16-bold">신청 내역</Text>
          {!loading && changes?.length === 0 ? <Text color="textSub">아직 공원 변경 신청이 없어요</Text> : null}
          {changes?.map((change) => (
            <View key={change.id} style={s.card}>
              <Text variant="15-bold">{STATUS[change.status]}</Text>
              <Text>
                {change.currentParkName} → {change.requestedParkName}
              </Text>
              <Text color="textSub">{change.requestedParkAddress}</Text>
              <Text>신청 사유 · {change.reason}</Text>
              <Text color="textSub">신청일 · {new Date(change.createdAt).toLocaleString('ko-KR')}</Text>
              {change.rejectReason ? <Text color="error">반려 사유 · {change.rejectReason}</Text> : null}
              {change.status === 'pending' ? (
                <Button
                  label="신청 취소"
                  variant="soft"
                  disabled={busy}
                  onPress={() => act(() => cancelParkChange(change.id), '신청을 취소했어요')}
                />
              ) : null}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space[24], gap: space[16] },
  card: { padding: space[16], gap: space[12], borderRadius: radius[20], backgroundColor: colors.card },
});
