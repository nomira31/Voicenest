import { File, Paths } from "expo-file-system";
import { decodeAudioData } from "react-native-audio-api";

export type ProcessedAudio = {
  uri: string;
  durationMillis: number;
  isWav: boolean;
};

// A decoded AudioBuffer uses much more memory than its compressed source file.
// The output guard also prevents large PCM allocations on mobile devices.
const MAX_WAV_BYTES = 120 * 1024 * 1024;
const WAV_HEADER_BYTES = 44;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function writeWavHeader(
  view: DataView,
  dataLength: number,
  sampleRate: number,
  channelCount: number,
) {
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * 2, true);
  view.setUint16(32, channelCount * 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataLength, true);
}

/**
 * Exports the selected audio range as a PCM16 WAV file. Optional voice cleanup
 * applies peak normalization, a basic low-level noise gate, and short edge fades.
 * The source recording is never modified.
 */
export async function createEditedWav(
  sourceUri: string,
  trimStartRatio: number,
  trimEndRatio: number,
  applyVoiceCleanup: boolean,
): Promise<ProcessedAudio> {
  const sourceFile = new File(sourceUri);
  if (!sourceFile.exists) {
    throw new Error("The source recording could not be found.");
  }

  // decodeAudioData is available in react-native-audio-api 0.11.7+. The module
  // fixes local file URI resolution on Android release builds from that version.
  const audioBuffer = await decodeAudioData(sourceUri);
  const sampleRate = audioBuffer.sampleRate;
  const channelCount = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;

  if (
    !Number.isFinite(sampleRate) ||
    sampleRate <= 0 ||
    !Number.isFinite(length) ||
    length < 2 ||
    channelCount < 1
  ) {
    throw new Error("The recording could not be decoded for editing.");
  }

  const startRatio = clamp(trimStartRatio, 0, 0.99999);
  const endRatio = clamp(trimEndRatio, startRatio + 0.00001, 1);
  const startFrame = clamp(Math.floor(length * startRatio), 0, length - 1);
  const endFrame = clamp(Math.ceil(length * endRatio), startFrame + 1, length);
  const frameCount = endFrame - startFrame;
  const dataLength = frameCount * channelCount * 2;
  const totalBytes = WAV_HEADER_BYTES + dataLength;

  if (totalBytes > MAX_WAV_BYTES) {
    throw new Error(
      "The selected WAV export is too large to process safely on this device. Trim it to a shorter section and try again.",
    );
  }

  const sourceChannels: Float32Array[] = [];
  let peak = 0;
  for (let channel = 0; channel < channelCount; channel += 1) {
    const samples = audioBuffer.getChannelData(channel).subarray(startFrame, endFrame);
    sourceChannels.push(samples);
    if (applyVoiceCleanup) {
      for (let frame = 0; frame < samples.length; frame += 1) {
        peak = Math.max(peak, Math.abs(samples[frame]));
      }
    }
  }

  const gain = applyVoiceCleanup && peak > 0 ? Math.min(8, 0.92 / peak) : 1;
  const fadeFrames = applyVoiceCleanup
    ? Math.min(Math.floor(sampleRate * 0.008), Math.floor(frameCount / 2))
    : 0;

  // Build the WAV directly into its byte buffer, avoiding an additional full-size
  // Float32Array copy of every channel.
  const wavBytes = new Uint8Array(totalBytes);
  const view = new DataView(wavBytes.buffer);
  writeWavHeader(view, dataLength, sampleRate, channelCount);

  let outputOffset = WAV_HEADER_BYTES;
  for (let frame = 0; frame < frameCount; frame += 1) {
    let fade = 1;
    if (fadeFrames > 0 && frame < fadeFrames) {
      fade = frame / fadeFrames;
    } else if (fadeFrames > 0 && frame >= frameCount - fadeFrames) {
      fade = (frameCount - frame - 1) / fadeFrames;
    }

    for (let channel = 0; channel < channelCount; channel += 1) {
      let sample = sourceChannels[channel][frame] * gain;
      if (applyVoiceCleanup && Math.abs(sample) < 0.006) sample *= 0.18;
      sample = clamp(sample * fade, -1, 1);
      const intSample = sample < 0
        ? Math.round(sample * 32768)
        : Math.round(sample * 32767);
      view.setInt16(outputOffset, intSample, true);
      outputOffset += 2;
    }
  }

  const outputFile = new File(
    Paths.cache,
    `voice-note-edited-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.wav`,
  );
  outputFile.create({ intermediates: true, overwrite: true });
  outputFile.write(wavBytes);

  return {
    uri: outputFile.uri,
    durationMillis: (frameCount / sampleRate) * 1000,
    isWav: true,
  };
}
