import asyncio
import json
from pathlib import Path
from uuid import UUID, uuid4

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from ultralytics import YOLO

# 기본 설정
app = FastAPI()

MODEL_PATH = "yolo11n.pt"
model = YOLO(MODEL_PATH)

OUTPUT_DIR = Path(__file__).resolve().parent / "outputs6"
OUTPUT_DIR.mkdir(exist_ok=True)

robot_ws: WebSocket | None = None

# request_id -> Future로 저장
pending_images: dict[str, asyncio.Future] = {}

# 이미지 요청 및 추론을 한번에 하나씩 처리
capture_lock = asyncio.Lock()

# ===
# 2. HTTP 요청 모델
# ===
class MoveCommand(BaseModel):
  vx: float = Field(0.0, ge=-0.2, le=0.2)
  vy: float = Field(0.0, ge=-0.2, le=0.2)
  wz: float = Field(0.0, ge=-0.8, le=0.8)
  duration_sec: float = Field(1.0, gt=0, le=3.0)

# ============
# 3. 로봇으로 명령 전송
# ============
async def send_to_robot(command: dict):
  if robot_ws is None:
    raise HTTPException(503, "Robot not connected")

  try:
    await robot_ws.send_json(command)
  except (RuntimeError, WebSocketDisconnect, ConnectionError):
    raise HTTPException(503, "Robot connection lost")

# ============
# 4. WebSocket 연결
# ============
@app.websocket("/ws/robot")
async def robot_socket(ws: WebSocket):
  global robot_ws

  await ws.accept()

  # 로봇 웹소켓이 이미 등록되어있으면 해당 연결 바로 끊어주기
  # 1008은 server policy error 이라고 함.
  if robot_ws is not None:
    await ws.close(code=1008)
    return

  robot_ws = ws
  print("Robot connected")

  image_id = None

  try:
    while True:
      message = await ws.receive()

      if message["type"] == "websocket.disconnect":
        break

      # JSON 메시지
      if message.get("text") is not None:
        data = json.loads(message["text"])

        if data.get("type") == "image_meta":
          image_id = data.get("request_id")

        elif data.get("type") == "error":
          request_id = data.get("request_id")
          future = pending_images.get(request_id)

          if future and not future.done():
            future.set_exception(
              RuntimeError(data.get("detail", "Robot error"))
            )

        else:
          print("Robot event:", data)

      # JPEG 바이너리 메시지
      elif message.get("bytes") is not None:
        jpeg_bytes = message["bytes"]

        future = pending_images.get(image_id)

        if future and not future.done():
          future.set_result(jpeg_bytes)

        image_id = None
    # while True
  except (WebSocketDisconnect, json.JSONDecodeError) as e:
    print("WebSocket ended:", e)

  finally:
    if robot_ws is ws:
      robot_ws = None

    for future in pending_images.values():
      if not future.done():
        future.set_exception(
          ConnectionError("Robot disconnected")
        )

    print("Robot disconnected")

# ===============
# 5. 이동 명령
# ===============
@app.post("/move")
async def move(command: MoveCommand):
  request_id = uuid4().hex

  await send_to_robot({
    "type": "move",
    "request_id": request_id,
    **command.model_dump()
  })

  return {
    "status": "sent",
    "requeust_id": request_id
  }

@app.post("/stop")
async def stop():
  await send_to_robot({"type": "stop"})

  return {"status": "sent"}

# ===============
# 6. YOLO 객체 탐지
# ===============
def detect_image(jpeg_bytes: bytes, request_id: str):
  # JPEG bytes -> OpenCV 이미지
  image_array = np.frombuffer(jpeg_bytes, dtype=np.uint8)
  frame = cv2.imdecode(image_array, cv2.IMREAD_COLOR)

  if frame is None:
    raise ValueError("Invalid JPEG image")

  # 원본 저장
  cv2.imwrite(
    str(OUTPUT_DIR / f"{request_id}_original.jpg"),
    frame
  )

  # YOLO 추론
  print("[YOLO predicting...]")
  result = model.predict(
    source=frame,
    imgsz=640,
    conf=0.25,
    verbose=False
  )[0]

  detections = []

  for box in result.boxes:
    class_id = int(box.cls.item())
    detections.append({
      "class_id": class_id,
      "class_name": result.names[class_id],
      "confidence": round(float(box.conf.item()), 4),
      "bbox_xyxy": [
        round(float(v), 1)
        for v in box.xyxy[0].tolist()
      ]
    })

  # 탐지 결과 이미지 저장
  annotated = result.plot()

  cv2.imwrite(
    str(OUTPUT_DIR / f"{request_id}_result.jpg"),
    annotated
  )

  return detections

# ===============
# 7. 촬영 + 객체탐지
# ===============

@app.post("/capture-detect")
async def capture_detect():
  async with capture_lock:
    request_id = uuid4().hex

    future = asyncio.get_running_loop().create_future()
    pending_images[request_id] = future

    try:
      # 로봇에 촬영 요청
      await send_to_robot({
        "type": "capture",
        "request_id": request_id
      })

      # 로봇에서 JPEG 수신 대기
      jpeg_bytes = await asyncio.wait_for(
        future,
        timeout=15.0
      )

      # 5MiB
      if len(jpeg_bytes) > 5 * 1024 * 1024:
        raise HTTPException(413, "Image too large")

      # 추론은 별도 스레드에서 실행
      detections = await asyncio.to_thread(
        detect_image,
        jpeg_bytes,
        request_id
      )

    except asyncio.TimeoutError:
      raise HTTPException(504, "Image capture timeout")

    except (ConnectionError, RuntimeError) as e:
      raise HTTPException(503, str(e))

    except ValueError as e:
      raise HTTPException(422, str(e))

    finally:
      pending_images.pop(request_id, None)

    return {
      "request_id": request_id,
      "count": len(detections),
      "detections": detections,
      "image_url": f"/results/{request_id}"
    }

# ===============
# 8. 결과 이미지 조회
# ===============

@app.get("/results/{request_id}")
async def get_result(request_id: UUID):
  image_path = OUTPUT_DIR / f"{request_id.hex}_result.jpg"

  if not image_path.exists():
    raise HTTPException(404, "Image not found")

  return FileResponse(
    image_path,
    media_type="image/jpeg"
  )

@app.get("/health")
async def health():
  return {
    "robot_connected": robot_ws is not None,
    "model": MODEL_PATH
  }