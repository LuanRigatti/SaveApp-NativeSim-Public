/* global beforeEach, describe, expect, jest, test */

jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
}));

const { Alert } = require('react-native');
const { confirmSavedLinkOpen } = require('../src/features/home-content/savedLinkOpenConfirmation');

describe('saved link open confirmation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('cancelling does not open the link and releases the confirmation for the next request', () => {
    const openLink = jest.fn();

    confirmSavedLinkOpen(openLink);

    expect(Alert.alert).toHaveBeenCalledWith(
      'Abrir link?',
      'Deseja abrir este link?',
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancelar', style: 'cancel' }),
        expect.objectContaining({ text: 'Abrir' }),
      ]),
      { cancelable: false },
    );
    const buttons = Alert.alert.mock.calls[0][2];
    buttons.find(({ text }) => text === 'Cancelar').onPress();
    expect(openLink).not.toHaveBeenCalled();

    confirmSavedLinkOpen(openLink);
    expect(Alert.alert).toHaveBeenCalledTimes(2);
    Alert.alert.mock.calls[1][2].find(({ text }) => text === 'Cancelar').onPress();
  });

  test('opening calls the existing flow once and blocks duplicate alerts until it settles', async () => {
    let finishOpening;
    const openLink = jest.fn(() => new Promise((resolve) => { finishOpening = resolve; }));

    confirmSavedLinkOpen(openLink);
    const buttons = Alert.alert.mock.calls[0][2];
    const openButton = buttons.find(({ text }) => text === 'Abrir');
    expect(openButton.style).toBeUndefined();
    openButton.onPress();
    openButton.onPress();

    expect(openLink).toHaveBeenCalledTimes(1);
    confirmSavedLinkOpen(jest.fn());
    expect(Alert.alert).toHaveBeenCalledTimes(1);

    finishOpening();
    await Promise.resolve();
    confirmSavedLinkOpen(jest.fn());
    expect(Alert.alert).toHaveBeenCalledTimes(2);
    Alert.alert.mock.calls[1][2].find(({ text }) => text === 'Cancelar').onPress();
  });

  test('ignores rapid repeated requests while the alert is visible', () => {
    confirmSavedLinkOpen(jest.fn());
    confirmSavedLinkOpen(jest.fn());

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    Alert.alert.mock.calls[0][2].find(({ text }) => text === 'Cancelar').onPress();
  });
});
