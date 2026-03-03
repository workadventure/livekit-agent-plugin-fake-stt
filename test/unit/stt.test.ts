import { stt } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';
import { describe, expect, it } from 'vitest';

import { STT, type FakeSTTOptions } from '../../src/index.js';

function createFrame(samplesPerChannel = 1600, sampleRate = 16000): AudioFrame {
  return {
    data: new Int16Array(samplesPerChannel),
    sampleRate,
    channels: 1,
    samplesPerChannel,
  } as unknown as AudioFrame;
}

async function collectEvents(stream: stt.SpeechStream): Promise<stt.SpeechEvent[]> {
  const events: stt.SpeechEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

async function runStream(
  options: FakeSTTOptions
): Promise<Array<{ type: stt.SpeechEventType; text: string }>> {
  const provider = new STT(options);
  const stream = provider.stream();
  const done = collectEvents(stream);

  stream.pushFrame(createFrame());
  stream.flush();
  stream.pushFrame(createFrame());
  stream.endInput();

  const events = await done;
  return events.map((event) => ({
    type: event.type,
    text: event.alternatives?.[0]?.text ?? '',
  }));
}

describe('STT stream behavior', () => {
  it('emits deterministic event order across two utterances', async () => {
    const provider = new STT({ defaultStepDelayMs: 0, emitRecognitionUsage: true });
    const stream = provider.stream();
    const done = collectEvents(stream);

    stream.pushFrame(createFrame());
    stream.flush();
    stream.pushFrame(createFrame());
    stream.endInput();

    const events = await done;

    expect(events.map((event) => event.type)).toEqual([
      stt.SpeechEventType.START_OF_SPEECH,
      stt.SpeechEventType.INTERIM_TRANSCRIPT,
      stt.SpeechEventType.INTERIM_TRANSCRIPT,
      stt.SpeechEventType.FINAL_TRANSCRIPT,
      stt.SpeechEventType.END_OF_SPEECH,
      stt.SpeechEventType.RECOGNITION_USAGE,
      stt.SpeechEventType.START_OF_SPEECH,
      stt.SpeechEventType.INTERIM_TRANSCRIPT,
      stt.SpeechEventType.FINAL_TRANSCRIPT,
      stt.SpeechEventType.END_OF_SPEECH,
      stt.SpeechEventType.RECOGNITION_USAGE,
    ]);
  });

  it('keeps interim/final transition semantics per segment', async () => {
    const provider = new STT({ defaultStepDelayMs: 0 });
    const stream = provider.stream();
    const done = collectEvents(stream);

    stream.pushFrame(createFrame());
    stream.flush();
    stream.endInput();

    const events = await done;

    const interimIndexes = events
      .map((event, index) => ({ event, index }))
      .filter(({ event }) => event.type === stt.SpeechEventType.INTERIM_TRANSCRIPT)
      .map(({ index }) => index);

    const finalIndex = events.findIndex(
      (event) => event.type === stt.SpeechEventType.FINAL_TRANSCRIPT
    );
    const endIndex = events.findIndex((event) => event.type === stt.SpeechEventType.END_OF_SPEECH);

    expect(interimIndexes.length).toBeGreaterThan(0);
    expect(finalIndex).toBeGreaterThan(interimIndexes[interimIndexes.length - 1] ?? -1);
    expect(endIndex).toBeGreaterThan(finalIndex);
  });

  it('is deterministic for same script, seed, and offset', async () => {
    const options: FakeSTTOptions = {
      defaultStepDelayMs: 0,
      jitterMs: 4,
      seed: 42,
      offset: 1,
      emitRecognitionUsage: true,
      script: [
        ['alpha partial', 'alpha final'],
        ['beta partial', 'beta final'],
      ],
    };

    const first = await runStream(options);
    const second = await runStream(options);

    expect(second).toEqual(first);
  });

  it('supports close() without hanging and rejects new input after close', async () => {
    const provider = new STT({ defaultStepDelayMs: 20 });
    const stream = provider.stream();
    const done = collectEvents(stream);

    stream.pushFrame(createFrame());
    stream.flush();
    stream.close();

    await expect(done).resolves.toEqual(expect.any(Array));
    expect(() => stream.pushFrame(createFrame())).toThrow();
    expect(() => stream.endInput()).toThrow();
  });

  it('supports batch recognize with deterministic final transcript', async () => {
    const provider = new STT({
      script: [
        ['first partial', 'first final'],
        ['second partial', 'second final'],
      ],
    });

    const frame = createFrame(3200, 16000);
    const event1 = await provider.recognize(frame as unknown as AudioFrame);
    const event2 = await provider.recognize(frame as unknown as AudioFrame);

    expect(event1.type).toBe(stt.SpeechEventType.FINAL_TRANSCRIPT);
    expect(event2.type).toBe(stt.SpeechEventType.FINAL_TRANSCRIPT);
    expect(event1.alternatives?.[0]?.text).not.toEqual(event2.alternatives?.[0]?.text);
  });
});
