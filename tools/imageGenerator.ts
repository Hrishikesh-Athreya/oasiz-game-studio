import Replicate from "replicate";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export async function generateImage(prompt: string, outputPath: string): Promise<Buffer> {
  const input = {
    prompt: prompt,
    num_outputs: 1,
    aspect_ratio: "1:1",
    output_format: "png",
    output_quality: 80
  };

  const output = await replicate.run("openai/gpt-image-1.5", { input });
  
  if (Array.isArray(output) && output.length > 0) {
    const response = await fetch(output[0]);
    return Buffer.from(await response.arrayBuffer());
  }
  
  throw new Error("Failed to generate image");
}
