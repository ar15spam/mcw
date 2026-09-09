import type {
  AutomationParam,
  Clip,
  ProjectState,
  SampleAsset,
  SynthConfig,
  Track,
} from "@/lib/model";

const midiToHz = (note: number) => 440 * 2 ** ((note - 69) / 12);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

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
  private playStartCtx: number | null = null;
  private playStartStep = 0;
  private sampleBuffers = new Map<string, AudioBuffer>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private saturationCurve: any = null;

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
    this.playStartCtx = null;
  }

  private loopBounds(project: ProjectState) {
    const spb = project.stepsPerBar;
    if (project.loopEnabled === false) {
      return { start: 0, end: project.bars * spb };
    }
    const start = (project.loopStartBar ?? 0) * spb;
    const end = Math.max(start + spb, (project.loopEndBar ?? project.bars) * spb);
    return { start, end };
  }

  /** Smooth playhead position in bars, derived from the audio clock. */
  getPositionBar(): number {
    const ctx = this.context;
    const project = this.project;
    if (!ctx || !project) return 0;
    if (!project.playing || this.playStartCtx === null) {
      return project.startBar ?? 0;
    }
    const stepSeconds = 60 / project.bpm / 4;
    const { start, end } = this.loopBounds(project);
    const loopLen = Math.max(project.stepsPerBar, end - start);
    const elapsed = (ctx.currentTime - this.playStartCtx) / stepSeconds;
    let step = this.playStartStep + elapsed;
    if (step >= end) step = start + ((step - start) % loopLen);
    return clamp(step / project.stepsPerBar, 0, project.bars);
  }

  private startAt(startAtMs: number) {
    if (typeof window === "undefined") return;
    const ctx = this.ensureContext();
    const project = this.project;
    if (!project) return;

    const spb = project.stepsPerBar;
    const stepSeconds = 60 / project.bpm / 4;
    const { start: loopStartStep, end: loopEndStep } = this.loopBounds(project);
    const loopSteps = Math.max(spb, loopEndStep - loopStartStep);

    // where to begin: the seek bar, snapped into the loop window
    let baseStep = (project.startBar ?? 0) * spb;
    if (baseStep < loopStartStep || baseStep >= loopEndStep) baseStep = loopStartStep;

    const nowMs = Date.now();
    const elapsedSeconds = Math.max(0, (nowMs - startAtMs) / 1000);
    const elapsedSteps = Math.floor(elapsedSeconds / stepSeconds);

    this.globalStep =
      loopStartStep + ((baseStep - loopStartStep + elapsedSteps) % loopSteps);

    const fraction = elapsedSeconds / stepSeconds - elapsedSteps;
    const untilNext = fraction === 0 ? 0 : (1 - fraction) * stepSeconds;
    const requestedDelay = Math.max(0, (startAtMs - nowMs) / 1000);

    this.nextStepTime =
      ctx.currentTime + (startAtMs > nowMs ? requestedDelay : untilNext);

    this.playStartCtx = this.nextStepTime;
    this.playStartStep = this.globalStep;
    this.activeStartAtMs = startAtMs;
    this.scheduler = window.setInterval(() => this.tick(), 25);
  }

  private tick() {
    const ctx = this.context;
    const project = this.project;
    if (!ctx || !project || !project.playing) return;

    const stepSeconds = 60 / project.bpm / 4;
    const { start: loopStartStep, end: loopEndStep } = this.loopBounds(project);

    while (this.nextStepTime < ctx.currentTime + 0.14) {
      this.scheduleGlobalStep(project, this.globalStep, this.nextStepTime, stepSeconds);
      this.nextStepTime += stepSeconds;
      this.globalStep += 1;
      if (this.globalStep >= loopEndStep) this.globalStep = loopStartStep;
    }
  }

  // -----------------------------------------------------------------------
  // scheduling
  // -----------------------------------------------------------------------

  private scheduleGlobalStep(
    project: ProjectState,
    globalStep: number,
    time: number,
    stepSeconds: number,
  ) {
    const spb = project.stepsPerBar;
    const bar = globalStep / spb;
    const hasSolo = project.tracks.some((t) => t.mixer.solo);
    const swingBase = project.swing ?? 0;

    for (const track of project.tracks) {
      if (track.mixer.muted || (hasSolo && !track.mixer.solo)) continue;

      for (const clip of track.clips) {
        const clipStartStep = clip.startBar * spb;
        const clipEndStep = (clip.startBar + clip.lengthBars) * spb;
        if (globalStep < clipStartStep || globalStep >= clipEndStep) continue;

        const relative = globalStep - clipStartStep;
        const patternLen = clip.patternSteps || clip.lengthBars * spb;
        if (!clip.looped && relative >= patternLen) continue;
        const localStep = relative % patternLen;

        // swing: push every other 16th slightly later
        const swing = clip.swing ?? swingBase;
        const swingOffset =
          swing > 0 && localStep % 2 === 1 ? swing * stepSeconds * 0.62 : 0;
        const humanize = clip.humanize ?? 0;
        const humanOffset =
          humanize > 0 ? (Math.random() * 2 - 1) * humanize * stepSeconds * 0.35 : 0;
        const at = time + swingOffset + humanOffset;

        const humVel = (v: number) =>
          humanize > 0
            ? clamp(v + (Math.random() * 2 - 1) * humanize * 24, 1, 127)
            : v;

        if (clip.kind === "drum" && clip.drumSteps) {
          for (const [voice, steps] of Object.entries(clip.drumSteps)) {
            if (steps && steps[localStep]) {
              this.triggerDrum(track, project, voice, at, humVel(104), bar);
            }
          }
        } else if (clip.kind === "notes" && clip.notes && track.synth) {
          for (const note of clip.notes) {
            if (note.startStep !== localStep) continue;
            this.triggerSynth(
              track,
              project,
              track.synth,
              note.note,
              humVel(note.velocity),
              Math.max(stepSeconds * note.durationSteps, 0.05),
              at,
              bar,
            );
          }
        } else if (clip.kind === "sample" && clip.sampleTriggers) {
          if (clip.sampleTriggers.some((t) => t.step === localStep)) {
            this.triggerSample(track, project, at, bar);
          }
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // automation
  // -----------------------------------------------------------------------

  private automationOffset(
    project: ProjectState,
    trackId: string,
    param: AutomationParam,
    bar: number,
  ): number | null {
    const auto = project.automations?.find(
      (a) => a.trackId === trackId && a.param === param,
    );
    if (!auto) return null;
    if (bar <= auto.startBar) return auto.from;
    if (bar >= auto.endBar) return auto.to;
    const t = (bar - auto.startBar) / Math.max(0.001, auto.endBar - auto.startBar);
    const shaped = auto.curve === "exp" ? t * t : t;
    return auto.from + (auto.to - auto.from) * shaped;
  }

  // -----------------------------------------------------------------------
  // graph
  // -----------------------------------------------------------------------

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
    delayFeedback.gain.value = 0.34;
    delayWet.gain.value = 0.4;
    delayIn.connect(delay);
    delay.connect(delayFeedback).connect(delay);
    delay.connect(delayWet).connect(master);

    const reverbIn = ctx.createGain();
    const convolver = ctx.createConvolver();
    const reverbWet = ctx.createGain();
    convolver.buffer = makeImpulse(ctx, 2.2, 2.6);
    reverbWet.gain.value = 0.34;
    reverbIn.connect(convolver).connect(reverbWet).connect(master);

    this.context = ctx;
    this.graph = { master, delayIn, reverbIn };
    this.saturationCurve = makeSaturationCurve();
    return ctx;
  }

  /** Per-hit output chain: [filter?] -> [drive?] -> gain -> pan -> master + sends */
  private createTrackOutput(track: Track, project: ProjectState, bar: number) {
    const ctx = this.ensureContext();
    const graph = this.graph!;

    const head = ctx.createGain();
    let node: AudioNode = head;

    const fx = track.fx;
    const autoCutoff = this.automationOffset(project, track.id, "cutoff", bar);
    const autoDrive = this.automationOffset(project, track.id, "drive", bar);

    if ((fx && fx.filterType !== "off") || autoCutoff !== null) {
      const filter = ctx.createBiquadFilter();
      filter.type = (fx?.filterType && fx.filterType !== "off"
        ? fx.filterType
        : "lowpass") as BiquadFilterType;
      filter.frequency.value = clamp(autoCutoff ?? fx?.filterHz ?? 12000, 40, 18000);
      filter.Q.value = clamp(fx?.resonance ?? 0.7, 0.0001, 24);
      node.connect(filter);
      node = filter;
    }

    const drive = autoDrive ?? fx?.drive ?? 0;
    if (drive > 0.01) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = this.saturationCurve;
      shaper.oversample = "2x";
      const pre = ctx.createGain();
      pre.gain.value = 1 + drive * 8;
      const post = ctx.createGain();
      post.gain.value = 1 / (1 + drive * 2.5);
      node.connect(pre).connect(shaper).connect(post);
      node = post;
    }

    if ((fx?.chorus ?? 0) > 0.02) {
      const chorusDelay = ctx.createDelay(0.05);
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.8;
      lfoGain.gain.value = 0.003 * (fx!.chorus + 0.3);
      chorusDelay.delayTime.value = 0.012;
      lfo.connect(lfoGain).connect(chorusDelay.delayTime);
      lfo.start();
      const wet = ctx.createGain();
      wet.gain.value = fx!.chorus * 0.5;
      node.connect(chorusDelay).connect(wet);
      const merge = ctx.createGain();
      node.connect(merge);
      wet.connect(merge);
      node = merge;
    }

    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner();
    const delaySend = ctx.createGain();
    const reverbSend = ctx.createGain();

    const autoVol = this.automationOffset(project, track.id, "volume", bar);
    const autoPan = this.automationOffset(project, track.id, "pan", bar);
    const autoRev = this.automationOffset(project, track.id, "reverb", bar);
    const autoDel = this.automationOffset(project, track.id, "delay", bar);

    gain.gain.value = clamp(autoVol ?? track.mixer.volume, 0, 1);
    pan.pan.value = clamp(autoPan ?? track.mixer.pan, -1, 1);
    delaySend.gain.value = clamp(autoDel ?? track.mixer.delaySend, 0, 1);
    reverbSend.gain.value = clamp(autoRev ?? track.mixer.reverbSend, 0, 1);

    node.connect(gain);
    gain.connect(pan);
    pan.connect(graph.master);
    pan.connect(delaySend).connect(graph.delayIn);
    pan.connect(reverbSend).connect(graph.reverbIn);

    return head;
  }

  // -----------------------------------------------------------------------
  // instruments
  // -----------------------------------------------------------------------

  private triggerDrum(
    track: Track,
    project: ProjectState,
    voice: string,
    time: number,
    velocity: number,
    bar: number,
  ) {
    const ctx = this.ensureContext();
    const output = this.createTrackOutput(track, project, bar);
    const vel = velocity / 127;
    const kit = track.kit ?? "house";

    if (voice === "kick") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = kit === "eight08" ? 120 : kit === "techno" ? 180 : 155;
      const end = kit === "eight08" ? 34 : 46;
      const dur = kit === "eight08" ? 0.6 : kit === "lofi" ? 0.28 : 0.34;
      osc.type = "sine";
      osc.frequency.setValueAtTime(start, time);
      osc.frequency.exponentialRampToValueAtTime(end, time + 0.14);
      gain.gain.setValueAtTime(vel * 1.0, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      if (kit === "techno") {
        const click = ctx.createOscillator();
        const cg = ctx.createGain();
        click.type = "square";
        click.frequency.value = 1600;
        cg.gain.setValueAtTime(vel * 0.3, time);
        cg.gain.exponentialRampToValueAtTime(0.0001, time + 0.02);
        click.connect(cg).connect(output);
        click.start(time);
        click.stop(time + 0.03);
      }
      osc.connect(gain).connect(output);
      osc.start(time);
      osc.stop(time + dur + 0.02);
      return;
    }

    if (voice === "tom" || voice === "rim") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const f = voice === "rim" ? 380 : 180;
      osc.type = voice === "rim" ? "square" : "sine";
      osc.frequency.setValueAtTime(f * 1.5, time);
      osc.frequency.exponentialRampToValueAtTime(f, time + 0.08);
      gain.gain.setValueAtTime(vel * (voice === "rim" ? 0.4 : 0.6), time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + (voice === "rim" ? 0.06 : 0.22));
      osc.connect(gain).connect(output);
      osc.start(time);
      osc.stop(time + 0.3);
      return;
    }

    // noise-based voices: snare, clap, hat, open_hat, perc, ride, shaker
    const length =
      voice === "open_hat" || voice === "ride"
        ? 0.28
        : voice === "snare"
          ? 0.18
          : voice === "clap"
            ? 0.14
            : voice === "perc"
              ? 0.1
              : 0.05;

    const buffer = ctx.createBuffer(
      1,
      Math.max(1, Math.floor(ctx.sampleRate * length)),
      ctx.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 0.4;
    }

    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    if (voice === "snare") {
      filter.type = "bandpass";
      filter.frequency.value = kit === "eight08" ? 2200 : 1800;
      filter.Q.value = 0.9;
      // add a tone body
      const tone = ctx.createOscillator();
      const tg = ctx.createGain();
      tone.type = "triangle";
      tone.frequency.value = 190;
      tg.gain.setValueAtTime(vel * 0.4, time);
      tg.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);
      tone.connect(tg).connect(output);
      tone.start(time);
      tone.stop(time + 0.14);
      gain.gain.setValueAtTime(vel * 0.6, time);
    } else if (voice === "clap") {
      filter.type = "bandpass";
      filter.frequency.value = 1500;
      filter.Q.value = 0.7;
      gain.gain.setValueAtTime(vel * 0.55, time);
    } else if (voice === "ride") {
      filter.type = "highpass";
      filter.frequency.value = 6500;
      gain.gain.setValueAtTime(vel * 0.22, time);
    } else if (voice === "shaker" || voice === "perc") {
      filter.type = "highpass";
      filter.frequency.value = voice === "shaker" ? 8000 : 3000;
      gain.gain.setValueAtTime(vel * 0.3, time);
    } else {
      // hat / open_hat
      filter.type = "highpass";
      filter.frequency.value = kit === "eight08" ? 8500 : kit === "lofi" ? 6200 : 7200;
      gain.gain.setValueAtTime(vel * (voice === "open_hat" ? 0.26 : 0.22), time);
    }

    filter.Q.value = filter.Q.value || 0.5;
    gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(output);
    source.start(time);
    source.stop(time + length + 0.02);
  }

  private triggerSynth(
    track: Track,
    project: ProjectState,
    synth: SynthConfig,
    note: number,
    velocity: number,
    duration: number,
    time: number,
    bar: number,
  ) {
    const ctx = this.ensureContext();
    const output = this.createTrackOutput(track, project, bar);

    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    filter.type = "lowpass";
    filter.frequency.value = clamp(synth.cutoff, 40, 18000);
    filter.Q.value = clamp(synth.resonance, 0.0001, 30);

    const unison = clamp(Math.round(synth.unison ?? 1), 1, 3);
    const freq = midiToHz(note);
    const oscs: OscillatorNode[] = [];

    for (let i = 0; i < unison; i++) {
      const osc = ctx.createOscillator();
      osc.type = synth.oscillator;
      const spread = unison > 1 ? (i - (unison - 1) / 2) * 8 : 0;
      osc.detune.value = synth.detune + spread;
      if ((synth.glide ?? 0) > 0.001) {
        osc.frequency.setValueAtTime(freq * 0.94, time);
        osc.frequency.linearRampToValueAtTime(freq, time + synth.glide);
      } else {
        osc.frequency.value = freq;
      }
      osc.connect(filter);
      oscs.push(osc);
    }

    if ((synth.sub ?? 0) > 0.01) {
      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      sub.type = "sine";
      sub.frequency.value = freq / 2;
      subGain.gain.value = synth.sub * 0.6;
      sub.connect(subGain).connect(filter);
      oscs.push(sub);
    }

    const peak = clamp((velocity / 127) * 0.24, 0.02, 0.28) / Math.sqrt(unison);
    const attackEnd = time + Math.max(0.002, synth.attack);
    const decayEnd = attackEnd + Math.max(0.002, synth.decay);
    const releaseStart = Math.max(decayEnd, time + duration - synth.release);
    const stop = time + duration + synth.release + 0.03;

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, attackEnd);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, peak * synth.sustain),
      decayEnd,
    );
    gain.gain.setValueAtTime(Math.max(0.0001, peak * synth.sustain), releaseStart);
    gain.gain.exponentialRampToValueAtTime(0.0001, stop);

    filter.connect(gain).connect(output);
    for (const osc of oscs) {
      osc.start(time);
      osc.stop(stop + 0.02);
    }
  }

  private triggerSample(track: Track, project: ProjectState, time: number, bar: number) {
    const ctx = this.ensureContext();
    const sampleId = track.sampleId;
    if (!sampleId) return;
    const buffer = this.sampleBuffers.get(sampleId);
    if (!buffer) return;
    const source = ctx.createBufferSource();
    const output = this.createTrackOutput(track, project, bar);
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
        /* a missing remote sample should not break the studio */
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
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
    }
  }
  return impulse;
}

function makeSaturationCurve(): Float32Array {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 2);
  }
  return curve;
}
