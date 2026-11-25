# hurwan_claude_assignment_ws — JUBJUB 전체 구조 (sandbox)

바퀴·팔을 절대 움직이지 않는 상태에서 줍줍 로봇의 전체 흐름(탐지 → 추적 → 임무 → 서버 → 경로 계획 → 팔 IK → GPS 변환)을 돌려 보는 ROS 2 Humble 워크스페이스. 작업 기록과 판단 근거는 Notion "2026-11-24 | Claude 과제" 페이지.

## 빌드 / 환경
```bash
cd ~/hurwan_claude_assignment_ws
source env.bash            # bash 전용 (.robotrc의 bash 버전 + 이 ws overlay)
colcon build --symlink-install
source env.bash
```

## 실행
```bash
# 1) 테스트용 서버 (실서버 대신)
ros2 run jubjub_claude mock_server --token test-token --points '[[1.5,0],[1.5,1.2],[0,1.2]]'
#    --stop-after 9  : 순찰 중지 테스트 / --drop-after 8 : 연결 끊김·재전송 테스트

# 2) 전체 파이프라인
ros2 launch jubjub_claude jubjub_sandbox.launch.py token:=test-token \
    use_detector:=true use_synthetic:=false use_fake_gps:=false use_depth_obstacles:=true
#    실서버: server_url:=ws://<서버>:8000/ws/robots robot_id:=<id> token:=<발급 토큰>
#    라이다가 죽어 있으면 manager가 device_failure로 멈춤(정상 동작). 테스트만 할 때:
#    overrides:=$PWD/install/jubjub_claude/share/jubjub_claude/config/test_lidar_down.yaml
```

## 노드
| 노드 | 역할 |
| --- | --- |
| claude_trash_detector | RGB+Depth 동기화, YOLO, bbox 중앙 ROI 깊이 중앙값, 카메라 좌표 3D 점 → `/jubjub/detections` |
| claude_trash_tracker | 촬영 시각 TF(팔 자세 포함)로 odom 변환, ID 유지 → `/jubjub/tracks` |
| claude_jubjub_manager | 순찰 상태머신 (Confluence 로봇-서버 v14 규칙) → `/jubjub/robot_status`, `/jubjub/robot_event` |
| claude_server_bridge | WebSocket 클라이언트, hello/status/ack, outbox(~/.jubjub_claude/outbox.json) 재전송 |
| claude_nav_adapter | Nav2 ComputePathToPose로 실제 경로 계획 + 가상 주행(`navigate_to`), `plan_path` 서비스 |
| claude_arm_ik | URDF→KDL, 닫힌형 IK + FK 검증(`compute_arm_ik`), `pick_and_store` (계획만) |
| claude_geo_localizer | 서버와 같은 기준점 2개 유사변환 (`geo_to_map`, `map_to_geo`, `/gps/fix`→`/jubjub/gps_pose`) |
| claude_sandbox_guard | 구동 토픽에 이 ws 노드가 publisher로 붙으면 FATAL |
| (테스트) mock_server, synthetic_detections, fake_gps | 서버·쓰레기·GPS 대역 |

## 안전 경계
- `/cmd_vel`은 odom_publisher가 구독해 바퀴를 돌린다. 이 ws는 `/cmd_vel`, `/controller/cmd_vel`, `/ros_robot_controller/*`, `/servo_controller`, `/joint_controller`에 publisher를 만들지 않는다.
- Nav2는 planner_server만 띄운다(controller/behavior 없음). 팔 계획은 `/claude_sandbox/arm_joint_plan`(구독자 없음)으로만 나간다.
- 실주행으로 바꾸려면 nav_adapter `backend:=nav2` + Nav2 controller의 cmd_vel 경로를 의도적으로 설계해야 한다(이번 과제 범위 밖).
