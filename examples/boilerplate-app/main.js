const { USM: Machine, adapters } = window.USM;

document.querySelectorAll('[data-goto]').forEach(btn=>{
  btn.addEventListener('click', ()=> m.send(btn.getAttribute('data-goto').toUpperCase()));
});

const m = new Machine({
  initial: 'home',
  states: {
    home: {
      enter(ctx){ 
        
        ctx.text.type('#greet', 'Welcome to your USM app!', { speed: 30 });
      // Nav + toolbars (you style with CSS via data-attributes on <html>)
        ctx.ui.widgets.toggleNav('left', true);   // open left nav
        ctx.ui.widgets.showToolbar('top', true);  // show top toolbar
        ctx.ui.widgets.setTitle('Dashboard');
        // Debug
        ctx.ui.widgets.debug.show();
        ctx.ui.widgets.debug.log('Loaded profile data');
      },
      on: { ABOUT:'about', SETTINGS:'settings', Digit2:'about', Digit3:'settings' }
    },
    about: { 
      enter(ctx){ 
        ctx.text.type('.about', 'USM adapter-first demo.', { speed: 30 });
            // Draggable window
        ctx.ui.widgets.makeDraggable('#profiler', '.titlebar');
      },
      on: { HOME:'home', SETTINGS:'settings', Digit1:'home', Digit3:'settings' } },
    settings: {
      enter(ctx){ 
        ctx.text.type('.settings', 'Press 1/2/3 to switch pages!', { speed: 30 }); 

        ctx.text.type('#title', 'Mission Start', { speed: 50, keepCursor: true });
        ctx.text.count('#score', 12500, { from: 0, duration: 1, prefix: '$', format: v => Math.round(v).toLocaleString() });
        ctx.text.scramble('#status', 'CONNECTED', { speed: 10, charset: '01' }); // binary vibe

              // Dialogs
        ctx.ui.widgets.openDialog('#settingsDialog'); // will create backdrop, trap focus, Esc closes
        // ctx.ui.widgets.closeDialog();
      },
      on: { HOME:'home', ABOUT:'about', Digit1:'home', Digit2:'about' } }
  },
  adapters: [
    adapters.timeAdapter({ fixedStep: 1/60 }), // optional but makes debug/fade pause-aware
    adapters.tweenAdapter(),                   // optional but recommended
    adapters.uiAdapter(),                      // keeps html[data-state], [data-show]
    adapters.uiWidgetsAdapter({ autoStyles: true, dragHandle: '.titlebar' }), // NEW
    adapters.textAdapter(),     // typewriter/counters
    adapters.keyboardAdapter({ bindings:{ Digit1:'Digit1', Digit2:'Digit2', Digit3:'Digit3' } }),
  ]
});

m.start();