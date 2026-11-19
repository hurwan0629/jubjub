# 로봇 배정 요청 API

하위관리자의 최초·추가 배정 요청과 총관리자의 실제 배정을 분리해요. 프론트는 변경하지 않아요. 기존 `POST /admin/robots`(기기 등록), `PATCH /admin/robots/{robot_id}/assignment`(직접 배정·이동·회수)는 유지해요.

## 경로와 권한

모든 API는 `Authorization: Bearer <accessToken>`이 필요해요. 승인된 하위관리자만 요청할 수 있고 총관리자만 승인·반려할 수 있어요. JSON 필드는 camelCase, ID는 문자열이에요.

| Method | Path | 권한 | 성공 응답 |
| --- | --- | --- | --- |
| POST | /robot-assignment-requests | 하위관리자 | 201 요청 객체 |
| GET | /robot-assignment-requests | 하위관리자 | 200 내 요청 배열 |
| POST | /robot-assignment-requests/{request_id}/cancel | 요청한 하위관리자 | 200 취소된 요청 |
| GET | /admin/robot-assignment-requests | 총관리자 | 200 요청 배열 |
| POST | /admin/robot-assignment-requests/{request_id}/approve | 총관리자 | 200 승인·배정된 요청 |
| POST | /admin/robot-assignment-requests/{request_id}/reject | 총관리자 | 200 반려된 요청 |

GET 두 경로는 `status=all|pending|approved|rejected|cancelled`, `limit=20`(1~100), `offset=0`(0~9223372036854775807)을 받아요. 내 목록의 기본 status는 all이고 총관리자는 pending이에요. 최신 생성 시각·ID 순으로 내려주며 결과가 없으면 `[]`예요. 취소는 본문이 없어요. Path ID는 1~9223372036854775807이에요.

## 배정 요청

```json
{
  "robotCount": 2,
  "reason": "주말 방문객이 많아 추가 순찰이 필요해요"
}
```

- robotCount: 추가로 필요한 대수, 정수 1~100이에요. 이미 배정된 로봇 대수를 포함한 총 목표 대수가 아니에요. 소수·문자열·boolean은 거부해요.
- reason: 필수 사항이에요. 앞뒤 공백 제거 후 1~1000자이며 누락·빈 문자열·공백만 있는 값은 `422 validation_error`로 거부해요.
- 신청자·공원은 로그인 계정에서 결정해요. `userId`, `parkId`, `catalogId`, `status` 같은 추가 입력은 422예요.
- 공원당 pending은 한 건이에요. 요청만으로 로봇이 생성·배정되지는 않아요. 취소·반려 후 다시 신청할 수 있어요.

## 승인과 실제 배정

```json
{
  "robotIds": ["7", "8"]
}
```

- 요청한 대수와 정확히 같은 수의 로봇을 선택해야 해요. 부분 승인은 지원하지 않아요. ID는 중복 없이 양의 bigint 범위여야 해요.
- 모든 로봇이 미배정이고 idle 또는 offline이어야 해요. 다른 공원에서 가져오거나 현재 공원에 배정된 로봇을 중복 계산할 수 없어요.
- 신청자의 승인 상태·역할·운영 공원과 신청 당시 catalogId가 유지되고 공원이 활성 상태여야 해요. 공원 변경 등으로 신청이 오래된 상태라면 취소·반려 후 새로 요청해요.
- 요청 승인·실제 배정·승인 당시 로봇 ID 이력·초안 복사·알림 저장은 하나의 트랜잭션이에요. 한 단계라도 실패하면 전부 되돌려요. 이미 배정된 로봇의 경로·시간표는 유지해요.
- 미배정 초안이 있으면 한 번에 모든 신규 로봇에 독립된 설정으로 복사해요. 기존 로봇의 설정을 임의로 복사하지는 않아요.
- 배정 이후 로봇을 회수해도 요청의 assignedRobotIds는 승인 당시 이력으로 보존해요.

## 반려

```json
{
  "reason": "현재 배정 가능한 로봇이 없어요"
}
```

사유는 앞뒤 공백 제거 후 1~1000자예요. 승인·반려·취소는 pending 요청에만 가능해요. 완료된 요청을 반복 처리하면 409예요.

## 응답 객체

```json
{
  "id": "31",
  "userId": "12",
  "parkId": "5",
  "catalogId": "69",
  "parkName": "예시공원",
  "applicantName": "공원 관리자",
  "applicantLoginId": "manager01",
  "robotCount": 2,
  "reason": "주말 방문객이 많아 추가 순찰이 필요해요",
  "status": "approved",
  "rejectReason": null,
  "reviewedBy": "8",
  "reviewedAt": "2026-11-18T07:00:00Z",
  "createdAt": "2026-11-18T06:00:00Z",
  "assignedRobotIds": ["7", "8"]
}
```

pending은 reviewedBy·reviewedAt·rejectReason이 null이고 assignedRobotIds는 빈 배열이에요. 승인하면 총관리자 ID·처리 시각·선택 로봇 ID를 기록해요. 취소 시 reviewedBy는 요청한 관리자 ID예요. 반려 사유는 rejected일 때만 저장해요. parkName은 신청 당시 catalogId에 연결된 이름이고 applicantName·applicantLoginId는 현재 계정 정보예요.

## 오류

기존 `{status, message, code, details?}` 형식을 유지해요.

| HTTP | code | 조건 |
| --- | --- | --- |
| 401/403 | invalid_token, registration_pending, registration_rejected, manager_required, super_admin_required | 인증·역할·가입 승인 검사 |
| 404 | robot_assignment_request_not_found | 없는 요청 또는 타인의 요청 취소 |
| 409 | robot_assignment_request_pending | 같은 공원에 대기 요청 존재 |
| 409 | robot_assignment_request_not_pending | 이미 승인·반려·취소된 요청 |
| 409 | robot_assignment_request_stale | 신청자의 역할·승인·공원이 변경됨 |
| 409 | park_not_approved, park_catalog_inactive | 승인된 활성 공원 조건 불충족 |
| 422 | robot_assignment_count_mismatch | 선택 대수와 요청 대수가 다름 |
| 404 | robot_not_found | 선택 로봇 없음 |
| 409 | robot_already_assigned, robot_not_available | 이미 배정됨 또는 가용 상태가 아님 |
| 422 | validation_error | 수량·ID·입력 형식 오류 |
| 409/503 | settings_conflict, patrol_unavailable | 저장 충돌 또는 DB 처리 실패 |

## DB와 알림

마이그레이션 `20261118_0010`이 `robot_assignment_requests`, `robot_assignment_request_robots`를 생성해요. 요청은 사용자·운영 공원·신청 당시 공원 목록·요청 대수·메모·상태·처리자를 보존하고, 연결 테이블은 승인 당시 로봇을 보존해요. 두 테이블은 RLS를 활성화하며 공원별 대기 요청은 부분 유일 인덱스로 보호해요.

승인·반려 시 notifications와 기기별 발송 대기열을 함께 저장해요. 유형은 `robotAssignmentApproved`, `robotAssignmentRejected`예요. 알림 조회·읽음 처리·Expo 발송 및 운영 설정은 [NOTIFICATIONS.md](NOTIFICATIONS.md)를 참고해요. 프론트는 변경하지 않아요.
