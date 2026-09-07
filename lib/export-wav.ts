import type { Clip, ProjectState, SynthConfig, Track } from "@/lib/model";

const midiToHz = (note: number) => 440 * 2 ** ((note - 69) / 12);

export async function exportProjectWav(project: ProjectState) {
  const secondsPerStep = 60 / project.bpm / 4;
  const duration = project.bars * project.stepsPerBar * secondsPerStep + 2;
  const sampleRate = 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);

  const master = ctx.createGain();
  master.gain.value = project.masterVolume;
  master.connect(ctx.destination);

  const sampleBuffers = new Map<string, AudioBuffer>();
  for (const asset of project.samples) {
    try {
      const response = await fetch(asset.url);
      if (!response.ok) continue;
      sampleBuffers.set(asset.id, await ctx.decodeAudioData(await response.arrayBuffer()));
    } catch {
      // Ignore unavailable samples during export.
    }
  }

  const hasSolo = project.tracks.some((track) => track.mixer.solo);

  for (const track of project.tracks) {
    if (track.mixer.muted || (hasSolo && !track.mixer.solo)) continue;

    for (const clip of track.clips) {
      scheduleClip(ctx, master, project, track, clip, secondsPerStep, sampleBuffers);
    }
  }

  const rendered = await ctx.startRendering();
  const wav = encodeWav(rendered);
  const blob = new Blob([wav], { type: "audio/wav" });

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${slug(project.name || "song")}.wav`;
  link.click();

  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function scheduleClip(
  ctx: OfflineAudioContext,
  master: AudioNode,
  project: ProjectState,
  track: Track,
  clip: Clip,
  stepSeconds: number,
  samples: Map<string, AudioBuffer>,
) {
  const clipSteps = clip.lengthBars * project.stepsPerBar;

  for (let relative = 0; relative < clipSteps; relative++) {
    if (!clip.looped && relative >= clip.patternSteps) break;

    const localStep = relative % clip.patternSteps;
    const globalStep = clip.startBar * project.stepsPerBar + relative;
    if (globalStep >= project.bars * project.stepsPerBar) break;

    const time = globalStep * stepSeconds;

    if (clip.kind === "drum" && clip.drumSteps) {
      for (const [voice, steps] of Object.entries(clip.drumSteps)) {
        if (steps[localStep]) triggerOfflineDrum(ctx, master, track, voice, time);
      }
    } else if (clip.kind === "notes" && clip.notes && track.synth) {
      for (const note of clip.notes.filter((n) => n.startStep === localStep)) {
        triggerOfflineSynth(
          ctx,
          master,
          track,
          track.synth,
          note.note,
          note.velocity,
          note.durationSteps * stepSeconds,
          time,
        );
      }
    } else if (clip.kind === "sample" && clip.sampleTriggers) {
      if (clip.sampleTriggers.some((t) => t.step === localStep) && track.sampleId) {
        const buffer = samples.get(track.sampleId);
        if (buffer) {
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(trackOutput(ctx, master, track));
          source.start(time);
        }
      }
    }
  }
}

function trackOutput(
  ctx: BaseAudioContext,
  master: AudioNode,
  track: Track,
) {
  const gain = ctx.createGain();
  const pan = ctx.createStereoPanner();
  gain.gain.value = track.mixer.volume;
  pan.pan.value = track.mixer.pan;
  gain.connect(pan).connect(master);
  return gain;
}

function triggerOfflineDrum(
  ctx: OfflineAudioContext,
  master: AudioNode,
  track: Track,
  voice: string,
  time: number,
) {
  const out = trackOutput(ctx, master, track);

  if (voice === "kick") {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(155, time);
    osc.frequency.exponentialRampToValueAtTime(44, time + 0.16);
    gain.gain.setValueAtTime(0.95, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.34);
    osc.connect(gain).connect(out);
    osc.start(time);
    osc.stop(time + 0.35);
    return;
  }

  const length = voice === "open_hat" ? 0.24 : voice === "clap" ? 0.13 : 0.055;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * length), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  filter.type = voice === "clap" ? "bandpass" : "highpass";
  filter.frequency.value = voice === "clap" ? 1600 : 6500;
  gain.gain.setValueAtTime(voice === "clap" ? 0.5 : 0.23, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + length);

  source.buffer = buffer;
  source.connect(filter).connect(gain).connect(out);
  source.start(time);
  source.stop(time + length);
}

function triggerOfflineSynth(
  ctx: OfflineAudioContext,
  master: AudioNode,
  track: Track,
  synth: SynthConfig,
  note: number,
  velocity: number,
  duration: number,
  time: number,
) {
  const out = trackOutput(ctx, master, track);
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
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * synth.sustain), decayEnd);
  gain.gain.setValueAtTime(Math.max(0.0001, peak * synth.sustain), releaseStart);
  gain.gain.exponentialRampToValueAtTime(0.0001, stop);

  osc.connect(filter).connect(gain).connect(out);
  osc.start(time);
  osc.stop(stop);
}

function encodeWav(buffer: AudioBuffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length * numChannels * 2 + 44;
  const arrayBuffer = new ArrayBuffer(length);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + buffer.length * numChannels * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, buffer.length * numChannels * 2, true);

  const channels = Array.from({ length: numChannels }, (_, i) => buffer.getChannelData(i));
  let offset = 44;

  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, channels[channel][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return arrayBuffer;
}

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
