import asyncio
import json
from websockets.asyncio.client import connect

async def main():
    url = "ws://192.168.45.220:8000/ws/robot"

    async with connect(url) as ws:
        while True:
            message = await ws.recv()
            command = json.loads(message)

            print("Server:", command)

            if command["type"] == "get_status":
                await ws.send(json.dumps({
                    "robot_id": "jetrover-001",
                    "status": "idle"
                }))


asyncio.run(main())

