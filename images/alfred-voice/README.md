# alfred-voice

Voice satellite server for **ESPHome `voice_assistant` devices** — the pod-side
half of talking to an agent instead of Home Assistant.

Home Assistant's Assist pipeline is synchronous: a conversation agent that
thinks for a minute gets killed by timeouts. This server takes HA's place on
the wire instead — it subscribes to the satellite over the ESPHome **native
API** (stock firmware, no fork) and owns the whole pipeline, so a slow agent
backend costs nothing: the satellite gets an immediate spoken ack, and the
real answer arrives later as an announcement.

```
ESPHome satellite (stock firmware, on-device wake word)
   │ native API (noise-encrypted TCP, port 6053)
   ▼
alfred-voice ── STT ──► wyoming-whisper
   │        ── TTS ──► nestor-voice (Wyoming, multi-voice)
   │
   ├── wake word "hey jarvis" ──► Alfred gateway (MCP ask_alfred, localhost)
   └── wake word "okay nabu"  ──► Home Assistant conversation API
```

## How a run works

1. The device detects the wake word on-device (`micro_wake_word`) and starts a
   pipeline; the start request carries **which** wake word was said
   (`wake_word_phrase`) — that is the routing key.
2. Mic audio streams over the API connection; an adaptive-energy endpointer
   decides end-of-utterance server-side; whisper transcribes.
3. The route decides delivery:
   - **sync** (fast backends, e.g. HA intents): wait up to `sync_timeout_s`
     and speak the answer in the same run — falls back to async if slow;
   - **async** (agent backends): speak a short ack, close the run, then
     deliver the answer via `announce` when the backend is done (however long
     it takes).
4. TTS audio is served to the device as short-lived unguessable URLs
   (`/tts/<token>.wav`).

## Requirements on the Home Assistant side

The device may stay in HA (sensors, OTA), but its **`assist_satellite` entity
must be disabled**: the firmware accepts a single voice assistant subscriber
(first one wins, no NACK) — if HA holds the slot, this server receives
nothing.

## Configuration

Runtime config is one JSON file (`ALFRED_VOICE_CONFIG`), owned by the
gateway's settings UI and hot-reloaded on change (see `app/config.py` for the
schema and defaults): Wyoming service endpoints, wake-word routes
(backend / voice / mode / ack), device list.

Environment: see `app/main.py` — noise key (`ESPHOME_NOISE_KEY`), device DNS
domain, TTS public base URL, `GW_MCP_URL`/`GW_MCP_TOKEN`, `HA_URL`/`HA_TOKEN`.

## Control API (in-pod, proxied by agent-gw for the PWA)

| Route | Purpose |
|---|---|
| `GET /health` | liveness |
| `GET /status` | devices + Wyoming services (incl. installed TTS voices) + config |
| `POST /reload` | force config reload |
| `POST /devices/test {name}` | probe a device: reachable, voice-capable, versions |
| `POST /say {text, device?, voice?}` | voice preview: synthesize and play on a satellite |
| `GET /tts/<token>.wav` | TTS audio fetched by the satellites |
