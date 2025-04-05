import cv2
import json
import base64
import uuid
import time
import asyncio
import websockets
import numpy as np
from datetime import datetime
from PIL import Image
import io

WEBSOCKET_URL = "ws://localhost:3000/ws"
FRAME_INTERVAL = 0.5  # Seconds between frame processing
MIN_FACE_SIZE = 100   # Minimum face size to detect

class FaceRecognitionClient:
    def __init__(self):
        self.cap = None
        self.observer_id = str(uuid.uuid4())
        self.frame_counter = 0
        self.last_process_time = 0
        self.face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        self.frame_interval = 1.0  # Increase interval to 1 second
        self.max_image_size = 640  # Maximum image dimension

    async def connect(self):
        try:
            self.cap = cv2.VideoCapture(0)
            if not self.cap.isOpened():
                raise Exception("Could not open video capture device")
            
            print(f"🎥 Camera initialized. Observer ID: {self.observer_id}")
            return True
        except Exception as e:
            print(f"❌ Camera initialization failed: {str(e)}")
            return False

    def preprocess_frame(self, frame):
        """Preprocess frame and detect faces before sending"""
        # Resize frame to reduce processing time
        height, width = frame.shape[:2]
        max_dim = max(height, width)
        if max_dim > self.max_image_size:
            scale = self.max_image_size / max_dim
            frame = cv2.resize(frame, None, fx=scale, fy=scale)

        # Convert to grayscale for face detection
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # Detect faces with optimized parameters
        faces = self.face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.2,
            minNeighbors=4,
            minSize=(60, 60),
            maxSize=(200, 200)
        )

        # Draw rectangles around faces
        for (x, y, w, h) in faces:
            cv2.rectangle(frame, (x, y), (x+w, y+h), (0, 255, 0), 2)

        return len(faces) > 0, frame

    async def process_frame(self, ws):
        """Capture and process a single frame"""
        ret, frame = self.cap.read()
        if not ret:
            return False

        # Ensure frame is in RGB format
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # Resize frame to a reasonable size (max 640px width)
        height, width = frame_rgb.shape[:2]
        if width > 640:
            scale = 640 / width
            frame_rgb = cv2.resize(frame_rgb, (640, int(height * scale)))

        # Convert to PIL Image format and back to ensure compatibility
        _, buffer = cv2.imencode('.jpg', frame_rgb, [cv2.IMWRITE_JPEG_QUALITY, 90])
        encoded_frame = base64.b64encode(buffer).decode('utf-8')

        message = {
            "observerId": self.observer_id,
            "frameId": self.frame_counter,
            "timestamp": int(time.time() * 1000),
            "image": encoded_frame
        }

        try:
            await ws.send(json.dumps(message))
            self.frame_counter += 1
            
            # Add timeout for response
            try:
                response = await asyncio.wait_for(ws.recv(), timeout=10.0)
                self.handle_response(response, frame)
            except asyncio.TimeoutError:
                print("⚠️ Response timeout - continuing with next frame")
                
        except Exception as e:
            print(f"❌ Error sending frame: {str(e)}")
            return False

        # Display frame
        cv2.imshow("Face Recognition Client", frame)
        return True

    def handle_response(self, response, frame):
        """Handle recognition response from server"""
        try:
            result = json.loads(response)
            
            # Display recognition results on frame
            if result.get('found') and result.get('person'):
                person = result['person']
                confidence = result.get('confidence', 0)
                
                # Draw recognition info on frame
                text = f"{person['name']} ({confidence:.1f}%)"
                cv2.putText(frame, text, (10, 30),
                           cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
                
                print(f"✅ Recognized: {person['name']} (Confidence: {confidence:.1f}%)")
            elif result.get('error'):
                print(f"❌ Error: {result['error']}")
            else:
                print("🔍 No match found")
                
        except Exception as e:
            print(f"❌ Error processing response: {str(e)}")

    async def run(self):
        """Main loop for video streaming"""
        if not await self.connect():
            return

        print("🚀 Starting face recognition stream...")
        retry_count = 0
        max_retries = 3

        while retry_count < max_retries:
            try:
                async with websockets.connect(WEBSOCKET_URL) as ws:
                    print("✅ Connected to server")
                    retry_count = 0  # Reset retry count on successful connection
                    
                    while True:
                        current_time = time.time()
                        
                        if current_time - self.last_process_time >= self.frame_interval:
                            if not await self.process_frame(ws):
                                break
                            self.last_process_time = current_time
                        
                        if cv2.waitKey(1) & 0xFF == ord('q'):
                            print("👋 Quitting...")
                            return
                        
                        await asyncio.sleep(0.1)  # Increased sleep time
                        
            except websockets.exceptions.ConnectionClosed:
                print("⚠️ Connection lost. Retrying...")
                retry_count += 1
                await asyncio.sleep(2)  # Wait before retrying
            except Exception as e:
                print(f"❌ Error: {str(e)}")
                retry_count += 1
                await asyncio.sleep(2)

        print("❌ Max retries reached. Exiting...")
        self.cleanup()

    def cleanup(self):
        """Clean up resources"""
        if self.cap is not None:
            self.cap.release()
        cv2.destroyAllWindows()
        print("🧹 Cleanup completed")

async def send_video():
    cap = cv2.VideoCapture(0)

    if not cap.isOpened():
        print("Error: Could not open video.")
        return

    async with websockets.connect(WEBSOCKET_URL) as ws:
        frame_count = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            # Convert BGR to RGB
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            # Resize frame if needed
            height, width = frame_rgb.shape[:2]
            if width > 640:
                scale = 640 / width
                frame_rgb = cv2.resize(frame_rgb, (640, int(height * scale)))

            # Save as RGB image using PIL to ensure correct format
            pil_image = Image.fromarray(frame_rgb)
            temp_buffer = io.BytesIO()
            pil_image.save(temp_buffer, format='JPEG', quality=90)
            encoded_frame = base64.b64encode(temp_buffer.getvalue()).decode('utf-8')

            message = {
                "observerId": str(uuid.uuid4()),
                "frameId": frame_count,
                "timestamp": int(time.time() * 1000),
                "image": encoded_frame
            }

            await ws.send(json.dumps(message))
            print(f"📤 Sent frame {frame_count} at {time.strftime('%Y-%m-%d %H:%M:%S')}")

            # Display the frame (in BGR format for OpenCV display)
            cv2.imshow("Live Feed", frame)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

            frame_count += 1
            await asyncio.sleep(15)

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    try:
        asyncio.run(send_video())
    except KeyboardInterrupt:
        print("\nStopping video capture...")
    except Exception as e:
        print(f"Error: {str(e)}")
