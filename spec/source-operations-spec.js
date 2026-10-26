const { TextBuffer } = require("lumine");
const operations = require("../lib/source-operations");

function huge(text) {
  let source = TextBuffer.createTextSnapshot(text.repeat(65536));
  for (let i = 0; i < 14; i++) source = source.replace(source.length, source.length, source);
  return source;
}

describe("Source-native selection algorithms", () => {
  beforeEach(() => jasmine.useRealClock());

  it("selects a complete word beyond the native string limit and can cancel it", async () => {
    const source = huge("x");
    const result = await operations.run(operations.chars(source, source.length - 10, "[a-z]"));
    expect(result).toEqual([[0, source.length]]);
    let checks = 0;
    await expectAsync(
      Promise.resolve().then(() =>
        operations.run(operations.chars(source, 10, "[a-z]"), () => ++checks < 3),
      ),
    ).toBeRejectedWith(jasmine.objectContaining({ name: "AbortError" }));
  });

  it("keeps triple-quote global phases at every clipped cursor offset", async () => {
    const patterns = [/('''|'|"""|"|`)/, "('''|')", "'''", '("""|")', '"""', "`"];
    for (let count = 1; count < 10; count++)
      for (const quotes of ["'", '"', "`"]) {
        const text = `${quotes.repeat(count)}word${quotes.repeat(count)} tail`;
        for (const pattern of patterns)
          for (let cursor = 0; cursor <= text.length; cursor++) {
            const matches = Array.from(
              text
                .slice(0, cursor)
                .matchAll(new RegExp(typeof pattern === "string" ? pattern : pattern.source, "g")),
            );
            const last = matches.at(-1),
              start = last ? last.index + last[0].length : -1;
            const end = last ? text.indexOf(last[0], start) : -1;
            const expected = end < 0 ? null : [[start, end]];
            const actual = await operations.run(
              operations.quotes(TextBuffer.createTextSnapshot(text), cursor, pattern),
            );
            expect(actual)
              .withContext(JSON.stringify([text, cursor, String(pattern)]))
              .toEqual(expected);
          }
      }
  });

  it("finds quotes and nested brackets across a giant source without native whole-range scans", async () => {
    const body = huge("x");
    const quoted = body.replace(0, 0, '"').replace(body.length + 1, body.length + 1, '"');
    expect(await operations.run(operations.quotes(quoted, 12, /("|')/))).toEqual([
      [1, body.length + 1],
    ]);
    const bracketed = body.replace(0, 0, "((").replace(body.length + 2, body.length + 2, "))");
    expect(await operations.run(operations.brackets(bracketed, 12, ["()"]))).toEqual([
      [2, body.length + 2],
    ]);
  });

  it("streams slash runs across chunk boundaries with exact native replacement semantics", () => {
    const samples = [
      "a\\\\/b///\\c",
      "x".repeat(65535) + "\\\\\\/tail",
      "😀\\a\r\n/b",
      "no separator",
      "\\".repeat(100000),
    ];
    for (const text of samples)
      for (const requested of [undefined, 1, 2, 3]) {
        const first = /(\\\\|\\|\/)/.exec(text)?.[0];
        const mode =
          requested ?? (first === "\\\\" ? 1 : first === "\\" ? 2 : first === "/" ? 3 : 0);
        const expected =
          mode === 1
            ? text.replace(/\/+|\\+/g, "\\\\")
            : mode === 2
              ? text.replace(/\\+|\/+/g, "\\")
              : mode === 3
                ? text.replace(/\\+/g, "/")
                : text;
        const buffer = new TextBuffer(text),
          source = buffer.getTextSnapshot();
        try {
          buffer.setTextInIndependentRanges(
            Array.from(operations.slashEdits(source, [[0, source.length]], requested)).flat(),
          );
          expect(buffer.getText()).toBe(expected);
        } finally {
          buffer.destroy();
        }
      }
  });

  it("selects nested HTML tags across quoted attributes and comments", async () => {
    const text = '<div><!-- <fake> --><span title="a > b">value</span></div>';
    const offset = text.indexOf("value") + 2;
    const source = TextBuffer.createTextSnapshot(text);
    const result = await operations.run(operations.html(source, offset, true));
    expect(result.map(([start, end]) => text.slice(start, end))).toEqual([
      '<span title="a > b">',
      "</span>",
    ]);
  });
});

describe("Cooperative selection command publication", () => {
  let main, editor;
  beforeEach(async () => {
    jasmine.useRealClock();
    main = (await lumine.packages.activatePackage("super-select")).mainModule;
    editor = await lumine.workspace.open();
  });
  afterEach(() => editor.destroy());

  it("normalizes a giant selected slash run in one undo step without reading selected text", async () => {
    const source = huge("\\");
    editor.getBuffer().setTextInRange(editor.getBuffer().getRange(), source);
    editor.selectAll();
    const selection = editor.getLastSelection();
    const read = spyOn(selection, "getText").and.throwError("Selection must stay a snapshot");
    const result = main.slashWorker(3, { target: editor.element });
    read.and.callThrough();
    await result;
    expect(editor.getText()).toBe("/");
    expect(editor.getSelectedText()).toBe("/");
    editor.undo();
    expect(editor.getBuffer().getLength()).toBe(source.length);
  });

  it("does not publish a long-running selection or edit after cursor/source changes", async () => {
    const source = huge("x");
    editor.getBuffer().setTextInRange(editor.getBuffer().getRange(), source);
    const selecting = main.byChar(editor, editor.getLastCursor(), "[a-z]");
    editor.setCursorBufferPosition([0, 12]);
    expect(await selecting).toBe(false);
    expect(editor.getLastSelection().isEmpty()).toBe(true);
    editor.selectAll();
    const replacing = main.slashWorker(3, { target: editor.element });
    editor.getBuffer().insert([0, 0], "new");
    expect(await replacing).toBe(false);
    expect(editor.getBuffer().getLength()).toBe(source.length + 3);
  });
});
