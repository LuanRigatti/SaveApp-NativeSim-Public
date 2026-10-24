const { formatVideoDuration } = require('../src/features/photos/videoDuration');

describe('video duration label', () => {
  test('formats short, minute, and hour durations', () => {
    expect(formatVideoDuration(7_900)).toBe('0:07');
    expect(formatVideoDuration(61_000)).toBe('1:01');
    expect(formatVideoDuration(3_661_000)).toBe('1:01:01');
  });

  test('returns an empty label for unavailable durations', () => {
    expect(formatVideoDuration(0)).toBe('');
    expect(formatVideoDuration(null)).toBe('');
    expect(formatVideoDuration(Number.NaN)).toBe('');
  });
});
