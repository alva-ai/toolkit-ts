# Task List: fs.read() JSON decode

## Task 1: Add decode tests to fs.test.ts

**Complexity:** simple
**Dependencies:** none

**Files:** `test/resources/fs.test.ts`

**What to do:** Add 5 test cases to the existing `describe('read', ...)` block.
Mock `_request` to return different values (ArrayBuffer with JSON, text,
binary, non-ArrayBuffer passthrough, empty). All tests should fail initially
since the decode logic doesn't exist yet.

**Steps:**

- [ ] Write 5 test cases per the test plan table in section 5
- [ ] Run `npm test`, verify all 5 fail (read() returns ArrayBuffer, not parsed)
- [ ] Commit test file only

## Task 2: Implement decode logic in fs.ts

**Complexity:** simple
**Dependencies:** Task 1

**Files:** `src/resources/fs.ts`

**What to do:** In `read()`, after getting the result from `_request`, add
post-processing: if result is `ArrayBuffer`, try `TextDecoder({ fatal: true })`
→ try `JSON.parse` → return parsed. Catch at each level falls through to the
next-best return value.

Pseudocode:

```
const result = await this.client._request(...)
if (!(result instanceof ArrayBuffer)) return result
try {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(result)
  try { return JSON.parse(text) } catch { return text }
} catch { return result }
```

**Steps:**

- [ ] Implement the decode logic in `read()`
- [ ] Run `npm test`, verify all 5 new tests pass
- [ ] Run existing tests, verify none break
- [ ] Build check: `npm run build`

---

**Dependency graph:**

```
Task 1 (tests) → Task 2 (implementation)
```

Serial execution. Two tasks total.
