"""Narration with Piper neural TTS (run with the Python that has piper-tts).
    echo "text" | python tts_piper.py <voice.onnx> <espeak-ng-data dir> <length_scale> <out.wav>
"""
import sys, wave
from piper import PiperVoice, SynthesisConfig
model, data, scale, out = sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4]
text = sys.stdin.read().strip()
voice = PiperVoice.load(model, espeak_data_dir=data)
with wave.open(out, 'wb') as w:
    voice.synthesize_wav(text, w, syn_config=SynthesisConfig(length_scale=scale, noise_scale=0.6, noise_w_scale=0.8))
