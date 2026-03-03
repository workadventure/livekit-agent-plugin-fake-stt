import { stt } from '@livekit/agents';
import { STT } from '../dist/index.js';

const provider = new STT({
  defaultStepDelayMs: 0,
  emitRecognitionUsage: true,
  script: [['demo partial', 'demo final']],
});

const stream = provider.stream();
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
    console.log(`${stt.SpeechEventType[event.type]}: ${event.alternatives?.[0]?.text ?? ''}`);
  }
}
