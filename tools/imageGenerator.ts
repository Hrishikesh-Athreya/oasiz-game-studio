import { coerceOutputUrl, downloadToFile, replicateCreatePrediction, replicateWaitForPrediction } from "./replicateClient";

export interface ImageGenOptions {
  size?: "512x512" | "768x768" | "1024x1024" | "1536x1536";
  outputFormat?: "png" | "webp" | "jpg";
}

// Generates a single image via Replicate openai/gpt-image-1.5 and writes it to disk.
export async function generateImage(prompt: string, outputPath: string, opts?: ImageGenOptions): Promise<void> {
  console.log("[generateImage] Generating:", outputPath);

  const pred = await replicateCreatePrediction({
    owner: "openai",
    model: "gpt-image-1.5",
    input: {
      prompt,
      size: opts?.size ?? "1024x1024",
      output_format: opts?.outputFormat ?? "png",
    },
  });

  const done = await replicateWaitForPrediction(pred.id);
  const url = coerceOutputUrl(done.output);
  await downloadToFile(url, outputPath);

  console.log("[generateImage] Done:", outputPath);
}
