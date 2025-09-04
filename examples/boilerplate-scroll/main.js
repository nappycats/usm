const { USM: Machine, adapters } = window.USM;

const m = new Machine({
  initial: 'idle',
  states: {
    idle: {
      on: {
        PANEL1_IN:  () => ({ target:'panel1' }),
        PANEL2_IN:  () => ({ target:'panel2' }),
        PANEL3_IN:  () => ({ target:'panel3' }),
        SCROLL_PROGRESS: (ctx, evt) => {
          const p = Math.round((evt.data?.progress ?? 0) * 100);
          document.getElementById('progress').textContent = p + '%';
        }
      }
    },
    panel1: { on: { PANEL2_IN:'panel2', PANEL3_IN:'panel3' } },
    panel2: { on: { PANEL1_IN:'panel1', PANEL3_IN:'panel3' } },
    panel3: { on: { PANEL1_IN:'panel1', PANEL2_IN:'panel2' } },
  },
  adapters: [
    adapters.uiAdapter(), // toggles data-state on <html> if you want styles per state
    adapters.scrollAdapter({
      sections: [
        { selector:'#p1', enter:'PANEL1_IN' },
        { selector:'#p2', enter:'PANEL2_IN' },
        { selector:'#p3', enter:'PANEL3_IN' },
      ],
      progressEvent: 'SCROLL_PROGRESS'
    }),
  ]
});

m.start();