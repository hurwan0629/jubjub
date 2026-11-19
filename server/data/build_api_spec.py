"""현재 OpenAPI와 검토한 업무 규칙으로 게시용 명세서를 만들어요."""

import ast
import copy
import html
import json
from pathlib import Path

from app.main import app
from app.schemas import approval, auth, common, health, notifications, operations, parks, patrol, robot_assignment
from data.notifications_spec import extend_notification_spec

ROOT = Path(__file__).resolve().parents[1]
schema = app.openapi()
schemas = schema["components"]["schemas"]
md, ht = [], []


def heading(level, title):
    md.append("#" * level + " " + title)
    ht.append(f"<h{level}>{html.escape(title)}</h{level}>")


def para(value):
    md.append(value)
    ht.append("<p>" + html.escape(value) + "</p>")


def code(value, language="json"):
    value = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, indent=2)
    md.append(f"```{language}\n{value}\n```")
    ht.append(f'<pre><code class="language-{language}">{html.escape(value)}</code></pre>')


def table(headers, rows):
    rows = [list(map(str, row)) for row in rows]
    md.append(
        "\n".join(
            ["| " + " | ".join(headers) + " |", "| " + " | ".join(["---"] * len(headers)) + " |"]
            + ["| " + " | ".join(x.replace("|", "\\|").replace("\n", " ") for x in row) + " |" for row in rows]
        )
    )
    ht.append(
        "<table><thead><tr>"
        + "".join("<th><p>" + html.escape(x) + "</p></th>" for x in headers)
        + "</tr></thead><tbody>"
        + "".join("<tr>" + "".join("<td><p>" + html.escape(x) + "</p></td>" for x in row) + "</tr>" for row in rows)
        + "</tbody></table>"
    )


def bullets(items):
    md.append("\n".join("- " + x for x in items))
    ht.append("<ul>" + "".join("<li><p>" + html.escape(x) + "</p></li>" for x in items) + "</ul>")


def typ(s):
    if "$ref" in s:
        return s["$ref"].split("/")[-1]
    if "anyOf" in s:
        return " / ".join(typ(x) for x in s["anyOf"])
    if s.get("type") == "array":
        return typ(s["items"]) + "[]"
    return s.get("type", "object") + (f" ({s['format']})" if "format" in s else "")


def rules(s):
    result = []
    if "enum" in s:
        result.append("허용: " + ", ".join(map(str, s["enum"])))
    if "const" in s:
        result.append("고정값: " + str(s["const"]))
    for key, label in [
        ("minLength", "최소 문자 수"),
        ("maxLength", "최대 문자 수"),
        ("minItems", "최소 항목 수"),
        ("maxItems", "최대 항목 수"),
        ("minimum", "최솟값"),
        ("maximum", "최댓값"),
        ("pattern", "정규식"),
    ]:
        if key in s:
            result.append(f"{label}: {s[key]}")
    if "default" in s:
        result.append("기본값: " + json.dumps(s["default"], ensure_ascii=False))
    if "anyOf" in s:
        result.extend(rules(x) for x in s["anyOf"] if x.get("type") != "null")
    return "; ".join(x for x in result if x)


loc = {"latitude": 37.5433, "longitude": 127.0332}
loc2 = {"latitude": 37.5435, "longitude": 127.0334}
bounds = {"southWest": {"latitude": 37.54, "longitude": 127.03}, "northEast": {"latitude": 37.55, "longitude": 127.04}}
area = {
    "outer": [
        {"latitude": a, "longitude": b}
        for a, b in [(37.54, 127.03), (37.54, 127.04), (37.55, 127.04), (37.55, 127.03), (37.54, 127.03)]
    ],
    "holes": [],
}
park = {
    "id": "69",
    "name": "예시공원",
    "address": "서울특별시 예시 주소",
    "distance": "",
    "bounds": bounds,
    "area": area,
}
profile = {
    "name": "공원 관리자",
    "email": "manager@example.com",
    "role": "manager",
    "parkStatus": "approved",
    "routeSetupDone": False,
    "registrationStatus": "approved",
}
managed = {
    "id": "5",
    "catalogId": "69",
    "name": park["name"],
    "address": park["address"],
    "center": loc,
    "bounds": bounds,
    "area": area,
    "status": "approved",
    "reviewedBy": "8",
    "reviewedAt": "2026-11-18T03:00:00Z",
    "rejectReason": None,
    "routeSetupDone": False,
    "anchorPoints": [],
}
register = {
    "loginId": "manager01",
    "password": "ExamplePass123!",
    "name": profile["name"],
    "phone": "010-1234-5678",
    "email": profile["email"],
    "catalogId": "69",
}
slot = {"time": "10:00", "label": "오전 순찰", "on": True, "repeat": "daily"}
point = {"name": "정문", "position": loc2}
examples = {
    "HealthResponse": {"status": "ok", "db": "ok"},
    "LatLng": loc,
    "ParkBounds": bounds,
    "ParkArea": area,
    "ParkResponse": park,
    "LoginRequest": {"loginId": register["loginId"], "password": register["password"]},
    "RegisterRequest": register,
    "ProfileResponse": profile,
    "RegisterResponse": dict(profile, id="12", registrationStatus="pending", parkStatus="pending"),
    "LoginResponse": {
        k: v
        for k, v in dict(
            profile, accessToken="<accessToken>", tokenType="bearer", expiresIn=3600, isFirstLogin=True
        ).items()
        if k not in ("name", "email")
    },
    "ReapplicationSession": {
        "reapplicationToken": "<reapplicationToken>",
        "expiresIn": 1800,
        "loginId": register["loginId"],
        "name": profile["name"],
        "email": profile["email"],
        "phone": "01012345678",
        "catalogId": "69",
        "rejectReason": "담당자 정보를 확인해 주세요",
        "park": park,
    },
    "ReapplyRequest": {k: v for k, v in register.items() if k != "loginId"}
    | {"reapplicationToken": "<reapplicationToken>"},
    "ManagedPark": managed,
    "ParkSelection": {"catalogId": "69"},
    "PointInput": point,
    "PointResponse": dict(point, id="101"),
    "RouteInput": {"catalogId": "69", "points": [point]},
    "ScheduleInput": slot,
    "ScheduleResponse": dict(slot, id="30"),
    "ConfigInput": {"catalogId": "69", "station": loc, "points": [point], "schedule": [slot]},
    "ConfigResponse": {
        "catalogId": "69",
        "robotId": "6",
        "parkName": park["name"],
        "bounds": bounds,
        "area": area,
        "station": loc,
        "points": [dict(point, id="101")],
        "schedule": [dict(slot, id="30")],
    },
    "RouteResponse": {
        "catalogId": "69",
        "robotId": "6",
        "id": "20",
        "start": loc,
        "points": [dict(point, id="101")],
        "end": loc,
        "appliesFrom": "nextPatrol",
    },
    "SetupResponse": {"routeSetupDone": True},
    "ApprovalInput": {"robotIds": ["6"]},
    "RejectionInput": {"reason": "담당 공원 확인이 필요해요"},
    "RobotInput": {"name": "jub21", "serialNo": "jub21"},
    "RobotNameInput": {"name": "순찰 로봇"},
    "RobotResponse": {
        "id": "6",
        "name": "jub3",
        "serialNo": "jub3",
        "parkId": "5",
        "status": "offline",
        "assignedAt": "2026-11-18T03:00:00Z",
        "createdAt": "2026-11-18T02:00:00Z",
        "slamX": None,
        "slamY": None,
        "lat": None,
        "lng": None,
        "batteryVoltage": None,
        "lastSeenAt": None,
        "parkName": None,
        "managerId": None,
        "managerName": None,
        "managerLoginId": None,
    },
    "ParkRequestResponse": dict(
        managed,
        userId="12",
        applicantName=profile["name"],
        applicantLoginId="manager01",
        applicantEmail=profile["email"],
        applicantPhone="01012345678",
        registrationStatus="approved",
        createdAt="2026-11-18T02:00:00Z",
    ),
    "ParkChangeInput": {"catalogId": "70", "reason": "담당 공원이 변경되었어요"},
    "ParkChangeResponse": {
        "id": "31",
        "parkId": "5",
        "userId": "12",
        "applicantName": profile["name"],
        "applicantLoginId": "manager01",
        "currentCatalogId": "69",
        "currentParkName": park["name"],
        "requestedCatalogId": "70",
        "requestedParkName": "다른 예시공원",
        "requestedParkAddress": "서울특별시 다른 예시 주소",
        "reason": "담당 공원이 변경되었어요",
        "status": "pending",
        "rejectReason": None,
        "createdAt": "2026-11-18T03:00:00Z",
        "reviewedAt": None,
        "conflictingManagerName": None,
    },
    "AssignmentInput": {"parkId": "5"},
    "AdminParkResponse": {
        "id": "5",
        "catalogId": "69",
        "name": park["name"],
        "address": park["address"],
        "managerId": "12",
        "managerName": profile["name"],
        "managerLoginId": "manager01",
        "status": "approved",
        "robotCount": 2,
    },
    "ErrorResponse": {
        "status": 403,
        "message": "총관리자의 회원가입 승인을 기다리고 있어요. 승인 후 로그인해 주세요",
        "code": "registration_pending",
    },
    "RobotAssignmentRequestInput": {"robotCount": 2, "reason": "추가 순찰이 필요해요"},
    "RobotAssignmentApprovalInput": {"robotIds": ["7", "8"]},
    "RobotAssignmentRequestResponse": {
        "id": "41",
        "userId": "12",
        "parkId": "5",
        "catalogId": "69",
        "parkName": park["name"],
        "applicantName": profile["name"],
        "applicantLoginId": "manager01",
        "robotCount": 2,
        "reason": "추가 순찰이 필요해요",
        "status": "pending",
        "rejectReason": None,
        "reviewedBy": None,
        "reviewedAt": None,
        "createdAt": "2026-11-18T03:00:00Z",
        "assignedRobotIds": [],
    },
}


def example(s):
    if "$ref" in s:
        return copy.deepcopy(examples[s["$ref"].split("/")[-1]])
    if "anyOf" in s:
        return example(next(x for x in s["anyOf"] if x.get("type") != "null"))
    if s.get("type") == "array":
        return [example(s["items"])]
    raise ValueError(s)


# title, business rule, selected business errors (common auth/validation errors are documented once).
spec = {}


def add(method, path, title, note, errors=""):
    spec[(method.lower(), path)] = (title, note, errors)


add(
    "GET",
    "/health",
    "서버·DB 상태 확인",
    "SELECT 1로 DB 연결을 확인합니다. 로봇·외부 서비스 정상 여부까지 의미하지 않습니다.",
    "503 db_unavailable",
)
add(
    "GET",
    "/parks",
    "공원 검색",
    "활성 공원만 이름·ID 순서로 반환합니다. 이름 또는 주소에 검색 단어가 모두 포함되어야 합니다. 공백 검색어·검색 결과 없음은 []입니다. 거리순 검색은 없고 distance는 빈 문자열입니다.",
    "503 park_catalog_unavailable",
)
add(
    "POST",
    "/auth/register",
    "회원가입 신청",
    "가입 계정과 담당 공원을 하나의 트랜잭션으로 생성합니다. manager 역할만 생성하고 pending으로 대기합니다. 토큰은 발급하지 않습니다. 비밀번호 확인·개인정보 동의는 앱에서 검사합니다. 아이디는 대소문자를 구분하고 이메일은 소문자로 정규화합니다. 정의하지 않은 필드는 422입니다.",
    "404 park_not_found; 409 account_exists; 503 registration_unavailable",
)
add(
    "POST",
    "/auth/login",
    "로그인",
    "비밀번호 확인 후 승인된 계정에만 토큰을 발급합니다. pending·rejected는 403입니다. 총관리자는 웹에서 로그인하며 앱은 web_login_required로 안내합니다(앱 자체 오류). isFirstLogin은 최초 로그인 횟수가 아니라 manager의 순찰 초기 설정 필요 여부입니다.",
    "401 invalid_credentials; 403 registration_pending / registration_rejected / registration_incomplete; 503 auth_not_configured",
)
add(
    "POST",
    "/auth/reapplication-session",
    "반려 사유·재신청 정보 조회",
    "기존 아이디·비밀번호로 본인 확인한 반려 manager만 호출할 수 있습니다. 기존 정보와 반려 사유, 30분 유효한 재신청 전용 토큰을 반환합니다. 비밀번호는 반환하지 않습니다. park는 활성 공원일 때 기존 선택 정보이고, 비활성 공원은 null입니다. 일반 업무 API에는 이 토큰을 사용할 수 없습니다.",
    "401 invalid_credentials; 409 registration_not_rejected; 503 auth_not_configured",
)
add(
    "POST",
    "/auth/reapply",
    "반려된 가입 신청 수정·재제출",
    "일반 Bearer 토큰 대신 본문의 reapplicationToken을 사용합니다. 같은 계정·신청 행을 수정하고 pending으로 되돌립니다. loginId·role 입력은 허용하지 않습니다. 비밀번호를 새로 입력하며 이전 비밀번호를 반환하거나 자동 채우지 않습니다. 다른 공원을 고르면 이전 경로·지점·시간표·좌표 기준점을 초기화하고 미처리 공원 변경 요청은 취소합니다. 제출 후 토큰을 다시 사용할 수 없으며 다시 승인받아야 로그인할 수 있습니다.",
    "401 invalid_token; 404 park_not_found; 409 account_exists / registration_not_rejected; 503 registration_unavailable / auth_not_configured",
)
add(
    "GET",
    "/me",
    "내 계정 조회",
    "토큰 소유자의 이름·이메일·역할·가입 승인 상태·초기 설정 완료 여부를 반환합니다. 총관리자는 parkStatus=null, registrationStatus=approved입니다.",
)
add(
    "GET",
    "/park",
    "담당 공원 조회",
    "로그인한 manager의 운영 공원과 지도 정보·승인 정보를 반환합니다. id는 parks.id, catalogId는 공원 목록 ID입니다. pending·rejected 계정은 공통 인증 단계에서 차단됩니다.",
    "404 park_not_found",
)
add(
    "PUT",
    "/park",
    "담당 공원 선택 — 기존 호환 API",
    "현재 공개 가입은 /auth/register에서 공원을 함께 저장합니다. 승인 계정은 같은 catalogId 요청에는 기존 공원을 반환하고, 다른 공원으로 직접 바꾸는 요청은 거부합니다. pending·rejected는 인증 단계에서 차단되어 이 API로 재신청할 수 없습니다. 공원 변경은 /park-change-requests, 반려 재신청은 /auth/reapply를 사용합니다.",
    "404 park_not_found; 409 approved_park_change_forbidden",
)
add(
    "GET",
    "/station",
    "공유 분리수거장 조회",
    "공원 공통 분리수거장 좌표를 반환합니다. 미등록이면 null입니다. 로봇별 분리수거장을 따로 두지 않습니다.",
)
add(
    "PUT",
    "/station",
    "공유 분리수거장 저장",
    "catalogId는 query로 전달합니다. 공원 경계 안 좌표만 허용합니다. 위치를 옮기면 같은 공원의 배정 로봇·미배정 초안의 활성 경로를 모두 검증하고 경로 버전을 함께 갱신합니다. 어느 경로라도 유효하지 않으면 전체 변경을 취소합니다.",
    "409 park_changed; 422 point_outside_park / point_too_far",
)
add(
    "GET",
    "/routes",
    "로봇별 순찰 경로 조회",
    "robotId로 대상 로봇을 지정합니다. 미설정이면 id/start/end가 null일 수 있고 points=[]입니다. start/end는 해당 경로 버전의 분리수거장 좌표이며 appliesFrom=nextPatrol입니다. 실제 주행 가능한 polyline 계산 API가 아닙니다.",
    "404 robot_not_found; 422 robot_required",
)
add(
    "PUT",
    "/routes",
    "로봇별 순찰 지점·순서 저장",
    "body.catalogId로 편집 시작 당시 공원을 확인합니다. points 배열 순서가 순찰 순서입니다. 좌표 중복은 거부하고 분리수거장이 먼저 있어야 합니다. 기존 경로를 비활성화하고 새 버전·새 지점 ID를 생성합니다. 전달한 임시 id를 식별 권한으로 사용하지 않습니다. 다음 순찰 적용 설정이며 실행 중인 로봇에 즉시 경로 명령을 보내는 API가 아닙니다.",
    "404 robot_not_found; 409 station_required / park_changed; 422 robot_required / point_outside_park / point_too_far",
)
add(
    "GET",
    "/schedules",
    "로봇별 순찰 시간표 조회",
    "robotId로 조회합니다. runAt이 아니라 time=HH:mm, enabled가 아니라 on 필드를 사용합니다. 미설정이면 []입니다.",
    "404 robot_not_found; 422 robot_required",
)
add(
    "PUT",
    "/schedules",
    "로봇별 순찰 시간표 교체",
    "본문은 객체가 아닌 배열입니다. 최대 100개이며 []로 비울 수 있습니다. 같은 시각의 동일 repeat와 daily+weekdays/weekends 조합은 중복입니다. 같은 시각의 weekdays+weekends는 허용합니다. on=false여도 중복 검사는 적용됩니다. 비우면 다른 로봇의 완성 설정 유무에 따라 routeSetupDone이 false가 될 수 있습니다.",
    "404 robot_not_found; 409 park_changed; 422 robot_required / duplicate_schedule",
)
add(
    "GET",
    "/route",
    "로봇별 전체 순찰 설정 조회",
    "분리수거장·지점·시간표·공원 경계를 한 번에 반환합니다. station은 공원 공통이고 경로·시간표는 로봇별입니다. 미설정은 station=null, points=[], schedule=[]입니다.",
    "404 robot_not_found; 422 robot_required",
)
add(
    "PUT",
    "/route",
    "전체 순찰 설정 일괄 저장",
    "분리수거장·경로·시간표를 하나의 트랜잭션으로 저장하고 routeSetupDone=true로 완료합니다. points·schedule은 각각 1~100개입니다. body.catalogId와 query.robotId를 사용합니다. 공유 분리수거장 변경은 다른 로봇의 기존 경로도 함께 검증·갱신합니다. 실패하면 일부 항목만 저장되지 않습니다.",
    "404 robot_not_found; 409 park_changed; 422 robot_required / point_outside_park / point_too_far / duplicate_schedule",
)
add(
    "POST",
    "/route/complete",
    "개별 순찰 설정 완료 처리",
    "본문 없이 query.robotId·catalogId를 사용합니다. 대상 로봇(또는 미배정 초안)에 분리수거장·활성 경로·시간표가 모두 있어야 완료합니다. PUT /route는 이 완료 처리를 포함하므로 별도 호출이 필요 없습니다.",
    "404 robot_not_found; 409 setup_incomplete / park_changed; 422 robot_required",
)
add(
    "GET",
    "/admin/registrations",
    "총관리자 — 가입 신청 목록",
    "status 기본값은 pending, all이면 전체입니다. 각 항목은 운영 공원 정보와 신청자 정보를 포함하며 createdAt·id 오름차순입니다. createdAt은 parks 행의 생성 시각으로 재신청할 때 새로 갱신되는 시각은 아닙니다.",
)
add(
    "POST",
    "/admin/registrations/{user_id}/approve",
    "총관리자 — 가입 승인",
    "path에는 계정 user_id를 넣습니다. {}로 로봇 없이도 승인할 수 있습니다. robotIds는 중복 없는 최대 100개입니다. 공원 목록이 활성이고 같은 catalogId에 승인된 다른 관리자가 없어야 합니다. 지정 로봇은 미배정이며 idle 또는 offline이어야 합니다. 초안 설정은 로봇별 독립 설정으로 복사합니다.",
    "404 registration_not_found / robot_not_found; 409 park_request_not_pending / park_catalog_inactive / park_already_approved / invalid_applicant_role / robot_already_assigned / robot_not_available",
)
add(
    "POST",
    "/admin/registrations/{user_id}/reject",
    "총관리자 — 가입 반려",
    "대기 신청만 반려합니다. reason은 공백 제거 후 1~1000자입니다. 승인 정보는 null로 초기화하고 rejectReason을 남깁니다. 응답은 신청자 목록 항목이 아닌 ManagedPark입니다.",
    "404 registration_not_found; 409 park_request_not_pending",
)
add(
    "POST",
    "/admin/registrations/{user_id}/revoke",
    "총관리자 — 기존 가입 승인 취소",
    "approved 계정만 취소할 수 있습니다. 모든 배정 로봇이 idle 또는 offline이어야 하고 로봇은 미배정으로 회수합니다. 계정은 rejected로 전환되며 사유를 저장합니다. 이전 로그인 토큰으로도 업무 접근이 즉시 차단됩니다. 이후 반려 재신청 절차를 사용할 수 있습니다.",
    "404 registration_not_found; 409 registration_not_approved / robot_not_available",
)
add(
    "GET",
    "/admin/park-requests",
    "총관리자 — 공원 신청 목록(호환)",
    "가입 신청 목록의 기존 호환 경로입니다. 기본 status는 없음(전체)이고 all 문자열은 허용하지 않습니다. offset 상한은 10000입니다. 새 클라이언트는 /admin/registrations를 사용합니다.",
)
add(
    "POST",
    "/admin/parks/{park_id}/approve",
    "총관리자 — 공원 ID로 승인(호환)",
    "계정 userId가 아니라 운영 공원 park_id를 받는 기존 호환 API입니다. 처리 규칙·본문·응답은 가입 승인과 같습니다.",
    "404 park_request_not_found / robot_not_found; 409 park_request_not_pending / park_already_approved / park_catalog_inactive / invalid_applicant_role / robot_already_assigned / robot_not_available",
)
add(
    "POST",
    "/admin/parks/{park_id}/reject",
    "총관리자 — 공원 ID로 반려(호환)",
    "계정 userId가 아니라 운영 공원 park_id를 받습니다. 대기 중인 신청만 반려하며 새 클라이언트는 /admin/registrations/{user_id}/reject를 사용합니다.",
    "404 park_request_not_found; 409 park_request_not_pending",
)
add(
    "POST",
    "/admin/robots",
    "총관리자 — 로봇 등록",
    "name·serialNo는 앞뒤 공백 제거 후 각각 1~100자입니다. serialNo는 고유합니다. 신규 로봇은 실제 연결 확인 전이므로 offline, parkId/assignedAt=null로 생성합니다.",
    "409 robot_serial_exists",
)
add(
    "GET",
    "/admin/robots",
    "총관리자 — 전체·미배정 로봇 목록",
    "unassigned=true이면 미배정 로봇만 반환합니다. 기본 false는 전체입니다. id 오름차순, limit·offset 페이지 방식입니다. 배정 로봇은 담당 공원·관리자 필드를 채웁니다.",
)
add(
    "GET",
    "/robots",
    "내 공원의 배정 로봇 목록",
    "승인된 manager의 공원에 배정된 로봇만 id 오름차순으로 반환합니다. 미배정이면 []입니다. 실제 측정 전 좌표·전압·최근 수신 시각은 null입니다.",
)
add(
    "GET",
    "/robots/{robot_id}",
    "내 공원의 로봇 상세 조회",
    "내 공원 소속 로봇만 조회합니다. 다른 공원 또는 없는 로봇은 같은 404로 처리합니다.",
    "404 robot_not_found",
)
add(
    "PATCH",
    "/robots/{robot_id}",
    "내 공원 로봇 이름 수정",
    "수정 가능한 필드는 name뿐입니다. 기기 식별 번호·경로·시간표는 바뀌지 않습니다. 이름은 앞뒤 공백 제거 후 1~100자입니다.",
    "404 robot_not_found",
)
add(
    "GET",
    "/park-change-requests",
    "내 공원 변경 요청 이력",
    "내 계정의 최신 요청 최대 50개를 id 내림차순으로 반환합니다. 다른 관리자의 요청은 보이지 않습니다. 별도 페이지 query는 없습니다.",
)
add(
    "POST",
    "/park-change-requests",
    "담당 공원 변경 신청",
    "승인된 manager가 현재 공원과 다른 활성 공원으로 변경을 신청합니다. reason은 공백 제거 후 1~200자입니다. 공원당 pending 요청은 하나만 허용합니다. 이미 관리자가 있는 공원도 신청은 가능하며 conflictingManagerName으로 알려주고 실제 승인은 충돌을 거부합니다. 신청 단계에서는 기존 설정을 유지합니다.",
    "404 park_not_found; 409 park_change_pending; 422 same_park",
)
add(
    "POST",
    "/park-change-requests/{request_id}/cancel",
    "내 공원 변경 요청 취소",
    "내 pending 요청만 취소합니다. 타인 요청과 없는 요청은 동일한 404입니다. cancelled와 reviewedAt을 기록하며 기존 공원·로봇·설정은 유지합니다.",
    "404 park_change_not_found; 409 park_change_not_pending",
)
add(
    "GET",
    "/admin/park-change-requests",
    "총관리자 — 공원 변경 요청 목록",
    "status 기본 pending, all은 전체입니다. createdAt·id 내림차순으로 반환합니다. limit 기본값은 100으로 가입 신청 목록(20)과 다릅니다.",
)
add(
    "POST",
    "/admin/park-change-requests/{request_id}/approve",
    "총관리자 — 공원 변경 승인",
    "본문이 없습니다. pending 요청이며 신청 당시 공원과 현재 공원이 같아야 합니다. 대상 공원에 다른 승인 관리자가 없어야 하고 모든 배정 로봇이 idle/offline이어야 합니다. 운영 parkId와 로봇 배정은 유지하고 catalogId를 바꿉니다. 기존 경로·지점·시간표·좌표 기준점을 초기화하고 routeSetupDone=false로 만듭니다. 새 공원에서 순찰 설정을 다시 해야 합니다.",
    "404 park_change_not_found; 409 park_change_not_pending / park_change_stale / park_catalog_inactive / park_already_approved / robot_not_available",
)
add(
    "POST",
    "/admin/park-change-requests/{request_id}/reject",
    "총관리자 — 공원 변경 반려",
    "pending 요청만 반려합니다. reason은 1~1000자입니다. 요청 상태·반려 사유·검토 시각을 기록하고 현재 공원·설정·로봇 배정은 유지합니다.",
    "404 park_change_not_found; 409 park_change_not_pending",
)
add(
    "GET",
    "/admin/parks",
    "총관리자 — 운영 공원 목록",
    "승인된 공원만 id 오름차순으로 반환합니다. 담당 관리자와 배정된 로봇 수를 포함합니다. 공원 목록 카탈로그 검색과 다릅니다.",
)
add(
    "PATCH",
    "/admin/robots/{robot_id}/assignment",
    "총관리자 — 로봇 공원 배정·이동·회수",
    "parkId는 승인된 운영 공원 ID이며 null이면 회수입니다. 필드 생략은 허용하지 않습니다. idle/offline만 처리하고 활성 공원으로만 배정합니다. 이동·회수 시 이전 공원의 해당 로봇 경로를 비활성화하고 지점을 숨기며 시간표를 제거합니다. 다른 로봇 설정은 보존합니다. 새 공원의 미배정 초안이 있으면 복사합니다. 상태를 임의로 online으로 바꾸지 않습니다.",
    "404 robot_not_found; 409 robot_assignment_changed / robot_not_available / park_not_approved / park_catalog_inactive",
)

add(
    "POST",
    "/robot-assignment-requests",
    "최초·추가 로봇 배정 요청",
    "승인된 manager의 로그인 정보로 신청자와 운영 공원을 결정합니다. robotCount는 추가 요청 대수(정수 1~100)이며 기존 배정 로봇을 포함한 총 대수가 아닙니다. reason은 필수이며 앞뒤 공백 제거 후 1~1000자입니다. 누락·빈 문자열·공백만 입력하면 422 validation_error입니다. 공원별 pending 요청은 한 건만 허용하고 요청만으로 기기 등록·배정은 하지 않습니다. userId·parkId 등의 추가 입력은 거부합니다.",
    "409 robot_assignment_request_pending / park_not_approved / park_catalog_inactive",
)
add(
    "GET",
    "/robot-assignment-requests",
    "내 로봇 배정 요청 이력",
    "현재 계정의 요청만 조회합니다. status 기본 all이며 최신 생성 시각·ID 순으로 내려줍니다. assignedRobotIds는 승인 당시 로봇 ID 이력으로 회수 이후에도 유지합니다.",
)
add(
    "POST",
    "/robot-assignment-requests/{request_id}/cancel",
    "내 로봇 배정 요청 취소",
    "본문 없이 자신의 pending 요청만 취소합니다. 타인의 요청과 없는 요청은 동일한 404입니다. reviewedBy에 취소한 관리자 ID, reviewedAt에 취소 시각을 기록하고 기존 배정은 유지합니다.",
    "404 robot_assignment_request_not_found; 409 robot_assignment_request_not_pending",
)
add(
    "GET",
    "/admin/robot-assignment-requests",
    "총관리자 — 로봇 배정 요청 목록",
    "status 기본 pending, all로 전체 요청을 조회합니다. limit 기본 20, 최대 100입니다. 최신 생성 시각·ID 순으로 반환합니다.",
)
add(
    "POST",
    "/admin/robot-assignment-requests/{request_id}/approve",
    "총관리자 — 요청 승인과 실제 로봇 배정",
    "요청 대수와 정확히 같은 수의 중복 없는 robotIds를 받습니다. 전부 미배정·idle/offline이어야 하고 신청 당시 승인된 공원·catalogId·manager 역할이 유지되어야 합니다. 요청 승인·배정·이력·초안 경로 복사·알림 저장을 한 트랜잭션으로 처리하며 부분 승인은 하지 않습니다. 모든 신규 로봇에 미배정 초안을 독립 복사하고 기존 로봇 설정은 유지합니다. 실제 로봇 주행 명령은 보내지 않습니다. 푸시는 커밋 후 발송 설정이 켜져 있을 때 처리합니다.",
    "404 robot_assignment_request_not_found / robot_not_found; 409 robot_assignment_request_not_pending / robot_assignment_request_stale / robot_already_assigned / robot_not_available / park_catalog_inactive; 422 robot_assignment_count_mismatch",
)
add(
    "POST",
    "/admin/robot-assignment-requests/{request_id}/reject",
    "총관리자 — 로봇 배정 요청 반려",
    "pending 요청만 반려하고 1~1000자 reason을 저장합니다. 로봇 배정은 바꾸지 않습니다. 반려 상태·처리자·시각·알림 기록을 함께 저장합니다.",
    "404 robot_assignment_request_not_found; 409 robot_assignment_request_not_pending",
)

examples.update(
    {
        "StationInput": {"name": "북문 분리수거장", "position": loc, "catalogId": "69"},
        "StationResponse": {"id": "1", "name": "북문 분리수거장", "position": loc},
        "StationSelectionInput": {"stationId": "1", "catalogId": "69"},
    }
)
add("GET", "/stations", "분리수거장 목록", "본인 공원의 삭제되지 않은 장소 목록을 반환합니다.")
add(
    "POST",
    "/stations",
    "분리수거장 등록",
    "이름·공원 내부 좌표를 등록합니다. 최대 100곳이며 같은 좌표는 중복 등록할 수 없습니다.",
    "409 station_position_exists / park_changed; 422 point_outside_park / station_limit_exceeded",
)
add(
    "PATCH",
    "/stations/{station_id}",
    "분리수거장 수정",
    "이름과 좌표를 수정합니다. 참조하는 활성 경로를 모두 검증하고 새 버전으로 저장합니다. 과거 경로 좌표는 보존합니다.",
    "404 station_not_found; 409 station_position_exists / park_changed; 422 point_outside_park / point_too_far",
)
add(
    "DELETE",
    "/stations/{station_id}",
    "분리수거장 삭제",
    "활성 경로·기본 장소 선택에서 사용하지 않는 장소만 삭제합니다. catalogId는 query입니다.",
    "404 station_not_found; 409 station_in_use / park_changed",
)
add(
    "PUT",
    "/robots/{robot_id}/default-station",
    "로봇 기본 분리수거장 선택",
    "본인 공원에 배정된 로봇의 기본 장소를 선택합니다. 경로 생성 전에도 가능하며 기존 경로가 있으면 해당 경로만 새 버전으로 저장합니다.",
    "404 robot_not_found / station_not_found; 409 park_changed; 422 point_too_far",
)
for method, path in [("get", "/station"), ("put", "/station"), ("put", "/route"), ("put", "/routes")]:
    title, note, errs = spec[(method, path)]
    spec[(method, path)] = (
        title,
        note
        + " 여러 장소가 등록되면 단일 좌표 방식은 409 default_station_required이며 defaultStationId로 선택해야 합니다.",
        errs + "; 409 default_station_required; 404 station_not_found",
    )

extend_notification_spec(examples, add)
assert set(spec) == {(m, p) for p, item in schema["paths"].items() for m in item}, "전체 API 누락 또는 추가"
for name, value in examples.items():
    model = next(
        (
            getattr(module, name)
            for module in [approval, auth, common, health, notifications, operations, parks, patrol, robot_assignment]
            if hasattr(module, name)
        ),
        None,
    )
    assert model is not None, name
    model.model_validate(value)
    assert set(value) <= {field.alias or key for key, field in model.model_fields.items()}, (
        name,
        "예시에 정의되지 않은 필드 포함",
    )

heading(1, "JUBJUB API 명세서")
para(
    f"기준일: 2026-11-19 (KST) · 현재 로컬 구현 기준 전체 {len(spec)}개 HTTP API(기존 호환 경로 4개 포함). KAN-23의 기능 → 요청 → 응답 형식으로 전체를 다시 작성했습니다. 이 문서는 변경분 목록이 아닌 전체 명세입니다. 코드 기준이며 원격 서버 배포 완료를 의미하지 않습니다."
)
ht.append('<p><a href="https://kdt-3team-finalterm.atlassian.net/browse/KAN-23" data-card-appearance="inline"></a></p>')
ht.append(
    '<div data-type="extension" data-extension-key="toc" data-extension-type="com.atlassian.confluence.macro.core" data-parameters=\'{"macroParams":{"minLevel":{"value":"2"},"maxLevel":{"value":"2"}}}\'></div>'
)
md.append("기존 명세 형식: [KAN-23](https://kdt-3team-finalterm.atlassian.net/browse/KAN-23)")
heading(2, "1. 공통 규칙")
table(
    ["항목", "내용"],
    [
        ["서버 기본 주소", "http://localhost:8000 — 휴대폰에서는 서버 PC의 사설 IP:8000 사용"],
        [
            "문서 주소",
            "/docs (Swagger), /openapi.json (OpenAPI). 아래 경로에 /api 접두사는 없습니다. 웹 개발 프록시 /api는 클라이언트 설정입니다.",
        ],
        ["요청·응답", "JSON / Content-Type: application/json / camelCase"],
        ["일반 인증", "Authorization: Bearer <accessToken>"],
        [
            "공개 HTTP 경로",
            "GET /health, GET /parks, POST /auth/register, POST /auth/login, POST /auth/reapplication-session, POST /auth/reapply. 재신청은 자체 본인 확인·전용 토큰 검증이 있습니다.",
        ],
        [
            "역할",
            "manager: 하위관리자 앱 / super_admin: 총관리자 웹. /admin/*는 서버에서 총관리자 권한 검사. /me는 둘 다 허용. 일반 공원·순찰·로봇 API는 manager만 허용.",
        ],
        [
            "승인 정책",
            "pending·rejected manager는 일반 업무 API를 기존 토큰으로도 호출할 수 없습니다. 승인 취소 시 즉시 차단합니다.",
        ],
        [
            "ID",
            "응답·JSON 본문 ID는 문자열. Path·Query ID는 URL의 양의 정수로 서버가 변환합니다. Query·Path 상한 9223372036854775807. 이름이 같아 보여도 userId, parkId, catalogId, robotId는 별개입니다.",
        ],
        [
            "목록·페이지",
            "목록은 data/total 포장 없는 배열. 해당 API가 지원하는 limit·offset으로 조회합니다. 빈 결과는 []입니다.",
        ],
        [
            "시각·좌표",
            "시각은 ISO 8601, 화면에서 KST 변환. 시간표 HH:mm은 현지 운영 시간 계약으로 타임존 필드는 없습니다. 위도·경도는 latitude/longitude, 로봇 SLAM 좌표는 slamX/slamY입니다.",
        ],
        [
            "저장·예시",
            "설정 변경은 트랜잭션으로 처리합니다. 아래 계정·ID·좌표는 가상 예시이며 실제 호출은 공원 검색 결과와 실제 경계 안 좌표를 사용합니다.",
        ],
    ],
)
code("Content-Type: application/json\nAuthorization: Bearer <accessToken>", "http")
heading(3, "ID 구분")
table(
    ["예시 필드", "테이블·의미", "사용 위치"],
    [
        ['userId="12"', "users.id — 계정", "/admin/registrations/{user_id}"],
        ['parkId="5"', "parks.id — 관리자와 연결된 운영 공원", "로봇 배정, /admin/parks/{park_id}/approve"],
        ['catalogId="69"', "park_catalog_entries.id — 물리적 공원 목록", "공원 검색·가입·공원 변경·편집 대상 검증"],
        ['robotId="6"', "robots.id — 로봇", "로봇 상세·로봇별 순찰 설정"],
        ['requestId="31"', "park_change_requests.id — 변경 요청", "공원 변경 취소·승인·반려"],
    ],
)
heading(3, "다중 로봇·편집 일관성")
bullets(
    [
        "robotId가 있는 순찰 API는 공원 배정 로봇이 2대 이상이면 반드시 지정합니다(미지정 422 robot_required). 1대면 생략 시 자동 선택, 0대면 robotId=null 미배정 초안을 저장합니다.",
        "분리수거장은 공원 공통, 경로·시간표는 로봇별입니다. 첫 로봇 배정 때 초안을 독립 설정으로 복사합니다.",
        "응답의 catalogId를 편집 화면에서 보관하고 PUT /route·PUT /routes의 body.catalogId, PUT /station·PUT /schedules·POST /route/complete의 query.catalogId로 돌려보냅니다.",
        "catalogId가 달라지면 409 park_changed입니다. 과거 공원 변경 승인이 있는 공원은 catalogId를 생략해도 409이므로 신규 클라이언트는 항상 전달해야 합니다.",
        "지점은 공원 외곽 안·holes 밖이어야 합니다(다각형 경계 자체는 허용). 분리수거장부터 다른 지점과 1km 이내로 연결되는지 검사하며, 인접한 배열 항목끼리만 검사하는 방식은 아닙니다.",
        "PUT /schedules는 빈 배열을 허용하지만 PUT /route의 schedule은 최소 1개입니다. 초기 완료 확인은 시간표 행 존재 기준이며 on=true 항목 존재 여부를 별도로 강제하지 않습니다.",
    ]
)
heading(2, "2. 전체 API 목록")
table(
    ["번호", "기능", "Method", "Path", "권한"],
    [
        [
            i,
            title,
            method.upper(),
            path,
            "총관리자"
            if path.startswith("/admin/")
            else (
                "공개·전용 검증"
                if path.startswith("/auth/") or path in ["/health", "/parks"]
                else (
                    "승인된 하위·총관리자"
                    if path == "/me" or path.startswith("/notifications") or path == "/push-tokens"
                    else "승인된 하위관리자"
                )
            ),
        ]
        for i, ((method, path), (title, _, _)) in enumerate(spec.items(), 1)
    ],
)

param_samples = {
    "query": "예시공원",
    "limit": 20,
    "offset": 0,
    "robotId": 6,
    "catalogId": 69,
    "unassigned": False,
    "status": "pending",
    "type": "robotAssignmentApproved",
    "isRead": False,
}

for i, ((method, path), (title, note, errors)) in enumerate(spec.items(), 1):
    op = schema["paths"][path][method]
    heading(2, f"3.{i:02d}. {title}")
    heading(3, f"{method.upper()} {path}")
    para("기능: " + note)
    para(
        "권한: "
        + (
            "총관리자(super_admin) Bearer 토큰"
            if path.startswith("/admin/")
            else (
                "일반 Bearer 토큰 불필요. 위 기능의 자체 검증 조건 적용"
                if path in ["/health", "/parks"] or path.startswith("/auth/")
                else (
                    "승인된 manager 또는 super_admin Bearer 토큰"
                    if path == "/me" or path.startswith("/notifications") or path == "/push-tokens"
                    else "승인된 manager Bearer 토큰"
                )
            )
        )
    )
    heading(4, "요청")
    url = (
        path.replace("{user_id}", "12")
        .replace("{park_id}", "5")
        .replace("{robot_id}", "6")
        .replace("{request_id}", "31")
        .replace("{notification_id}", "41")
    )
    params = op.get("parameters", [])
    query = []
    for p in params:
        if p["in"] == "query":
            value = param_samples[p["name"]]
            if p["name"] == "limit" and path in ["/admin/parks", "/admin/park-change-requests"]:
                value = 100
            query.append(p["name"] + "=" + (str(value).lower() if isinstance(value, bool) else str(value)))
    code(method.upper() + " " + url + ("?" + "&".join(query) if query else ""), "http")
    if params:
        table(
            ["위치", "이름", "필수", "타입", "제약·기본값"],
            [
                [
                    p["in"],
                    p["name"],
                    "필수" if p.get("required") else "선택",
                    typ(p["schema"]),
                    rules(p["schema"]) or "-",
                ]
                for p in params
            ],
        )
    request_schema = op.get("requestBody", {}).get("content", {}).get("application/json", {}).get("schema")
    if request_schema:
        para("본문: " + typ(request_schema) + " — 필드 상세는 4장 공통 데이터 계약에 모두 기재했습니다.")
        code(example(request_schema))
    else:
        para("요청 본문: 없음.")
    heading(4, "응답")
    success = next((str(c), val) for c, val in op["responses"].items() if str(c).startswith("2"))
    response_schema = success[1].get("content", {}).get("application/json", {}).get("schema")
    if response_schema is None:
        para("성공: HTTP " + success[0] + " · 응답 본문 없음")
        para("주요 오류: " + errors + ". 공통 인증·입력 검증 오류를 함께 적용합니다.")
        continue
    para("성공: HTTP " + success[0] + " · " + typ(response_schema))
    val = example(response_schema)
    if path.endswith("/read"):
        val["isRead"] = True
    elif "robot-assignment-requests" in path:
        if path.endswith(("/approve", "/reject", "/cancel")):
            val.update(
                status="approved"
                if path.endswith("/approve")
                else ("rejected" if path.endswith("/reject") else "cancelled"),
                reviewedBy="8" if path.startswith("/admin/") else "12",
                reviewedAt="2026-11-18T03:10:00Z",
            )
            if path.endswith("/approve"):
                val["assignedRobotIds"] = ["7", "8"]
            elif path.endswith("/reject"):
                val["rejectReason"] = "현재 가용 로봇이 없어요"
    elif path.endswith("/reapply"):
        pass
    elif path.endswith("/revoke") or (path.endswith("/reject") and "/park-change-requests/" not in path):
        val.update(status="rejected", rejectReason="담당 공원 확인이 필요해요")
    elif path.endswith("/cancel") or ("/park-change-requests/" in path and path.endswith(("/approve", "/reject"))):
        val.update(
            status="cancelled"
            if path.endswith("/cancel")
            else ("approved" if path.endswith("/approve") else "rejected"),
            reviewedAt="2026-11-18T03:10:00Z",
        )
        if path.endswith("/reject"):
            val["rejectReason"] = "담당 공원 확인이 필요해요"
    elif path == "/admin/registrations" or path == "/admin/park-requests":
        val[0].update(status="pending", registrationStatus="pending", reviewedBy=None, reviewedAt=None)
    elif path == "/admin/robots" and method == "post":
        val.update(name="jub21", serialNo="jub21", parkId=None, assignedAt=None)
    elif path == "/robots/{robot_id}" and method == "patch":
        val["name"] = "순찰 로봇"
    elif path in ["/admin/robots", "/admin/robots/{robot_id}/assignment"]:
        target = val[0] if isinstance(val, list) else val
        target.update(parkName=park["name"], managerId="12", managerName=profile["name"], managerLoginId="manager01")
    code(val)
    if errors:
        para("주요 업무 오류: " + errors + ". 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.")
    else:
        para("오류: 5장의 공통 인증·입력 검증·서버 오류를 적용합니다.")

heading(2, "4. 공통 데이터 계약 — 모든 요청·응답 필드")
para(
    "각 API의 요청·응답 타입 이름은 이 표의 객체를 가리킵니다. 필수는 JSON 키 존재 조건이며 null 허용 여부는 타입에 별도 표기합니다. 응답의 기본값이 있는 필드도 FastAPI 기본 직렬화에서는 일반적으로 포함됩니다. 가입·재신청·배정 요청·배정 요청 승인·푸시 토큰 입력은 추가 필드를 거부하며, 나머지는 기본적으로 정의되지 않은 필드를 무시합니다."
)
field_notes = {
    "loginId": "로그인 아이디(대소문자 구분)",
    "password": "영문·숫자를 각각 포함. 서버는 Argon2 해시로 저장하며 응답하지 않음",
    "name": "이름. 요청에서 공백 제거 적용 여부는 해당 API 규칙 참고",
    "phone": "가입·재신청에서 하이픈·공백 제거 후 숫자 9~15자",
    "email": "가입·재신청 시 소문자로 정규화",
    "catalogId": "공원 목록 ID. 운영 공원 ID와 다름",
    "parkId": "운영 공원 ID",
    "userId": "계정 ID",
    "robotId": "로봇 ID. null은 미배정 초안",
    "robotIds": "중복 불가. 양의 bigint ID 문자열 목록",
    "accessToken": "업무 API Bearer 인증",
    "reapplicationToken": "재신청 전용. 30분 유효, 본문에 전달",
    "expiresIn": "초 단위 유효 시간",
    "tokenType": "bearer",
    "registrationStatus": "가입 승인 상태",
    "parkStatus": "호환용 승인 상태. 총관리자 null",
    "routeSetupDone": "순찰 초기 설정 완료 여부",
    "isFirstLogin": "순찰 초기 설정 필요 여부, 로그인 횟수가 아님",
    "role": "manager / super_admin",
    "center": "공원 중심 위도·경도",
    "bounds": "지도 표시 범위",
    "area": "공원 다각형 경계",
    "outer": "외곽 좌표(최소 4개)",
    "holes": "외곽 내부의 제외 영역 좌표 목록",
    "southWest": "지도 남서 좌표",
    "northEast": "지도 북동 좌표",
    "latitude": "위도. -90~90, NaN·무한대 불가",
    "longitude": "경도. -180~180, NaN·무한대 불가",
    "anchorPoints": "좌표 기준점 목록. 현재 별도 쓰기 API 없음",
    "rejectReason": "반려 사유. 반려 전 또는 반려가 아니면 null 가능",
    "distance": "현재 공원 검색 서버는 빈 문자열",
    "position": "해당 순찰 지점의 지도 좌표",
    "points": "순찰 순서대로 정렬된 지점 목록",
    "station": "공원 공유 분리수거장 좌표",
    "schedule": "로봇별 시간표 목록",
    "time": "현지 시각 HH:mm",
    "label": "시간표 이름",
    "on": "시간표 사용 여부",
    "repeat": "daily 매일 / weekdays 평일 / weekends 주말",
    "start": "경로 출발 분리수거장 좌표",
    "end": "경로 복귀 분리수거장 좌표",
    "appliesFrom": "nextPatrol: 다음 순찰 적용",
    "parkName": "담당 공원 이름. 로봇 응답에서는 총관리자 목록·배정 응답에 보강",
    "serialNo": "변경되지 않는 고유 기기 식별 번호",
    "assignedAt": "공원 배정 시각. 미배정 null",
    "createdAt": "원본 행 생성 시각",
    "slamX": "로봇 SLAM x 좌표. 측정 전 null",
    "slamY": "로봇 SLAM y 좌표. 측정 전 null",
    "lat": "로봇 지도 위도. 측정 전 null",
    "lng": "로봇 지도 경도. 측정 전 null",
    "batteryVoltage": "배터리 전압(V). 퍼센트가 아님. 미수신 null",
    "lastSeenAt": "최근 로봇 데이터 수신 시각",
    "managerId": "담당 관리자 계정 ID",
    "managerName": "담당 관리자 이름",
    "managerLoginId": "담당 관리자 로그인 아이디",
    "applicantName": "신청자 이름",
    "applicantLoginId": "신청자 로그인 아이디",
    "applicantEmail": "신청자 이메일",
    "applicantPhone": "신청자 전화번호",
    "currentCatalogId": "변경 신청 당시 원본 공원 목록 ID",
    "currentParkName": "변경 신청 당시 원본 공원 이름",
    "requestedCatalogId": "신청한 대상 공원 목록 ID",
    "requestedParkName": "신청한 대상 공원 이름",
    "requestedParkAddress": "대상 공원 주소",
    "reason": "신청 또는 반려·취소 사유. 길이는 요청 타입별로 다름",
    "reviewedAt": "승인·반려·승인 취소 처리 시각. pending은 null. 신청 취소 시 취소 시각",
    "conflictingManagerName": "대상 공원에 이미 승인된 관리자가 있으면 이름, 없으면 null",
    "robotCount": "배정 요청: 추가 요청 대수 / AdminParkResponse: 실제 배정 로봇 수",
    "assignedRobotIds": "요청 승인 당시 배정된 로봇 ID. 회수 이후에도 이력 보존",
    "reviewedBy": "승인·반려·승인 취소 처리자 계정 ID. pending은 null. 신청 취소 시 요청자 ID",
    "status": "상태 코드. 허용 값은 타입별 제약 참고",
    "message": "사용자 안내 오류 문구",
    "code": "분기용 오류 코드",
    "details": "검증 오류에서는 field/reason 배열, 일부 업무 오류에서는 객체. 항상 배열은 아님",
    "id": "해당 객체 ID. PointInput·ScheduleInput의 임시 ID는 식별 권한으로 쓰지 않음",
    "address": "공원 주소",
    "db": "DB 연결 상태",
    "park": "재신청 시 기존 활성 공원 선택 정보. 비활성 공원은 null",
    "type": "알림 종류. 예: robotAssignmentApproved, robotAssignmentRejected",
    "body": "알림 상세 내용",
    "occurredAt": "알림 발생 시각(ISO 8601)",
    "isRead": "읽음 여부. 목록·상세 조회만으로 바뀌지 않음",
    "count": "내 전체 미확인 알림 개수",
    "token": "ExpoPushToken[...] 또는 ExponentPushToken[...]. 요청 전용",
    "platform": "android 또는 ios",
    "isActive": "기기 토큰 활성 여부",
    "updatedAt": "마지막 토큰 등록·갱신 시각",
}
for name in sorted(examples):
    heading(3, name)
    s = schemas[name]
    table(
        ["필드", "타입·null", "키 필수", "제약·기본값", "설명"],
        [
            [
                key,
                typ(value),
                "필수" if key in s.get("required", []) else "선택/기본값",
                rules(value) or "-",
                field_notes.get(key, "해당 API 기능 설명 참고"),
            ]
            for key, value in s.get("properties", {}).items()
        ],
    )
heading(2, "5. 오류 응답 전체")
para(
    "API의 성공 응답만 보고 오류를 판단하지 않습니다. HTTP 상태와 code를 함께 사용합니다. OpenAPI에 공통 오류 상태가 일괄 등록되어 있으므로 모든 경로에서 나열된 모든 업무 오류가 실제로 발생한다는 뜻은 아닙니다."
)
code(examples["ErrorResponse"])
code(
    {
        "status": 422,
        "message": "입력값을 확인해 주세요",
        "code": "validation_error",
        "details": [{"field": "body.email", "reason": "입력값의 형식이 올바르지 않아요"}],
    }
)
code(
    {
        "status": 422,
        "message": "기존 지점과 약 1.2km 떨어져 있어요. 1km 이내로 지정해 주세요",
        "code": "point_too_far",
        "details": {"distanceMeters": 1200, "maxDistanceMeters": 1000},
    }
)
para(
    "details는 값이 있을 때만 포함합니다. 검증 오류 field는 body.email, query.robotId, path.robot_id 같은 위치를 나타냅니다. 401의 경우 WWW-Authenticate: Bearer 헤더를 포함할 수 있습니다."
)
errors = {}
for p in [*list((ROOT / "app/services").glob("*.py")), ROOT / "app/core/security.py"]:
    tree = ast.parse(p.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id == "AppError"
            and len(node.args) >= 2
        ):
            status = node.args[0].value if isinstance(node.args[0], ast.Constant) else "?"
            message = (
                node.args[1].value
                if isinstance(node.args[1], ast.Constant)
                else "기존 지점과 거리가 멀어요(계산한 거리 포함)"
            )
            key = next(
                (kw.value.value for kw in node.keywords if kw.arg == "code" and isinstance(kw.value, ast.Constant)),
                None,
            )
            if key:
                errors[(str(status), key)] = message
errors.update(
    {
        ("404", "not_found"): "요청한 주소를 찾을 수 없어요",
        ("405", "method_not_allowed"): "허용되지 않는 요청 방식이에요",
        ("422", "validation_error"): "입력값을 확인해 주세요",
        ("500", "internal_error"): "서버에서 문제가 생겼어요",
    }
)
table(["HTTP", "code", "발생 조건·안내"], [[status, key, value] for (status, key), value in sorted(errors.items())])
para(
    "공통 인증: 401 invalid_token(누락·만료·변조·잘못된 용도), 403 registration_pending/rejected/incomplete(가입 승인 상태), 403 manager_required 또는 super_admin_required(역할), 503 auth_not_configured(JWT 설정). 순찰·운영·승인 서비스의 DB 오류는 503 patrol_unavailable, DB 유일 제약 등의 저장 충돌은 409 settings_conflict로 변환될 수 있습니다. 네트워크 연결 실패의 status=0/network_error는 앱·웹 클라이언트 자체 오류로 HTTP 응답 코드가 아닙니다."
)
heading(2, "6. 화면별 호출 순서")
table(
    ["흐름", "호출 순서·분기"],
    [
        [
            "신규 가입",
            "GET /parks → POST /auth/register → pending 안내 → 총관리자 승인 → POST /auth/login → GET /me·GET /park·GET /robots",
        ],
        [
            "반려 재신청",
            "POST /auth/login(403 registration_rejected) → POST /auth/reapplication-session → 반려 사유 안내 → 정보 수정·공원 확인 → POST /auth/reapply → pending 안내 → 총관리자 재승인 → 로그인",
        ],
        [
            "가입 승인",
            "총관리자 로그인 → GET /admin/registrations?status=pending → 필요 시 GET /admin/robots?unassigned=true → POST /admin/registrations/{user_id}/approve",
        ],
        [
            "초기 순찰 설정",
            "GET /park·GET /robots → 대상 robotId 선택 → GET /route?robotId=... → PUT /route?robotId=... (body.catalogId 포함) → 홈",
        ],
        [
            "분리 저장",
            "PUT /station?catalogId=... → PUT /routes?robotId=... (body.catalogId) → PUT /schedules?robotId=...&catalogId=... → POST /route/complete?robotId=...&catalogId=...",
        ],
        [
            "공원 변경",
            "GET /parks → POST /park-change-requests → 총관리자 목록·승인 → 기존 편집 저장은 409 park_changed → 새 /park·/route 조회 → 새 공원 순찰 설정",
        ],
        [
            "로봇 배정",
            "GET /admin/parks·GET /admin/robots → PATCH /admin/robots/{robot_id}/assignment → 앱에서 GET /robots 재조회",
        ],
        [
            "최초·추가 로봇 요청",
            "POST /robot-assignment-requests → GET /robot-assignment-requests → 총관리자 GET /admin/robot-assignment-requests → 미배정 로봇 선택 → POST /admin/robot-assignment-requests/{request_id}/approve → GET /robots 재조회. 프론트는 이번 변경에서 미수정.",
        ],
    ],
)
heading(2, "7. 구현 범위·제거된 API·별도 구현 예정")
table(
    ["구분", "현재 상태"],
    [
        [
            "구현된 HTTP API",
            f"위에 전부 작성한 {len(spec)}개. 서버 상태·검색·계정·재신청·순찰 설정·승인·공원 변경·로봇 관리·배정 요청.",
        ],
        [
            "배정 요청 알림",
            "승인·반려 시 알림과 Expo 기기별 발송 대기열을 함께 저장합니다. 커밋 후 발송하며 프론트는 미수정입니다. 실제 수신에는 앱 기기 토큰·Expo 자격 증명·서버 설정이 필요합니다.",
        ],
        [
            "제거됨",
            "GET /admin/parks/{park_id}/reports: 현재 라우터에서 제거됨. daily_reports, agent_runs, agent_steps 테이블과 해당 서버 사용 코드도 제거됨.",
        ],
        [
            "DB만 생성됨",
            "detections(탐지), robot_tasks(작업 이력)는 테이블만 있고 수신·조회 HTTP API는 아직 없습니다. notifications·push_tokens는 본인 조회·읽음·기기 등록·해제 API를 구현했습니다.",
        ],
        ["탐지·이미지", "Cloudflare 이미지 경로 저장 필드만 존재. 업로드·서명 URL·이미지 조회 API는 미구현."],
        [
            "푸시·알림",
            "알림 API와 Expo 발송·재시도·영수증 처리를 구현했습니다. EXPO_PUSH_ENABLED 기본 false이며 주기 워커 python -m app.scripts.send_notification_pushes --watch가 필요합니다. 공개 임의 발송 API는 없고 프론트 연결은 별도입니다.",
        ],
        [
            "로봇 실제 실행·실시간",
            "순찰 시작/중지/분리수거장 이동 명령, 센서 상태 수신, 작업/탐지 결과 수신, 지도 마커, 배터리 % 계산, 실시간 영상·원격 조종·WebSocket 상태 API는 위 서버 라우터에 없음.",
        ],
        [
            "경로 계산",
            "POST /routes/preview 및 실제 주행 가능한 polyline·예상 시간·도달 불가 사유 API는 미구현. 순찰 지점 저장과 다름. KAN-23의 프론트 요청사항은 구현 완료로 표기하지 않음.",
        ],
        [
            "계정 기타",
            "서버 로그아웃·토큰 갱신·비밀번호 찾기·계정 삭제·일반 프로필 수정 API는 미구현. 재신청은 반려 계정에 한정.",
        ],
        [
            "앱 목업",
            "EXPO_PUBLIC_API_URL이 비면 목업. 주소가 있으면 SERVER_READY(auth, me, parks, park, route)만 서버 연결하며 나머지 알림·보고·지도 등은 목업일 수 있음. 앱 화면 존재를 서버 API 구현으로 해석하지 않음.",
        ],
        [
            "호환 경로 4개",
            "PUT /park, GET /admin/park-requests, POST /admin/parks/{park_id}/approve, POST /admin/parks/{park_id}/reject. 현재 라우터에는 남아 있으며 새 가입·승인 흐름을 우선 사용.",
        ],
    ],
)
heading(2, "8. 명세 검증 기준")
bullets(
    [
        f"server/app/main.py와 routers/api.py가 실제 등록한 전체 HTTP 경로를 FastAPI OpenAPI와 대조했습니다. Method+Path 조합 {len(spec)}개가 모두 명세에 존재하는지 자동 확인했습니다.",
        "각 요청·응답 예시는 실제 Pydantic 모델로 검증했습니다. 입력 검증기, 권한·업무 오류·상태 전환은 services/auth.py, patrol.py, approval.py, operations.py, parks.py, health.py 및 core/security.py·errors.py와 대조했습니다.",
        "공원·로봇 DB의 실제 계정 정보나 인증 키는 문서에 넣지 않았습니다. 모든 계정·좌표·토큰은 형식 설명용 예시입니다.",
        "DB 테이블이 있다는 이유만으로 HTTP API를 구현 완료로 적지 않았습니다. 원격 서버 버전·배포 주소·HTTPS·프록시 구성은 실제 배포 환경에서 별도 확인합니다.",
    ]
)
out_md = "\n\n".join(md) + "\n"
out_html = "\n".join(ht).replace("기준일: 2026-11-18", '기준일: <time datetime="2026-11-19">2026-11-19</time>') + "\n"
(ROOT / "API_SPEC.md").write_text(out_md, encoding="utf-8")
(ROOT / "data/api-spec-20261118.html").write_text(out_html, encoding="utf-8")
(ROOT / "data/current-openapi.json").write_text(json.dumps(schema, ensure_ascii=False, indent=2), encoding="utf-8")
print(
    json.dumps(
        {
            "endpoints": len(spec),
            "schemas": len(examples),
            "error_codes": len(errors),
            "markdown_chars": len(out_md),
            "html_chars": len(out_html),
        },
        ensure_ascii=False,
    )
)
