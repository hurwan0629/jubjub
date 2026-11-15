"""
  postman 
     |
    http
     |
>> fastapi <<
     |
  websocket
     |
   ubuntu
"""
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel
from typing import Literal
from uuid import uuid4
import asyncio

app = FastAPI()

robot_ws: WebSocket | None = None

class MoveCommand(BaseModel):
  idx: str  # 요청 식별 번호
  vx: float # 앞뒤
  vy: float # 좌우
  wz: float # 좌우 회전
  type: Literal["move", "disconnect"]

pending_requests = {}

# 1. ubuntu 로봇이 접속할 WebSocket
@app.websocket("/ws/robot")
async def robot_socket(ws: WebSocket):
  global robot_ws

  await ws.accept()
  robot_ws = ws
  print("Robot connected")

  try:
    while True:
      data = await ws.receive_json()
      print("Robot:", data)

      command_id = data.get("command_id")
      future = pending_requests.get(command_id)

      if future is not None and not future.done():
        future.set_result(data)

  except WebSocketDisconnect:
    print("Robot disconnected")

  finally:
    if robot_ws is ws:
      robot_ws = None

# 2. Postman에서 호출할 HTTP API
@app.post("/commands/move")
async def move_robot(command: MoveCommand):
  if robot_ws is None:
    raise HTTPException(503, "Robot is offline")

  await robot_ws.send_json({
    "command_id": command.idx,
    "type": command.type,
    "vx": command.vx,
    "vy": command.vy,
    "wz": command.wz
  })

  return {
    "status": "sent"
  }

# 3. 발행 topic (/controller/cmd_vel) 정보 확인
@app.get("/commands/check-topic/{topic:path}")
async def check_topic_info(topic: str):
  topic = "/" + topic.lstrip("/")
  print(f"[check-topic] topic: {topic}")

  if robot_ws is None:
    raise HTTPException(503, "Robot is offline")

  command_id = str(uuid4())
  future = asyncio.get_running_loop().create_future()
  pending_requests[command_id] = future

  try:
    await robot_ws.send_json({
      "command_id": command_id,
      "type": "check_topic_info",
      "topic": topic
    })

    print(f"[check-topic] waiting for response...")
    result = await asyncio.wait_for(future, timeout=10)
    return result
  except asyncio.TimeoutError:
    raise HTTPException(504, "Robot response timeout")