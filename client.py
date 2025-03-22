import cv2
import json
import base64
import uuid
import time
import asyncio
import websockets

WEBSOCKET_URL = "ws://localhost:3000"  # Change to your WebSocket server URL

async def send_video():
    cap = cv2.VideoCapture(0)  # Webcam (Use URL for an IP camera)

    if not cap.isOpened():
        print("Error: Could not open video.")
        return

    async with websockets.connect(WEBSOCKET_URL) as ws:
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            # Encode frame as base64 (optional)
            _, buffer = cv2.imencode('.jpg', frame)
            encoded_frame = base64.b64encode(buffer).decode('utf-8')

            # Generate unique frame ID and timestamp
            frame_id = str(uuid.uuid4())
            observer_id = str(uuid.uuid4())
            timestamp = int(time.time() * 1000)  # Convert to milliseconds

            # Create JSON message
            message = {
                "observerId": observer_id,
                "frameId": frame_id,
                "timestamp": timestamp,
                "image": encoded_frame  # Sending encoded image (optional)
            }

            await ws.send(json.dumps(message))

            # Display the frame
            cv2.imshow("Live Feed", frame)

            # Exit on 'q' key press
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

    cap.release()
    cv2.destroyAllWindows()

# Run WebSocket client
asyncio.run(send_video())
