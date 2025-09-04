import { USM } from '@nappycat/usm';
import { timeAdapter } from '@nappycat/usm/adapters/time';

const m = new USM({
  initial: 'menu',
  states: {
    menu: { on: { START: 'play' } },
    play: {}
  },
  adapters: [ timeAdapter({ fixedStep: 1/60 }) ]
});
m.start();