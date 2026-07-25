describe("super-select", () => {
  let workspaceElement, editor, editorElement;

  beforeEach(async () => {
    workspaceElement = atom.views.getView(atom.workspace);
    jasmine.attachToDOM(workspaceElement);
    await atom.packages.activatePackage("super-select");
    editor = await atom.workspace.open();
    editorElement = atom.views.getView(editor);
  });

  function dispatch(command) {
    atom.commands.dispatch(editorElement, command);
  }

  it("registers its commands on atom-text-editor", () => {
    const commands = atom.commands
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

    it("selects text inside single quotes with string-'-'", () => {
      editor.setText("x = 'abc def' + 1");
      editor.setCursorBufferPosition([0, 8]);
      dispatch("super-select:string-'-'");
      expect(editor.getSelectedText()).toBe("abc def");
    });

    it('selects text inside double quotes with string-"-"', () => {
      editor.setText('x = "abc def" + 1');
      editor.setCursorBufferPosition([0, 8]);
      dispatch('super-select:string-"-"');
      expect(editor.getSelectedText()).toBe("abc def");
    });

    it("selects text inside backticks", () => {
      editor.setText("x = `tpl str` + 1");
      editor.setCursorBufferPosition([0, 8]);
      dispatch("super-select:string-`-`");
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

    it("selects text inside square brackets with brackets-[-]", () => {
      editor.setText("foo[1, 2](x)");
      editor.setCursorBufferPosition([0, 5]);
      dispatch("super-select:brackets-[-]");
      expect(editor.getSelectedText()).toBe("1, 2");
    });

    it("selects text inside curly braces with brackets-{-}", () => {
      editor.setText("val = { a: 1 }");
      editor.setCursorBufferPosition([0, 9]);
      dispatch("super-select:brackets-{-}");
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
