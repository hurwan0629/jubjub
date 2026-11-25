import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

app = FastAPI()


@app.websocket("/ws/robot")
async def robot_socket(ws: WebSocket):
    await ws.accept()

    try:
        while True:
            await ws.send_json({
                "type": "get_status"
            })

            response = await ws.receive_json()
            print("Robot:", response)

            await asyncio.sleep(5)

    except WebSocketDisconnect:
        print("Robot disconnected")