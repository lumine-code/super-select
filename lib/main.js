const { CompositeDisposable } = require("lumine");
const operations = require("./source-operations");

/**
 * Super Select Package
 * Provides advanced selection commands for selecting text by characters,
 * strings, brackets, and HTML tags in text editors.
 */
module.exports = {
  provideBackgroundTips() {
    return {
      packageName: "super-select",
      tips: [
        "You can select the text inside the quotes around the cursor with {{ 'super-select:string' | keystroke }}",
      ],
    };
  },

  /**
   * Activates the package and registers selection commands.
   */
  activate() {
    this.disposables = new CompositeDisposable();
    this.active = true;
    this.generations = new WeakMap();
    this.disposables.add(
      lumine.commands.add("lumine-text-editor", {
        "super-select:chars-1": {
          description: "Select the run of word characters and dots around the cursor.",
          didDispatch: (event) => {
            return this.selectMany(this.byChar, "[0-9\\p{L}_\\.]", event);
          },
        },
        "super-select:chars-2": {
          description: "Select a wider run of characters around the cursor.",
          didDispatch: (event) => {
            return this.selectMany(this.byChar, "[0-9\\p{L}_\\.\\-\\[\\]\\(\\)#]", event);
          },
        },
        "super-select:string": {
          description: "Select what the nearest pair of quotes encloses.",
          didDispatch: (event) => {
            return this.selectMany(this.byString, /("""|'''|"|'|`)/, event);
          },
        },
        "super-select:select-single-quoted-string": {
          description: "Select what the nearest pair of single quotes encloses.",
          didDispatch: (event) => {
            return this.selectMany(this.byString, "('''|')", event);
          },
        },
        "super-select:select-triple-single-quoted-string": {
          description: "Select what the nearest pair of triple single quotes holds.",
          didDispatch: (event) => {
            return this.selectMany(this.byString, "'''", event);
          },
        },
        "super-select:select-double-quoted-string": {
          description: "Select what the nearest pair of double quotes encloses.",
          didDispatch: (event) => {
            return this.selectMany(this.byString, '("""|")', event);
          },
        },
        "super-select:select-triple-double-quoted-string": {
          description: "Select what the nearest pair of triple double quotes holds.",
          didDispatch: (event) => {
            return this.selectMany(this.byString, '"""', event);
          },
        },
        "super-select:select-backtick-string": {
          description: "Select what the nearest pair of backticks encloses.",
          didDispatch: (event) => {
            return this.selectMany(this.byString, "`", event);
          },
        },
        "super-select:brackets": {
          description: "Select what the nearest pair of brackets encloses.",
          didDispatch: (event) => {
            return this.selectMany(this.byBrackets, ["()", "[]", "{}", "<>"], event);
          },
        },
        "super-select:select-parentheses": (event) => {
          return this.selectMany(this.byBrackets, ["()"], event);
        },
        "super-select:select-square-brackets": (event) => {
          return this.selectMany(this.byBrackets, ["[]"], event);
        },
        "super-select:select-curly-braces": (event) => {
          return this.selectMany(this.byBrackets, ["{}"], event);
        },
        "super-select:select-angle-brackets": (event) => {
          return this.selectMany(this.byBrackets, ["<>"], event);
        },
        "super-select:html-body": {
          description: "Select the enclosing HTML element, including its tags.",
          didDispatch: (event) => {
            return this.selectMany(this.htmlBody, undefined, event);
          },
        },
        "super-select:html-tags": {
          description: "Select the enclosing HTML tag along with what it holds.",
          didDispatch: (event) => this.selectMany(this.htmlTags, undefined, event),
        },
      }),
      lumine.commands.add("lumine-text-editor:not([readonly])", {
        "super-select:normalize": {
          description: "Rewrite the selected path to one kind of slash throughout.",
          didDispatch: (event) => {
            return this.slashWorker(undefined, event);
          },
        },
        "super-select:double-backslash": {
          description: "Rewrite the selected path with doubled backslashes.",
          didDispatch: (event) => {
            return this.slashWorker(1, event);
          },
        },
        "super-select:backslash": {
          description: "Rewrite the selected path with backslashes.",
          didDispatch: (event) => {
            return this.slashWorker(2, event);
          },
        },
        "super-select:forward-slash": {
          description: "Rewrite the selected path with forward slashes.",
          didDispatch: (event) => {
            return this.slashWorker(3, event);
          },
        },
      }),
    );
  },

  /**
   * Deactivates the package and disposes subscriptions.
   */
  deactivate() {
    this.active = false;
    this.disposables?.dispose();
  },

  /**
   * Gets the editor these commands act on.
   * @returns {TextEditor|undefined} The editor the user is typing in
   */
  getActiveTextEditor(event) {
    return lumine.workspace.getTextEditorForElement(event?.target, { includeMini: true });
  },

  selectMany(func, symbols, event) {
    const editor = this.getActiveTextEditor(event);
    if (!editor) return;
    const kind =
      func === this.byChar
        ? "chars"
        : func === this.byString
          ? "quotes"
          : func === this.byBrackets
            ? "brackets"
            : "html";
    return this._select(
      editor,
      editor.getCursors(),
      kind,
      kind === "html" ? func === this.htmlTags : symbols,
    );
  },

  _guard(editor) {
    const buffer = editor.getBuffer(),
      revision = buffer.getTextRevision();
    const ranges = editor.getSelectedBufferRanges();
    const generation = (this.generations.get(editor) ?? 0) + 1;
    this.generations.set(editor, generation);
    return () =>
      this.active &&
      !editor.isDestroyed() &&
      buffer.getTextRevision() === revision &&
      this.generations.get(editor) === generation &&
      editor.getSelectedBufferRanges().length === ranges.length &&
      editor.getSelectedBufferRanges().every((range, index) => range.isEqual(ranges[index]));
  },

  _settle(value) {
    if (!value?.then) return value;
    return value.catch((error) => {
      if (error.name !== "AbortError" && error.code !== "ERR_STALE_EDIT")
        lumine.notifications.addError("Super Select", {
          detail: `${error.message}${error.committed ? " The edit was committed; Undo remains available." : ""}`,
          dismissable: true,
        });
      return false;
    });
  },

  _select(editor, cursors, kind, symbols) {
    const current = this._guard(editor),
      source = editor.getBuffer().getTextSnapshot();
    const compute = function* () {
      const results = [];
      for (const cursor of cursors)
        results.push(
          yield* operations[kind](source, source.offsetAt(cursor.getBufferPosition()), symbols),
        );
      return results;
    };
    const publish = (results) => {
      if (!current()) return false;
      for (let i = 0; i < cursors.length; i++) {
        const ranges = results[i];
        if (!ranges || cursors[i].isDestroyed()) continue;
        cursors[i].setBufferPosition(source.positionAt(ranges[0][0]));
        cursors[i].selection.selectToBufferPosition(source.positionAt(ranges[0][1]));
        for (const [start, end] of ranges.slice(1))
          editor.addSelectionForBufferRange([source.positionAt(start), source.positionAt(end)]);
      }
      return true;
    };
    try {
      const result = operations.run(compute(), current);
      return this._settle(result?.then ? result.then(publish) : publish(result));
    } catch (error) {
      return this._settle(Promise.reject(error));
    }
  },

  byChar(editor, cursor, symbols) {
    return this._select(editor, [cursor], "chars", symbols);
  },
  byString(editor, cursor, symbols) {
    return this._select(editor, [cursor], "quotes", symbols);
  },
  byBrackets(editor, cursor, symbols) {
    return this._select(editor, [cursor], "brackets", symbols);
  },
  htmlBody(editor, cursor) {
    return this._select(editor, [cursor], "html", false);
  },
  htmlTags(editor, cursor) {
    return this._select(editor, [cursor], "html", true);
  },

  slashWorker(mode, event) {
    try {
      return this._slashWorker(mode, event);
    } catch (error) {
      return this._settle(Promise.reject(error));
    }
  },

  _slashWorker(mode, event) {
    const editor = this.getActiveTextEditor(event);
    if (!editor || editor.isReadOnly()) return;
    const buffer = editor.getBuffer(),
      originalCurrent = this._guard(editor),
      source = buffer.getTextSnapshot();
    const current = () => originalCurrent() && !editor.isReadOnly();
    const selections = editor.getSelectedBufferRanges().sort((a, b) => a.compare(b));
    const offsets = selections.map((range) => [
      source.offsetAt(range.start),
      source.offsetAt(range.end),
    ]);
    const iterator = operations.slashEdits(source, offsets, mode);
    const units = offsets.reduce((sum, [start, end]) => sum + end - start, 0);
    if (units <= 65536 && selections.length <= 128) {
      const edits = Array.from(iterator).flat();
      if (!edits.length) return;
      return buffer.setTextInIndependentRanges(edits, { normalizeLineEndings: false });
    }
    const input = async function* () {
      let deadline = performance.now() + 4;
      for (const batch of iterator) {
        if (performance.now() >= deadline) {
          await new Promise((resolve) => setTimeout(resolve, 0));
          deadline = performance.now() + 4;
        }
        yield batch;
      }
    };
    return this._settle(
      buffer.applyTextEdits(input(), {
        expectedRevision: buffer.getTextRevision(),
        isCurrent: current,
      }),
    );
  },
};
