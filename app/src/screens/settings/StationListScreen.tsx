// C-02 분리수거장 관리. 기준: Figma Page 5 "C-02 분리수거장 관리"
// 공원의 분리수거장 여러 곳을 지도와 목록으로 보여 줘요. 지도를 꾹 누르거나 "+ 분리수거장 추가"로 새로 만들고,
// 항목을 누르면 위치 · 이름을 바꾸는 편집 화면으로 가요.
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Station } from '@/api/types';
import { Button, Header, Icon, MapHint, ParkMap, Text } from '@/components';
import { useRouteConfig } from '@/hooks/useRoute';
import { useStations } from '@/hooks/useStations';
import { icons } from '@/icons';
import type { RootParams } from '@/navigation';
import { colors, layout, radius, softShadow, space } from '@/theme';
import { shortStationName } from '@/utils/labels';

type Props = NativeStackScreenProps<RootParams, 'StationList'>;

export function StationListScreen({ navigation }: Props) {
  const { data: stations = [], reload } = useStations();
  const { data: route } = useRouteConfig();

  // 편집 화면에서 돌아오면 다시 불러요
  useEffect(() => navigation.addListener('focus', reload), [navigation, reload]);

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <Header title="분리수거장 관리" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.intro}>
          <Text variant="18-bold">
            {route?.parkName ?? '공원'} 분리수거장 {stations.length}곳
          </Text>
          <Text variant="13-regular" color="textBody" lineHeight="relaxed">
            모든 로봇이 같이 써요. 눌러서 위치와 이름을 바꿀 수 있어요
          </Text>
        </View>

        {route ? (
          <ParkMap
            style={s.map}
            bounds={route.bounds}
            area={route.area}
            markers={stations.map((st) => ({
              id: st.id,
              kind: 'station' as const,
              position: st.position,
              label: shortStationName(st.name),
              showLabel: true,
            }))}
            onMarkerPress={(id) => navigation.navigate('StationEdit', { id })}
            onLongPress={(position) => navigation.navigate('StationEdit', { position })}
          />
        ) : (
          <View style={s.map} />
        )}
        <MapHint text="지도를 꾹 누르면 새 분리수거장을 추가해요" />

        <View style={s.listWrap}>
          <View style={s.list}>
            {stations.map((st, i) => (
              <View key={st.id}>
                {i > 0 ? <View style={s.divider} /> : null}
                <StationRow station={st} onPress={() => navigation.navigate('StationEdit', { id: st.id })} />
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={s.bottom}>
        <Button label="+ 분리수거장 추가" variant="soft" onPress={() => navigation.navigate('StationEdit', {})} />
      </View>
    </SafeAreaView>
  );
}

function StationRow({ station, onPress }: { station: Station; onPress: () => void }) {
  const used = station.robots.length > 0;
  return (
    <Pressable style={s.row} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${station.name} 편집`}>
      <View style={s.marker}>
        <Icon source={icons.markerRecycle} size={22} />
      </View>
      <View style={s.rowText}>
        <Text variant="14-semibold">{station.name}</Text>
        <View style={[s.badge, { backgroundColor: used ? colors.chipIdle : colors.bg }]}>
          <Text variant="10-semibold" color={used ? 'brandText' : 'textBody'}>
            {used ? `${station.robots.map((r) => r.name).join(', ')} 사용 중` : '쓰는 로봇 없음'}
          </Text>
        </View>
      </View>
      <Text variant="13-semibold" color="brandText">
        편집 ›
      </Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: space[24] },
  intro: { paddingHorizontal: layout.screenPadding, paddingTop: space[8], paddingBottom: space[12], gap: space[8] },
  map: { height: 290, backgroundColor: colors.map },
  listWrap: { paddingHorizontal: layout.screenPadding, paddingTop: space[12] },
  list: { backgroundColor: colors.card, borderRadius: radius[16], paddingHorizontal: 14, paddingVertical: 10 },
  divider: { height: 1, backgroundColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  marker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: colors.card,
    backgroundColor: colors.done,
    alignItems: 'center',
    justifyContent: 'center',
    ...softShadow,
  },
  rowText: { flex: 1, gap: 3 },
  badge: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  bottom: {
    backgroundColor: colors.card,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space[12],
    paddingBottom: space[8],
  },
});
