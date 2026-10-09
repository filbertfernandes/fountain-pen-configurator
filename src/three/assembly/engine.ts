import gsap from "gsap";
import { createStore } from "zustand/vanilla";
import type {
  ClipId,
  FillId,
  InkId,
  NibMaterialId,
  NibSizeId,
} from "@/data/catalog";
import { optionName, INKS } from "@/data/catalog";
import {
  PARTS,
  PART_IDS,
  removalChain,
  turns,
  turnsLabel,
  explodeAt,
  type PartId,
} from "./parts";
import { removalMotion } from "./motion";

export type Mode = "closed" | "open" | "exploded";

/** inner parts first, cap last — the reverse of a full strip-down */
const INSTALL_ORDER: PartId[] = PART_IDS.reduce<PartId[]>(
  (o, id) => removalChain(id, o),
  [],
).reverse();

/** The variant of each mechanical part currently fitted in the 3D pen. */
export interface Fitted {
  clip: ClipId;
  nibMaterial: NibMaterialId;
  nibSize: NibSizeId;
  fill: FillId;
  ink: InkId;
}

export interface Target extends Fitted {
  mode: Mode;
  /** a see-through body lets ink changes play without removing the barrel */
  transparentBody: boolean;
}

export interface PartState {
  engage: number;
  /** 0…1 of the part's turns (follows engage, but winds down a moment later) */
  spin: number;
  clear: number;
  park: number;
  scale: number;
}

/** A resting layout of the pen: the camera frames it before the parts get there. */
export interface Pose {
  parts: Record<PartId, PartState>;
  explode: number;
}

export interface Plan {
  seq: number;
  pose: Pose;
  mode: Mode;
}

export interface EngineView {
  fitted: Fitted;
  mode: Mode;
  status: string;
  step: number;
  busy: boolean;
  /** increments whenever parts come to rest — the camera re-frames on change */
  settle: number;
  /** where the parts are about to go — the camera starts framing it as they set off */
  plan: Plan | null;
}

/** global pace of every mechanical move (multiplies every authored duration; 0.625 = 25% slower than 0.5) */
export const TEMPO = 0.55;

const ease = { screw: "sine.inOut", move: "power2.inOut", out: "power3.out" };

export interface EngineOptions {
  initial: Target;
}

/**
 * Drives the pen's mechanical state. Rendering code reads `parts`, `explode`,
 * `fill` and `knob` every frame; UI subscribes to `view`.
 */
export class AssemblyEngine {
  parts: Record<PartId, PartState>;
  explode = { v: 0 };
  ink = { fill: 1, knob: 0 };
  view;
  speed = 1;
  private target: Target;
  private clocks = new Set<{ t: number }>();
  private running = false;
  private dirty = false;
  private disposed = false;

  constructor(opts: EngineOptions) {
    this.target = { ...opts.initial };
    this.parts = Object.fromEntries(
      PART_IDS.map((id) => [
        id,
        { engage: 0, spin: 0, clear: 0, park: 0, scale: 1 },
      ]),
    ) as Record<PartId, PartState>;
    const { mode, transparentBody: _t, ...fitted } = opts.initial;
    void _t;
    this.view = createStore<EngineView>(() => ({
      fitted,
      mode: "closed",
      status: "",
      step: 0,
      busy: false,
      settle: 0,
      plan: null,
    }));
  }

  revive() {
    this.disposed = false;
    if (this.dirty) void this.pump();
  }

  dispose() {
    this.disposed = true;
    this.running = false;
    gsap.killTweensOf(Object.values(this.parts));
    gsap.killTweensOf(this.explode);
    gsap.killTweensOf(this.ink);
    gsap.killTweensOf([...this.clocks]);
    this.clocks.clear();
  }

  setTarget(t: Target) {
    this.target = { ...t };
    this.dirty = true;
    void this.pump();
  }

  /** jump straight to the target with no animation (first paint, reduced motion) */
  snap(t: Target) {
    this.target = { ...t };
    const { mode, transparentBody: _t, ...fitted } = t;
    void _t;
    for (const id of PART_IDS)
      Object.assign(this.parts[id], {
        engage: 0,
        spin: 0,
        clear: 0,
        park: 0,
        scale: 1,
      });
    if (mode === "open")
      Object.assign(this.parts.cap, { engage: 1, spin: 1, clear: 1, park: 1 });
    this.explode.v = mode === "exploded" ? 1 : 0;
    this.ink.fill = 1;
    this.view.setState({
      fitted,
      mode,
      status: "",
      busy: false,
      settle: this.view.getState().settle + 1,
    });
  }

  installed(id: PartId) {
    const p = this.parts[id];
    return p.engage + p.clear + p.park < 0.001;
  }

  /** fully off and parked */
  parked(id: PartId) {
    const p = this.parts[id];
    return p.engage + p.clear + p.park > 2.999;
  }

  /** run `fn` with the pen posed as `pose` (used to measure a layout before the parts move) */
  withPose<T>(pose: Pose, fn: () => T): T {
    const parts = this.parts;
    const explode = this.explode;
    this.parts = pose.parts;
    this.explode = { v: pose.explode };
    try {
      return fn();
    } finally {
      this.parts = parts;
      this.explode = explode;
    }
  }

  /** tell the camera where the parts are heading */
  private plan(change: { off?: PartId[]; explode?: number; mode?: Mode }) {
    const parts = Object.fromEntries(
      PART_IDS.map((id) => [id, { ...this.parts[id] }]),
    ) as Record<PartId, PartState>;
    for (const id of change.off ?? [])
      Object.assign(parts[id], { engage: 1, spin: 1, clear: 1, park: 1 });
    const prev = this.view.getState().plan;
    this.view.setState({
      plan: {
        seq: (prev?.seq ?? 0) + 1,
        pose: { parts, explode: change.explode ?? this.explode.v },
        mode: change.mode ?? this.view.getState().mode,
      },
    });
  }

  // ---------------------------------------------------------------- runner
  private async pump() {
    if (this.running) return;
    this.running = true;
    this.view.setState({ busy: true });
    try {
      while (this.dirty && !this.disposed) {
        this.dirty = false;
        await this.reconcile();
      }
    } finally {
      this.running = false;
      if (!this.disposed)
        this.view.setState({
          busy: false,
          status: "",
          settle: this.view.getState().settle + 1,
        });
    }
  }

  private say(status: string) {
    this.view.setState((s) => ({ status, step: s.step + 1 }));
  }

  private settle() {
    this.view.setState((s) => ({ settle: s.settle + 1 }));
  }

  private async reconcile() {
    const t = this.target;
    const f = this.view.getState().fitted;

    const swaps: PartId[] = [];
    if (t.clip !== f.clip) swaps.push("clip");
    if (t.nibMaterial !== f.nibMaterial || t.nibSize !== f.nibSize)
      swaps.push("nib");
    const fillerSwap =
      t.fill !== f.fill || (t.fill === "cartridge" && t.ink !== f.ink);
    if (fillerSwap) swaps.push("filler");
    const refill = !fillerSwap && t.fill === "converter" && t.ink !== f.ink;

    if (swaps.length || refill) {
      if (this.explode.v > 0.001) {
        this.say("Bringing the parts together");
        await this.tween(this.explode, {
          v: 0,
          duration: 0.9,
          ease: ease.move,
        });
      }
      const order: PartId[] = [];
      for (const id of swaps) removalChain(id, order);
      if (refill && !t.transparentBody) removalChain("barrel", order);

      await this.removeAll(order.filter((id) => this.installed(id)));
      if (swaps.length) await Promise.all(swaps.map((id) => this.swap(id)));
      if (refill) await this.refill();

      const desired = this.target;
      await this.installAll(
        [...order]
          .reverse()
          .filter((id) => !(id === "cap" && desired.mode === "open")),
      );
      if (this.dirty) return;
    }

    // settle into the requested display mode
    const mode = this.target.mode;
    if (mode === "open") {
      if (this.explode.v > 0.001)
        await this.tween(this.explode, {
          v: 0,
          duration: 0.9,
          ease: ease.move,
        });
      if (this.installed("cap")) await this.removeAll(["cap"], "open");
    } else {
      await this.installAll(INSTALL_ORDER.filter((id) => !this.installed(id)));
      const e = mode === "exploded" ? 1 : 0;
      if (Math.abs(this.explode.v - e) > 0.001) {
        this.say(
          e
            ? "Separating every part along the axis"
            : "Bringing the parts together",
        );
        if (e) this.plan({ explode: 1, mode: "exploded" });
        await this.tween(this.explode, { v: e, duration: 2.6, ease: "none" });
      }
    }
    this.view.setState({ mode });
    this.settle();
  }

  // ---------------------------------------------------------------- moves
  private tween(target: object, vars: gsap.TweenVars): Promise<void> {
    const duration = ((vars.duration as number) ?? 0.5) * TEMPO * this.speed;
    return new Promise((resolve) => {
      if (this.disposed) return resolve();
      gsap.to(target, { ...vars, duration, onComplete: () => resolve() });
    });
  }

  private removeLabel(id: PartId) {
    const f = this.view.getState().fitted;
    switch (id) {
      case "cap":
        return `Unscrewing the cap — ${turnsLabel(turns("cap"))} on a three-start thread`;
      case "barrel":
        return `Unscrewing the barrel from the section — ${turnsLabel(turns("barrel"))}`;
      case "capFinial":
        return `Unscrewing the finial — ${turnsLabel(turns("capFinial"))}`;
      case "clip":
        return "Lifting the clip ring off the cap";
      case "nib":
        return "Drawing the nib and feed out of the section";
      case "filler":
        return f.fill === "converter"
          ? "Easing the converter off the section nipple"
          : "Pulling the cartridge off the nipple";
    }
  }

  private installLabel(id: PartId) {
    switch (id) {
      case "cap":
        return this.target.mode === "closed"
          ? "Screwing the cap closed"
          : "Screwing the cap back on";
      case "barrel":
        return "Screwing the barrel home against the section";
      case "capFinial":
        return "Screwing the finial down to clamp the clip";
      case "clip":
        return "Seating the clip ring on the cap";
      case "nib":
        return "Seating the nib and feed in the section";
      case "filler":
        return this.view.getState().fitted.fill === "converter"
          ? "Pushing the converter onto the nipple"
          : "Pressing the cartridge onto the nipple";
    }
  }

  /**
   * Take parts off in order. Each one starts while the one before it is still
   * slowing into its park, so the strip-down reads as one movement.
   */
  async removeAll(ids: PartId[], mode?: Mode) {
    if (!ids.length) return;
    this.plan({ off: ids, mode });
    const done: Promise<void>[] = [];
    for (const id of ids) {
      const m = this.remove(id);
      done.push(m.done);
      await m.handoff;
    }
    await Promise.all(done);
  }

  /** Put parts back in order, overlapping the same way. */
  async installAll(ids: PartId[]) {
    const done: Promise<void>[] = [];
    for (const id of ids) {
      if (this.installed(id)) continue;
      const m = this.install(id);
      done.push(m.done);
      await m.handoff;
    }
    await Promise.all(done);
  }

  remove(id: PartId) {
    this.say(this.removeLabel(id));
    if (this.installed(id)) return this.play(id, true);
    // from an in-between state (an interrupted move): the phases one after another
    const p = this.parts[id];
    const done = (async () => {
      if (p.engage < 1 || p.spin < 1)
        await this.tween(p, {
          engage: 1,
          spin: 1,
          duration: 0.6,
          ease: ease.move,
        });
      if (p.clear < 1)
        await this.tween(p, { clear: 1, duration: 0.55, ease: ease.move });
      if (p.park < 1)
        await this.tween(p, { park: 1, duration: 0.45, ease: ease.out });
    })();
    return { done, handoff: done };
  }

  install(id: PartId) {
    this.say(this.installLabel(id));
    if (this.parked(id)) return this.play(id, false);
    const p = this.parts[id];
    const def = PARTS[id];
    const done = (async () => {
      if (p.park > 0)
        await this.tween(p, { park: 0, duration: 0.45, ease: ease.move });
      if (p.clear > 0)
        await this.tween(p, { clear: 0, duration: 0.55, ease: ease.move });
      const screwTime =
        def.kind === "screw" ? Math.max(0.9, turns(id) * 0.7) : 0.45;
      if (p.engage > 0 || p.spin > 0)
        await this.tween(p, {
          engage: 0,
          spin: 0,
          duration: screwTime,
          ease: def.kind === "screw" ? ease.screw : "power2.out",
        });
    })();
    return { done, handoff: done };
  }

  /** play a part's continuous removal curve, forwards (off) or backwards (on) */
  private play(id: PartId, off: boolean) {
    const m = removalMotion(id);
    const p = this.parts[id];
    const k = TEMPO * this.speed;
    const clock = { t: off ? 0 : m.T };
    const apply = () => {
      const s = m.at(clock.t);
      p.engage = s.engage;
      p.spin = s.spin;
      p.clear = s.clear;
      p.park = s.park;
    };
    let release: () => void = () => {};
    const handoff = new Promise<void>((r) => (release = r));
    const done = new Promise<void>((resolve) => {
      if (this.disposed) {
        release();
        return resolve();
      }
      this.clocks.add(clock);
      gsap.to(clock, {
        t: off ? m.T : 0,
        duration: m.T * k,
        ease: "none",
        onUpdate: () => {
          apply();
          const left = off ? m.T - clock.t : clock.t;
          if (left <= m.handoff) release();
        },
        onComplete: () => {
          clock.t = off ? m.T : 0;
          apply();
          this.clocks.delete(clock);
          release();
          resolve();
        },
        onInterrupt: () => {
          this.clocks.delete(clock);
          release();
          resolve();
        },
      });
    });
    return { done, handoff };
  }

  private async swap(id: PartId) {
    const p = this.parts[id];
    const t = this.target;
    const fitted = { ...this.view.getState().fitted };
    let label = "";
    if (id === "clip") {
      fitted.clip = t.clip;
      label = `Fitting the ${optionName("clip", t.clip)}`;
    } else if (id === "nib") {
      fitted.nibMaterial = t.nibMaterial;
      fitted.nibSize = t.nibSize;
      label = `Fitting a ${optionName("nibMaterial", t.nibMaterial).toLowerCase()} nib, ${optionName("nibSize", t.nibSize).toLowerCase()}`;
    } else if (id === "filler") {
      fitted.fill = t.fill;
      fitted.ink = t.ink;
      label =
        t.fill === "converter"
          ? `Fitting a piston converter filled with ${INKS.find((i) => i.id === t.ink)!.name}`
          : `Fitting a ${INKS.find((i) => i.id === t.ink)!.name} cartridge`;
    }
    this.say(label);
    await this.tween(p, { scale: 0.0, duration: 0.32, ease: "back.in(1.6)" });
    this.view.setState({ fitted });
    if (id === "filler") this.ink.fill = 1;
    await this.tween(p, { scale: 1, duration: 0.42, ease: "back.out(1.6)" });
  }

  private async refill() {
    const t = this.target;
    const ink = INKS.find((i) => i.id === t.ink)!;
    this.say("Turning the knob to empty the converter");
    await this.tween(this.ink, { fill: 0, duration: 1.1, ease: ease.move });
    this.view.setState((s) => ({ fitted: { ...s.fitted, ink: t.ink } }));
    this.say(`Drawing ${ink.name} into the converter`);
    await this.tween(this.ink, { fill: 1, duration: 1.6, ease: ease.move });
  }

  // ---------------------------------------------------------------- pose
  /** axial travel in mm (signed), including exploded offset */
  axial(id: PartId) {
    const d = PARTS[id];
    const p = this.parts[id];
    // in the park phase the part lifts away first and travels second
    const along =
      d.engage * p.engage + d.clear * p.clear + d.park.axial * p.park * p.park;
    return d.dir * along + d.dir * explodeAt(id, this.explode.v).axial;
  }

  rotation(id: PartId) {
    const d = PARTS[id];
    if (d.kind !== "screw" || !d.lead) return 0;
    return ((d.dir * d.engage * this.parts[id].spin) / d.lead) * Math.PI * 2;
  }

  lateral(id: PartId): [number, number] {
    const d = PARTS[id];
    const p = this.parts[id].park;
    const k = 1 - (1 - p) * (1 - p);
    const el = explodeAt(id, this.explode.v);
    return [d.park.x * k + el.x, d.park.z * k + el.z];
  }
}
