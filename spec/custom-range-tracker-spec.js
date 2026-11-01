describe("Super Select custom range tracking", () => {
  let main, editor;
  beforeEach(async () => {
    jasmine.useRealClock();
    main = (await lumine.packages.activatePackage("super-select")).mainModule;
    editor = await lumine.workspace.open();
  });
  afterEach(() => editor.destroy());

  it("normalizes a large source selection with live trackers and exact undo", async () => {
    const prefix = "x".repeat(65537);
    const original = prefix + "\\a\\b";
    editor.setText(original);
    editor.selectAll();
    const buffer = editor.getBuffer();
    let calls = 0;
    const layer = buffer.addMarkerLayer({
      trackRanges(entries) {
        calls++;
        return entries.map(({ id }) => ({ id, range: buffer.getRange() }));
      },
    });
    layer.markRange(buffer.getRange(), { invalidate: "never" });
    const errors = spyOn(lumine.notifications, "addError");
    buffer.clearUndoStack();
    await main.slashWorker(3, { target: editor.getElement() });
    expect(editor.getText()).toBe(prefix + "/a/b");
    expect(editor.getSelectedText()).toBe(prefix + "/a/b");
    expect(calls).toBe(2);
    expect(errors).not.toHaveBeenCalled();
    editor.undo();
    expect(editor.getText()).toBe(original);
    expect(buffer.undo()).toBe(false);
  });
});
