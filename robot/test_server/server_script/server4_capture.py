import asyncio
from uuid import uuid4
from fastapi import (
  FastAPI,
  WebSocket,
  WebSocketDisconnect,
  HTTPException
)
# from pydantic import BaseModel

# class Command(BaseModel):
#   command_id: str

robot_ws: WebSocket | None = None
pending_requests = {}

app = FastAPI()

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


@app.post("/command/save-image")
async def request_save_image():
  if robot_ws is None:
    raise HTTPException(503, "Robot is offline")

  command_id = str(uuid4())

  future = asyncio.get_running_loop().create_future()
  pending_requests[command_id] = future

  try:
    await robot_ws.send_json({
      "type": "save_image",
      "command_id": command_id
    })

    result = await asyncio.wait_for(
      future, timeout=15
    )

    return result
  except asyncio.TimeoutError:
    raise HTTPException(504, "Robot response timeout")

  finally:
    pending_requests.pop(command_id, None)