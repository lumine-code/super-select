# super-select

Text selection helpers and slash normalization commands.

## Features

- **String selection**: select text inside quotes.
- **Bracket selection**: select text inside brackets.
- **Character patterns**: select by custom character sets.
- **Slash normalization**: convert path separators to forward slash, backslash or double backslash.
- **HTML selection**: select HTML body or tags.

## Installation

To install `super-select` search for it in the Install pane of the Lumine settings, or run the command `lumine --install lumine-code/super-select`.

## Commands

Commands available in `lumine-workspace`:

- `super-select:chars-1`: select text by chars `/[0-9\\p{L}_\\.]/`,
- `super-select:chars-2`: select text by chars `/[0-9\\p{L}_\\.\\-\\[\\]\\(\\)#]/`,
- `super-select:string`: select text inside `'''`, `"""`, `'`, `"` or backticks,
- `super-select:string-'-'`: select text inside `'''` or `'`,
- `super-select:string-'''-'''`: select text inside `'''`,
- `super-select:string-\`-\``: select text inside backticks,
- `super-select:string-"-"`: select text inside `"""` or `"`,
- `super-select:string-"""-"""`: select text inside `"""`,
- `super-select:brackets`: select text inside `()`, `[]`, `{}` or `<>`,
- `super-select:brackets-(-)`: select text inside `()`,
- `super-select:brackets-[-]`: select text inside `[]`,
- `super-select:brackets-{-}`: select text inside `{}`,
- `super-select:brackets-<->`: select text inside `<>`,
- `super-select:normalize`: convert slashes to match the most left slash inside selection,
- `super-select:double-backslash`: convert slashes to `\\` inside selection,
- `super-select:backslash`: convert slashes to `\` inside selection,
- `super-select:forward-slash`: convert slashes to `/` inside selection,
- `super-select:html-body`: select html body,
- `super-select:html-tags`: select html tags.

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
