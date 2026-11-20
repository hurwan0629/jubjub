// C-02 분리수거장 편집 · 추가. 기준: Figma Page 5 "C-02 분리수거장 편집 - 위치 옮기기" · "쓰는 로봇이 있어 삭제 막힘"
// 지도를 꾹 눌러 새 위치를 정하고 이름을 바꿔 저장해요. 쓰는 로봇이 있으면 지울 수 없고,
// 그 로봇이 쓸 다른 분리수거장을 고른 뒤에 지울 수 있어요.
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import { addStation, deleteStation, editStation, setRobotStation } from '@/api/stations';
import type { LatLng, Station } from '@/api/types';
import { BottomSheet, Button, Header, MapHint, ParkMap, Text } from '@/components';
import type { ParkMapMarker } from '@/components';
import { useRouteConfig } from '@/hooks/useRoute';
import { useStations } from '@/hooks/useStations';
import type { RootParams } from '@/navigation';
import { colors, layout, radius, softShadow, space, typography } from '@/theme';
import { shortStationName } from '@/utils/labels';
import { withParticle } from '@/utils/robot';

type Props = NativeStackScreenProps<RootParams, 'StationEdit'>;

const NAME_MAX = 20;
const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : '잠시 후 다시 시도해 주세요');

export function StationEditScreen({ navigation, route: nav }: Props) {
  const { id, position: picked } = nav.params ?? {};
  const { data: stations, reload } = useStations();
  const { data: route } = useRouteConfig();
  const station = stations?.find((s) => s.id === id);

  // 화면을 열 때의 값에서 시작해요 (목록이 다시 와도 고치던 값은 그대로)
  const [name, setName] = useState<string | null>(null);
  const [moved, setMoved] = useState<LatLng | null>(picked ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [blockedBy, setBlockedBy] = useState<Station['robots'] | null>(null);
  const [reassign, setReassign] = useState<Station['robots'][number] | null>(null);

  if (!stations || !route || (id && !station)) {
    return (
      <SafeAreaView style={s.screen} edges={['top']}>
        <Header title="분리수거장 편집" onBack={() => navigation.goBack()} />
      </SafeAreaView>
    );
  }

  const creating = !station;
  const currentName = name ?? station?.name ?? '새 분리수거장';
  const robots = station?.robots ?? [];
  const robotNames = robots.map((r) => r.name).join(', ');

  const markers: ParkMapMarker[] = [
    // 다른 분리수거장은 흐리게 (이름만 짧게)
    ...stations
      .filter((st) => st.id !== id)
      .map((st) => ({ id: st.id, kind: 'station' as const, position: st.position, label: shortStationName(st.name) })),
    ...(station
      ? [
          {
            id: 'original',
            kind: 'station' as const,
            position: station.position,
            label: moved ? '원래 위치' : shortStationName(station.name),
            showLabel: true,
          },
        ]
      : []),
    ...(moved ? [{ id: 'moved', kind: 'station' as const, position: moved, label: '새 위치', showLabel: true }] : []),
  ];

  const handleSave = async () => {
    setSaving(true);
    setError(undefined);
    try {
      if (creating) {
        if (!moved) throw new ApiError(422, '지도를 꾹 눌러 위치를 먼저 정해 주세요');
        await addStation({ name: currentName.trim(), position: moved });
      } else {
        await editStation(station.id, {
          ...(name !== null ? { name: name.trim() } : null),
          ...(moved ? { position: moved } : null),
        });
      }
      navigation.goBack();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!station) return;
    setError(undefined);
    try {
      await deleteStation(station.id);
      navigation.goBack();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'station_in_use') {
        setBlockedBy((e.details as unknown as Station['robots']) ?? robots);
      } else {
        setError(messageOf(e));
      }
    }
  };

  const handleReassign = async (stationId: string) => {
    if (!reassign) return;
    try {
      await setRobotStation(reassign.id, stationId);
      setReassign(null);
      reload();
    } catch (e) {
      setError(messageOf(e));
    }
  };

  const blockedName = blockedBy?.map((r) => r.name).join(', ') ?? '';

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <Header title={creating ? '분리수거장 추가' : '분리수거장 편집'} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.intro}>
          <Text variant="18-bold">{creating ? '새 분리수거장 위치 정하기' : `${station.name} 위치 옮기기`}</Text>
          <Text variant="13-regular" color="textBody" lineHeight="relaxed">
            지도를 꾹 눌러 실제 위치에 놓아 주세요
          </Text>
        </View>

        <ParkMap
          style={s.map}
          bounds={route.bounds}
          area={route.area}
          markers={markers}
          onLongPress={setMoved}
          onLongPressOutside={() => setError('공원 경계 안의 위치를 선택해 주세요')}
        />
        <MapHint
          text={
            moved && station
              ? '"원래 위치"에서 "새 위치"로 옮겨요'
              : moved
                ? '이 자리에 분리수거장을 만들어요'
                : '지도를 꾹 누르면 새 위치를 정해요'
          }
        />

        <View style={s.sheet}>
          <Text variant="13-semibold">이름</Text>
          <TextInput
            value={currentName}
            onChangeText={setName}
            maxLength={NAME_MAX}
            style={s.nameInput}
            accessibilityLabel="분리수거장 이름"
          />
          {robots.length > 0 ? (
            <View style={s.infoBox}>
              <Text variant="13-semibold" color="brandText">
                {withParticle(robotNames, '이', '가')} 쓰는 분리수거장이에요
              </Text>
              <Text variant="12-regular">저장하면 {robotNames}은 다음 비우기부터 새 위치로 가요.</Text>
            </View>
          ) : null}
          {error ? (
            <Text variant="12-regular" color="error" accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <View style={s.actions}>
            <View style={s.cancel}>
              <Button label="취소" variant="soft" onPress={() => navigation.goBack()} />
            </View>
            <View style={s.flex1}>
              <Button
                label={saving ? '저장하는 중…' : creating ? '이 위치에 추가' : '이 위치로 저장'}
                onPress={handleSave}
                disabled={saving || !currentName.trim() || (creating && !moved)}
              />
            </View>
          </View>
          {station ? (
            <Pressable onPress={handleDelete} hitSlop={8} accessibilityRole="button">
              <Text variant="13-semibold" color="rejectText" style={s.center}>
                이 분리수거장 삭제
              </Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>

      {/* 쓰는 로봇이 있어 지울 수 없어요 */}
      <Modal visible={!!blockedBy} transparent animationType="fade" onRequestClose={() => setBlockedBy(null)}>
        <View style={s.dim}>
          <View style={s.dialog} accessibilityViewIsModal>
            <View style={s.bang}>
              <Text variant="22-bold" color="error">
                !
              </Text>
            </View>
            <Text variant="18-bold" style={s.center}>
              {`${withParticle(blockedName, '이', '가')} 쓰는 분리수거장이라\n지울 수 없어요`}
            </Text>
            <Text variant="13-regular" color="textBody" lineHeight="relaxed" style={s.center}>
              {`먼저 ${withParticle(blockedName, '이', '가')} 비우러 갈 다른 분리수거장을\n골라 주세요. 그다음 지울 수 있어요.`}
            </Text>
            {blockedBy?.map((r) => (
              <View key={r.id} style={s.fullWidth}>
                <Button
                  label={`${r.name} 분리수거장 바꾸기`}
                  onPress={() => {
                    // 확인 창을 닫고 고르는 시트를 열어요 (둘이 겹치지 않게)
                    setBlockedBy(null);
                    setReassign(r);
                  }}
                />
              </View>
            ))}
            <Pressable onPress={() => setBlockedBy(null)} hitSlop={8} accessibilityRole="button">
              <Text variant="14-semibold" color="textBody">
                닫기
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* 로봇이 쓸 다른 분리수거장 고르기 */}
      <BottomSheet
        visible={!!reassign}
        title={`${reassign?.name ?? ''} 분리수거장 바꾸기`}
        description="비우러 갈 분리수거장을 골라 주세요"
        descriptionColor="textBody"
        onClose={() => setReassign(null)}
      >
        {stations
          .filter((st) => st.id !== id)
          .map((st) => (
            <Pressable key={st.id} style={s.pickRow} onPress={() => handleReassign(st.id)} accessibilityRole="button">
              <Text variant="15-semibold" style={s.flex1}>
                {st.name}
              </Text>
              <Text variant="12-regular" color="textBody">
                {st.robots.length ? `${st.robots.map((r) => r.name).join(', ')} 사용 중` : '쓰는 로봇 없음'}
              </Text>
            </Pressable>
          ))}
      </BottomSheet>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1 },
  flex1: { flex: 1 },
  center: { textAlign: 'center' },
  fullWidth: { alignSelf: 'stretch' },
  intro: { paddingHorizontal: layout.screenPadding, paddingTop: space[8], paddingBottom: space[12], gap: space[8] },
  map: { height: 290, backgroundColor: colors.map },
  sheet: {
    flex: 1,
    backgroundColor: colors.card,
    borderTopLeftRadius: radius[20],
    borderTopRightRadius: radius[20],
    paddingHorizontal: layout.screenPadding,
    paddingVertical: 22,
    gap: 14,
    marginTop: space[12],
    ...softShadow,
  },
  nameInput: {
    ...typography['15-semibold'],
    color: colors.text,
    backgroundColor: colors.bgBrandSoft,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: space[12],
    outlineStyle: 'none',
  } as object,
  infoBox: {
    backgroundColor: colors.chipIdle,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: space[12],
    gap: 3,
  },
  actions: { flexDirection: 'row', gap: 10 },
  cancel: { width: 96 },
  dim: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: space[24] },
  dialog: {
    width: 330,
    maxWidth: '100%',
    backgroundColor: colors.card,
    borderRadius: radius[20],
    padding: space[24],
    alignItems: 'center',
    gap: space[16],
    ...softShadow,
  },
  bang: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.bgError,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[12],
    paddingVertical: 14,
    paddingHorizontal: space[16],
    borderRadius: 14,
    backgroundColor: colors.bg,
  },
});
