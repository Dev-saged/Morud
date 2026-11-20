// عائلة أيقونات مورد: شبكة 24، خط 1.75، زوايا مدورة. الاتجاهية تنعكس في RTL عبر الصنف flip.
import type { SVGProps } from 'react';

const P: Record<string, string> = {
  home: 'M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z',
  search: 'M11 4.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM16 16l4 4',
  cart: 'M3.5 5h2l2 10h10l2-7H7M9.5 19.5h.01M16.5 19.5h.01',
  orders: 'M7 4h10a1 1 0 0 1 1 1v15l-3-2-3 2-3-2-3 2V5a1 1 0 0 1 1-1zM9 9h6M9 13h4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  trash: 'M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13',
  box: 'M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8',
  truck: 'M3 6h11v10H3zM14 9h4l3 3v4h-7M7 18.5a1.5 1.5 0 1 0 0-.01M17 18.5a1.5 1.5 0 1 0 0-.01',
  logout: 'M14 5h4a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h9',
  chevron: 'M15 6l-6 6 6 6',
  clock: 'M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16zM12 8v4l3 2',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  alert: 'M12 4l9 16H3zM12 10v4M12 17h.01',
  wallet: 'M4 7h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4zM4 7l11-3v3M16 13h.01',
  chart: 'M5 19V11M10 19V6M15 19v-5M20 19V9',
  print: 'M7 9V4h10v5M6 17H4v-7h16v7h-2M7 14h10v6H7z',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  pin: 'M12 21s-6-5.5-6-10.5a6 6 0 1 1 12 0C18 15.5 12 21 12 21zM12 8.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  phone: 'M6.5 4h3l1.5 4-2 1.5a10 10 0 0 0 5.5 5.5l1.5-2 4 1.5v3a1.5 1.5 0 0 1-1.5 1.5A15.5 15.5 0 0 1 5 5.5 1.5 1.5 0 0 1 6.5 4z',
  share: 'M12 4v11M8 8l4-4 4 4M5 13v6h14v-6',
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 24, flip, ...rest }: { name: IconName; size?: number; flip?: boolean } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={flip ? 'flip' : undefined} {...rest}>
      <path d={P[name]} />
    </svg>
  );
}

export function LogoMark({ size = 32, light = false }: { size?: number; light?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" role="img" aria-label="مورد">
      <path fill={light ? '#fff' : 'var(--primary)'} d="M43 59V191a15 15 0 0 0 30 0V100l42 47a15 15 0 0 0 22 0l42-47v41a15 15 0 0 0 30 0V59a15 15 0 0 0-26-10l-57 64-57-64a15 15 0 0 0-26 10z" />
      <circle cx="194" cy="193" r="19" fill="var(--accent)" />
    </svg>
  );
}
