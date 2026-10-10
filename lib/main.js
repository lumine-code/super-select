const { CompositeDisposable, Point } = require("lumine");

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
    this.disposables.add(
      // On the workspace: the application menu dispatches at whatever holds
      // focus, so an editor scope left every one of these menu items dead
      // whenever focus was elsewhere. Each handler resolves the editor itself.
      lumine.commands.add("lumine-workspace", {
        "super-select:chars-1": {
          description: "Select the run of word characters and dots around the cursor.",
          didDispatch: () => {
            return this.selectMany(this.byChar, "[0-9\\p{L}_\\.]");
          },
        },
        "super-select:chars-2": {
          description: "Select a wider run of characters around the cursor.",
          didDispatch: () => {
            return this.selectMany(this.byChar, "[0-9\\p{L}_\\.\\-\\[\\]\\(\\)#]");
          },
        },
        "super-select:string": {
          description: "Select what the nearest pair of quotes encloses.",
          didDispatch: () => {
            return this.selectMany(this.byString, /("""|'''|"|'|`)/);
          },
        },
        "super-select:select-single-quoted-string": {
          description: "Select what the nearest pair of single quotes encloses.",
          didDispatch: () => {
            return this.selectMany(this.byString, "('''|')");
          },
        },
        "super-select:select-triple-single-quoted-string": {
          description: "Select what the nearest pair of triple single quotes holds.",
          didDispatch: () => {
            return this.selectMany(this.byString, "'''");
          },
        },
        "super-select:select-double-quoted-string": {
          description: "Select what the nearest pair of double quotes encloses.",
          didDispatch: () => {
            return this.selectMany(this.byString, '("""|")');
          },
        },
        "super-select:select-triple-double-quoted-string": {
          description: "Select what the nearest pair of triple double quotes holds.",
          didDispatch: () => {
            return this.selectMany(this.byString, '"""');
          },
        },
        "super-select:select-backtick-string": {
          description: "Select what the nearest pair of backticks encloses.",
          didDispatch: () => {
            return this.selectMany(this.byString, "`");
          },
        },
        "super-select:brackets": {
          description: "Select what the nearest pair of brackets encloses.",
          didDispatch: () => {
            return this.selectMany(this.byBrackets, ["()", "[]", "{}", "<>"]);
          },
        },
        "super-select:select-parentheses": () => {
          return this.selectMany(this.byBrackets, ["()"]);
        },
        "super-select:select-square-brackets": () => {
          return this.selectMany(this.byBrackets, ["[]"]);
        },
        "super-select:select-curly-braces": () => {
          return this.selectMany(this.byBrackets, ["{}"]);
        },
        "super-select:select-angle-brackets": () => {
          return this.selectMany(this.byBrackets, ["<>"]);
        },
        "super-select:normalize": {
          description: "Rewrite the selected path to one kind of slash throughout.",
          didDispatch: () => {
            return this.slashWorker();
          },
        },
        "super-select:double-backslash": {
          description: "Select the path segment between doubled backslashes.",
          didDispatch: () => {
            return this.slashWorker(1);
          },
        },
        "super-select:backslash": {
          description: "Select the path segment between backslashes.",
          didDispatch: () => {
            return this.slashWorker(2);
          },
        },
        "super-select:forward-slash": {
          description: "Select the path segment between forward slashes.",
          didDispatch: () => {
            return this.slashWorker(3);
          },
        },
        "super-select:html-body": {
          description: "Select what the enclosing HTML tag holds, without the tags.",
          didDispatch: () => {
            return this.selectMany(this.htmlBody.bind(this));
          },
        },
        "super-select:html-tags": {
          description: "Select the enclosing HTML tag along with what it holds.",
          didDispatch: () => this.selectMany(this.htmlTags.bind(this)),
        },
      }),
    );
  },

  /**
   * Deactivates the package and disposes subscriptions.
   */
  deactivate() {
    this.disposables.dispose();
  },

  /**
   * Gets the editor these commands act on.
   * @returns {TextEditor|undefined} The editor the user is typing in
   */
  getActiveTextEditor() {
    // Resolve the editor under focus, not merely the active pane item: these
    // commands also act on UI inputs such as find fields, go to line, and
    // commit boxes. Resolution walks outward from focus, so a nested editor
    // wins over the one hosting it. Registration controls observation, not
    // whether an existing editor element can be targeted.
    //
    // The workspace is still the fallback, for the application menu: it
    // dispatches at whatever holds focus, which is not always an editor.
    return (
      lumine.workspace.getFocusedTextEditor() ?? lumine.workspace.getActiveTextEditor() ?? undefined
    );
  },

  selectMany(func, symbols) {
    let editor = this.getActiveTextEditor();
    if (!editor) {
      return;
    }
    let cursors = editor.getCursors();
    for (let cursor of cursors) {
      func(editor, cursor, symbols);
    }
  },

  /**
   * Selects text by matching characters against a regex pattern.
   * @param {TextEditor} editor - The text editor
   * @param {Cursor} cursor - The cursor to select from
   * @param {string} symbols - Regex pattern for valid characters
   */
  byChar(editor, cursor, symbols) {
    let iA = null;
    let re = new RegExp(symbols, "u");
    let curPos = cursor.getBufferPosition();
    let lineText = editor.lineTextForBufferRow(curPos.row);
    // Match Unicode code points while keeping Core's buffer columns in UTF-16.
    const characters = [];
    let column = 0;
    for (const text of lineText) {
      characters.push({ text, start: column, end: column + text.length });
      column += text.length;
    }
    const leftIndex = Math.max(
      0,
      characters.findLastIndex((character) => character.start < curPos.column),
    );
    for (let i = leftIndex; i >= 0; i--) {
      const character = characters[i];
      if (!character) return;
      if (!character.text.match(re)) {
        iA = character.end;
        break;
      } else if (i === 0) {
        iA = 0;
        break;
      }
    }
    if (iA === null) {
      return;
    }
    let iB = lineText.length;
    const rightIndex = characters.findIndex((character) => character.end > curPos.column);
    for (let i = rightIndex; i >= 0 && i < characters.length; i++) {
      const character = characters[i];
      if (!character.text.match(re)) {
        iB = character.start;
        break;
      }
    }
    cursor.setBufferPosition([curPos.row, iA]);
    cursor.selection.selectToBufferPosition([curPos.row, iB]);
  },

  byString(editor, cursor, symbols) {
    let pointA, pointB, symbol, curPos;
    curPos = cursor.getBufferPosition();
    editor.backwardsScanInBufferRange(symbols, [Point.ZERO, curPos], (obj) => {
      pointA = obj.range.end;
      symbol = obj.matchText;
      obj.stop();
    });
    if (!pointA) {
      return;
    }
    editor.scanInBufferRange(symbol, [pointA, Point.INFINITY], (obj) => {
      pointB = obj.range.start;
      obj.stop();
    });
    if (!pointB) {
      return;
    }
    cursor.setBufferPosition(pointA);
    cursor.selection.selectToBufferPosition(pointB);
  },

  /**
   * Selects text within matching brackets.
   * @param {TextEditor} editor - The text editor
   * @param {Cursor} cursor - The cursor to select from
   * @param {string[]} symbols - Array of bracket pairs (e.g., ['()', '[]'])
   */
  byBrackets(editor, cursor, symbols) {
    let pointA, pointB, symbolA, symbolB, count, curPos, re;
    count = symbols.reduce((a, b) => ((a[b] = 0), a), {});
    curPos = cursor.getBufferPosition();
    re = new RegExp(
      "[" +
        Object.keys(count)
          .map(function (key) {
            return `\\${key[0]}\\${key[1]}`;
          })
          .join("") +
        "]",
      "g",
    );
    editor.backwardsScanInBufferRange(re, [Point.ZERO, curPos], (obj) => {
      for (let key in count) {
        if (obj.matchText === key[0]) {
          if (count[key] === 0) {
            pointA = obj.range.end;
            symbolA = key[0];
            symbolB = key[1];
            obj.stop();
          }
          count[key]++;
          break;
        } else if (obj.matchText === key[1]) {
          count[key]--;
          break;
        }
      }
    });
    if (!pointA) {
      return;
    }
    count = 0;
    editor.scanInBufferRange(
      new RegExp(`(\\${symbolA}|\\${symbolB})`, "g"),
      [pointA, Point.INFINITY],
      (obj) => {
        if (obj.matchText === symbolA) {
          count = count + 1;
        } else if (count === 0) {
          pointB = obj.range.start;
          symbolB = obj.matchText;
          obj.stop();
        } else if (obj.matchText === symbolB) {
          count = count - 1;
        }
      },
    );
    if (!pointB) {
      return;
    }
    cursor.setBufferPosition(pointA);
    cursor.selection.selectToBufferPosition(pointB);
  },

  /**
   * Normalizes or converts path slashes in selected text.
   * @param {number} mode - Slash mode: 1=\\, 2=\, 3=/
   */
  slashWorker(mode) {
    let editor = this.getActiveTextEditor();
    if (!editor) {
      return;
    }
    let selections = editor.getSelections();
    return editor.transact(() => {
      for (let selection of selections) {
        const range = selection.getBufferRange();
        if (range.isEmpty()) continue;
        let text = selection.getText();
        let selectedMode = mode;
        if (!selectedMode) {
          selectedMode = 0;
          editor.scanInBufferRange(/(\\\\|\\|\/)/, range, (obj) => {
            if (obj.matchText === "\\\\") {
              selectedMode = 1;
            } else if (obj.matchText === "\\") {
              selectedMode = 2;
            } else if (obj.matchText === "/") {
              selectedMode = 3;
            }
            obj.stop();
          });
        }
        if (selectedMode === 1) {
          text = text.replace(/(\/+|\\+)/g, "\\\\");
        } else if (selectedMode === 2) {
          text = text.replace(/(\\+|\/+)/g, "\\");
        } else if (selectedMode === 3) {
          text = text.replace(/(\\+)/g, "/");
        } else {
          continue;
        }
        selection.insertText(text, { select: true });
      }
    });
  },

  /**
   * Finds matching HTML tags and invokes a callback with the results.
   * @param {TextEditor} editor - The text editor
   * @param {Cursor} cursor - The cursor position
   * @param {Function} func - Callback invoked with (startTag, endTag) objects
   */
  htmlFind(editor, cursor, func) {
    let count = 0;
    let type;
    editor.backwardsScanInBufferRange(
      /< *\/(\w+)|< *(\w*).*>/g,
      [Point.ZERO, cursor.getCurrentWordBufferRange().end],
      (objStart) => {
        if (objStart.match[1]) {
          count++;
        } else if (count === 0) {
          objStart.stop();
          type = objStart.match[2].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          editor.scanInBufferRange(
            new RegExp("< *(" + type + ")|< *\\/ *" + type + ">", "g"),
            [objStart.range.end, Point.INFINITY],
            (objEnd) => {
              if (objEnd.match[1]) {
                count++;
              } else if (count === 0) {
                func(objStart, objEnd);
                objEnd.stop();
              } else {
                count--;
              }
            },
          );
        } else {
          count--;
        }
      },
    );
  },

  /**
   * Selects the body of an HTML element (including tags).
   * @param {TextEditor} editor - The text editor
   * @param {Cursor} cursor - The cursor position
   */
  htmlBody(editor, cursor) {
    this.htmlFind(editor, cursor, (objStart, objEnd) => {
      cursor.setBufferPosition(objStart.range.start);
      cursor.selection.selectToBufferPosition(objEnd.range.end);
    });
  },

  /**
   * Selects only the HTML tags (start and end) as multiple selections.
   * @param {TextEditor} editor - The text editor
   * @param {Cursor} cursor - The cursor position
   */
  htmlTags(editor, cursor) {
    this.htmlFind(editor, cursor, (objStart, objEnd) => {
      cursor.setBufferPosition(objStart.range.start);
      cursor.selection.selectToBufferPosition(objStart.range.end);
      editor.addSelectionForBufferRange(objEnd.range);
    });
  },
};
