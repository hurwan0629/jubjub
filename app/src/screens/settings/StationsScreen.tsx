// C-02 분리수거장 관리 · 분리수거장 편집 (위치 옮기기 · 이름 바꾸기 · 쓰는 로봇이 있어 삭제 막힘)
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import { createStation, deleteStation, updateStation } from '@/api/stations';
import type { Station } from '@/api/stations';
import type { LatLng } from '@/api/types';
import { Button, Header, Icon, MapHint, ParkMap, PointNameSheet, Text } from '@/components';
import type { ParkMapMarker } from '@/components';
import { usePatrolRobots, useRouteConfig } from '@/hooks/useRoute';
import { useStations, useStationUsers } from '@/hooks/useStations';
import { icons } from '@/icons';
import type { RootParams } from '@/navigation';
import { colors, layout, radius, softShadow, space, typography } from '@/theme';

type Props = NativeStackScreenProps<RootParams, 'Stations'>;

export function StationsScreen({ navigation }: Props) {
  const { data: stations, error, reload } = useStations();
  const { data: usage, reload: reloadUsage } = useStationUsers();
  const { data: robots } = usePatrolRobots();
  // 공원 범위 · 경계 · 이름은 경로 설정과 같은 곳에서 가져와요
  const { data: config } = useRouteConfig(robots?.[0]?.id);
  const [editing, setEditing] = useState<Station | null>(null);
  const [pending, setPending] = useState<LatLng | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [outside, setOutside] = useState(false);

  useFocusEffect(
    useCallback(() => {
      reload();
      reloadUsage();
    }, [reload, reloadUsage]),
  );

  const users = usage?.users ?? {};
  const add = async (name: string) => {
    if (!pending) return;
    setBusy(true);
    setMessage(undefined);
    try {
      await createStation(name, pending, config?.catalogId);
      setPending(null);
      reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '분리수거장을 등록하지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  if (editing && config) {
    return (
      <StationEditor
        station={editing}
        others={(stations ?? []).filter((st) => st.id !== editing.id)}
        users={users[editing.id] ?? []}
        robots={robots ?? []}
        config={config}
        onClose={() => {
          setEditing(null);
          reload();
          reloadUsage();
        }}
        onChangeRoute={(robotId) => {
          setEditing(null);
          navigation.navigate('RouteEdit', { robotId });
        }}
      />
    );
  }

  const markers: ParkMapMarker[] = (stations ?? []).map((st) => ({
    id: st.id,
    kind: 'station',
    position: st.position,
    label: st.name,
    showLabel: true,
  }));

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <Header title="분리수거장 관리" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={s.head}>
          <Text variant="18-bold">
            {config?.parkName ?? '공원'} 분리수거장 {stations?.length ?? 0}곳
          </Text>
          <Text variant="13-regular" color="textSub">
            모든 로봇이 같이 써요. 눌러서 위치와 이름을 바꿀 수 있어요
          </Text>
        </View>
        {config ? (
          <ParkMap
            style={s.map}
            bounds={config.bounds}
            area={config.area}
            markers={markers}
            onMarkerPress={(id) => setEditing(stations?.find((st) => st.id === id) ?? null)}
            onLongPress={(p) => {
              setOutside(false);
              setPending(p);
            }}
            onLongPressOutside={() => setOutside(true)}
          />
        ) : (
          <View style={[s.map, { backgroundColor: colors.map }]} />
        )}
        <MapHint
          tone={outside ? 'error' : 'brand'}
          text={outside ? '공원 밖이에요. 공원 안을 꾹 눌러 주세요' : '지도를 꾹 누르면 새 분리수거장을 추가해요'}
        />
        <View style={s.padX}>
          {error ? (
            <Text variant="13-regular" color="error">
              {error.message}
            </Text>
          ) : null}
          {message ? (
            <Text variant="13-regular" color="error">
              {message}
            </Text>
          ) : null}
          <View style={s.card}>
            {!stations ? (
              <Text variant="13-regular" color="textSub">
                분리수거장을 불러오고 있어요…
              </Text>
            ) : stations.length === 0 ? (
              <Text variant="13-regular" color="textSub">
                아직 등록한 분리수거장이 없어요. 지도를 꾹 눌러 추가해 주세요
              </Text>
            ) : (
              stations.map((st) => {
                const used = users[st.id] ?? [];
                return (
                  <Pressable
                    key={st.id}
                    style={s.row}
                    onPress={() => setEditing(st)}
                    accessibilityRole="button"
                    accessibilityLabel={`${st.name} 편집`}
                  >
                    <View style={s.recycleDot}>
                      <Icon source={icons.markerRecycle} size={16} />
                    </View>
                    <View style={s.flex1}>
                      <Text variant="15-bold" numberOfLines={1}>
                        {st.name}
                      </Text>
                      <View style={[s.useBadge, used.length ? s.useBadgeOn : null]}>
                        <Text variant="10-semibold" color={used.length ? 'brandText' : 'textSub'}>
                          {used.length ? `${used.join(', ')} 사용 중` : '쓰는 로봇 없음'}
                        </Text>
                      </View>
                    </View>
                    <Text variant="12-semibold" color="brandText">
                      편집 ›
                    </Text>
                  </Pressable>
                );
              })
            )}
          </View>
        </View>
      </ScrollView>
      <View style={s.footer}>
        <Button
          label="+ 분리수거장 추가"
          variant="soft"
          onPress={() => setMessage('지도를 꾹 눌러 새 분리수거장 위치를 찍어 주세요')}
        />
      </View>
      <PointNameSheet
        visible={!!pending}
        kind="station"
        order={(stations?.length ?? 0) + 1}
        sending={busy}
        onCancel={() => setPending(null)}
        onSubmit={add}
      />
    </SafeAreaView>
  );
}

/** 분리수거장 편집: 지도를 꾹 눌러 새 위치 (원래 자리는 흐리게), 이름 바꾸기, 삭제 */
function StationEditor({
  station,
  others,
  users,
  robots,
  config,
  onClose,
  onChangeRoute,
}: {
  station: Station;
  others: Station[];
  users: string[];
  robots: { id: string; name: string }[];
  config: NonNullable<ReturnType<typeof useRouteConfig>['data']>;
  onClose: () => void;
  onChangeRoute: (robotId: string) => void;
}) {
  const [name, setName] = useState(station.name);
  const [position, setPosition] = useState<LatLng>(station.position);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [blocked, setBlocked] = useState(false);
  const moved = position.latitude !== station.position.latitude || position.longitude !== station.position.longitude;

  const markers: ParkMapMarker[] = [
    ...others.map((st) => ({ id: st.id, kind: 'station' as const, position: st.position, label: st.name })),
    // 원래 자리 (옮기면 이름표로 남겨 둬요)
    ...(moved
      ? [{ id: 'origin', kind: 'point' as const, position: station.position, label: '원래 위치', showLabel: true }]
      : []),
    { id: station.id, kind: 'station' as const, position, label: moved ? '새 위치' : name, showLabel: true },
  ];

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('이름을 입력해 주세요');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await updateStation(station.id, trimmed, position, config.catalogId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await deleteStation(station.id, config.catalogId);
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'station_in_use') setBlocked(true);
      else setError(e instanceof Error ? e.message : '삭제하지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  const user = robots.find((r) => users.includes(r.name));

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <Header title="분리수거장 편집" onBack={onClose} />
      <ScrollView contentContainerStyle={{ paddingBottom: space[24] }} keyboardShouldPersistTaps="handled">
        <View style={s.head}>
          <Text variant="18-bold">{station.name} 위치 옮기기</Text>
          <Text variant="13-regular" color="textSub">
            지도를 꾹 눌러 실제 위치로 옮겨 주세요
          </Text>
        </View>
        <ParkMap
          style={s.map}
          bounds={config.bounds}
          area={config.area}
          markers={markers}
          route={moved ? [station.position, position] : undefined}
          onLongPress={setPosition}
        />
        <MapHint text={moved ? '점선 끝이 원래 위치예요' : '지도를 꾹 눌러 새 위치를 정해요'} />
        <View style={[s.padX, s.gap12]}>
          <Text variant="13-bold">이름</Text>
          <TextInput
            style={s.input}
            value={name}
            onChangeText={setName}
            maxLength={20}
            accessibilityLabel="분리수거장 이름"
          />
          {users.length ? (
            <View style={s.note}>
              <Text variant="12-semibold" color="brandText">
                {users.join(', ')}이 쓰는 분리수거장이에요
              </Text>
              <Text variant="11-regular" color="textSub">
                저장하면 다음 비우기부터 새 위치로 가요.
              </Text>
            </View>
          ) : null}
          {error ? (
            <Text variant="13-regular" color="error" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
          <View style={s.actions}>
            <View style={s.flex1}>
              <Button label="취소" variant="soft" onPress={onClose} />
            </View>
            <View style={s.flex2}>
              <Button label={busy ? '저장 중…' : '이 위치로 저장'} disabled={busy} onPress={save} />
            </View>
          </View>
          <Pressable style={s.deleteLink} onPress={remove} disabled={busy} accessibilityRole="button">
            <Text variant="13-semibold" color="error">
              이 분리수거장 삭제
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* 쓰는 로봇이 있어 삭제 막힘 */}
      <Modal visible={blocked} transparent animationType="fade" onRequestClose={() => setBlocked(false)}>
        <View style={s.dim}>
          <View style={s.dialog} accessibilityViewIsModal>
            <View style={s.symbol}>
              <Text variant="25-bold" color="error">
                !
              </Text>
            </View>
            <Text variant="18-bold" style={s.center}>
              {(user?.name ?? '로봇') + '이 쓰는 분리수거장이라\n지울 수 없어요'}
            </Text>
            <Text variant="13-regular" color="textSub" style={s.center}>
              {`먼저 ${user?.name ?? '로봇'}이 비우러 갈 다른 분리수거장을\n골라 주세요. 그다음 지울 수 있어요.`}
            </Text>
            {user ? (
              <Button
                label={`${user.name} 분리수거장 바꾸기`}
                onPress={() => {
                  setBlocked(false);
                  onChangeRoute(user.id);
                }}
              />
            ) : null}
            <Button label="닫기" variant="soft" onPress={() => setBlocked(false)} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex1: { flex: 1, gap: 4 },
  flex2: { flex: 2 },
  gap12: { gap: space[12] },
  center: { textAlign: 'center' },
  head: { paddingHorizontal: space[24], paddingTop: space[12], paddingBottom: space[12], gap: space[8] },
  map: { height: 260 },
  padX: { paddingHorizontal: layout.screenPadding, paddingTop: space[12], gap: space[8] },
  card: { backgroundColor: colors.card, borderRadius: radius[16], padding: space[16], gap: space[12], ...softShadow },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[12], minHeight: 44 },
  recycleDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.done,
    alignItems: 'center',
    justifyContent: 'center',
  },
  useBadge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: space[8],
    paddingVertical: 2,
    backgroundColor: colors.bg,
  },
  useBadgeOn: { backgroundColor: colors.bgBrandSoft },
  footer: { position: 'absolute', left: layout.screenPadding, right: layout.screenPadding, bottom: space[24] },
  input: {
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.bgBrandSoft,
    paddingHorizontal: 14,
    ...typography['15-bold'],
    color: colors.text,
    outlineStyle: 'none',
  } as object,
  note: { backgroundColor: colors.bgBrandSoft, borderRadius: 12, padding: space[12], gap: 2 },
  actions: { flexDirection: 'row', gap: space[8] },
  deleteLink: { alignItems: 'center', paddingVertical: space[8] },
  dim: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: space[24] },
  dialog: {
    width: 320,
    maxWidth: '100%',
    backgroundColor: colors.card,
    borderRadius: radius[20],
    padding: space[24],
    gap: space[12],
    ...softShadow,
  },
  symbol: {
    alignSelf: 'center',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.bgError,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
