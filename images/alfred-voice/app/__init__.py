"""alfred-voice — voice satellite server for ESPHome voice_assistant devices.

Connects to stock-firmware ESPHome satellites over the native API (the role
Home Assistant normally plays), runs STT/TTS through Wyoming services, and
routes each utterance by wake word to a backend: the Alfred agent gateway
(MCP) or Home Assistant's conversation API.
"""

__version__ = "0.1.0"
