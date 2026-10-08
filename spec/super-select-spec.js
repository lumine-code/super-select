const { TextEditor } = require("lumine");

describe("super-select", () => {
  let workspaceElement, editor, editorElement, registration;

  beforeEach(async () => {
    workspaceElement = lumine.views.getView(lumine.workspace);
    jasmine.attachToDOM(workspaceElement);
    await lumine.packages.activatePackage("super-select");
    editor = await lumine.workspace.open();
    editorElement = lumine.views.getView(editor);
    registration = null;
  });

  afterEach(() => {
    registration?.dispose();
  });

  function dispatch(command) {
    lumine.commands.dispatch(editorElement, command);
  }

  it("registers its commands on lumine-text-editor", () => {
    const commands = lumine.commands
      .findCommands({ target: editorElement })
      .map((command) => command.name);
    expect(commands).toContain("super-select:string");
    expect(commands).toContain("super-select:brackets");
    expect(commands).toContain("super-select:normalize");
    expect(commands).toContain("super-select:html-body");
  });

  describe("character selection", () => {
    it("selects contiguous word characters around the cursor", () => {
      editor.setText("foo bar.baz qux");
      editor.setCursorBufferPosition([0, 6]);
      dispatch("super-select:chars-1");
      expect(editor.getSelectedText()).toBe("bar.baz");
    });

    it("selects each cursor's word independently", () => {
      editor.setText("alpha beta\ngamma delta");
      editor.setCursorBufferPosition([0, 2]);
      editor.addCursorAtBufferPosition([1, 8]);
      dispatch("super-select:chars-1");
      expect(editor.getSelections().map((s) => s.getText())).toEqual(["alpha", "delta"]);
    });
  });

  describe("string selection", () => {
    it("selects text inside double quotes", () => {
      editor.setText('x = "hello world" + 1');
      editor.setCursorBufferPosition([0, 8]);
      dispatch("super-select:string");
      expect(editor.getSelectedText()).toBe("hello world");
    });

    it("selects text inside single quotes with select-single-quoted-string", () => {
      editor.setText("x = 'abc def' + 1");
      editor.setCursorBufferPosition([0, 8]);
      dispatch("super-select:select-single-quoted-string");
      expect(editor.getSelectedText()).toBe("abc def");
    });

    it("selects text inside double quotes with select-double-quoted-string", () => {
      editor.setText('x = "abc def" + 1');
      editor.setCursorBufferPosition([0, 8]);
      dispatch("super-select:select-double-quoted-string");
      expect(editor.getSelectedText()).toBe("abc def");
    });

    it("selects text inside backticks", () => {
      editor.setText("x = `tpl str` + 1");
      editor.setCursorBufferPosition([0, 8]);
      dispatch("super-select:select-backtick-string");
      expect(editor.getSelectedText()).toBe("tpl str");
    });
  });

  describe("bracket selection", () => {
    it("selects text inside parentheses", () => {
      editor.setText("foo(bar, baz)");
      editor.setCursorBufferPosition([0, 6]);
      dispatch("super-select:brackets");
      expect(editor.getSelectedText()).toBe("bar, baz");
    });

    it("selects the innermost matching pair when nested", () => {
      editor.setText("(a(b)c)");
      editor.setCursorBufferPosition([0, 6]);
      dispatch("super-select:brackets");
      expect(editor.getSelectedText()).toBe("a(b)c");
    });

    it("selects text inside square brackets with select-square-brackets", () => {
      editor.setText("foo[1, 2](x)");
      editor.setCursorBufferPosition([0, 5]);
      dispatch("super-select:select-square-brackets");
      expect(editor.getSelectedText()).toBe("1, 2");
    });

    it("selects text inside curly braces with select-curly-braces", () => {
      editor.setText("val = { a: 1 }");
      editor.setCursorBufferPosition([0, 9]);
      dispatch("super-select:select-curly-braces");
      expect(editor.getSelectedText()).toBe(" a: 1 ");
    });
  });

  describe("slash conversion", () => {
    it("converts backslashes to forward slashes", () => {
      editor.setText("C:\\path\\to\\file");
      editor.selectAll();
      dispatch("super-select:forward-slash");
      expect(editor.getText()).toBe("C:/path/to/file");
    });

    it("converts forward slashes to backslashes", () => {
      editor.setText("C:/path/to/file");
      editor.selectAll();
      dispatch("super-select:backslash");
      expect(editor.getText()).toBe("C:\\path\\to\\file");
    });

    it("converts slashes to double backslashes", () => {
      editor.setText("C:/path/to");
      editor.selectAll();
      dispatch("super-select:double-backslash");
      expect(editor.getText()).toBe("C:\\\\path\\\\to");
    });

    it("normalizes mixed slashes to the leftmost separator style", () => {
      editor.setText("C:\\alpha/beta/gamma");
      editor.selectAll();
      dispatch("super-select:normalize");
      expect(editor.getText()).toBe("C:\\alpha\\beta\\gamma");
    });

    const selectPaths = (paths) => {
      editor.setText(paths.join("\n"));
      editor.setSelectedBufferRanges(
        paths.map((text, row) => [
          [row, 0],
          [row, text.length],
        ]),
      );
    };

    it("infers a separator style independently for each selected path", () => {
      selectPaths(["one/two\\tail", "three\\four/tail"]);
      dispatch("super-select:normalize");
      expect(editor.getSelections().map((selection) => selection.getText())).toEqual([
        "one/two/tail",
        "three\\four\\tail",
      ]);
    });

    it("also preserves independent styles when the first path starts with a backslash", () => {
      selectPaths(["one\\two/tail", "three/four\\tail"]);
      dispatch("super-select:normalize");
      expect(editor.getText()).toBe("one\\two\\tail\nthree/four/tail");
    });

    it("keeps doubled-backslash inference local to its own selection", () => {
      selectPaths(["one\\\\two/tail", "three/four\\tail"]);
      dispatch("super-select:normalize");
      expect(editor.getSelections().map((selection) => selection.getText())).toEqual([
        "one\\\\two\\\\tail",
        "three/four/tail",
      ]);
    });

    it("leaves separator-free selections selected and processes later paths", () => {
      selectPaths(["plain text", "one\\two/tail"]);
      dispatch("super-select:normalize");
      expect(editor.getSelections().map((selection) => selection.getText())).toEqual([
        "plain text",
        "one\\two\\tail",
      ]);
    });

    it("skips collapsed selections without skipping later selected paths", () => {
      editor.setText("plain text\none\\two/tail");
      editor.setSelectedBufferRanges([
        [
          [0, 0],
          [0, 0],
        ],
        [
          [1, 0],
          [1, 12],
        ],
      ]);
      dispatch("super-select:normalize");
      expect(editor.getText()).toBe("plain text\none\\two\\tail");
      expect(editor.getSelections()[0].isEmpty()).toBe(true);
    });

    it("retains the common supplied mode for explicit conversion commands", () => {
      for (const [command, expected] of [
        ["super-select:forward-slash", ["one/two/tail", "three/four/tail"]],
        ["super-select:backslash", ["one\\two\\tail", "three\\four\\tail"]],
        ["super-select:double-backslash", ["one\\\\two\\\\tail", "three\\\\four\\\\tail"]],
      ]) {
        selectPaths(["one/two\\tail", "three\\four/tail"]);
        dispatch(command);
        expect(editor.getSelections().map((selection) => selection.getText())).toEqual(expected);
      }
    });

    it("restores every normalized selection in one undo step", () => {
      const paths = ["one/two\\tail", "three\\four/tail"];
      selectPaths(paths);
      editor.getBuffer().clearUndoStack();
      dispatch("super-select:normalize");
      expect(editor.getText()).toBe("one/two/tail\nthree\\four\\tail");
      editor.undo();
      expect(editor.getText()).toBe(paths.join("\n"));
    });
  });

  describe("mini editors", () => {
    let miniEditor, miniElement;

    beforeEach(() => {
      // A find field, go to line, a commit box: `mini` is the only thing that
      // sets them apart from the editor holding a file, and the surface that
      // owns one registers it — search-panel does exactly this for its find
      // and replace fields — which is what puts it in reach of these commands.
      miniEditor = new TextEditor({ mini: true });
      miniElement = lumine.views.getView(miniEditor);
      workspaceElement.appendChild(miniElement);
      registration = lumine.textEditors.add(miniEditor, { role: "input" });
      miniElement.focus();
    });

    it("acts on the mini editor that has focus", () => {
      editor.setText("behind the dialog");
      editor.setCursorBufferPosition([0, 2]);
      miniEditor.setText("one.two three");
      miniEditor.setCursorBufferPosition([0, 3]);
      dispatch("super-select:chars-1");
      expect(miniEditor.getSelectedText()).toBe("one.two");
      expect(editor.getSelectedText()).toBe("");
    });

    it("selects inside quotes in a mini editor", () => {
      miniEditor.setText('x = "hello world" + 1');
      miniEditor.setCursorBufferPosition([0, 8]);
      dispatch("super-select:string");
      expect(miniEditor.getSelectedText()).toBe("hello world");
    });

    it("rewrites slashes in a mini editor", () => {
      miniEditor.setText("C:/path/to");
      miniEditor.selectAll();
      dispatch("super-select:backslash");
      expect(miniEditor.getText()).toBe("C:\\path\\to");
    });

    it("acts on an unregistered focused mini editor", () => {
      // Focus resolution is structural. Registration exposes an editor to
      // observers, but is not required to resolve its existing element.
      registration.dispose();
      editor.setText("foo bar.baz qux");
      editor.setCursorBufferPosition([0, 6]);
      miniEditor.setText("one.two three");
      miniEditor.setCursorBufferPosition([0, 3]);
      dispatch("super-select:chars-1");
      expect(miniEditor.getSelectedText()).toBe("one.two");
      expect(editor.getSelectedText()).toBe("");
    });

    it("falls back to the active editor when focus is not in one", () => {
      // What the application menu does: dispatch at whatever holds focus,
      // which is not always an editor at all.
      workspaceElement.focus();
      editor.setText("foo bar.baz qux");
      editor.setCursorBufferPosition([0, 6]);
      dispatch("super-select:chars-1");
      expect(editor.getSelectedText()).toBe("bar.baz");
    });
  });

  describe("html selection", () => {
    it("selects the surrounding html element with html-body", () => {
      editor.setText("<div>\n  <span>text</span>\n</div>");
      editor.setCursorBufferPosition([1, 10]);
      dispatch("super-select:html-body");
      expect(editor.getSelectedText()).toBe("<span>text</span>");
    });

    it("selects the opening and closing tags with html-tags", () => {
      editor.setText("<div>\n  <span>text</span>\n</div>");
      editor.setCursorBufferPosition([1, 10]);
      dispatch("super-select:html-tags");
      expect(editor.getSelections().map((s) => s.getText())).toEqual(["<span>", "</span>"]);
    });
  });
});
