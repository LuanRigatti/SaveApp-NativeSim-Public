import { Alert } from 'react-native';

export type SavedLinkOpenAction = () => void | Promise<void>;

let confirmationInProgress = false;

/** Keeps one native confirmation active until the chosen open flow finishes. */
export function confirmSavedLinkOpen(openLink: SavedLinkOpenAction): void {
  if (confirmationInProgress) return;
  confirmationInProgress = true;
  let openWasSelected = false;

  const releaseConfirmation = () => {
    confirmationInProgress = false;
  };

  const confirmOpen = () => {
    if (openWasSelected) return;
    openWasSelected = true;

    let opening: void | Promise<void>;
    try {
      opening = openLink();
    } catch {
      releaseConfirmation();
      return;
    }

    void Promise.resolve(opening).then(releaseConfirmation, releaseConfirmation);
  };

  const cancel = () => {
    if (!openWasSelected) releaseConfirmation();
  };

  try {
    Alert.alert(
      'Abrir link?',
      'Deseja abrir este link?',
      [
        { text: 'Cancelar', style: 'cancel', onPress: cancel },
        { text: 'Abrir', onPress: confirmOpen },
      ],
      { cancelable: false },
    );
  } catch {
    releaseConfirmation();
  }
}
