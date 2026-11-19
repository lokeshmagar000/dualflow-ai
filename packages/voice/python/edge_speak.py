"""
Free voice with Edge TTS (the "Read aloud" voices of Microsoft Edge).

How the Node.js code uses this file:
  - it sends JSON on stdin:   {"text": "...", "voice": "ne-NP-HemkalaNeural"}
  - this script saves the MP3 audio to the path given as the first argument
  - and prints the time of every word as JSON on stdout:
        {"words": [{"text": "नमस्ते", "startMs": 50, "endMs": 600}, ...]}

Edge TTS needs no key and no account, but it is unofficial, so the app keeps
Azure as the main voice and uses this one as the free backup.
Install it once with:  pip install -r packages/voice/python/requirements.txt
"""
import asyncio
import json
import sys

import edge_tts

# Edge gives times in "ticks": 1 tick = 100 nanoseconds, so 10,000 ticks = 1 ms.
TICKS_PER_MS = 10_000


async def main() -> None:
    request = json.load(sys.stdin)
    out_path = sys.argv[1]
    communicate = edge_tts.Communicate(
        request["text"],
        request["voice"],
        rate=request.get("rate", "+0%"),
        boundary="WordBoundary",  # ask for the time of every word (for subtitles)
    )
    words = []
    with open(out_path, "wb") as audio_file:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_file.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                start = chunk["offset"] / TICKS_PER_MS
                words.append(
                    {
                        "text": chunk["text"],
                        "startMs": round(start),
                        "endMs": round(start + chunk["duration"] / TICKS_PER_MS),
                    }
                )
    json.dump({"words": words}, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    asyncio.run(main())
