export const SAVE_LINK_ACTIVITY_ICON_SIZE = 96;
export const SAVE_LINK_ACTIVITY_LIGHT_ICON_NAME = 'saveapp-live-activity-icon.png';
export const SAVE_LINK_ACTIVITY_DARK_ICON_NAME = 'saveapp-live-activity-icon-dark.png';

export function hasPngSignature(bytes: Uint8Array): boolean {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
}

export function isExpectedSaveLinkActivityPng(bytes: Uint8Array): boolean {
  if (!hasPngSignature(bytes) || bytes.length < 33) return false;
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return bytes[8] === 0 && bytes[9] === 0 && bytes[10] === 0 && bytes[11] === 13
    && bytes[12] === 73 && bytes[13] === 72 && bytes[14] === 68 && bytes[15] === 82
    && header.getUint32(16, false) === SAVE_LINK_ACTIVITY_ICON_SIZE
    && header.getUint32(20, false) === SAVE_LINK_ACTIVITY_ICON_SIZE
    && bytes[24] === 8
    && bytes[25] === 6 // RGBA PNG so the widget keeps an alpha channel.
    && bytes[26] === 0
    && bytes[27] === 0
    && bytes[28] === 0;
}

export function areBytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
