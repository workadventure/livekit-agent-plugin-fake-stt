# @workadventure/livekit-agent-plugin-fake-stt

Deterministic fake STT provider for `@livekit/agents`.

This plugin is designed for tests and local development where you need predictable
streaming STT events without calling external APIs.

## Features

- deterministic streaming event sequence
- no network calls, no credentials
- configurable scripts with interim/final steps
- per-step delays and deterministic jitter
- stable `seed` + `offset` controls
- optional `RECOGNITION_USAGE` events

## Install

```bash
npm install @workadventure/livekit-agent-plugin-fake-stt
```

Peer requirements:

- `@livekit/agents`
- `@livekit/rtc-node`

## Quick Start

```ts
import { stt } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';
import { STT } from '@workadventure/livekit-agent-plugin-fake-stt';

const fakeStt = new STT({
  emitRecognitionUsage: true,
  script: [['hello partial', 'hello final']],
});

const stream = fakeStt.stream();
const frame = {
  data: new Int16Array(1600),
  sampleRate: 16000,
  channels: 1,
  samplesPerChannel: 1600,
} as unknown as AudioFrame;

stream.pushFrame(frame);
stream.endInput();

for await (const event of stream) {
  switch (event.type) {
    case stt.SpeechEventType.INTERIM_TRANSCRIPT:
    case stt.SpeechEventType.FINAL_TRANSCRIPT:
      console.log(event.alternatives?.[0]?.text ?? '');
      break;
  }
}
```

## Event Model

For each utterance (audio frames up to `flush()` or `endInput()`), the stream emits:

1. `START_OF_SPEECH`
2. one or more `INTERIM_TRANSCRIPT` / `FINAL_TRANSCRIPT` steps from the configured script
3. `END_OF_SPEECH`
4. optional `RECOGNITION_USAGE`

Default script:

- Segment A: interim, interim, final
- Segment B: interim, final

Segments are reused in deterministic round-robin order.

## Configuration

```ts
import { STT } from '@workadventure/livekit-agent-plugin-fake-stt';

const fakeStt = new STT({
  language: 'en-US',
  defaultStepDelayMs: 10,
  jitterMs: 2,
  seed: 1234,
  offset: 1,
  emitRecognitionUsage: true,
  script: [
    [
      { text: 'segment-1 partial', final: false, delayMs: 20 },
      { text: 'segment-1 final', final: true },
    ],
    {
      emitUsage: false,
      steps: ['segment-2 partial', 'segment-2 final'],
    },
  ],
});
```

### `FakeSTTOptions`

- `script`: deterministic transcript script. Array of segments.
- `language`: default language on transcript alternatives.
- `defaultStepDelayMs`: delay used when a step has no explicit `delayMs`.
- `jitterMs`: deterministic signed jitter added to each step delay.
- `seed`: stable seed used for script offset and jitter generation.
- `offset`: deterministic script cursor offset.
- `emitRecognitionUsage`: emit usage events for each utterance.
- `sampleRate`: expected input sample rate for stream resampling behavior.

## Deterministic Testing Recipes

### Stable transcript snapshots

- set `defaultStepDelayMs: 0`
- set `jitterMs: 0`
- use explicit script text values

### Seeded timing simulation

- set `defaultStepDelayMs` and `jitterMs`
- pin `seed` so delay jitter stays reproducible in CI

### Script partitioning by utterance

- call `flush()` between user turns
- each flush/end advances to the next script segment

## Examples

- `examples/basic-stream.mjs`
- `examples/seeded-script.mjs`

Build first, then run:

```bash
npm run build
node examples/basic-stream.mjs
```

## Development

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

## License

MIT
