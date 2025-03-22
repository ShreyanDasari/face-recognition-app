import cv2

cap = cv2.VideoCapture(0)  # Try 1, 2, or 3 if this fails

if not cap.isOpened():
    print("Error: Could not open camera.")
else:
    ret, frame = cap.read()
    if ret:
        cv2.imshow("Camera Test", frame)
        cv2.waitKey(0)

cap.release()
cv2.destroyAllWindows()
