/**
 * All sound is synthesised with Web Audio – no files to download.
 * Ambient: traffic rumble, generator hum, crowd murmur and occasional horns.
 */
export type Surface = "road" | "grass" | "concrete";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let hornTimer: number | undefined;

function noiseBuffer(c: AudioContext, seconds: number, brown = false) {
  const b = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  return b;
}

function loop(buf: AudioBuffer, dest: AudioNode, gain: number, filter?: BiquadFilterNode) {
  const src = ctx!.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const g = ctx!.createGain();
  g.gain.value = gain;
  if (filter) {
    src.connect(filter);
    filter.connect(g);
  } else src.connect(g);
  g.connect(dest);
  src.start();
  return g;
}

export function initAudio(volume: number) {
  if (ctx) {
    ctx.resume();
    return;
  }
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);
  noise = noiseBuffer(ctx, 2);
  const brown = noiseBuffer(ctx, 6, true);

  // Distant traffic
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 350;
  loop(brown, master, 0.5, lp);

  // Generator hum (the sound of Lagos)
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.value = 50;
  const gf = ctx.createBiquadFilter();
  gf.type = "lowpass";
  gf.frequency.value = 160;
  const gg = ctx.createGain();
  gg.gain.value = 0.035;
  osc.connect(gf).connect(gg).connect(master);
  osc.start();

  // Crowd murmur: band-passed noise with slow wobble
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 900;
  bp.Q.value = 1.4;
  const voices = loop(noise, master, 0.05, bp);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.23;
  const lg = ctx.createGain();
  lg.gain.value = 0.03;
  lfo.connect(lg).connect(voices.gain);
  lfo.start();

  const horn = () => {
    if (!ctx || !master) return;
    const t = ctx.currentTime;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 2 - 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.025, t + 0.02);
    const dur = 0.15 + Math.random() * 0.4;
    g.gain.setValueAtTime(0.025, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.05);
    for (const f of [380 + Math.random() * 60, 480 + Math.random() * 60]) {
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.value = f;
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 1400;
    g.connect(f).connect(pan).connect(master);
    hornTimer = window.setTimeout(horn, 2500 + Math.random() * 9000);
  };
  hornTimer = window.setTimeout(horn, 3000);
}

export function setVolume(v: number) {
  if (master && ctx) master.gain.setTargetAtTime(v, ctx.currentTime, 0.1);
}

export function footstep(surface: Surface, loud = 1) {
  if (!ctx || !master || !noise) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  const g = ctx.createGain();
  let dur = 0.07, peak = 0.35;
  if (surface === "road") { f.type = "lowpass"; f.frequency.value = 900 + Math.random() * 300; peak = 0.5; }
  else if (surface === "grass") { f.type = "bandpass"; f.frequency.value = 2800; f.Q.value = 0.6; dur = 0.13; peak = 0.18; }
  else { f.type = "highpass"; f.frequency.value = 500 + Math.random() * 200; dur = 0.05; peak = 0.3; }
  g.gain.setValueAtTime(peak * loud, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 1.5, dur + 0.02);
}

export function stopAudio() {
  clearTimeout(hornTimer);
  ctx?.suspend();
}
