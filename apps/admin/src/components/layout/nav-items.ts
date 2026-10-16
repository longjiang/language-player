import {
  Clapperboard,
  Compass,
  Film,
  Search,
  Tv,
  Upload,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';

/**
 * The admin console's menu. Two groups: user management and content
 * management (SPEC-099). Labels are `translations.csv` keys resolved with
 * `useT()` so the menu follows the project i18n convention.
 */
export interface NavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
}

export interface NavGroup {
  labelKey: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: 'label.users',
    items: [{ href: '/users', labelKey: 'title.user_management', icon: Search }],
  },
  {
    labelKey: 'title.content_management',
    items: [
      { href: '/content/videos', labelKey: 'label.videos', icon: Film },
      { href: '/content/import', labelKey: 'action.import', icon: Upload },
      { href: '/content/discover', labelKey: 'title.discover', icon: Compass },
      { href: '/content/shows', labelKey: 'title.shows_and_talks', icon: Clapperboard },
      { href: '/content/channels', labelKey: 'title.channels', icon: Tv },
      { href: '/content/sweep', labelKey: 'title.unavailable_videos', icon: TriangleAlert },
    ],
  },
];

/** True when `href` is the active nav item for `pathname`. */
export function isActiveHref(pathname: string, href: string): boolean {
  if (href === '/users') return pathname === '/users' || pathname.startsWith('/users/');
  return pathname === href || pathname.startsWith(`${href}/`);
}
