import Replicate from "replicate";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export async function generateMusic(
  prompt: string, 
  outputPath: string, 
  options?: { negativePrompt?: string; seed?: number }
): Promise<Buffer> {
  const input = {
    prompt: prompt,
    negative_prompt: options?.negativePrompt || "",
    seed: options?.seed || 42,
    duration: 30
  };

  const output = await replicate.run("google/lyria-2", { input });
  
  if (output && typeof output === 'object' && 'audio' in output) {
    const response = await fetch(output.audio);
    return Buffer.from(await response.arrayBuffer());
  }
  
  throw new Error("Failed to generate music");
}
