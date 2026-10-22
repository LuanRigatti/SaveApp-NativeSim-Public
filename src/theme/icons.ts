import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

export type IconName = ComponentProps<typeof Ionicons>['name'];

type IconPair = {
  active: IconName;
  inactive: IconName;
};

export const icons = {
  tabBar: {
    home: { active: 'home', inactive: 'home-outline' },
    finance: { active: 'bar-chart', inactive: 'bar-chart-outline' },
    clients: { active: 'people', inactive: 'people-outline' },
    deliveries: { active: 'cube', inactive: 'cube-outline' },
    settings: { active: 'settings', inactive: 'settings-outline' },
  } satisfies Record<'home' | 'finance' | 'clients' | 'deliveries' | 'settings', IconPair>,
  navigation: {
    back: 'arrow-back',
    close: 'close',
    more: 'ellipsis-horizontal',
    search: 'search',
    filter: 'filter',
    add: 'add',
    calendar: 'calendar',
    location: 'location',
    warning: 'warning',
    checkmark: 'checkmark',
  } satisfies Record<string, IconName>,
  status: {
    paid: 'checkmark-circle',
    unpaid: 'time-outline',
    delivered: 'checkmark-done-circle',
    pending: 'time-outline',
    issued: 'document-text-outline',
    toIssue: 'document-outline',
  } satisfies Record<'paid' | 'unpaid' | 'delivered' | 'pending' | 'issued' | 'toIssue', IconName>,
} as const;

export type IconTokens = typeof icons;
