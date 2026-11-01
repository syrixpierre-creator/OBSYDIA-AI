import { describe, expect, it } from "vitest";
import { extractJson, parseFileBlocks } from "../src/services/projects/fileFormat.js";
import { findPreviewEntry, validateProjectFiles } from "../src/services/projects/validate.js";

describe("project file protocol", () => {
  it("parses files, deletions and strips fences", () => {
    const out = parseFileBlocks(
      "Intro\n<<<FILE: src/app.js>>>\n```js\nconsole.log(1)\n```\n<<<END FILE>>>\n<<<FILE: index.html>>>\n<p>x</p>\n<<<END FILE>>>\n<<<DELETE: old.css>>>"
    );
    expect(out.files.map((f) => f.path)).toEqual(["src/app.js", "index.html"]);
    expect(out.files[0]!.content).toBe("console.log(1)\n");
    expect(out.deletes).toEqual(["old.css"]);
  });

  it("refuses traversal and secret files", () => {
    const out = parseFileBlocks(
      "<<<FILE: ../etc/passwd>>>\nx\n<<<END FILE>>>\n<<<FILE: .env>>>\nSECRET=1\n<<<END FILE>>>\n<<<FILE: .env.production>>>\nSECRET=1\n<<<END FILE>>>\n<<<FILE: .env.example>>>\nKEY=\n<<<END FILE>>>"
    );
    expect(out.files.map((f) => f.path)).toEqual([".env.example"]);
  });

  it("extracts JSON from prose or fences", () => {
    expect(extractJson('Sure:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('plan {"files":[]} done')).toEqual({ files: [] });
    expect(extractJson("nothing")).toBeNull();
  });
});

describe("project validation", () => {
  it("detects syntax errors, invalid JSON, missing assets and placeholders", () => {
    const r = validateProjectFiles([
      { path: "index.html", content: '<link href="style.css"><script src="js/app.js"></script><img src="https://x/y.png">' },
      { path: "js/app.js", content: "function ( {" },
      { path: "package.json", content: "{bad" },
      { path: "lib.js", content: "// ... rest of code here" }
    ]);
    expect(r.ok).toBe(false);
    expect(r.issues.join("\n")).toMatch(/style\.css/);
    expect(r.issues.join("\n")).toMatch(/js\/app\.js: JavaScript syntax error/);
    expect(r.issues.join("\n")).toMatch(/package\.json: invalid JSON/);
    expect(r.issues.join("\n")).toMatch(/placeholder/);
  });

  it("accepts valid ES modules and scripts", () => {
    const r = validateProjectFiles([
      { path: "index.html", content: '<script type="module" src="main.js"></script>' },
      { path: "main.js", content: "import x from 'https://esm.sh/x';\nexport const a = 1;" },
      { path: "server.cjs", content: "const http = require('http'); module.exports = http;" }
    ]);
    expect(r).toEqual({ ok: true, issues: [] });
  });

  it("finds preview entry points", () => {
    expect(findPreviewEntry(["src/a.ts", "preview/index.html"])).toBe("preview/index.html");
    expect(findPreviewEntry(["index.html", "public/index.html"])).toBe("index.html");
    expect(findPreviewEntry(["server.js"])).toBeNull();
  });
});
