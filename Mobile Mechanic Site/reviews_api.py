from flask import Flask, request, jsonify
from flask_cors import CORS
from pathlib import Path
import json
import time

app = Flask(__name__)
CORS(app)

DATA_FILE = Path(__file__).with_name('reviews.json')


def load_reviews():
    if not DATA_FILE.exists():
        return []
    try:
        return json.loads(DATA_FILE.read_text(encoding='utf-8'))
    except Exception:
        return []


def save_reviews(reviews):
    DATA_FILE.write_text(json.dumps(reviews, ensure_ascii=False, indent=2), encoding='utf-8')


@app.route('/api/reviews', methods=['GET'])
def get_reviews():
    reviews = load_reviews()
    # return newest first
    reviews_sorted = sorted(reviews, key=lambda r: r.get('ts', 0), reverse=True)
    return jsonify(reviews_sorted)


@app.route('/api/reviews', methods=['POST'])
def post_review():
    data = request.get_json(force=True)
    # basic validation
    name = (data.get('name') or '').strip()
    vehicle = (data.get('vehicle') or '').strip()
    rating = int(data.get('rating') or 0)
    text = (data.get('text') or '').strip()
    if not name or not text or rating < 1 or rating > 5:
        return jsonify({'error': 'Invalid payload'}), 400

    reviews = load_reviews()
    review = {
        'id': int(time.time() * 1000),
        'name': name,
        'vehicle': vehicle,
        'rating': rating,
        'text': text,
        'ts': int(time.time())
    }
    reviews.append(review)
    save_reviews(reviews)
    return jsonify(review), 201


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
