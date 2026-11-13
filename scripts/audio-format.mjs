import { isUtf8 } from "node:buffer";

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

function signatureAt(buffer, offset, signature) {
  return offset >= 0 && offset + signature.length <= buffer.length
    && buffer.toString("latin1", offset, offset + signature.length) === signature;
}
function id3Size(buffer, offset) {
  if (offset < 0 || offset + 4 > buffer.length || [...buffer.subarray(offset, offset + 4)].some(value => value > 0x7f)) {
    throw new Error("ID3-Tag besitzt keine gültige Größenbindung");
  }
  return buffer[offset] * 0x200000 + buffer[offset + 1] * 0x4000 + buffer[offset + 2] * 0x80 + buffer[offset + 3];
}
function id3v2End(buffer, offset, limit) {
  if (!signatureAt(buffer, offset, "ID3") || offset + 10 > limit) throw new Error("ID3-Tag ist unvollständig");
  const major = buffer[offset + 3], revision = buffer[offset + 4], flags = buffer[offset + 5];
  const allowedFlags = { 2: 0xc0, 3: 0xe0, 4: 0xf0 }[major];
  if (allowedFlags === undefined || revision === 0xff || (flags & ~allowedFlags) !== 0) throw new Error("ID3-Tagkopf ist ungültig");
  const size = id3Size(buffer, offset + 6), footer = major === 4 && (flags & 0x10) !== 0;
  const end = offset + 10 + size + (footer ? 10 : 0);
  if (end > limit) throw new Error("ID3-Tag ist abgeschnitten");
  if (footer && (!signatureAt(buffer, end - 10, "3DI")
    || !buffer.subarray(offset + 3, offset + 10).equals(buffer.subarray(end - 7, end)))) {
    throw new Error("ID3-Fuß und ID3-Kopf stimmen nicht überein");
  }
  return end;
}
function unsupportedTag(message) { return Object.assign(new Error(message), { code: "unsupported_audio_tag" }); }

// Envelope/item layout: TagLib's ape/ape-tag-format.txt. Footer-present bit30
// follows its actual parse/render implementation in ape/apefooter.cpp (inverted).
// https://github.com/taglib/taglib/tree/master/taglib/ape
function apeTrailerStart(buffer, end) {
  const footer = end - 32;
  if (!signatureAt(buffer, footer, "APETAGEX")) return null;
  const version = buffer.readUInt32LE(footer + 8), size = buffer.readUInt32LE(footer + 12);
  const count = buffer.readUInt32LE(footer + 16), flags = buffer.readUInt32LE(footer + 20);
  if (![1000, 2000].includes(version)) throw unsupportedTag("Diese APE-Metadatenversion wird derzeit nicht unterstützt; das Original bleibt erhalten.");
  if (count > 50000) throw unsupportedTag("Die APE-Metadaten überschreiten die begrenzte Anzahl prüfbarer Einträge; das Original bleibt erhalten.");
  if (size < 32 || size > end || (flags & 0x60000000) !== 0 || (flags & 0x1ffffff8) !== 0
    || (flags & 6) === 6 || version === 1000 && flags !== 0 || buffer.subarray(footer + 24, end).some(value => value !== 0)) {
    throw new Error("APE-Fuß besitzt ungültige Größen-, Versions- oder Flagbindungen");
  }
  const itemsStart = end - size, hasHeader = (flags & 0x80000000) !== 0, start = itemsStart - (hasHeader ? 32 : 0);
  if (start < 0 || count > Math.floor((size - 32) / 11)) throw new Error("APE-Einträge sind unvollständig");
  if (hasHeader && (!signatureAt(buffer, start, "APETAGEX") || buffer.readUInt32LE(start + 8) !== version
    || buffer.readUInt32LE(start + 12) !== size || buffer.readUInt32LE(start + 16) !== count
    || buffer.readUInt32LE(start + 20) !== ((flags | 0x20000000) >>> 0)
    || buffer.subarray(start + 24, start + 32).some(value => value !== 0))) {
    throw new Error("APE-Kopf und APE-Fuß stimmen nicht überein");
  }
  const keys = new Set(); let offset = itemsStart;
  for (let index = 0; index < count; index++) {
    if (offset + 11 > footer) throw new Error("APE-Eintrag ist abgeschnitten");
    const length = buffer.readUInt32LE(offset), itemFlags = buffer.readUInt32LE(offset + 4);
    const keyStart = offset + 8, keyEnd = buffer.indexOf(0, keyStart), type = (itemFlags >>> 1) & 3;
    if ((itemFlags & 0xfffffff8) !== 0 || type === 3 || keyEnd < keyStart + 2 || keyEnd >= keyStart + 256 || keyEnd >= footer
      || buffer.subarray(keyStart, keyEnd).some(value => value < 0x20 || value > 0x7e)) {
      throw new Error("APE-Eintrag besitzt ungültige Schlüssel oder Flags");
    }
    const key = buffer.toString("latin1", keyStart, keyEnd).toLowerCase(), valueStart = keyEnd + 1;
    if (keys.has(key) || length > footer - valueStart) throw new Error("APE-Wert ist nicht eindeutig oder abgeschnitten");
    keys.add(key);
    // Binary artwork remains opaque. Text and locator bytes are checked as
    // UTF-8 only, never interpreted as a filename or fetched as a URL.
    if (version === 2000 && type !== 1 && !isUtf8(buffer.subarray(valueStart, valueStart + length))) throw new Error("APE-Text ist kein gültiges UTF-8");
    offset = valueStart + length;
  }
  if (offset !== footer) throw new Error("APE-Tag besitzt unbekannte oder fehlende Einträge");
  return start;
}

function trailingMetadataStart(buffer) {
  let end = buffer.length;
  while (end > 0) {
    if (end >= 20 && signatureAt(buffer, end - 10, "3DI")) {
      // Only a complete matching header/footer pair is an appended ID3v2.4
      // tag. A coincidental byte pattern inside MPEG data is not a footer.
      let start = -1;
      try {
        const candidate = end - 20 - id3Size(buffer, end - 4);
        if (candidate >= 0 && buffer[candidate + 3] === 4 && (buffer[candidate + 5] & 0x10) !== 0
          && id3v2End(buffer, candidate, end) === end) start = candidate;
      } catch { /* An invalid trailer is rejected later at its exact frame boundary. */ }
      if (start >= 0) { end = start; continue; }
    }
    const apeStart = apeTrailerStart(buffer, end);
    if (apeStart !== null) { end = apeStart; continue; }
    if (end >= 128 && signatureAt(buffer, end - 128, "TAG")) {
      end -= 128;
      // Enhanced ID3v1 is a complete 227-byte TAG+ extension immediately
      // before the ordinary, complete 128-byte ID3v1 tag.
      if (end >= 227 && signatureAt(buffer, end - 227, "TAG+")) end -= 227;
      continue;
    }
    break;
  }
  return end;
}

/**
 * Complete frame/container boundary proof, not a decoder. Variable bitrate and
 * Xing/Info/LAME bytes inside whole MPEG frames remain untouched. Only exact
 * ID3 may also occur between whole frames. APE end tags are checked separately;
 * no resync can skip a damaged ending or an unproved byte range.
 */
export function inspectCompleteMp3Buffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) throw new Error("MP3-Datei ist zu klein oder unlesbar");
  const limit = trailingMetadataStart(buffer);
  let start = 0;
  while (signatureAt(buffer, start, "ID3")) start = id3v2End(buffer, start, limit);
  if (signatureAt(buffer, start, "APETAGEX")) throw unsupportedTag("Vorangestellte APE-Metadaten werden derzeit nicht unterstützt; das Original bleibt erhalten.");
  const firstFrame = inspectMpegFrameHeader(buffer, start, limit);
  if (!firstFrame) throw new Error("MP3-Datei besitzt keinen vollständigen belegten Anfangsframe");
  let offset = start, frameCount = 0, audioEnd = start;
  while (offset < limit) {
    const frame = inspectMpegFrameHeader(buffer, offset, limit);
    if (frame) { offset += frame.frameLength; audioEnd = offset; frameCount++; continue; }
    if (signatureAt(buffer, offset, "ID3")) {
      offset = id3v2End(buffer, offset, limit); continue;
    }
    throw new Error("MP3-Framefolge ist beschädigt oder am Ende abgeschnitten");
  }
  if (frameCount < REQUIRED_MPEG_FRAMES || offset !== limit) throw new Error("MP3-Framefolge ist unvollständig");
  return { format: "mp3", signature: start ? "ID3 + MPEG frames" : "MPEG frames", frameOffset: start,
    verifiedFrames: frameCount, sampleRate: firstFrame.sampleRate, bitrateKbps: firstFrame.bitrateKbps,
    audioEnd, leadingTagBytes: start, trailingTagBytes: buffer.length - audioEnd };
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

function inspectMpegFrameHeader(buffer, offset, limit = buffer.length) {
  if (offset < 0 || offset + 4 > limit) return null;
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
  if (!Number.isInteger(frameLength) || frameLength < 24 || offset + frameLength > limit) return null;

  return {
    offset,
    version,
    layerBits,
    bitrateKbps,
    sampleRate,
    frameLength,
  };
}
