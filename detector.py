import argparse
import pickle
import json
import sqlite3
import io
import numpy as np
from collections import Counter
from pathlib import Path

import face_recognition
from PIL import Image, ImageDraw

DEFAULT_ENCODINGS_PATH = Path("output/encodings.pkl")
BOUNDING_BOX_COLOR = "blue"
TEXT_COLOR = "white"
DB_PATH = "face_recognition.db"

# Create directories if they don't already exist
Path("output").mkdir(exist_ok=True)

parser = argparse.ArgumentParser(description="Recognize faces in an image")
parser.add_argument("--train", action="store_true", help="Train on input data")
parser.add_argument(
    "--validate", action="store_true", help="Validate trained model"
)
parser.add_argument(
    "--test", action="store_true", help="Test the model with an unknown image"
)
parser.add_argument(
    "-m",
    action="store",
    default="hog",
    choices=["hog", "cnn"],
    help="Which model to use for training: hog (CPU), cnn (GPU)",
)
parser.add_argument(
    "-f", action="store", help="Path to an image with an unknown face"
)
args = parser.parse_args()

def get_db_connection():
    return sqlite3.connect(DB_PATH)

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
    cursor = conn.cursor()
    
    # Get all references from database
    cursor.execute("""
        SELECT r.id, r.userId, r.imageData, p.name 
        FROM face_references r 
        JOIN people p ON r.userId = p.id
    """)
    
    for row in cursor.fetchall():
        ref_id, user_id, image_data, name = row
        
        # Convert BLOB to image
        image = Image.open(io.BytesIO(image_data))
        # Convert PIL Image to numpy array
        image_array = np.array(image)
        
        face_locations = face_recognition.face_locations(image_array, model=model)
        face_encodings = face_recognition.face_encodings(image_array, face_locations)

        for encoding in face_encodings:
            names.append(name)
            encodings.append(encoding)
            person_ids.append(user_id)

    name_encodings = {
        "names": names,
        "encodings": encodings,
        "person_ids": person_ids
    }
    with encodings_location.open(mode="wb") as f:
        pickle.dump(name_encodings, f)

    conn.close()

def recognize_faces(
    image_location: str,
    model: str = "hog",
    encodings_location: Path = DEFAULT_ENCODINGS_PATH,
) -> None:
    """
    Given an unknown image, get the locations and encodings of any faces and
    compares them against the known encodings to find potential matches.
    Returns JSON with recognition results.
    """
    with encodings_location.open(mode="rb") as f:
        loaded_encodings = pickle.load(f)

    input_image = face_recognition.load_image_file(image_location)
    input_face_locations = face_recognition.face_locations(input_image, model=model)
    input_face_encodings = face_recognition.face_encodings(input_image, input_face_locations)

    if not input_face_encodings:
        print(json.dumps({
            "found": False,
            "message": "No faces detected in the image"
        }))
        return

    # Get the first face detected (assuming one face per image)
    unknown_encoding = input_face_encodings[0]
    name, person_id = _recognize_face(unknown_encoding, loaded_encodings)
    
    if not name or not person_id:
        print(json.dumps({
            "found": False,
            "message": "No matching person found"
        }))
        return

    # Get person details from database
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

    # Convert tuple to dictionary
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
        "confidence": 100  # You could calculate actual confidence if needed
    }))

def _recognize_face(unknown_encoding, loaded_encodings):
    """
    Given an unknown encoding and all known encodings, find the known
    encoding with the most matches.
    """
    boolean_matches = face_recognition.compare_faces(
        loaded_encodings["encodings"], unknown_encoding
    )
    
    votes = Counter()
    for match, name, person_id in zip(
        boolean_matches,
        loaded_encodings["names"],
        loaded_encodings["person_ids"]
    ):
        if match:
            votes[(name, person_id)] += 1
    
    if votes:
        (name, person_id), _ = votes.most_common(1)[0]
        return name, person_id
    return None, None

def validate(model: str = "hog"):
    """
    Runs validation using images from the database
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get all references
    cursor.execute("""
        SELECT r.id, r.userId, r.imageData, p.name 
        FROM face_references r 
        JOIN people p ON r.userId = p.id
    """)
    
    total = 0
    correct = 0
    
    for row in cursor.fetchall():
        ref_id, user_id, image_data, true_name = row
        
        # Save image data to temporary file
        temp_path = f"temp_validate_{ref_id}.jpg"
        with open(temp_path, "wb") as f:
            f.write(image_data)
        
        # Recognize face
        with encodings_location.open(mode="rb") as f:
            loaded_encodings = pickle.load(f)
        
        input_image = face_recognition.load_image_file(temp_path)
        input_face_locations = face_recognition.face_locations(input_image, model=model)
        input_face_encodings = face_recognition.face_encodings(input_image, input_face_locations)
        
        if input_face_encodings:
            name, _ = _recognize_face(input_face_encodings[0], loaded_encodings)
            total += 1
            if name == true_name:
                correct += 1
        
        # Clean up temporary file
        Path(temp_path).unlink()
    
    conn.close()
    
    if total > 0:
        accuracy = (correct / total) * 100
        print(json.dumps({
            "accuracy": round(accuracy, 2),
            "total_tested": total,
            "correct_matches": correct
        }))
    else:
        print(json.dumps({
            "error": "No faces found in validation set"
        }))

if __name__ == "__main__":
    if args.train:
        encode_known_faces(model=args.m)
    if args.validate:
        validate(model=args.m)
    if args.test:
        recognize_faces(image_location=args.f, model=args.m)
