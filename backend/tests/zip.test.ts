import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import yazl from "yazl";
import { inspectZip, sniff, detectUpload, safeRelativePath, zipSummary } from "../src/services/files.js";
import { writeZip } from "../src/services/artifacts.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "obs-zip-"));

function makeZip(name: string, build: (z: yazl.ZipFile) => void): Promise<string> {
  const p = path.join(dir, name);
  const z = new yazl.ZipFile();
  build(z);
  z.end();
  return new Promise((resolve) => z.outputStream.pipe(fs.createWriteStream(p)).on("close", () => resolve(p)));
}

describe("ZIP safety", () => {
  it("inspects a normal project and detects technologies", async () => {
    const p = await makeZip("ok.zip", (z) => {
      z.addBuffer(Buffer.from(JSON.stringify({ name: "x", dependencies: { react: "1", express: "1" } })), "proj/package.json");
      z.addBuffer(Buffer.from("<h1>x</h1>"), "proj/index.html");
      z.addBuffer(Buffer.from("module.exports=1"), "proj/node_modules/a/index.js");
    });
    const r = await inspectZip(p);
    expect(r.rootPrefix).toBe("proj/");
    expect(r.entries.map((e) => e.path).sort()).toEqual(["index.html", "package.json"]);
    expect(r.skipped).toBe(1);
    expect(r.technologies).toEqual(expect.arrayContaining(["Node.js", "React", "Express", "HTML"]));
    expect(zipSummary(r)).toContain("--- package.json ---");
  });

  it("rejects path traversal", async () => {
    const p = await makeZip("trav.zip", (z) => z.addBuffer(Buffer.from("x"), "aa/b.txt"));
    const buf = fs.readFileSync(p);
    const patched = Buffer.from(buf.toString("latin1").split("aa/b.txt").join("../b.txt").slice(0), "latin1");
    const evil = path.join(dir, "evil.zip");
    fs.writeFileSync(evil, patched.length === buf.length ? patched : buf);
    await expect(inspectZip(evil)).rejects.toMatchObject({ code: expect.stringMatching(/zip_path_traversal|invalid_zip/) });
    expect(safeRelativePath("../x")).toBeNull();
    expect(safeRelativePath("/etc/passwd")).toBeNull();
    expect(safeRelativePath("C:\\x")).toBeNull();
    expect(safeRelativePath("a/./b//c.txt")).toBe("a/b/c.txt");
  });

  it("rejects symlinks", async () => {
    const p = await makeZip("link.zip", (z) => z.addBuffer(Buffer.from("/etc/passwd"), "link", { mode: 0o120777 }));
    await expect(inspectZip(p)).rejects.toMatchObject({ code: "zip_symlink" });
  });

  it("rejects compression bombs and oversize archives", async () => {
    const p = await makeZip("bomb.zip", (z) => z.addBuffer(Buffer.alloc(30 * 1024 * 1024, 0), "zeros.txt"));
    await expect(inspectZip(p)).rejects.toMatchObject({ code: "zip_bomb" });
    const big = await makeZip("big.zip", (z) => z.addBuffer(Buffer.alloc(3 * 1024 * 1024, 7), "x.bin", { compress: false }));
    await expect(inspectZip(big, { maxTotalBytes: 1024 * 1024 })).rejects.toMatchObject({ code: "zip_too_large" });
  });

  it("rejects archives with too many entries", async () => {
    const p = await makeZip("many.zip", (z) => {
      for (let i = 0; i < 30; i++) z.addBuffer(Buffer.from("x"), `f${i}.txt`);
    });
    await expect(inspectZip(p, { maxEntries: 10 })).rejects.toMatchObject({ code: "zip_too_many_entries" });
  });

  it("writes artifacts that preserve folder structure", async () => {
    const target = path.join(dir, "out", "v1.zip");
    const files = [
      { path: "README.md", content: "# Hi" },
      { path: "src/index.js", content: "export default 1;" },
      { path: ".env.example", content: "KEY=" },
      { path: "assets/logo.png", content: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"), encoding: "base64" }
    ];
    const meta = await writeZip(target, "my-app", files);
    expect(meta.size).toBeGreaterThan(100);
    const r = await inspectZip(target);
    expect(r.rootPrefix).toBe("my-app/");
    expect(r.entries.map((e) => e.path).sort()).toEqual([".env.example", "README.md", "assets/logo.png", "src/index.js"]);
  });
});

describe("file type detection", () => {
  it("sniffs magic bytes rather than trusting extensions", () => {
    expect(sniff(Buffer.from("89504e470d0a1a0a0000", "hex"))?.mime).toBe("image/png");
    expect(sniff(Buffer.from("%PDF-1.7"))?.kind).toBe("document");
    expect(sniff(Buffer.from("RIFF0000WEBPVP8 ", "latin1"))?.mime).toBe("image/webp");
    expect(detectUpload("main.py", Buffer.from("print('hi')")).kind).toBe("code");
    expect(() => detectUpload("photo.png", Buffer.from("MZ\x90\x00binary\x00\x00"))).toThrow(/not supported/);
    expect(() => detectUpload("evil.exe", Buffer.from("MZ\x90\x00"))).toThrow();
  });
});
