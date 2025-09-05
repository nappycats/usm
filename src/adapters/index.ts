
export * from './three'; // pulls threeAdapter + threeFxAdapter via the barrel
export * from './ui';    // pulls uiAdapter + uiWidgetsAdapter via the barrel
export { loaderAdapter, type LoaderAdapterOpts } from './loader';
export { gsapAdapter, type GsapAdapterOpts } from './gsap';
export { keyboardAdapter, type KeyboardAdapterOpts } from './keyboard';
export { pointerAdapter, type PointerAdapterOpts } from './pointer';
export { faderAdapter, type FaderAdapterOpts } from './fader';
export { debugAdapter, type DebugAdapterOpts } from './debug';
export { audioAdapter, type AudioAdapterOpts } from './audio';
export { timeAdapter, type TimeAdapterOpts } from './time';
export { pickingAdapter, type PickingAdapterOpts } from './picking';
export { scrollAdapter, type ScrollAdapterOpts }   from './scroll';
export { tweenAdapter } from './tween';
export { textAdapter } from './text';
export { animAdapter } from './anim';

export { transitionsAdapter } from './transitions';