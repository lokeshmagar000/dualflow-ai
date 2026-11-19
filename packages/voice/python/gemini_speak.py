"""
Gemini TTS helper: turns text into a WAV file with Google's Gemini voices.

It uses the SAME free key as the rest of the app (GEMINI_API_KEY from Google AI Studio).
The key is sent in a header, never printed.

Use:  echo '{"text": "नमस्ते", "voice": "Kore"}' | python gemini_speak.py out.wav
Prints: {"model": "<model that answered>", "seconds": 3.2}

Optional in the JSON:
  "style": a short instruction, like "Speak warmly, like a friendly storyteller"
  "models": list of model names to try in order
"""
import base64
import json
import os
import sys
import urllib.error
import urllib.request
import wave

API = "https://generativelanguage.googleapis.com/v1beta/models"
DEFAULT_MODELS = ["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"]
RATE = 24000  # Gemini returns raw 16-bit mono audio at 24 kHz


def speak(text, voice, style, models, key):
    prompt = f"{style}:\n{text}" if style else text
    errors = []
    for model in models:
        body = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}},
            },
        }
        req = urllib.request.Request(
            f"{API}/{model}:generateContent",
            data=json.dumps(body).encode(),
            headers={"content-type": "application/json", "x-goog-api-key": key},
        )
        try:
            with urllib.request.urlopen(req, timeout=180) as res:
                data = json.load(res)
        except urllib.error.HTTPError as e:
            errors.append(f"{model}: HTTP {e.code} {e.read().decode()[:300]}")
            continue
        except Exception as e:  # timeout, network
            errors.append(f"{model}: {e}")
            continue
        parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
        audio = next((p["inlineData"]["data"] for p in parts if "inlineData" in p), None)
        if audio:
            return model, base64.b64decode(audio)
        errors.append(f"{model}: no audio in answer ({json.dumps(data)[:200]})")
    raise RuntimeError(" | ".join(errors))


def main():
    out = sys.argv[1]
    req = json.load(sys.stdin)
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        sys.exit("GEMINI_API_KEY is not set")
    models = req.get("models") or DEFAULT_MODELS
    model, pcm = speak(req["text"], req.get("voice", "Kore"), req.get("style"), models, key)
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm)
    print(json.dumps({"model": model, "seconds": round(len(pcm) / 2 / RATE, 2)}))


if __name__ == "__main__":
    main()
