const { USM: Machine, adapters } = window.USM;

document.querySelectorAll('[data-goto]').forEach(btn=>{
  btn.addEventListener('click', ()=> m.send(btn.getAttribute('data-goto').toUpperCase()));
});

const m = new Machine({
  initial: 'home',
  states: {
    home: {
      enter(ctx){ ctx.text.type('#greet', 'Welcome to your USM app!', { speed: 30 }); },
      on: { ABOUT:'about', SETTINGS:'settings', Digit2:'about', Digit3:'settings' }
    },
    about: { 
      enter(ctx){ ctx.text.type('.about', 'USM adapter-first demo.', { speed: 30 }); },
      on: { HOME:'home', SETTINGS:'settings', Digit1:'home', Digit3:'settings' } },
    settings: {
      enter(ctx){ ctx.text.type('.settings', 'Press 1/2/3 to switch pages!', { speed: 30 }); },
      on: { HOME:'home', ABOUT:'about', Digit1:'home', Digit2:'about' } }
  },
  adapters: [
    adapters.uiAdapter(),       // data-show + data-state
    adapters.textAdapter(),     // typewriter/counters
    adapters.keyboardAdapter({ bindings:{ Digit1:'Digit1', Digit2:'Digit2', Digit3:'Digit3' } }),
  ]
});

m.start();