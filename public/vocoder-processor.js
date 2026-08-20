const BANDS = [110, 165, 247, 330, 440, 587, 784, 1046];

class PalmVocoderProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "gate", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "mix", defaultValue: 0.86, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "pitch", defaultValue: 0, minValue: -12, maxValue: 12, automationRate: "k-rate" },
      { name: "brightness", defaultValue: 0.62, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "drive", defaultValue: 0.26, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    ];
  }

  constructor() {
    super();
    this.phase = new Float32Array(BANDS.length);
    this.env = new Float32Array(BANDS.length);
    this.x1 = new Float32Array(BANDS.length);
    this.x2 = new Float32Array(BANDS.length);
    this.y1 = new Float32Array(BANDS.length);
    this.y2 = new Float32Array(BANDS.length);
    this.coefficients = BANDS.map((frequency) => this.makeBandpass(frequency));
    this.reportTick = 0;
  }

  makeBandpass(frequency) {
    const omega = (2 * Math.PI * frequency) / sampleRate;
    const alpha = Math.sin(omega) / (2 * 2.2);
    const cosine = Math.cos(omega);
    const a0 = 1 + alpha;
    return {
      b0: (Math.sin(omega) / 2) / a0,
      b1: 0,
      b2: (-Math.sin(omega) / 2) / a0,
      a1: (-2 * cosine) / a0,
      a2: (1 - alpha) / a0,
    };
  }

  parameterValue(parameters, name, index) {
    const values = parameters[name];
    return values.length > 1 ? values[index] : values[0];
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!output) return true;

    const gate = this.parameterValue(parameters, "gate", 0);
    const mix = this.parameterValue(parameters, "mix", 0);
    const pitch = this.parameterValue(parameters, "pitch", 0);
    const brightness = this.parameterValue(parameters, "brightness", 0);
    const drive = this.parameterValue(parameters, "drive", 0);
    const pitchRatio = Math.pow(2, pitch / 12);
    let sumLevel = 0;

    for (let i = 0; i < output.length; i += 1) {
      const sample = input ? input[i] || 0 : 0;
      let synth = 0;
      let energy = 0;

      for (let band = 0; band < BANDS.length; band += 1) {
        const c = this.coefficients[band];
        const bandSample = c.b0 * sample + c.b1 * this.x1[band] + c.b2 * this.x2[band] - c.a1 * this.y1[band] - c.a2 * this.y2[band];
        this.x2[band] = this.x1[band];
        this.x1[band] = sample;
        this.y2[band] = this.y1[band];
        this.y1[band] = bandSample;

        const magnitude = Math.min(1, Math.abs(bandSample) * 7.5);
        const smoothing = magnitude > this.env[band] ? 0.18 : 0.055;
        this.env[band] += (magnitude - this.env[band]) * smoothing;

        const harmonicWeight = 0.56 + brightness * (band / BANDS.length) * 1.3;
        const frequency = BANDS[band] * pitchRatio;
        this.phase[band] += frequency / sampleRate;
        if (this.phase[band] >= 1) this.phase[band] -= 1;
        const saw = this.phase[band] * 2 - 1;
        const fifth = Math.sin(this.phase[band] * Math.PI * 2 * 1.5) * 0.22;
        synth += (saw * 0.68 + fifth) * this.env[band] * harmonicWeight;
        energy += this.env[band];
      }

      synth /= BANDS.length * 0.75;
      const gated = sample * (1 - mix * gate) + synth * mix * gate * 2.2;
      const amplified = gated * (1.15 + gate * 0.65);
      const shaped = Math.tanh(amplified * (1 + drive * 4.2));
      output[i] = shaped * 0.82;
      sumLevel += Math.abs(output[i]);
    }

    this.reportTick += 1;
    if (this.reportTick % 8 === 0) {
      this.port.postMessage({ level: Math.min(1, sumLevel / output.length * 2.3), gate });
    }
    return true;
  }
}

registerProcessor("palm-vocoder-processor", PalmVocoderProcessor);
