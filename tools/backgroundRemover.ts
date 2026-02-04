import { coerceOutputUrl, downloadToFile, replicateCreatePrediction, replicateWaitForPrediction } from "./replicateClient";

function guessMime(path: string): string {
  const p = path.toLowerCase();
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".webp")) return "image/webp";
  if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

function toDataUrl(buf: Buffer, mime: string): string {
  return "data:" + mime + ";base64," + buf.toString("base64");
}

// Removes background via Replicate using a rembg-style model.
// Writes a PNG with transparency to disk and returns the Buffer.
export async function removeBackground(inputPath: string, outputPath: string): Promise<Buffer> {
  console.log("[removeBackground] Removing background:", inputPath);

  const inBuf = Buffer.from(await Bun.file(inputPath).arrayBuffer());
  const image = toDataUrl(inBuf, guessMime(inputPath));

  // Note: model schemas can drift; if this ever fails, we can adjust the model or inputs.
  const pred = await replicateCreatePrediction({
    owner: "cjwbw",
    model: "rembg",
    input: {
      image,
    },
  });

  const done = await replicateWaitForPrediction(pred.id);
  const url = coerceOutputUrl(done.output);
  await downloadToFile(url, outputPath);

  const outBuf = Buffer.from(await Bun.file(outputPath).arrayBuffer());
  console.log("[removeBackground] Done:", outputPath);
  return outBuf;
}
