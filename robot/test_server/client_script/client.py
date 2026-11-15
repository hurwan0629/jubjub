import asyncio
import websockets

async def main():
    url = "ws://172.30.1.48:8000/ws/robot"

    async with websockets.connect(url) as ws:
        command = await ws.recv()
        print("Server command:", command)

        await ws.send("ACK")

asyncio.run(main())
