"""jetrover에 websocket를 보내서 jetrover/jetson에서 받을 수 있는지를 확인하기 위한 스크립트"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

app = FastAPI()

@app.get("/health")
def get_health():
    return {"status": "ok"}

# @app.websocket("/ws/robot")
# async def robot_socket(ws: WebSocket):
#     await ws.accept()

#     try:
#         while True:
#             message: str = await ws.receive_text()
#             print("Robot:", message)
#             await ws.send_text(f"ACK: {message}")

#     except WebSocketDisconnect:
#         print("Robot disconnected")

@app.websocket("/ws/robot")
async def robot_socket(ws: WebSocket):
    await ws.accept()

    await ws.send_json({
        "type": "move",
        "vx": 0.15
    })

    message = await ws.receive_text()
    print("Robot:", message) 