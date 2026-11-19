import React, { memo } from "react";
import { SvgXml } from "react-native-svg";

/** Lucide outlines used by the design (24×24, 2px stroke). */
const P = {
  home: "<path d='M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8'/><path d='M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'/>",
  list: "<path d='M3 12h.01'/><path d='M3 18h.01'/><path d='M3 6h.01'/><path d='M8 12h13'/><path d='M8 18h13'/><path d='M8 6h13'/>",
  clipboard:
    "<rect width='8' height='4' x='8' y='2' rx='1'/><path d='M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2'/><path d='M12 11h4'/><path d='M12 16h4'/><path d='M8 11h.01'/><path d='M8 16h.01'/>",
  bell: "<path d='M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9'/><path d='M10.3 21a1.94 1.94 0 0 0 3.4 0'/>",
  user: "<circle cx='12' cy='8' r='5'/><path d='M20 21a8 8 0 0 0-16 0'/>",
  pin: "<path d='M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0'/><circle cx='12' cy='10' r='3'/>",
  truck:
    "<path d='M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2'/><path d='M15 18H9'/><path d='M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14'/><circle cx='17' cy='18' r='2'/><circle cx='7' cy='18' r='2'/>",
  clock: "<circle cx='12' cy='12' r='10'/><polyline points='12 6 12 12 16 14'/>",
  plus: "<path d='M5 12h14'/><path d='M12 5v14'/>",
  minus: "<path d='M5 12h14'/>",
  search: "<circle cx='11' cy='11' r='8'/><path d='m21 21-4.3-4.3'/>",
  chevR: "<path d='m9 18 6-6-6-6'/>",
  chevL: "<path d='m15 18-6-6 6-6'/>",
  chevD: "<path d='m6 9 6 6 6-6'/>",
  arrowL: "<path d='m12 19-7-7 7-7'/><path d='M19 12H5'/>",
  phone:
    "<path d='M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z'/>",
  camera:
    "<path d='M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z'/><circle cx='12' cy='13' r='3'/>",
  image:
    "<rect width='18' height='18' x='3' y='3' rx='2'/><circle cx='9' cy='9' r='2'/><path d='m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21'/>",
  check: "<path d='M20 6 9 17l-5-5'/>",
  checkC: "<circle cx='12' cy='12' r='10'/><path d='m9 12 2 2 4-4'/>",
  wifiOff:
    "<path d='M12 20h.01'/><path d='M8.5 16.429a5 5 0 0 1 7 0'/><path d='M5 12.859a10 10 0 0 1 5.17-2.69'/><path d='M19 12.859a10 10 0 0 0-2.007-1.523'/><path d='M2 8.82a15 15 0 0 1 4.177-2.643'/><path d='M22 8.82a15 15 0 0 0-11.288-3.764'/><path d='m2 2 20 20'/>",
  help: "<circle cx='12' cy='12' r='10'/><path d='M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3'/><path d='M12 17h.01'/>",
  pkg: "<path d='M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z'/><path d='M12 22V12'/><path d='m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7'/>",
  info: "<circle cx='12' cy='12' r='10'/><path d='M12 16v-4'/><path d='M12 8h.01'/>",
  alert:
    "<path d='m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3'/><path d='M12 9v4'/><path d='M12 17h.01'/>",
  upload:
    "<path d='M12 13v8'/><path d='M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242'/><path d='m8 17 4-4 4 4'/>",
  building:
    "<rect width='16' height='20' x='4' y='2' rx='2'/><path d='M9 22v-4h6v4'/><path d='M8 6h.01'/><path d='M16 6h.01'/><path d='M12 6h.01'/><path d='M12 10h.01'/><path d='M12 14h.01'/><path d='M16 10h.01'/><path d='M16 14h.01'/><path d='M8 10h.01'/><path d='M8 14h.01'/>",
  shield:
    "<path d='M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'/>",
  gps: "<line x1='2' x2='5' y1='12' y2='12'/><line x1='19' x2='22' y1='12' y2='12'/><line x1='12' x2='12' y1='2' y2='5'/><line x1='12' x2='12' y1='19' y2='22'/><circle cx='12' cy='12' r='7'/><circle cx='12' cy='12' r='3'/>",
  receipt:
    "<path d='M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z'/><path d='M8 8h8'/><path d='M8 12h8'/><path d='M8 16h5'/>",
  megaphone: "<path d='m3 11 18-5v12L3 14v-3z'/><path d='M11.6 16.8a3 3 0 1 1-5.8-1.6'/>",
  x: "<path d='M18 6 6 18'/><path d='m6 6 12 12'/>",
  eye: "<path d='M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0'/><circle cx='12' cy='12' r='3'/>",
  eyeOff:
    "<path d='M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49'/><path d='M14.084 14.158a3 3 0 0 1-4.242-4.242'/><path d='M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143'/><path d='m2 2 20 20'/>",
  pen: "<path d='M12 20h9'/><path d='M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z'/>",
};

export type IconName = keyof typeof P;

const Icon = memo(function Icon({
  name,
  size = 22,
  color = "#000",
  strokeWidth = 2,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const xml = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${color}' stroke-width='${strokeWidth}' stroke-linecap='round' stroke-linejoin='round'>${P[name] ?? P.info}</svg>`;
  return <SvgXml xml={xml} width={size} height={size} />;
});

export default Icon;
