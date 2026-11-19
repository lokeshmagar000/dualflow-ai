"""
Meta MMS open-source Nepali voice (facebook/mms-tts-npi), for comparison only.
Runs on the computer itself (no key, no account). License is CC-BY-NC 4.0:
NOT allowed for videos that earn money, so it is only a test here.

Use: python mms_speak.py "नमस्ते" out.wav
"""
import sys

import scipy.io.wavfile
import torch
from transformers import AutoTokenizer, VitsModel

text, out = sys.argv[1], sys.argv[2]
tok = AutoTokenizer.from_pretrained("facebook/mms-tts-npi")
model = VitsModel.from_pretrained("facebook/mms-tts-npi")
if getattr(tok, "is_uroman", False):
    import uroman

    text = uroman.Uroman().romanize_string(text)
torch.manual_seed(1)
with torch.no_grad():
    wav = model(**tok(text, return_tensors="pt")).waveform[0].numpy()
scipy.io.wavfile.write(out, model.config.sampling_rate, wav)
print(f"MMS: {len(wav) / model.config.sampling_rate:.1f} s")
