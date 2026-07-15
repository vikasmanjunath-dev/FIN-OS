"""
Arya AI — Text-to-Speech via Edge Neural voices.
Same engine and tuned rate/pitch as voiceagent/agent.py's TTS class — ported
rather than reinvented, since those values (rate +12%, pitch -3Hz) were
already tuned against real listening ("+18% = too fast"), and the voice
choices (en-IN-PrabhatNeural, hi-IN-MadhurNeural) were already chosen for a
genuine Indian accent rather than the generic en-US voices edge-tts defaults to.

No API key, no cost — edge-tts calls Microsoft Edge's own free neural TTS
service, the same one used by voiceagent's voice agent.
"""
import edge_tts

TTS_RATE  = "+12%"
TTS_PITCH = "-3Hz"

EDGE_VOICES = {
    "english":  "en-IN-PrabhatNeural",
    "hindi":    "hi-IN-MadhurNeural",
    "hinglish": "en-IN-PrabhatNeural",
}


async def synthesize(text: str, lang: str = "english") -> bytes:
    """Returns MP3 bytes for the given text using an Indian neural voice."""
    voice = EDGE_VOICES.get(lang, EDGE_VOICES["english"])
    com = edge_tts.Communicate(text, voice, rate=TTS_RATE, pitch=TTS_PITCH)
    audio = b""
    async for chunk in com.stream():
        if chunk["type"] == "audio":
            audio += chunk["data"]
    if not audio:
        raise RuntimeError(f"TTS produced no audio (voice={voice})")
    return audio
