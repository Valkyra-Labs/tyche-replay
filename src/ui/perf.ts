// Rolling performance numbers for the HUD: frames per second over the
// last second, and the 95th percentile of the last N samples.

export class Rolling {
  private values: number[] = [];
  constructor(private size = 240) {}
  push(v: number) {
    this.values.push(v);
    if (this.values.length > this.size) this.values.shift();
  }
  p95(): number {
    if (this.values.length === 0) return 0;
    const s = [...this.values].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]!;
  }
}

export class Fps {
  private stamps: number[] = [];
  tick(now: number) {
    this.stamps.push(now);
    while (this.stamps.length && now - this.stamps[0]! > 1000) this.stamps.shift();
  }
  value(): number {
    return this.stamps.length;
  }
}
