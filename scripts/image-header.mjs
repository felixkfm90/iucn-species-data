// These readers describe image headers only. Use image-validation for usable pixels.
export function inspectJpeg(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return invalid("JPEG-Signatur fehlt");
  }

  let offset = 2;
  while (offset + 3 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= buffer.length) break;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) break;
    if (isJpegSofMarker(marker) && segmentLength >= 7) {
      const height = buffer.readUInt16BE(offset + 3);
      const width = buffer.readUInt16BE(offset + 5);
      return dimensionsResult("jpeg", width, height);
    }
    offset += segmentLength;
  }
  return invalid("JPEG-Abmessungen konnten nicht gelesen werden");
}

export function inspectPng(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!Buffer.isBuffer(buffer) || buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) {
    return invalid("PNG-Signatur fehlt");
  }
  if (buffer.toString("ascii", 12, 16) !== "IHDR") return invalid("PNG-IHDR fehlt");
  return dimensionsResult("png", buffer.readUInt32BE(16), buffer.readUInt32BE(20));
}

export function inspectWebp(buffer) {
  if (
    !Buffer.isBuffer(buffer)
    || buffer.length < 30
    || buffer.toString("ascii", 0, 4) !== "RIFF"
    || buffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return invalid("WebP-Signatur fehlt");
  }

  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    const width = 1 + readUInt24LE(buffer, 24);
    const height = 1 + readUInt24LE(buffer, 27);
    return dimensionsResult("webp", width, height);
  }
  if (chunk === "VP8 " && buffer.length >= 30 && buffer.subarray(23, 26).equals(Buffer.from([0x9d, 0x01, 0x2a]))) {
    return dimensionsResult("webp", buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff);
  }
  if (chunk === "VP8L" && buffer.length >= 25 && buffer[20] === 0x2f) {
    const width = 1 + buffer[21] + ((buffer[22] & 0x3f) << 8);
    const height = 1 + ((buffer[22] & 0xc0) >> 6) + (buffer[23] << 2) + ((buffer[24] & 0x0f) << 10);
    return dimensionsResult("webp", width, height);
  }
  return invalid(`WebP-Chunk ${chunk || "unbekannt"} wird nicht erkannt`);
}

function dimensionsResult(format, width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    return invalid(`${format}-Abmessungen sind ungültig`);
  }
  return { valid: true, format, width, height };
}

function invalid(reason) {
  return { valid: false, format: "unknown", reason };
}

function isJpegSofMarker(marker) {
  return [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker);
}

function readUInt24LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}
