// Authentic package usage. Run with lumine/script/demo.js; fixtures stay in demo/.
module.exports = {
  version: 1,
  dependencies: [],
  viewport: { width: 1100, height: 340 },
  async before() {},
  async prepare(context) {
    const { state, open } = context;
    state.editor = await open("usage/signal.js");
  },
  scenes: [
    {
      id: "scene-1",
      file: "demo.png",
      caption: "Select the string surrounding the cursor with one command.",
      timeout: 60000,
      async run(context) {
        const { lumine, state } = context;
        {
          state.editor.setCursorBufferPosition([1, 23]);
          lumine.commands.dispatch(lumine.views.getView(state.editor), "super-select:string");
        }
      },
      ready(context) {
        const { state } = context;
        return Boolean(state.editor.getSelectedText() === "results/smoothed.csv");
      },
    },
  ],
  async cleanup() {},
};
