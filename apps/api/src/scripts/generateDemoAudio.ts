import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  demoFullPath,
  demoLanguages,
  demoPreviewPath
} from "../demo/catalog.js";

const outputDir = join(process.cwd(), "public", "audio");

function makeWavBuffer(frequencyHz: number, durationSeconds: number): Buffer {
  const sampleRate = 8_000;
  const numSamples = sampleRate * durationSeconds;
  const dataSize = numSamples;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < numSamples; index += 1) {
    const time = index / sampleRate;
    const envelope = Math.min(1, time / 0.1, (durationSeconds - time) / 0.2);
    const carrier =
      Math.sin(time * Math.PI * 2 * frequencyHz) * 0.55 +
      Math.sin(time * Math.PI * 2 * (frequencyHz / 2)) * 0.2;
    const sample = 128 + Math.round(carrier * 127 * envelope);
    buffer[44 + index] = Math.max(0, Math.min(255, sample));
  }

  return buffer;
}

async function generateAudio(): Promise<void> {
  await mkdir(outputDir, { recursive: true });

  for (const language of demoLanguages) {
    const preview = makeWavBuffer(language.toneHz, 6);
    const full = makeWavBuffer(language.toneHz * 0.98, 8);

    await writeFile(
      join(outputDir, demoPreviewPath(language.isoCode).replace("/audio/", "")),
      preview
    );
    await writeFile(
      join(outputDir, demoFullPath(language.isoCode).replace("/audio/", "")),
      full
    );
  }

  console.log(`Generated ${demoLanguages.length * 2} demo audio files.`);
}

generateAudio().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
