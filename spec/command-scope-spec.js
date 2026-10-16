describe("super-select command scopes", () => {
  const commands = [
    "chars-1",
    "chars-2",
    "string",
    "select-single-quoted-string",
    "select-double-quoted-string",
    "select-triple-single-quoted-string",
    "select-triple-double-quoted-string",
    "select-backtick-string",
    "brackets",
    "select-parentheses",
    "select-square-brackets",
    "select-curly-braces",
    "select-angle-brackets",
    "forward-slash",
    "backslash",
    "double-backslash",
    "normalize",
    "html-body",
    "html-tags",
  ].map((name) => `super-select:${name}`);
  let editor, mini, button;

  beforeEach(async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    await lumine.packages.activatePackage("super-select");
    editor = await lumine.workspace.open();
    mini = lumine.workspace.buildTextEditor({ mini: true });
    button = document.createElement("button");
    lumine.workspace.getElement().append(mini.getElement(), button);
  });

  afterEach(async () => {
    button.remove();
    mini.destroy();
    editor.destroy();
    await lumine.packages.deactivatePackage("super-select");
  });

  it("exposes local actions only where their registered surface handles them", () => {
    for (const command of commands) {
      expect(lumine.commands.canDispatch(editor.getElement(), command))
        .withContext(command)
        .toBe(true);
      expect(lumine.commands.canDispatch(button, command)).withContext(command).toBe(false);
      expect(lumine.commands.canDispatch(lumine.workspace.getElement(), command))
        .withContext(command)
        .toBe(false);
      expect(lumine.commands.canDispatch(mini.getElement(), command))
        .withContext(command)
        .toBe(true);
    }
  });

  it("keeps selection and navigation available while disabling text mutations in a read-only editor", () => {
    editor.getElement().setAttribute("readonly", "");
    const mutators = new Set(
      ["normalize", "forward-slash", "backslash", "double-backslash"].map(
        (name) => `super-select:${name}`,
      ),
    );
    for (const command of commands)
      expect(lumine.commands.canDispatch(editor.getElement(), command))
        .withContext(command)
        .toBe(!mutators.has(command));
  });

  it("does not consume mutation shortcuts in a read-only editor", () => {
    const element = editor.getElement();
    for (const name of ["forward-slash", "backslash", "double-backslash"])
      expect(
        lumine.keymaps.findKeyBindings({ target: element, command: `super-select:${name}` }).length,
      )
        .withContext(name)
        .toBeGreaterThan(0);
    element.setAttribute("readonly", "");
    for (const name of ["forward-slash", "backslash", "double-backslash"])
      expect(lumine.keymaps.findKeyBindings({ target: element, command: `super-select:${name}` }))
        .withContext(name)
        .toEqual([]);
    for (const name of ["string", "brackets"])
      expect(
        lumine.keymaps.findKeyBindings({ target: element, command: `super-select:${name}` }).length,
      )
        .withContext(name)
        .toBeGreaterThan(0);
  });

  it("does not offer local actions in an empty workspace", () => {
    editor.destroy();
    for (const command of commands)
      expect(lumine.commands.canDispatch(lumine.workspace.getElement(), command))
        .withContext(command)
        .toBe(false);
  });
});
