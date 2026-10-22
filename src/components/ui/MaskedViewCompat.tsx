import NativeMaskedView from '@react-native-masked-view/masked-view';
import type { ComponentType, ReactElement, ReactNode } from 'react';
import type { ViewProps } from 'react-native';

type MaskedViewCompatProps = ViewProps & {
  androidRenderingMode?: 'software' | 'hardware';
  children?: ReactNode;
  maskElement: ReactElement;
};

const MaskedViewCompat = NativeMaskedView as unknown as ComponentType<MaskedViewCompatProps>;

export default MaskedViewCompat;
