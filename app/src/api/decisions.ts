// 판단 로그 API (A-08 판단 로그, A-09 상세, 홈 "에이전트가 방금 한 일"). 서버: server/app/routers/logs.py
import type { ImageSource } from 'expo-image';

import { API_URL, ApiError, mockFor, mockResponse, request } from './client';
import { MOCK_LOG_PHOTOS, mockDecisions, mockDetailOf } from './mock/decisions';
import type { Decision, DecisionDetail, DecisionDetailResponse, DecisionOrder, DecisionType } from './types';

type DecisionQuery = { type?: DecisionType; limit?: number; date?: string; order?: DecisionOrder };

/** GET /logs?type=&limit=&date=YYYY-MM-DD&order=desc|asc */
export function getDecisions(options: DecisionQuery = {}): Promise<Decision[]> {
  const { type, limit, date, order = 'desc' } = options;
  if (mockFor('decisions')) {
    const list = mockDecisions.filter((d) => !type || d.type === type);
    const sorted = order === 'asc' ? [...list].reverse() : list;
    return mockResponse(limit ? sorted.slice(0, limit) : sorted);
  }
  const query = new URLSearchParams();
  if (type) query.set('type', type);
  if (limit) query.set('limit', String(limit));
  if (date) query.set('date', date);
  query.set('order', order);
  return request(`/logs?${query.toString()}`);
}

/** 사진 경로 → 화면에 넣을 이미지 */
export function logPhotoOf(url: string | null | undefined): ImageSource | null {
  if (!url) return null;
  if (url in MOCK_LOG_PHOTOS) return MOCK_LOG_PHOTOS[url];
  return { uri: url.startsWith('http') ? url : `${API_URL}${url}` };
}

function toDetail(res: DecisionDetailResponse): DecisionDetail {
  const { photoUrl, shots, ...rest } = res;
  return {
    ...rest,
    photo: logPhotoOf(photoUrl),
    shots: shots.map((shot) => ({
      photo: logPhotoOf(shot.photoUrl),
      caption: shot.caption,
      highlight: shot.highlight,
    })),
  };
}

/** GET /logs/{id} */
export async function getDecision(id: string): Promise<DecisionDetail> {
  if (mockFor('decisions')) {
    const found = mockDecisions.find((d) => d.id === id);
    if (!found) throw new ApiError(404, '판단 기록을 찾을 수 없어요', 'log_not_found');
    return toDetail(await mockResponse({ ...found, ...mockDetailOf(found) }));
  }
  return toDetail(await request<DecisionDetailResponse>(`/logs/${id}`));
}
