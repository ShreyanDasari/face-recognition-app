import cv2
import json
import base64
import uuid
import time
import asyncio
import websockets

WEBSOCKET_URL = "ws://localhost:3000/ws"  # Make sure server is running

async def send_video():
    cap = cv2.VideoCapture(0)

    if not cap.isOpened():
        print("Error: Could not open video.")
        return

    async with websockets.connect(WEBSOCKET_URL) as ws:
        frame_count = 0  # Track frames
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            _, buffer = cv2.imencode('.jpg', frame)
            encoded_frame = base64.b64encode(buffer).decode('utf-8')

            message = {
                "observerId": str(uuid.uuid4()),
                "frameId": frame_count,
                "timestamp": int(time.time() * 1000),
                "image": encoded_frame
            }

            await ws.send(json.dumps(message))
            print(f"📤 Sent frame {frame_count} at {time.strftime('%Y-%m-%d %H:%M:%S')}")

            frame_count += 1

            cv2.imshow("Live Feed", frame)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

            # Wait for 1 minute before sending the next frame
            await asyncio.sleep(5)

    cap.release()
    cv2.destroyAllWindows(30)

asyncio.run(send_video())
