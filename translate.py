from flask import Flask, request, jsonify
from flask_cors import CORS
from deep_translator import LibreTranslator

app = Flask(__name__)
CORS(app) # Allows your frontend to talk to this backend

@app.route('/api/translate', methods=['POST'])
def translate_text():
    data = request.json
    english_text = data.get('text', '')
    target_lang = data.get('lang', 'hi') # Default to Hindi ('hi')
    
    try:
        # Translates text automatically on the fly
        translated = LibreTranslator(source='en', target=target_lang).translate(english_text)
        return jsonify({"translated_text": translated})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000)
