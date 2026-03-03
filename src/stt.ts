import { mergeFrames, stt, type APIConnectOptions, type AudioBuffer } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';

export interface FakeSTTScriptStep {
  text: string;
  final?: boolean;
  delayMs?: number;
  confidence?: number;
  language?: string;
}

export type FakeSTTScriptStepInput = string | FakeSTTScriptStep;

export interface FakeSTTScriptSegment {
  steps: FakeSTTScriptStepInput[];
  emitUsage?: boolean;
  usageAudioDuration?: number;
}

export type FakeSTTScriptSegmentInput = FakeSTTScriptSegment | FakeSTTScriptStepInput[];

export interface FakeSTTOptions {
  script?: FakeSTTScriptSegmentInput[];
  language?: string;
  defaultStepDelayMs?: number;
  jitterMs?: number;
  seed?: number;
  offset?: number;
  emitRecognitionUsage?: boolean;
  sampleRate?: number;
  silenceDurationMsToCommit?: number;
  silenceAmplitudeThreshold?: number;
}

interface NormalizedStep {
  text: string;
  final: boolean;
  delayMs?: number;
  confidence?: number;
  language?: string;
}

interface NormalizedSegment {
  steps: NormalizedStep[];
  emitUsage?: boolean;
  usageAudioDuration?: number;
}

interface ResolvedOptions {
  script: NormalizedSegment[];
  language: string;
  defaultStepDelayMs: number;
  jitterMs: number;
  seed: number;
  initialOffset: number;
  emitRecognitionUsage: boolean;
  sampleRate: number;
  silenceDurationMsToCommit: number;
  silenceAmplitudeThreshold: number;
}

const DEFAULT_SCRIPT: FakeSTTScriptSegmentInput[] = [
  [
    { text: 'segment-a partial-1', final: false },
    { text: 'segment-a partial-2', final: false },
    { text: 'segment-a final', final: true },
  ],
  [
    { text: 'segment-b partial', final: false },
    { text: 'segment-b final', final: true },
  ],
];

const DEFAULT_OPTIONS: Required<Omit<FakeSTTOptions, 'script'>> = {
  language: 'en-US',
  defaultStepDelayMs: 0,
  jitterMs: 0,
  seed: 0,
  offset: 0,
  emitRecognitionUsage: false,
  sampleRate: 16000,
  silenceDurationMsToCommit: 400,
  silenceAmplitudeThreshold: 150,
};

export class STT extends stt.STT {
  readonly label = 'fake.STT';

  #options: ResolvedOptions;
  #recognizeCount = 0;

  constructor(options: FakeSTTOptions = {}) {
    super({
      streaming: true,
      interimResults: true,
      alignedTranscript: false,
    });

    this.#options = resolveOptions(options);
  }

  get options(): Readonly<ResolvedOptions> {
    return this.#options;
  }

  protected async _recognize(
    frame: AudioBuffer,
    abortSignal?: AbortSignal
  ): Promise<stt.SpeechEvent> {
    if (abortSignal?.aborted) {
      throw abortError();
    }

    const merged = mergeFrames(frame);
    const duration = frameDurationSeconds(merged.samplesPerChannel, merged.sampleRate);
    const segment = this.#segmentForRecognize();
    const transcript =
      segment.steps
        .filter((step) => step.final)
        .map((step) => step.text)
        .join(' ')
        .trim() ||
      segment.steps[segment.steps.length - 1]?.text ||
      '';

    return {
      type: stt.SpeechEventType.FINAL_TRANSCRIPT,
      requestId: `fake-stt-recognize-${this.#recognizeCount - 1}`,
      alternatives: [
        {
          text: transcript,
          language: this.#options.language,
          startTime: 0,
          endTime: duration,
          confidence: 1,
        },
      ],
    };
  }

  stream(options?: { connOptions?: APIConnectOptions }): SpeechStream {
    return new SpeechStream(this, this.#options, options?.connOptions);
  }

  #segmentForRecognize(): NormalizedSegment {
    const segment = getSegmentAt(
      this.#options.script,
      positiveModulo(
        this.#options.initialOffset + this.#recognizeCount,
        this.#options.script.length
      )
    );

    this.#recognizeCount += 1;
    return segment;
  }
}

export class SpeechStream extends stt.SpeechStream {
  readonly label = 'fake.SpeechStream';

  #options: ResolvedOptions;
  #cursor: number;
  #utteranceCount = 0;
  #pendingAudioDuration = 0;
  #hasPendingAudio = false;
  #hasDetectedSpeech = false;
  #pendingSilenceDurationMs = 0;
  #processedAudioDuration = 0;

  constructor(sttImpl: STT, options: ResolvedOptions, connOptions?: APIConnectOptions) {
    super(sttImpl, options.sampleRate, connOptions);
    this.#options = options;
    this.#cursor = options.initialOffset;
  }

  protected async run(): Promise<void> {
    try {
      for await (const item of this.input) {
        if (this.abortSignal.aborted || this.closed) {
          return;
        }

        if (item === SpeechStream.FLUSH_SENTINEL) {
          await this.#emitPendingUtterance();
          continue;
        }

        const duration = frameDurationSeconds(item.samplesPerChannel, item.sampleRate);
        if (duration <= 0) {
          continue;
        }

        this.#hasPendingAudio = true;
        this.#pendingAudioDuration += duration;

        const frameDurationMs = duration * 1000;
        if (isSilentAudioFrame(item, this.#options.silenceAmplitudeThreshold)) {
          if (this.#hasDetectedSpeech) {
            this.#pendingSilenceDurationMs += frameDurationMs;
          }

          if (
            this.#hasDetectedSpeech &&
            this.#pendingSilenceDurationMs >= this.#options.silenceDurationMsToCommit
          ) {
            await this.#emitPendingUtterance();
          }
          continue;
        }

        this.#hasDetectedSpeech = true;
        this.#pendingSilenceDurationMs = 0;
      }

      await this.#emitPendingUtterance();
    } finally {
      this.closed = true;
    }
  }

  async #emitPendingUtterance(): Promise<void> {
    if (!this.#hasPendingAudio || this.abortSignal.aborted || this.closed) {
      this.#resetPendingAudio();
      return;
    }

    const utteranceIndex = this.#utteranceCount;
    const requestId = `fake-stt-${utteranceIndex}`;
    const segmentAudioDuration = this.#pendingAudioDuration;
    const segmentStart = this.startTimeOffset + this.#processedAudioDuration;
    const segment = this.#nextSegment();

    this.#processedAudioDuration += segmentAudioDuration;
    this.#utteranceCount += 1;
    this.#resetPendingAudio();

    if (!this.#putEvent({ type: stt.SpeechEventType.START_OF_SPEECH, requestId })) {
      return;
    }

    const stepsCount = segment.steps.length;
    for (const [stepIndex, step] of segment.steps.entries()) {
      const delayMs = this.#computeDelay(step, utteranceIndex, stepIndex);
      const continueEmission = await sleepWithAbort(delayMs, this.abortSignal);
      if (!continueEmission || this.closed) {
        return;
      }

      const eventType = step.final
        ? stt.SpeechEventType.FINAL_TRANSCRIPT
        : stt.SpeechEventType.INTERIM_TRANSCRIPT;

      const stepEnd = segmentStart + segmentAudioDuration * ((stepIndex + 1) / stepsCount);
      const transcriptEvent: stt.SpeechEvent = {
        type: eventType,
        requestId,
        alternatives: [
          {
            text: step.text,
            language: step.language ?? this.#options.language,
            startTime: segmentStart,
            endTime: stepEnd,
            confidence: step.confidence ?? (step.final ? 0.95 : 0.65),
          },
        ],
      };

      if (!this.#putEvent(transcriptEvent)) {
        return;
      }
    }

    if (!this.#putEvent({ type: stt.SpeechEventType.END_OF_SPEECH, requestId })) {
      return;
    }

    const shouldEmitUsage = segment.emitUsage ?? this.#options.emitRecognitionUsage;
    if (!shouldEmitUsage) {
      return;
    }

    this.#putEvent({
      type: stt.SpeechEventType.RECOGNITION_USAGE,
      requestId,
      recognitionUsage: {
        audioDuration: segment.usageAudioDuration ?? segmentAudioDuration,
      },
    });
  }

  #nextSegment(): NormalizedSegment {
    const segment = getSegmentAt(this.#options.script, this.#cursor);
    this.#cursor = positiveModulo(this.#cursor + 1, this.#options.script.length);
    return segment;
  }

  #computeDelay(step: NormalizedStep, utteranceIndex: number, stepIndex: number): number {
    const baseDelay = step.delayMs ?? this.#options.defaultStepDelayMs;
    if (this.#options.jitterMs <= 0) {
      return baseDelay;
    }

    const mixed = hash32(
      toUint32(this.#options.seed) ^
        toUint32((utteranceIndex + 1) * 0x9e3779b1) ^
        toUint32((stepIndex + 1) * 0x85ebca6b)
    );

    const unit = mixed / 0xffffffff;
    const jitter = Math.round((unit * 2 - 1) * this.#options.jitterMs);
    return Math.max(0, baseDelay + jitter);
  }

  #putEvent(event: stt.SpeechEvent): boolean {
    if (this.closed || this.abortSignal.aborted || this.queue.closed) {
      return false;
    }

    try {
      this.queue.put(event);
      return true;
    } catch {
      return false;
    }
  }

  #resetPendingAudio(): void {
    this.#hasPendingAudio = false;
    this.#hasDetectedSpeech = false;
    this.#pendingAudioDuration = 0;
    this.#pendingSilenceDurationMs = 0;
  }
}

function resolveOptions(options: FakeSTTOptions): ResolvedOptions {
  const script = normalizeScript(options.script ?? DEFAULT_SCRIPT);
  if (script.length === 0) {
    throw new Error('Fake STT script must contain at least one segment');
  }

  const seed = asInteger(options.seed ?? DEFAULT_OPTIONS.seed);
  const offset = asInteger(options.offset ?? DEFAULT_OPTIONS.offset);
  const seedOffset = options.seed === undefined ? 0 : positiveModulo(hash32(seed), script.length);
  const initialOffset = positiveModulo(offset + seedOffset, script.length);

  return {
    script,
    language: options.language ?? DEFAULT_OPTIONS.language,
    defaultStepDelayMs: clampNumber(
      options.defaultStepDelayMs ?? DEFAULT_OPTIONS.defaultStepDelayMs,
      0
    ),
    jitterMs: clampNumber(options.jitterMs ?? DEFAULT_OPTIONS.jitterMs, 0),
    seed,
    initialOffset,
    emitRecognitionUsage: options.emitRecognitionUsage ?? DEFAULT_OPTIONS.emitRecognitionUsage,
    sampleRate: clampNumber(options.sampleRate ?? DEFAULT_OPTIONS.sampleRate, 1),
    silenceDurationMsToCommit: clampNumber(
      options.silenceDurationMsToCommit ?? DEFAULT_OPTIONS.silenceDurationMsToCommit,
      0
    ),
    silenceAmplitudeThreshold: clampNumber(
      options.silenceAmplitudeThreshold ?? DEFAULT_OPTIONS.silenceAmplitudeThreshold,
      0
    ),
  };
}

function normalizeScript(script: FakeSTTScriptSegmentInput[]): NormalizedSegment[] {
  return script.map((segmentInput, segmentIndex) => {
    const segment = Array.isArray(segmentInput) ? { steps: segmentInput } : segmentInput;
    if (!segment.steps.length) {
      throw new Error(`Fake STT segment at index ${segmentIndex} is empty`);
    }

    const steps = segment.steps.map((stepInput, stepIndex) =>
      normalizeStep(stepInput, segmentIndex, stepIndex)
    );
    if (!steps.some((step) => step.final)) {
      const last = steps[steps.length - 1];
      if (!last) {
        throw new Error(`Fake STT segment at index ${segmentIndex} is empty`);
      }
      last.final = true;
    }

    const normalized: NormalizedSegment = { steps };
    if (segment.emitUsage !== undefined) {
      normalized.emitUsage = segment.emitUsage;
    }
    if (segment.usageAudioDuration !== undefined) {
      normalized.usageAudioDuration = segment.usageAudioDuration;
    }
    return normalized;
  });
}

function normalizeStep(
  stepInput: FakeSTTScriptStepInput,
  segmentIndex: number,
  stepIndex: number
): NormalizedStep {
  const step = typeof stepInput === 'string' ? { text: stepInput } : stepInput;

  if (!step.text) {
    throw new Error(`Fake STT step at segment ${segmentIndex}, index ${stepIndex} is missing text`);
  }

  const normalized: NormalizedStep = {
    text: step.text,
    final: Boolean(step.final),
  };

  if (step.delayMs !== undefined) {
    normalized.delayMs = step.delayMs;
  }
  if (step.confidence !== undefined) {
    normalized.confidence = step.confidence;
  }
  if (step.language !== undefined) {
    normalized.language = step.language;
  }

  return normalized;
}

function frameDurationSeconds(samplesPerChannel: number, sampleRate: number): number {
  if (samplesPerChannel <= 0 || sampleRate <= 0) {
    return 0;
  }

  return samplesPerChannel / sampleRate;
}

function isSilentAudioFrame(frame: AudioFrame, silenceAmplitudeThreshold: number): boolean {
  if (frame.samplesPerChannel <= 0) {
    return true;
  }

  for (let i = 0; i < frame.data.length; i++) {
    const sample = frame.data[i];
    if (sample !== undefined && Math.abs(sample) > silenceAmplitudeThreshold) {
      return false;
    }
  }

  return true;
}

function abortError(): Error {
  const err = new Error('The operation was aborted');
  err.name = 'AbortError';
  return err;
}

function asInteger(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.trunc(value);
}

function clampNumber(value: number, minimum: number): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }
  return Math.max(minimum, value);
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function toUint32(value: number): number {
  return value >>> 0;
}

function hash32(seed: number): number {
  let x = toUint32(seed) || 0x9e3779b9;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return toUint32(x);
}

function getSegmentAt(script: NormalizedSegment[], index: number): NormalizedSegment {
  const segment = script[index];
  if (!segment) {
    throw new Error(`Missing script segment at index ${index}`);
  }
  return segment;
}

async function sleepWithAbort(ms: number, signal: AbortSignal): Promise<boolean> {
  if (ms <= 0) {
    return !signal.aborted;
  }

  if (signal.aborted) {
    return false;
  }

  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve(true);
    }, ms);

    const onAbort = () => {
      cleanup();
      resolve(false);
    };

    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    };

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export { DEFAULT_SCRIPT };
