// C-02 공원 변경 요청. 기준: Figma Page 5 "C-02 설정: 공원 변경 요청" (공원 고르기 · 요청 확인)
// 총관리자가 승인하면 공원과 로봇이 같이 옮겨 가요. 승인 전까지는 지금 공원에서 그대로 일해요.
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { requestParkChange } from '@/api/account';
import { ApiError } from '@/api/client';
import type { Park } from '@/api/types';
import { Button, Header, Icon, Text } from '@/components';
import { useParkSearch } from '@/hooks/useParks';
import { useRobots } from '@/hooks/useRobots';
import { useRouteConfig } from '@/hooks/useRoute';
import { icons } from '@/icons';
import type { RootParams } from '@/navigation';
import { colors, layout, radius, softShadow, space, typography } from '@/theme';

type Props = NativeStackScreenProps<RootParams, 'ParkChange'>;

/** '서울 마포구 한강난지로 162' → '마포구' */
const districtOf = (address: string) => address.split(' ').find((w) => w.endsWith('구')) ?? address;

export function ParkChangeScreen({ navigation }: Props) {
  const { data: route } = useRouteConfig();
  const { data: robots = [] } = useRobots();
  const [query, setQuery] = useState('');
  const search = useParkSearch(query);
  const [picked, setPicked] = useState<Park | null>(null);
  const [memo, setMemo] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();

  const current = route?.parkName ?? '지금 공원';
  // 지금 공원은 목록에서 빼요
  const parks = search.items.filter((p) => p.name !== current);
  const robotNames = robots.map((r) => r.name).join(', ');

  const handleSend = async () => {
    if (!picked) return;
    setSending(true);
    setError(undefined);
    try {
      await requestParkChange({
        catalogId: picked.id,
        parkName: picked.name,
        fromPark: current,
        memo: memo.trim() || undefined,
      });
      setConfirm(false);
      navigation.goBack();
    } catch (e) {
      setConfirm(false);
      setError(e instanceof ApiError ? e.message : '잠시 후 다시 시도해 주세요');
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <Header title="공원 변경 요청" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.gap6}>
          <Text variant="20-bold">어느 공원으로 옮길까요?</Text>
          <Text variant="13-regular" color="textBody">
            총관리자가 승인하면 공원이 바뀌어요. 승인 전까지는 지금 공원에서 그대로 일해요.
          </Text>
        </View>

        <View style={s.currentCard}>
          <View style={s.currentText}>
            <Text variant="12-regular" color="textBody">
              지금 공원
            </Text>
            <Text variant="16-bold">{current}</Text>
          </View>
          {robots.length > 0 ? (
            <View style={s.pill}>
              <Text variant="12-bold" color="brandText">
                로봇 {robots.length}대 같이 이동
              </Text>
            </View>
          ) : null}
        </View>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="공원 이름으로 찾기"
          placeholderTextColor={colors.textPlaceholder}
          style={s.search}
          returnKeyType="search"
          accessibilityLabel="공원 이름으로 찾기"
        />

        {parks.length > 0 ? (
          <View style={s.list}>
            {parks.map((p, i) => {
              const taken = !!p.hasManager;
              const on = picked?.id === p.id;
              return (
                <View key={p.id}>
                  {i > 0 ? <View style={s.divider} /> : null}
                  <Pressable
                    style={s.parkRow}
                    onPress={() => setPicked(p)}
                    disabled={taken}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on, disabled: taken }}
                  >
                    <Icon source={taken ? icons.radioDisabled : on ? icons.radioOn : icons.radioOff} size={20} />
                    <View style={s.parkText}>
                      <Text variant="15-semibold" color={taken ? 'radioOff' : 'text'}>
                        {p.name}
                      </Text>
                      <Text variant="12-regular" color={taken ? 'radioOff' : 'textBody'}>
                        {districtOf(p.address)} · {taken ? '다른 관리자가 맡고 있어요' : '담당 관리자 없음'}
                      </Text>
                    </View>
                    {on ? (
                      <View style={s.pill}>
                        <Text variant="12-bold" color="brandText">
                          선택
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : query.trim() && !search.loading ? (
          <Text variant="13-regular" color="textBody">
            찾는 공원이 없어요. 이름을 다시 확인해 주세요
          </Text>
        ) : null}

        <View style={s.gap8}>
          <View style={s.memoTitle}>
            <Text variant="14-bold">요청 메모</Text>
            <Text variant="12-regular" color="textBody">
              선택
            </Text>
          </View>
          <TextInput
            value={memo}
            onChangeText={setMemo}
            placeholder="예) 12월부터 난지한강공원 담당으로 바뀌었어요."
            placeholderTextColor={colors.textPlaceholder}
            style={s.memo}
            multiline
            maxLength={300}
            textAlignVertical="top"
            accessibilityLabel="요청 메모"
          />
        </View>

        {error ? (
          <Text variant="12-regular" color="error" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </ScrollView>

      <View style={s.bottom}>
        <Button label="변경 요청 보내기" onPress={() => setConfirm(true)} disabled={!picked} />
      </View>

      {/* 요청 확인 */}
      <Modal visible={confirm} transparent animationType="fade" onRequestClose={() => setConfirm(false)}>
        <View style={s.dim}>
          <View style={s.dialog} accessibilityViewIsModal>
            <View style={s.warnCircle}>
              <Text variant="22-bold" color="orangeText">
                !
              </Text>
            </View>
            <Text variant="18-bold" style={s.center}>
              {`${current} → ${picked?.name ?? ''}\n변경을 요청할까요?`}
            </Text>
            <View style={s.bullets}>
              {[
                robotNames ? `승인되면 ${robotNames}도 같이 옮겨 가요` : null,
                `${current}의 순찰 경로와 시간표는 지워져요`,
                '새 공원에서 분리수거장·경로를 다시 정해요',
                `승인 전까지는 ${current}에서 그대로 일해요`,
              ]
                .filter(Boolean)
                .map((line) => (
                  <Text key={line} variant="12-regular" color="textBody">
                    · {line}
                  </Text>
                ))}
            </View>
            <View style={s.dialogActions}>
              <View style={s.flex1}>
                <Button label="취소" variant="soft" onPress={() => setConfirm(false)} />
              </View>
              <View style={s.flex1}>
                <Button label={sending ? '보내는 중…' : '요청 보내기'} onPress={handleSend} disabled={sending} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.screenPadding, paddingVertical: space[20], gap: space[16] },
  flex1: { flex: 1 },
  center: { textAlign: 'center' },
  gap6: { gap: 6 },
  gap8: { gap: space[8] },
  currentCard: {
    backgroundColor: colors.card,
    borderRadius: radius[16],
    paddingHorizontal: space[16],
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[12],
  },
  currentText: { flex: 1, gap: 3 },
  pill: { backgroundColor: colors.bgBrandSoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  search: {
    ...typography['14-regular'],
    color: colors.text,
    height: layout.touchMin,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    outlineStyle: 'none',
  } as object,
  list: { backgroundColor: colors.card, borderRadius: radius[16], paddingHorizontal: space[16], paddingVertical: 6 },
  divider: { height: 1, backgroundColor: colors.divider },
  parkRow: { flexDirection: 'row', alignItems: 'center', gap: space[12], paddingVertical: space[12] },
  parkText: { flex: 1, gap: 2 },
  memoTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  memo: {
    ...typography['14-regular'],
    color: colors.text,
    minHeight: 64,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: space[12],
    outlineStyle: 'none',
  } as object,
  bottom: { paddingHorizontal: layout.screenPadding, paddingTop: space[12], paddingBottom: space[12] },
  dim: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: space[24] },
  dialog: {
    width: 342,
    maxWidth: '100%',
    backgroundColor: colors.card,
    borderRadius: radius[20],
    padding: space[24],
    alignItems: 'center',
    gap: space[16],
    ...softShadow,
  },
  warnCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.bgOrange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bullets: { alignSelf: 'stretch', backgroundColor: colors.bg, borderRadius: 12, padding: 14, gap: 6 },
  dialogActions: { alignSelf: 'stretch', flexDirection: 'row', gap: space[8] },
});
