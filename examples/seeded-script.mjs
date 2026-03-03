import { stt } from '@livekit/agents';
import { STT } from '../dist/index.js';

const provider = new STT({
  seed: 20260303,
  offset: 1,
  defaultStepDelayMs: 5,
  jitterMs: 3,
  script: [
    ['alpha partial', 'alpha final'],
    ['beta partial', 'beta final'],
  ],
});

const stream = provider.stream();

stream.pushFrame({
  data: new Int16Array(1600),
  sampleRate: 16000,
  channels: 1,
  samplesPerChannel: 1600,
});
stream.flush();
stream.pushFrame({
  data: new Int16Array(1600),
  sampleRate: 16000,
  channels: 1,
  samplesPerChannel: 1600,
});
stream.endInput();

for await (const event of stream) {
  if (
    event.type === stt.SpeechEventType.INTERIM_TRANSCRIPT ||
    event.type === stt.SpeechEventType.FINAL_TRANSCRIPT
  ) {
    console.log(event.alternatives?.[0]?.text ?? '');
  }
}
