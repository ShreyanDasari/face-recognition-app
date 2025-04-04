import argparse
import pickle
import json
import sqlite3
import io
import base64
import numpy as np
from collections import Counter
from pathlib import Path
import face_recognition
from PIL import Image, ImageDraw
import cv2

DEFAULT_ENCODINGS_PATH = Path("output/encodings.pkl")
DB_PATH = "face_recognition.db"

# Ensure output directory exists
Path("output").mkdir(exist_ok=True)

parser = argparse.ArgumentParser(description="Face Recognition System")
parser.add_argument("--train", action="store_true", help="Train on input data")
parser.add_argument("--validate", action="store_true", help="Validate trained model")
parser.add_argument("--test", action="store_true", help="Test the model with an unknown image")
parser.add_argument("-m", action="store", default="hog", choices=["hog", "cnn"], help="Which model to use: hog (CPU), cnn (GPU)")
parser.add_argument("-f", action="store", help="Path to an image for testing")
args = parser.parse_args()

def get_db_connection():
    """Connect to SQLite database."""
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        return conn
    except sqlite3.Error as e:
        print(json.dumps({"error": f"Database connection error: {e}"}))
        if conn:
            conn.close()
        return None

def encode_known_faces(
    model: str = "hog", encodings_location: Path = DEFAULT_ENCODINGS_PATH
) -> None:
    """
    Loads images from the database and builds a dictionary of their
    names and encodings.
    """
    names = []
    encodings = []
    person_ids = []

    conn = get_db_connection()
    if not conn:
        return

    cursor = conn.cursor()
    
    try:
        # Get all references from database
        cursor.execute("""
            SELECT r.id, r.userId, r.imageData, p.name 
            FROM face_references r 
            JOIN people p ON r.userId = p.id
        """)
        
        for row in cursor.fetchall():
            ref_id, user_id, image_data, name = row
            try:
                # Decode base64 string to bytes
                image_bytes = base64.b64decode(image_data)
                # Convert bytes to image
                image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
                # Convert PIL Image to numpy array
                image_array = np.array(image)
                
                face_locations = face_recognition.face_locations(image_array, model=model)
                face_encodings = face_recognition.face_encodings(image_array, face_locations)

                for encoding in face_encodings:
                    names.append(name)
                    encodings.append(encoding)
                    person_ids.append(user_id)
            except Exception as e:
                print(f"Error processing image for reference {ref_id}: {str(e)}")
                continue

        name_encodings = {
            "names": names,
            "encodings": encodings,
            "person_ids": person_ids
        }
        with encodings_location.open(mode="wb") as f:
            pickle.dump(name_encodings, f)

        print(json.dumps({"status": "Training complete", "total_faces": len(names)}))

    except sqlite3.Error as e:
        print(json.dumps({"error": f"Database error during training: {e}"}))
    except pickle.PickleError as e:
        print(json.dumps({"error": f"Error saving encodings: {e}"}))
    except Exception as e:
        print(json.dumps({"error": f"An unexpected error occurred during training: {e}"}))
    finally:
        conn.close()

    if not names:
        print(json.dumps({"error": "No faces found in training data."}))
        return

def load_encodings(encodings_location: Path = DEFAULT_ENCODINGS_PATH):
    """Loads face encodings from the saved file."""
    if not encodings_location.exists():
        print(json.dumps({"error": "No trained encodings found. Run training first."}))
        return None

    try:
        with encodings_location.open(mode="rb") as f:
            encodings = pickle.load(f)

        if "person_ids" not in encodings:
            print(json.dumps({"error": "Corrupt encodings file. Retrain the model."}))
            return None

        return encodings
    except pickle.PickleError as e:
        print(json.dumps({"error": f"Error loading encodings: {e}"}))
        return None
    except FileNotFoundError:
        print(json.dumps({"error": "Encoding file not found."}))
        return None
    except Exception as e:
        print(json.dumps({"error": f"An unexpected error occurred while loading encodings: {e}"}))
        return None

def recognize_faces(
    image_location: str,
    model: str = "hog",
    encodings_location: Path = DEFAULT_ENCODINGS_PATH,
) -> None:
    """
    Process video frames for face recognition.
    """
    try:
        # Check for trained model
        if not encodings_location.exists():
            print(json.dumps({
                "found": False,
                "message": "No trained model found"
            }))
            return

        # Load encodings
        loaded_encodings = load_encodings(encodings_location)
        if not loaded_encodings:
            return

        if not loaded_encodings["encodings"]:
            print(json.dumps({
                "found": False,
                "message": "No face encodings in model"
            }))
            return

        # Process image
        try:
            input_image = face_recognition.load_image_file(image_location)
        except FileNotFoundError:
            print(json.dumps({
                "found": False,
                "message": "Image file not found"
            }))
            return
        except Exception as e:
             print(json.dumps({
                "found": False,
                "message": f"Error loading image: {e}"
            }))
             return
        
        # Optimize for speed with smaller image
        small_frame = cv2.resize(input_image, (0, 0), fx=0.25, fy=0.25)
        rgb_small_frame = small_frame[:, :, ::-1]

        # Detect faces
        input_face_locations = face_recognition.face_locations(rgb_small_frame, model=model)
        
        if not input_face_locations:
            print(json.dumps({
                "found": False,
                "message": "No faces detected"
            }))
            return

        # Get encodings
        input_face_encodings = face_recognition.face_encodings(rgb_small_frame, input_face_locations)

        if not input_face_encodings:
            print(json.dumps({
                "found": False,
                "message": "Could not encode faces"
            }))
            return

        # Process each detected face
        results = []
        for face_encoding in input_face_encodings:
            # Compare with known faces
            matches = face_recognition.compare_faces(
                loaded_encodings["encodings"], 
                face_encoding,
                tolerance=0.6  # Adjust tolerance for better matching
            )
            
            if not any(matches):
                continue

            # Calculate face distances
            face_distances = face_recognition.face_distance(loaded_encodings["encodings"], face_encoding)
            best_match_index = np.argmin(face_distances)
            confidence = (1 - face_distances[best_match_index]) * 100

            if matches[best_match_index] and confidence > 50:  # Minimum confidence threshold
                person_id = loaded_encodings["person_ids"][best_match_index]
                
                # Get person details
                conn = get_db_connection()
                if not conn:
                    print(json.dumps({
                        "found": False,
                        "message": "Could not connect to database to retrieve person details."
                    }))
                    continue
                cursor = conn.cursor()
                try:
                    cursor.execute("""
                        SELECT id, name, age, address, info, email, phone, gender, nationality
                        FROM people WHERE id = ?
                    """, (person_id,))

                    person = cursor.fetchone()
                    if person:
                        results.append({
                            "id": person[0],
                            "name": person[1],
                            "confidence": round(confidence, 2),
                            "details": {
                                "age": person[2],
                                "address": person[3],
                                "info": person[4],
                                "email": person[5],
                                "phone": person[6],
                                "gender": person[7],
                                "nationality": person[8]
                            }
                        })
                except sqlite3.Error as e:
                    print(json.dumps({
                        "found": False,
                        "message": f"Database error retrieving person details: {e}"
                    }))
                finally:
                    conn.close()

        if results:
            print(json.dumps({
                "found": True,
                "matches": results
            }))
        else:
            print(json.dumps({
                "found": False,
                "message": "No matching person found"
            }))

    except Exception as e:
        print(json.dumps({
            "error": str(e),
            "found": False
        }))

def _recognize_face(face_encoding, loaded_encodings):
    """Helper function to recognize a single face."""
    matches = face_recognition.compare_faces(
        loaded_encodings["encodings"],
        face_encoding,
        tolerance=0.6
    )
    if True in matches:
        matched_index = matches.index(True)
        name = loaded_encodings["names"][matched_index]
        return name, matched_index
    return "Unknown", None

def validate(model: str = "hog"):
    """Validates the accuracy of the trained model."""
    loaded_encodings = load_encodings()
    if not loaded_encodings:
        return

    conn = get_db_connection()
    if not conn:
        return

    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT r.id, r.userId, r.imageData, p.name 
            FROM face_references r 
            JOIN people p ON r.userId = p.id
        """)

        total, correct = 0, 0

        for row in cursor.fetchall():
            ref_id, user_id, image_data, true_name = row

            try:
                if isinstance(image_data, str):
                    image_data = image_data.encode()

                image = Image.open(io.BytesIO(base64.b64decode(image_data))).convert("RGB")
                image_array = np.array(image)

                face_locations = face_recognition.face_locations(image_array, model=model)
                face_encodings = face_recognition.face_encodings(image_array, face_locations)

                if face_encodings:
                    name, _ = _recognize_face(face_encodings[0], loaded_encodings)
                    total += 1
                    if name == true_name:
                        correct += 1
            except Exception as e:
                print(f"Error processing validation image {ref_id}: {e}")
                continue

        if total > 0:
            accuracy = (correct / total) * 100
            print(json.dumps({"accuracy": round(accuracy, 2), "total_tested": total, "correct_matches": correct}))
        else:
            print(json.dumps({"error": "No faces found in validation set"}))

    except sqlite3.Error as e:
        print(json.dumps({"error": f"Database error during validation: {e}"}))
    finally:
        conn.close()

if __name__ == "__main__":
    if args.train:
        encode_known_faces(model=args.m)
    if args.validate:
        validate(model=args.m)
    if args.test:
        recognize_faces(image_location=args.f, model=args.m)
