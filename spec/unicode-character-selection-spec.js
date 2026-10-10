describe("Unicode character selection", () => {
  let editor, editorElement;

  beforeEach(async () => {
    for (const name of ["openExternal", "openPath", "showItemInFolder", "openApplication"])
      spyOn(lumine.shell, name).and.resolveTo();
    spyOn(lumine.application, "openWindow").and.resolveTo();
    jasmine.attachToDOM(lumine.views.getView(lumine.workspace));
    await lumine.packages.activatePackage("super-select");
    editor = await lumine.workspace.open();
    editorElement = lumine.views.getView(editor);
    editorElement.focus();
  });

  afterEach(async () => {
    editor?.destroy();
    if (lumine.packages.isPackageActive("super-select"))
      await lumine.packages.deactivatePackage("super-select");
  });

  it("selects astral letters on both sides of an ASCII word", () => {
    editor.setText("𐐀alpha𐐁 beta");
    editor.setCursorBufferPosition([0, 4]);
    lumine.commands.dispatch(editorElement, "super-select:chars-1");
    expect(editor.getSelectedText()).toBe("𐐀alpha𐐁");
    expect(editor.getSelectedBufferRange().serialize()).toEqual([
      [0, 0],
      [0, 9],
    ]);
  });

  it("selects astral letters and the wider command's allowed punctuation", () => {
    editor.setText("𐐀𐐁.alpha-2 outside");
    editor.setCursorBufferPosition([0, 7]);
    lumine.commands.dispatch(editorElement, "super-select:chars-2");
    expect(editor.getSelectedText()).toBe("𐐀𐐁.alpha-2");
    expect(editor.getSelectedBufferRange().serialize()).toEqual([
      [0, 0],
      [0, 12],
    ]);
  });

  it("preserves ASCII and BMP letter selection at the start of a line", () => {
    for (const [text, command, expected] of [
      ["bar.baz outside", "super-select:chars-1", "bar.baz"],
      ["Żółć outside", "super-select:chars-1", "Żółć"],
      ["[Żółć]-2 outside", "super-select:chars-2", "[Żółć]-2"],
    ]) {
      editor.setText(text);
      editor.setCursorBufferPosition([0, 0]);
      lumine.commands.dispatch(editorElement, command);
      expect(editor.getSelectedText()).toBe(expected);
    }
  });
});
