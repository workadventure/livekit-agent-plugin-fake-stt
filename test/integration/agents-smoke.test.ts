import { stt } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';
import { describe, expect, it } from 'vitest';

import { STT } from '../../src/index.js';

function createFrame(samplesPerChannel = 1600, sampleRate = 16000): AudioFrame {
  return {
    data: new Int16Array(samplesPerChannel),
    sampleRate,
    channels: 1,
    samplesPerChannel,
  } as unknown as AudioFrame;
}

describe('LiveKit Agents integration smoke', () => {
  it('emits events consumable via standard SpeechEventType handlers', async () => {
    const provider = new STT({
      defaultStepDelayMs: 0,
      script: [['hello partial', 'hello final']],
      emitRecognitionUsage: true,
    });

    const stream = provider.stream();
    stream.pushFrame(createFrame());
    stream.endInput();

    let startCount = 0;
    let endCount = 0;
    const interimTexts: string[] = [];
    const finalTexts: string[] = [];
    const usageDurations: number[] = [];

    for await (const event of stream) {
      switch (event.type) {
        case stt.SpeechEventType.START_OF_SPEECH:
          startCount += 1;
          break;
        case stt.SpeechEventType.INTERIM_TRANSCRIPT:
          interimTexts.push(event.alternatives?.[0]?.text ?? '');
          break;
        case stt.SpeechEventType.FINAL_TRANSCRIPT:
          finalTexts.push(event.alternatives?.[0]?.text ?? '');
          break;
        case stt.SpeechEventType.END_OF_SPEECH:
          endCount += 1;
          break;
        case stt.SpeechEventType.RECOGNITION_USAGE:
          usageDurations.push(event.recognitionUsage?.audioDuration ?? 0);
          break;
      }
    }

    expect(startCount).toBe(1);
    expect(endCount).toBe(1);
    expect(interimTexts).toEqual(['hello partial']);
    expect(finalTexts).toEqual(['hello final']);
    expect(usageDurations[0]).toBeGreaterThan(0);
  });
});
