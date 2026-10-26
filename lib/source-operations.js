function abort() {
  return Object.assign(new Error("The operation was superseded"), { name: "AbortError" });
}

function run(iterator, isCurrent = () => true) {
  function step() {
    let deadline = performance.now() + 4;
    for (;;) {
      if (!isCurrent()) throw abort();
      const item = iterator.next();
      if (item.done) return item.value;
      if (performance.now() >= deadline)
        return new Promise((resolve) => setTimeout(resolve, 0)).then(step);
    }
  }
  return step();
}

function reader(source) {
  let start = -1,
    text = "";
  return (offset) => {
    if (offset < 0 || offset >= source.length) return "";
    if (offset < start || offset >= start + text.length) {
      start = Math.floor(offset / 16384) * 16384;
      text = source.slice(start, Math.min(source.length, start + 16384));
    }
    return text[offset - start];
  };
}

function* chars(source, offset, symbols) {
  const read = reader(source),
    pattern = new RegExp(symbols, "u"),
    fullBlock = new RegExp(`^(?:${symbols})+$`, "u");
  const row = source.positionAt(offset).row;
  const begin = source.lineStart(row);
  let end = row + 1 < source.lineCount ? source.lineStart(row + 1) - 1 : source.length;
  if (read(end - 1) === "\r" && row + 1 < source.lineCount) end--;
  let left = offset,
    right,
    work = 0,
    leftBoundaryBlock = false,
    rightBoundaryBlock = false;
  if (/[\uDC00-\uDFFF]/u.test(read(left)) && /[\uD800-\uDBFF]/u.test(read(left - 1))) left--;
  right = left;
  while (left > begin) {
    if (!leftBoundaryBlock) {
      let blockStart = Math.max(begin, left - 16384);
      if (
        /[\uDC00-\uDFFF]/u.test(read(blockStart)) &&
        /[\uD800-\uDBFF]/u.test(read(blockStart - 1))
      )
        blockStart++;
      if (blockStart < left && fullBlock.test(source.slice(blockStart, left))) {
        left = blockStart;
        yield;
        continue;
      }
      leftBoundaryBlock = true;
    }
    let previous = left - 1;
    if (/[\uDC00-\uDFFF]/u.test(read(previous)) && /[\uD800-\uDBFF]/u.test(read(previous - 1)))
      previous--;
    const text = read(previous) + (previous + 1 < left ? read(previous + 1) : "");
    if (!pattern.test(text)) break;
    left = previous;
    if (++work % 2048 === 0) yield;
  }
  while (right < end) {
    if (!rightBoundaryBlock) {
      let blockEnd = Math.min(end, right + 16384);
      if (/[\uDC00-\uDFFF]/u.test(read(blockEnd)) && /[\uD800-\uDBFF]/u.test(read(blockEnd - 1)))
        blockEnd--;
      if (blockEnd > right && fullBlock.test(source.slice(right, blockEnd))) {
        right = blockEnd;
        yield;
        continue;
      }
      rightBoundaryBlock = true;
    }
    const text =
      read(right) +
      (/[\uD800-\uDBFF]/u.test(read(right)) && /[\uDC00-\uDFFF]/u.test(read(right + 1))
        ? read(right + 1)
        : "");
    if (!pattern.test(text)) break;
    right += text.length;
    if (++work % 2048 === 0) yield;
  }
  return [[left, right]];
}

function* quotes(source, offset, symbols) {
  const expression = typeof symbols === "string" ? symbols : symbols.source;
  const allowed = [...new Set([...expression].filter((char) => "\"'`".includes(char)))];
  let upper = offset,
    opening,
    symbol;
  while (upper > 0) {
    const lower = Math.max(0, upper - 16384),
      text = source.slice(lower, upper);
    const found = Math.max(...allowed.map((char) => text.lastIndexOf(char)));
    if (found < 0) {
      upper = lower;
      yield;
      continue;
    }
    const char = text[found],
      end = lower + found + 1;
    let start = end;
    const tail = new RegExp(`${char}+$`);
    while (start > 0) {
      const begin = Math.max(0, start - 16384),
        block = source.slice(begin, start);
      const width = tail.exec(block)?.[0].length ?? 0;
      start -= width;
      yield;
      if (width < block.length) break;
    }
    const length = end - start,
      triple = expression.includes(char.repeat(3)),
      onlyTriple = expression === char.repeat(3);
    if (onlyTriple && length < 3) {
      upper = start;
      continue;
    }
    if (triple && (onlyTriple || length % 3 === 0)) {
      opening = start + Math.floor(length / 3) * 3;
      symbol = char.repeat(3);
    } else {
      opening = end;
      symbol = char;
    }
    break;
  }
  if (opening === undefined) return null;
  for (let start = opening; start < source.length; start += 16384) {
    const index = source
      .slice(start, Math.min(source.length, start + 16384 + symbol.length - 1))
      .indexOf(symbol);
    if (index >= 0) return [[opening, start + index]];
    yield;
  }
  return null;
}

function* positions(source, start, end, characters, backwards) {
  const escaped = characters.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`[${escaped}]`, "g");
  while (start < end) {
    const lower = backwards ? Math.max(start, end - 4096) : start;
    const upper = backwards ? end : Math.min(end, start + 4096);
    const text = source.slice(lower, upper);
    if (backwards) {
      const offsets = Array.from(text.matchAll(pattern), (match) => match.index);
      for (let index = offsets.length - 1; index >= 0; index--)
        yield { index: lower + offsets[index], char: text[offsets[index]] };
      end = lower;
    } else {
      for (const match of text.matchAll(pattern))
        yield { index: lower + match.index, char: match[0] };
      start = upper;
    }
    yield null;
  }
}

function* brackets(source, offset, pairs) {
  const counts = pairs.map(() => 0);
  let opening, pair;
  for (const match of positions(source, 0, offset, pairs.join(""), true)) {
    if (!match) {
      yield;
      continue;
    }
    for (let i = 0; i < pairs.length; i++) {
      if (match.char === pairs[i][0]) {
        if (counts[i] === 0) {
          opening = match.index + 1;
          pair = pairs[i];
          break;
        }
        counts[i]++;
      } else if (match.char === pairs[i][1]) counts[i]--;
    }
    if (opening !== undefined) break;
  }
  if (opening === undefined) return null;
  let depth = 0;
  for (const match of positions(source, opening, source.length, pair, false)) {
    if (!match) {
      yield;
      continue;
    }
    if (match.char === pair[0]) depth++;
    else if (depth === 0) return [[opening, match.index]];
    else depth--;
  }
  return null;
}

function* slashRuns(source, start, end) {
  let pending,
    offset = start;
  for (const text of source.subtext(start, end).chunks()) {
    const expression = /\\+|\/+/g;
    for (let match; (match = expression.exec(text));) {
      const begin = offset + match.index,
        finish = begin + match[0].length,
        char = match[0][0];
      if (pending && pending.end === begin && pending.char === char) pending.end = finish;
      else {
        if (pending) yield pending;
        pending = { start: begin, end: finish, char };
      }
    }
    offset += text.length;
    if (pending && pending.end < offset) {
      yield pending;
      pending = null;
    }
    yield null;
  }
  if (pending) yield pending;
}

function* slashEdits(source, selections, requestedMode) {
  let batch = [];
  for (const [start, end] of selections) {
    let mode = requestedMode;
    for (const run of slashRuns(source, start, end)) {
      if (!run) {
        yield batch.splice(0);
        continue;
      }
      mode ||= run.char === "/" ? 3 : run.end - run.start >= 2 ? 1 : 2;
      if (mode === 3 && run.char === "/") continue;
      const replacement = mode === 1 ? "\\\\" : mode === 2 ? "\\" : "/";
      if (run.end - run.start !== replacement.length || run.char !== replacement[0])
        batch.push({
          range: [source.positionAt(run.start), source.positionAt(run.end)],
          text: replacement,
        });
      if (batch.length === 64) yield batch.splice(0);
    }
  }
  if (batch.length) yield batch;
}

const voidTags = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

function* tags(source) {
  const read = reader(source);
  let work = 0;
  for (let index = 0; index < source.length;) {
    if (read(index) !== "<") {
      const block = source.slice(index, Math.min(source.length, index + 16384));
      const next = block.indexOf("<");
      index += next < 0 ? block.length : next;
      yield null;
      continue;
    }
    const start = index++;
    if (source.slice(start, Math.min(source.length, start + 4)) === "<!--") {
      index = start + 4;
      while (
        index < source.length &&
        !(read(index - 2) === "-" && read(index - 1) === "-" && read(index) === ">")
      ) {
        index++;
        if (++work % 2048 === 0) yield null;
      }
      index++;
      continue;
    }
    while (/\s/u.test(read(index)) && index < source.length) {
      index++;
      if (++work % 2048 === 0) yield null;
    }
    const closing = read(index) === "/";
    if (closing) index++;
    while (/\s/u.test(read(index)) && index < source.length) {
      index++;
      if (++work % 2048 === 0) yield null;
    }
    const nameStart = index;
    while (/[\w:.-]/u.test(read(index)) && index < source.length) {
      index++;
      if (++work % 2048 === 0) yield null;
    }
    const nameEnd = index;
    if (nameStart === nameEnd) continue;
    let quote = "";
    for (; index < source.length; index++) {
      const char = read(index);
      if (quote) {
        if (char === quote) quote = "";
      } else if (char === '"' || char === "'") quote = char;
      else if (char === ">") break;
      if (++work % 2048 === 0) yield null;
    }
    if (index >= source.length) return;
    const name = nameEnd - nameStart <= 16 ? source.slice(nameStart, nameEnd).toLowerCase() : "";
    const empty = read(index - 1) === "/" || voidTags.has(name);
    yield { start, end: ++index, nameStart, nameEnd, closing, empty };
  }
}

function* html(source, offset, separate) {
  let depth = 0;
  for (const tag of tags(source)) {
    if (!tag) {
      yield;
      continue;
    }
    if (tag.start >= offset) break;
    if (!tag.empty) depth = Math.max(0, depth + (tag.closing ? -1 : 1));
  }
  if (!depth) return null;
  const target = depth - 1;
  depth = 0;
  let opening;
  for (const tag of tags(source)) {
    if (!tag) {
      yield;
      continue;
    }
    if (tag.empty) continue;
    if (tag.closing) {
      depth = Math.max(0, depth - 1);
      if (opening && tag.start >= offset && depth === target) {
        if (opening.nameEnd - opening.nameStart !== tag.nameEnd - tag.nameStart) return null;
        for (
          let a = opening.nameStart, b = tag.nameStart;
          a < opening.nameEnd;
          a += 16384, b += 16384
        ) {
          if (
            source.slice(a, Math.min(opening.nameEnd, a + 16384)).toLowerCase() !==
            source.slice(b, Math.min(tag.nameEnd, b + 16384)).toLowerCase()
          )
            return null;
          yield;
        }
        return separate
          ? [
              [opening.start, opening.end],
              [tag.start, tag.end],
            ]
          : [[opening.start, tag.end]];
      }
    } else {
      if (tag.start < offset && depth === target) opening = tag;
      depth++;
    }
  }
  return null;
}

module.exports = { run, reader, chars, quotes, brackets, slashEdits, html };
