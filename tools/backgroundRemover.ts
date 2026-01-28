import Replicate from "replicate";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export async function removeBackground(inputPath: string, outputPath: string): Promise<Buffer> {
  const input = {
    image: inputPath,
    mode: "web"
  };

  const output = await replicate.run("cjwbw/rembg", { input });
  
  if (output && typeof output === 'string') {
    const response = await fetch(output);
    return Buffer.from(await response.arrayBuffer());
  }
  
  throw new Error("Failed to remove background");
}
