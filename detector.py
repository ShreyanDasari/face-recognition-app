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
from PIL import Image

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
    return sqlite3.connect(DB_PATH)


def encode_known_faces(model="hog", encodings_location=DEFAULT_ENCODINGS_PATH):
    names = []
    encodings = []
    person_ids = []

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT r.id, r.userId, r.imageData, p.name 
        FROM face_references r 
        JOIN people p ON r.userId = p.id
    """)

    for row in cursor.fetchall():
        ref_id, user_id, image_data, name = row
        try:
            # Decode base64 image data
            image_bytes = base64.b64decode(image_data)
            
            # Create a temporary file to save the image
            temp_file = io.BytesIO(image_bytes)
            
            # Load and convert image to RGB using PIL first
            pil_image = Image.open(temp_file)
            if pil_image.mode != 'RGB':
                pil_image = pil_image.convert('RGB')
            
            # Resize large images
            if pil_image.size[0] > 1024 or pil_image.size[1] > 1024:
                pil_image.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
            
            # Save the processed image to a new BytesIO
            processed_temp = io.BytesIO()
            pil_image.save(processed_temp, format='JPEG')
            processed_temp.seek(0)
            
            # Use face_recognition's load_image_file
            image_array = face_recognition.load_image_file(processed_temp)
            
            # Debug information
            print(f"Processing reference {ref_id}:")
            print(f"Original image mode: {pil_image.mode}")
            print(f"Original image size: {pil_image.size}")
            print(f"Array shape: {image_array.shape}")
            print(f"Array dtype: {image_array.dtype}")

            # Detect faces
            face_locations = face_recognition.face_locations(image_array, model=model)
            
            if not face_locations:
                print(f"No faces found in image for reference {ref_id}")
                continue
                
            face_encodings = face_recognition.face_encodings(image_array, face_locations)

            for encoding in face_encodings:
                names.append(name)
                encodings.append(encoding)
                person_ids.append(user_id)
                print(f"✅ Successfully processed face for {name} (ID: {user_id})")

        except Exception as e:
            print(f"Error processing image for reference {ref_id}: {str(e)}")
            print(f"Error type: {type(e).__name__}")
            continue

    conn.close()

    if not names:
        print(json.dumps({"error": "No faces found in training data."}))
        return

    name_encodings = {
        "names": names,
        "encodings": encodings,
        "person_ids": person_ids
    }

    with encodings_location.open(mode="wb") as f:
        pickle.dump(name_encodings, f)

    print(json.dumps({
        "status": "Training complete",
        "total_faces": len(names),
        "unique_people": len(set(names))
    }))


def load_encodings(encodings_location=DEFAULT_ENCODINGS_PATH):
    if not encodings_location.exists():
        print(json.dumps({"error": "No trained encodings found. Run training first."}))
        return None

    with encodings_location.open(mode="rb") as f:
        encodings = pickle.load(f)

    if "person_ids" not in encodings:
        print(json.dumps({"error": "Corrupt encodings file. Retrain the model."}))
        return None

    return encodings


def recognize_faces(image_location, model="hog", encodings_location=DEFAULT_ENCODINGS_PATH):
    try:
        with encodings_location.open(mode="rb") as f:
            loaded_encodings = pickle.load(f)

        # Load and process image
        try:
            # Load and convert image to RGB using PIL first
            pil_image = Image.open(image_location)
            if pil_image.mode != 'RGB':
                pil_image = pil_image.convert('RGB')
            
            # Resize large images
            if pil_image.size[0] > 1024 or pil_image.size[1] > 1024:
                pil_image.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
            
            # Save to temporary file
            temp_file = io.BytesIO()
            pil_image.save(temp_file, format='JPEG')
            temp_file.seek(0)
            
            # Use face_recognition's load_image_file
            image_array = face_recognition.load_image_file(temp_file)
            
            # Debug information
            print(json.dumps({
                "debug": {
                    "original_mode": pil_image.mode,
                    "original_size": pil_image.size,
                    "array_shape": image_array.shape,
                    "array_dtype": str(image_array.dtype)
                }
            }))

        except Exception as e:
            raise ValueError(f"Failed to load or process image: {str(e)}")

        # Detect and encode faces
        input_face_locations = face_recognition.face_locations(image_array, model=model)
        
        if not input_face_locations:
            print(json.dumps({
                "found": False,
                "message": "No faces detected in the image"
            }))
            return

        input_face_encodings = face_recognition.face_encodings(image_array, input_face_locations)
        
        if not input_face_encodings:
            print(json.dumps({
                "found": False,
                "message": "Could not encode detected face"
            }))
            return

        unknown_encoding = input_face_encodings[0]
        name, person_id = _recognize_face(unknown_encoding, loaded_encodings)

        if not name or not person_id:
            print(json.dumps({
                "found": False,
                "message": "No matching person found"
            }))
            return

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, name, age, address, info, email, phone, gender, nationality
            FROM people WHERE id = ?
        """, (person_id,))
        person = cursor.fetchone()
        conn.close()

        if not person:
            print(json.dumps({
                "found": False,
                "message": "Person data not found in database"
            }))
            return

        person_data = {
            "id": person[0],
            "name": person[1],
            "age": person[2],
            "address": person[3],
            "info": person[4],
            "email": person[5],
            "phone": person[6],
            "gender": person[7],
            "nationality": person[8]
        }

        print(json.dumps({
            "found": True,
            "person": person_data,
            "confidence": 100  # Placeholder confidence
        }))
    except Exception as e:
        print(json.dumps({"error": str(e)}))


def _recognize_face(unknown_encoding, loaded_encodings):
    boolean_matches = face_recognition.compare_faces(loaded_encodings["encodings"], unknown_encoding)
    votes = Counter()

    for match, name, person_id in zip(boolean_matches, loaded_encodings["names"], loaded_encodings["person_ids"]):
        if match:
            votes[(name, person_id)] += 1

    if votes:
        (name, person_id), _ = votes.most_common(1)[0]
        return name, person_id
    return None, None


def validate(model="hog"):
    loaded_encodings = load_encodings()
    if not loaded_encodings:
        return

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT r.id, r.userId, r.imageData, p.name 
        FROM face_references r 
        JOIN people p ON r.userId = p.id
    """)

    total, correct = 0, 0

    for row in cursor.fetchall():
        ref_id, user_id, image_data, true_name = row
        try:
            image_bytes = base64.b64decode(image_data)
            image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            image_array = np.array(image).astype(np.uint8)

            input_face_locations = face_recognition.face_locations(image_array, model=model)
            input_face_encodings = face_recognition.face_encodings(image_array, input_face_locations)

            if input_face_encodings:
                name, _ = _recognize_face(input_face_encodings[0], loaded_encodings)
                total += 1
                if name == true_name:
                    correct += 1
        except Exception as e:
            print(f"Error during validation on reference {ref_id}: {e}")

    conn.close()

    if total > 0:
        accuracy = (correct / total) * 100
        print(json.dumps({"accuracy": round(accuracy, 2), "total_tested": total, "correct_matches": correct}))
    else:
        print(json.dumps({"error": "No faces found in validation set"}))


if __name__ == "__main__":
    if args.train:
        encode_known_faces(model=args.m)
    if args.validate:
        validate(model=args.m)
    if args.test:
        recognize_faces(image_location=args.f, model=args.m)
