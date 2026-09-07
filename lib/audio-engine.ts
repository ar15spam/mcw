import type {
  Clip,
  ProjectState,
  SampleAsset,
  SynthConfig,
  Track,
} from "@/lib/model";

const midiToHz = (note: number) => 440 * 2 ** ((note - 69) / 12);

type AudioGraph = {
  master: GainNode;
  delayIn: GainNode;
  reverbIn: GainNode;
};

export class StudioAudioEngine {
  private context: AudioContext | null = null;
  private graph: AudioGraph | null = null;
  private project: ProjectState | null = null;
  private scheduler: number | null = null;
  private nextStepTime = 0;
  private globalStep = 0;
  private activeStartAtMs: number | null = null;
  private sampleBuffers = new Map<string, AudioBuffer>();

  setProject(project: ProjectState) {
    this.project = project;
    if (this.graph) this.graph.master.gain.value = project.masterVolume;
    void this.preloadSamples(project.samples);
  }

  async resume() {
    const context = this.ensureContext();
    if (context.state !== "running") await context.resume();
  }

  syncTransport(project: ProjectState) {
    this.setProject(project);

    if (!project.playing) {
      this.stop();
      return;
    }

    if (this.scheduler !== null && this.activeStartAtMs === project.startAtMs) {
      return;
    }

    this.stop();
    this.startAt(project.startAtMs ?? Date.now());
  }

  stop() {
    if (this.scheduler !== null && typeof window !== "undefined") {
      window.clearInterval(this.scheduler);
    }
    this.scheduler = null;
    this.activeStartAtMs = null;
  }

  private startAt(startAtMs: number) {
    if (typeof window === "undefined") return;

    const ctx = this.ensureContext();
    const project = this.project;
    if (!project) return;

    const stepSeconds = 60 / project.bpm / 4;
    const loopStartStep = project.loopStartBar * project.stepsPerBar;
    const loopSteps = Math.max(
      project.stepsPerBar,
      (project.loopEndBar - project.loopStartBar) * project.stepsPerBar,
    );

    const nowMs = Date.now();
    const elapsedSeconds = Math.max(0, (nowMs - startAtMs) / 1000);
    const elapsedSteps = Math.floor(elapsedSeconds / stepSeconds);

    this.globalStep = loopStartStep + (elapsedSteps % loopSteps);

    const fraction = elapsedSeconds / stepSeconds - elapsedSteps;
    const untilNext = fraction === 0 ? 0 : (1 - fraction) * stepSeconds;
    const requestedDelay = Math.max(0, (startAtMs - nowMs) / 1000);

    this.nextStepTime =
      ctx.currentTime + (startAtMs > nowMs ? requestedDelay : untilNext);

    this.activeStartAtMs = startAtMs;
    this.scheduler = window.setInterval(() => this.tick(), 25);
  }

  private tick() {
    const ctx = this.context;
    const project = this.project;
    if (!ctx || !project || !project.playing) return;

    const stepSeconds = 60 / project.bpm / 4;

    while (this.nextStepTime < ctx.currentTime + 0.12) {
      this.scheduleGlobalStep(project, this.globalStep, this.nextStepTime, stepSeconds);
      this.nextStepTime += stepSeconds;

      this.globalStep += 1;
      const loopStartStep = project.loopStartBar * project.stepsPerBar;
      const loopEndStep = project.loopEndBar * project.stepsPerBar;
      if (this.globalStep >= loopEndStep) this.globalStep = loopStartStep;
    }
  }

  private scheduleGlobalStep(
    project: ProjectState,
    globalStep: number,
    time: number,
    stepSeconds: number,
  ) {
    const hasSolo = project.tracks.some((track) => track.mixer.solo);

    for (const track of project.tracks) {
      if (track.mixer.muted || (hasSolo && !track.mixer.solo)) continue;

      for (const clip of track.clips) {
        const clipStart = clip.startBar * project.stepsPerBar;
        const clipEnd = (clip.startBar + clip.lengthBars) * project.stepsPerBar;
        if (globalStep < clipStart || globalStep >= clipEnd) continue;

        const relative = globalStep - clipStart;
        if (!clip.looped && relative >= clip.patternSteps) continue;
        const localStep = relative % clip.patternSteps;

        if (clip.kind === "drum" && clip.drumSteps) {
          for (const [voice, steps] of Object.entries(clip.drumSteps)) {
            if (steps[localStep]) {
              this.triggerDrum(track, voice, time);
            }
          }
        } else if (clip.kind === "notes" && clip.notes && track.synth) {
          const notes = clip.notes.filter((note) => note.startStep === localStep);
          for (const note of notes) {
            this.triggerSynth(
              track,
              track.synth,
              note.note,
              note.velocity,
              Math.max(stepSeconds * note.durationSteps, 0.04),
              time,
            );
          }
        } else if (clip.kind === "sample" && clip.sampleTriggers) {
          if (clip.sampleTriggers.some((trigger) => trigger.step === localStep)) {
            this.triggerSample(track, time);
          }
        }
      }
    }
  }

  private ensureContext() {
    if (this.context && this.graph) return this.context;

    const ctx = new AudioContext();

    const master = ctx.createGain();
    master.gain.value = this.project?.masterVolume ?? 0.85;
    master.connect(ctx.destination);

    const delayIn = ctx.createGain();
    const delay = ctx.createDelay(2);
    const delayFeedback = ctx.createGain();
    const delayWet = ctx.createGain();

    delay.delayTime.value = 0.28;
    delayFeedback.gain.value = 0.32;
    delayWet.gain.value = 0.35;

    delayIn.connect(delay);
    delay.connect(delayFeedback).connect(delay);
    delay.connect(delayWet).connect(master);

    const reverbIn = ctx.createGain();
    const convolver = ctx.createConvolver();
    const reverbWet = ctx.createGain();
    convolver.buffer = makeImpulse(ctx, 1.8, 2.4);
    reverbWet.gain.value = 0.32;
    reverbIn.connect(convolver).connect(reverbWet).connect(master);

    this.context = ctx;
    this.graph = { master, delayIn, reverbIn };

    return ctx;
  }

  private createTrackOutput(track: Track) {
    const ctx = this.ensureContext();
    const graph = this.graph!;

    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner();
    const delaySend = ctx.createGain();
    const reverbSend = ctx.createGain();

    gain.gain.value = track.mixer.volume;
    pan.pan.value = track.mixer.pan;
    delaySend.gain.value = track.mixer.delaySend;
    reverbSend.gain.value = track.mixer.reverbSend;

    gain.connect(pan);
    pan.connect(graph.master);
    pan.connect(delaySend).connect(graph.delayIn);
    pan.connect(reverbSend).connect(graph.reverbIn);

    return gain;
  }

  private triggerDrum(track: Track, voice: string, time: number) {
    const ctx = this.ensureContext();
    const output = this.createTrackOutput(track);

    if (voice === "kick") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(155, time);
      osc.frequency.exponentialRampToValueAtTime(44, time + 0.16);
      gain.gain.setValueAtTime(0.95, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.34);
      osc.connect(gain).connect(output);
      osc.start(time);
      osc.stop(time + 0.35);
      return;
    }

    const length =
      voice === "open_hat" ? 0.24 : voice === "clap" ? 0.13 : 0.055;
    const buffer = ctx.createBuffer(
      1,
      Math.max(1, Math.floor(ctx.sampleRate * length)),
      ctx.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    filter.type = voice === "clap" ? "bandpass" : "highpass";
    filter.frequency.value =
      voice === "clap" ? 1600 : voice === "open_hat" ? 5200 : 7000;
    filter.Q.value = voice === "clap" ? 0.8 : 0.4;

    gain.gain.setValueAtTime(voice === "clap" ? 0.5 : 0.24, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + length);

    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(output);
    source.start(time);
    source.stop(time + length);
  }

  private triggerSynth(
    track: Track,
    synth: SynthConfig,
    note: number,
    velocity: number,
    duration: number,
    time: number,
  ) {
    const ctx = this.ensureContext();
    const output = this.createTrackOutput(track);

    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = synth.oscillator;
    osc.frequency.value = midiToHz(note);
    osc.detune.value = synth.detune;

    filter.type = "lowpass";
    filter.frequency.value = synth.cutoff;
    filter.Q.value = synth.resonance;

    const peak = Math.max(0.02, Math.min(0.28, (velocity / 127) * 0.25));
    const attackEnd = time + Math.max(0.002, synth.attack);
    const decayEnd = attackEnd + Math.max(0.002, synth.decay);
    const releaseStart = Math.max(decayEnd, time + duration - synth.release);
    const stop = time + duration + synth.release + 0.02;

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, attackEnd);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, peak * synth.sustain),
      decayEnd,
    );
    gain.gain.setValueAtTime(
      Math.max(0.0001, peak * synth.sustain),
      releaseStart,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, stop);

    osc.connect(filter).connect(gain).connect(output);
    osc.start(time);
    osc.stop(stop + 0.01);
  }

  private triggerSample(track: Track, time: number) {
    const ctx = this.ensureContext();
    const sampleId = track.sampleId;
    if (!sampleId) return;
    const buffer = this.sampleBuffers.get(sampleId);
    if (!buffer) return;

    const source = ctx.createBufferSource();
    const output = this.createTrackOutput(track);
    source.buffer = buffer;
    source.connect(output);
    source.start(time);
  }

  private async preloadSamples(samples: SampleAsset[]) {
    const ctx = this.ensureContext();

    for (const sample of samples) {
      if (this.sampleBuffers.has(sample.id)) continue;

      try {
        const response = await fetch(sample.url);
        if (!response.ok) continue;
        const arrayBuffer = await response.arrayBuffer();
        const buffer = await ctx.decodeAudioData(arrayBuffer);
        this.sampleBuffers.set(sample.id, buffer);
      } catch {
        // A missing remote sample should not break the studio.
      }
    }
  }
}

function makeImpulse(ctx: BaseAudioContext, seconds: number, decay: number) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);

  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] =
        (Math.random() * 2 - 1) *
        (1 - i / length) ** decay;
    }
  }

  return impulse;
}
