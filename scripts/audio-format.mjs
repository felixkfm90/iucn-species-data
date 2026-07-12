const MAX_MPEG_SCAN_BYTES = 64 * 1024;
const REQUIRED_MPEG_FRAMES = 3;
const MPEG1_BITRATES = Object.freeze({
  1: [32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  2: [32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  3: [32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
});
const MPEG2_BITRATES = Object.freeze({
  1: [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  2: [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  3: [32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
});

export function inspectMp3Buffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    throw new Error("MP3-Datei ist zu klein oder unlesbar");
  }

  let scanStart = 0;
  let hasId3 = false;
  if (buffer.length >= 10 && buffer.subarray(0, 3).toString("ascii") === "ID3") {
    hasId3 = true;
    const sizeBytes = buffer.subarray(6, 10);
    if ([...sizeBytes].some((value) => value > 0x7f)) {
      throw new Error("ID3-Kopf ist beschädigt");
    }
    const tagSize = (
      (sizeBytes[0] << 21)
      | (sizeBytes[1] << 14)
      | (sizeBytes[2] << 7)
      | sizeBytes[3]
    );
    const footerBytes = (buffer[5] & 0x10) === 0x10 ? 10 : 0;
    scanStart = 10 + tagSize + footerBytes;
    if (scanStart >= buffer.length - 3) {
      throw new Error("MP3-Datei enthält nur ID3-Daten, aber keinen Audiostream");
    }
  }

  const scanLimit = Math.min(buffer.length - 3, scanStart + MAX_MPEG_SCAN_BYTES);
  for (let index = scanStart; index <= scanLimit; index += 1) {
    const sequence = inspectMpegFrameSequence(buffer, index, REQUIRED_MPEG_FRAMES);
    if (sequence) {
      return {
        format: "mp3",
        signature: hasId3 ? "ID3 + MPEG frames" : "MPEG frames",
        frameOffset: index,
        verifiedFrames: sequence.length,
        sampleRate: sequence[0].sampleRate,
        bitrateKbps: sequence[0].bitrateKbps,
      };
    }
  }
  throw new Error("Kein plausibler MPEG-Audioframe gefunden");
}

export function isMp3Buffer(buffer) {
  if (isWavBuffer(buffer)) return false;
  try {
    inspectMp3Buffer(buffer);
    return true;
  } catch {
    return false;
  }
}

export function isWavBuffer(buffer) {
  return Buffer.isBuffer(buffer)
    && buffer.length >= 12
    && buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WAVE";
}

export function detectAudioFormat(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return "unknown";
  if (isWavBuffer(buffer)) return "wav";
  if (isMp3Buffer(buffer)) return "mp3";
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "OggS") return "ogg";
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "fLaC") return "flac";
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp") return "mp4/m4a";
  return "unknown";
}

export function audioFormatLabel(format) {
  return {
    mp3: "MP3",
    wav: "WAV/PCM",
    ogg: "Ogg",
    flac: "FLAC",
    "mp4/m4a": "MP4/M4A",
    unknown: "unbekanntes Audioformat",
  }[format] || String(format || "unbekanntes Audioformat");
}

function inspectMpegFrameSequence(buffer, start, requiredFrames) {
  const frames = [];
  let offset = start;
  for (let index = 0; index < requiredFrames; index += 1) {
    const frame = inspectMpegFrameHeader(buffer, offset);
    if (!frame) return null;
    frames.push(frame);
    offset += frame.frameLength;
  }
  return frames;
}

function inspectMpegFrameHeader(buffer, offset) {
  if (offset < 0 || offset + 4 > buffer.length) return null;
  const byte0 = buffer[offset];
  const byte1 = buffer[offset + 1];
  const byte2 = buffer[offset + 2];
  if (byte0 !== 0xff || (byte1 & 0xe0) !== 0xe0) return null;

  const versionBits = (byte1 >> 3) & 0x03;
  const layerBits = (byte1 >> 1) & 0x03;
  const bitrateIndex = (byte2 >> 4) & 0x0f;
  const sampleRateIndex = (byte2 >> 2) & 0x03;
  const padding = (byte2 >> 1) & 0x01;
  if (
    versionBits === 0x01
    || layerBits === 0x00
    || bitrateIndex === 0x00
    || bitrateIndex === 0x0f
    || sampleRateIndex === 0x03
  ) {
    return null;
  }

  const version = versionBits === 0x03 ? 1 : versionBits === 0x02 ? 2 : 2.5;
  const bitrateTable = version === 1 ? MPEG1_BITRATES : MPEG2_BITRATES;
  const bitrateKbps = bitrateTable[layerBits]?.[bitrateIndex - 1];
  const baseSampleRates = [44100, 48000, 32000];
  const sampleRate = baseSampleRates[sampleRateIndex] / (version === 1 ? 1 : version === 2 ? 2 : 4);
  if (!bitrateKbps || !sampleRate) return null;

  let frameLength;
  if (layerBits === 0x03) {
    frameLength = Math.floor(((12 * bitrateKbps * 1000) / sampleRate + padding) * 4);
  } else if (layerBits === 0x01 && version !== 1) {
    frameLength = Math.floor((72 * bitrateKbps * 1000) / sampleRate + padding);
  } else {
    frameLength = Math.floor((144 * bitrateKbps * 1000) / sampleRate + padding);
  }
  if (!Number.isInteger(frameLength) || frameLength < 24 || offset + frameLength > buffer.length) return null;

  return {
    offset,
    version,
    layerBits,
    bitrateKbps,
    sampleRate,
    frameLength,
  };
}
