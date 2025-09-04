/**
 * Audio adapter
 * WHAT: Simple Web Audio graph for music/SFX with HTMLAudio fallback.
 * WHY : Consistent sound control; automatic AudioContext unlock on first input.
 */
import { createAdapter } from '../usm-core';

export interface AudioAdapterOpts {
  resumeOnGesture?: boolean; // resume AudioContext on first pointer/keydown
  master?: number;           // master volume (0..1)
  music?: number;            // music bus volume (0..1)
  sfx?: number;              // sfx bus volume (0..1)
}
type MusicHandle = { stop: (fade?: number) => Promise<void> } | null;

export function audioAdapter(
  { resumeOnGesture = true, master = 1, music = 0.8, sfx = 1 }: AudioAdapterOpts = {}
) {
  return createAdapter('audio', '1.0.0', ['audio'], (usm) => {
    const AC: any = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
    let ctx: AudioContext | null = AC ? new AC() : null;
    let masterGain: GainNode | null = ctx ? ctx.createGain() : null;
    let musicGain: GainNode  | null = ctx ? ctx.createGain() : null;
    let sfxGain: GainNode    | null = ctx ? ctx.createGain() : null;
    let currentMusic: MusicHandle = null;

    if (ctx && masterGain && musicGain && sfxGain) {
      masterGain.gain.value = master;
      musicGain.gain.value  = music;
      sfxGain.gain.value    = sfx;
      musicGain.connect(masterGain);
      sfxGain.connect(masterGain);
      masterGain.connect(ctx.destination);
    }

    const unlock = async () => {
      if (ctx && ctx.state === 'suspended') await ctx.resume();
    };

    function addUnlockListeners() {
      if (!resumeOnGesture || !ctx) return;
      const once = async () => {
        await unlock();
        window.removeEventListener('pointerdown', once);
        window.removeEventListener('keydown', once);
      };
      window.addEventListener('pointerdown', once, { once: true });
      window.addEventListener('keydown', once, { once: true });
    }

    function setVolumes({ master: vm, music: vmu, sfx: vs }:
      { master?: number; music?: number; sfx?: number }) {
      if (masterGain && typeof vm === 'number') masterGain.gain.value = vm;
      if (musicGain && typeof vmu === 'number') musicGain.gain.value = vmu;
      if (sfxGain && typeof vs === 'number') sfxGain.gain.value = vs;
    }

    async function playOneShot(name: string, volume = 1) {
      const a = (usm.context as any).loader?.get(name);
      if (!a) return console.warn('audio: asset not found', name);

      // WebAudio route if possible
      if (ctx && a instanceof HTMLAudioElement) {
        try {
          const el = a.cloneNode(true) as HTMLAudioElement;
          const src = ctx.createMediaElementSource(el);
          const gain = ctx.createGain();
          gain.gain.value = volume;
          src.connect(gain).connect(sfxGain!);
          el.currentTime = 0;
          await unlock();
          el.play();
          return;
        } catch { /* fallback below */ }
      }
      // Fallback: play element directly
      if (a instanceof HTMLAudioElement) {
        const el = a.cloneNode(true) as HTMLAudioElement;
        el.volume = volume;
        el.currentTime = 0;
        el.play();
        return;
      }

      console.warn('audio: unsupported asset for oneShot', name);
    }

    async function playMusic(
      name: string,
      { loop = true, fade = 0.5 }: { loop?: boolean; fade?: number } = {}
    ) {
      const a = (usm.context as any).loader?.get(name);
      if (!a) { console.warn('audio: asset not found', name); return null; }
      if (currentMusic) await currentMusic.stop(fade);

      // WebAudio path
      if (ctx && a instanceof HTMLAudioElement) {
        const el = a.cloneNode(true) as HTMLAudioElement;
        el.loop = loop;
        const src = ctx.createMediaElementSource(el);
        src.connect(musicGain!);
        el.volume = 1;
        await unlock();
        el.play();

        currentMusic = {
          stop: async (fd = 0.5) => {
            if (!ctx) return;
            if (fd > 0) {
              const t0 = ctx.currentTime;
              const start = musicGain!.gain.value;
              musicGain!.gain.cancelScheduledValues(t0);
              musicGain!.gain.setValueAtTime(start, t0);
              musicGain!.gain.linearRampToValueAtTime(0, t0 + fd);
              await new Promise((r) => setTimeout(r, fd * 1000));
            }
            try { el.pause(); el.src = ''; } catch {}
            musicGain!.gain.value = music;
            currentMusic = null;
          },
        };
        return currentMusic;
      }

      // Fallback (no WebAudio): fade by stepping volume
      if (a instanceof HTMLAudioElement) {
        const el = a.cloneNode(true) as HTMLAudioElement;
        el.loop = loop;
        el.volume = 1;
        await el.play();
        currentMusic = {
          stop: async (fd = 0.3) => {
            if (fd > 0) {
              const steps = 10;
              for (let i = 0; i < steps; i++) {
                el.volume = Math.max(0, 1 - i / steps);
                await new Promise((r) => setTimeout(r, (fd * 1000) / steps));
              }
            }
            el.pause();
            currentMusic = null;
          },
        };
        return currentMusic;
      }

      console.warn('audio: unsupported asset for music', name);
      return null;
    }

    (usm.context as any).audio = {
      unlock,
      setVolumes,
      playOneShot,
      playMusic,
      stopMusic: async (fade = 0.5) => {
        if (currentMusic) await currentMusic.stop(fade);
      },
      get context() { return ctx; },
    };

    return { onStart() { addUnlockListeners(); } };
  });
}