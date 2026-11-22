import type { Bounds } from './filters';

/*
 * Uganda's border, for deciding which recorded positions are plausible and for
 * dimming everything outside the country on the map.
 *
 * Source: Natural Earth 1:10m Admin 0 countries (public domain), as packaged in
 * world-atlas 2.0.2, simplified with Douglas-Peucker to about 1 km (607 points
 * down to 205). The outline includes Uganda's part of Lakes Victoria,
 * Albert, Edward and George, so island hotspots (Kalangala, Buvuma) are inside.
 * Points are [longitude, latitude].
 */
export const UGANDA_BORDER: readonly (readonly [number, number])[] = [
  [30.4725, -1.0666],
  [30.4473, -1.0582],
  [30.4041, -1.07],
  [30.3357, -1.0666],
  [30.3177, -1.1375],
  [30.2889, -1.1561],
  [30.2709, -1.2],
  [30.2133, -1.2591],
  [30.1665, -1.2777],
  [30.1485, -1.3452],
  [30.0621, -1.3891],
  [30.0369, -1.4246],
  [29.9397, -1.4736],
  [29.8965, -1.4702],
  [29.8821, -1.4533],
  [29.8641, -1.3706],
  [29.8245, -1.3233],
  [29.8065, -1.325],
  [29.7741, -1.3655],
  [29.7345, -1.3486],
  [29.6409, -1.3891],
  [29.5797, -1.3891],
  [29.5797, -1.2355],
  [29.5581, -1.1814],
  [29.5689, -1.0784],
  [29.5473, -1.0025],
  [29.5617, -0.9721],
  [29.5545, -0.9197],
  [29.5689, -0.9011],
  [29.5977, -0.8927],
  [29.6121, -0.864],
  [29.6013, -0.7222],
  [29.6157, -0.6445],
  [29.6301, -0.6293],
  [29.6193, -0.5989],
  [29.6517, -0.5803],
  [29.6481, -0.5043],
  [29.6301, -0.4419],
  [29.7129, -0.0079],
  [29.7021, 0.0732],
  [29.7597, 0.1728],
  [29.7957, 0.1643],
  [29.8389, 0.3585],
  [29.9217, 0.4599],
  [29.9397, 0.4987],
  [29.9181, 0.6186],
  [29.9325, 0.7233],
  [29.9253, 0.7756],
  [29.9469, 0.8246],
  [30.0369, 0.8786],
  [30.1557, 0.909],
  [30.2205, 1.0171],
  [30.2169, 1.0779],
  [30.2385, 1.1353],
  [30.2781, 1.1724],
  [30.3249, 1.1555],
  [30.3645, 1.2028],
  [30.4329, 1.2062],
  [30.4797, 1.2383],
  [30.6813, 1.5],
  [31.0269, 1.7786],
  [31.2429, 2.0505],
  [31.2717, 2.1028],
  [31.2789, 2.1552],
  [31.2681, 2.1738],
  [31.1889, 2.221],
  [31.1781, 2.3021],
  [31.1133, 2.2818],
  [31.0557, 2.2903],
  [31.0341, 2.3072],
  [31.0449, 2.3274],
  [30.9693, 2.4051],
  [30.9297, 2.4051],
  [30.9009, 2.346],
  [30.8721, 2.3325],
  [30.8181, 2.3764],
  [30.7965, 2.4406],
  [30.7101, 2.4456],
  [30.7065, 2.4625],
  [30.7389, 2.5368],
  [30.7353, 2.5925],
  [30.7605, 2.633],
  [30.8001, 2.7698],
  [30.8289, 2.7867],
  [30.8541, 2.8526],
  [30.8433, 2.9336],
  [30.8217, 2.9725],
  [30.7569, 3.0214],
  [30.7425, 3.0552],
  [30.8037, 3.246],
  [30.9117, 3.3929],
  [30.9081, 3.4959],
  [30.8973, 3.5196],
  [30.8397, 3.4908],
  [30.8433, 3.506],
  [30.9333, 3.6445],
  [30.9441, 3.68],
  [31.0089, 3.7002],
  [31.1673, 3.7931],
  [31.2933, 3.7745],
  [31.5057, 3.6597],
  [31.5345, 3.6648],
  [31.5633, 3.6901],
  [31.6857, 3.712],
  [31.7793, 3.8167],
  [31.8297, 3.7847],
  [31.9017, 3.7036],
  [31.9305, 3.5989],
  [32.0313, 3.5854],
  [32.0745, 3.5331],
  [32.1573, 3.5111],
  [32.1753, 3.5212],
  [32.1753, 3.6057],
  [32.1861, 3.6192],
  [32.3733, 3.7306],
  [32.7549, 3.7695],
  [32.8413, 3.7948],
  [32.9961, 3.886],
  [33.1653, 3.7627],
  [33.4893, 3.7492],
  [33.5325, 3.7745],
  [33.9753, 4.2203],
  [34.0077, 4.2051],
  [34.0293, 4.1882],
  [34.0401, 4.1207],
  [34.0725, 4.0768],
  [34.0617, 4.0076],
  [34.1085, 3.9603],
  [34.0833, 3.8775],
  [34.1085, 3.8691],
  [34.1841, 3.886],
  [34.2057, 3.8742],
  [34.2093, 3.8606],
  [34.1949, 3.8471],
  [34.1481, 3.8235],
  [34.1805, 3.7965],
  [34.1517, 3.7762],
  [34.2417, 3.783],
  [34.2777, 3.7104],
  [34.2921, 3.7036],
  [34.3101, 3.7272],
  [34.3353, 3.734],
  [34.4397, 3.6681],
  [34.4361, 3.5263],
  [34.3821, 3.4773],
  [34.4001, 3.4334],
  [34.3857, 3.376],
  [34.4253, 3.3051],
  [34.4325, 3.1818],
  [34.4433, 3.1599],
  [34.5333, 3.1177],
  [34.5729, 2.9454],
  [34.6305, 2.8694],
  [34.6557, 2.8559],
  [34.6845, 2.8813],
  [34.7385, 2.8441],
  [34.7781, 2.6854],
  [34.8177, 2.5976],
  [34.8429, 2.5875],
  [34.8645, 2.6043],
  [34.8861, 2.5216],
  [34.9221, 2.4777],
  [34.9221, 2.4541],
  [34.8681, 2.4118],
  [34.8573, 2.3865],
  [34.9689, 2.1011],
  [34.9617, 1.9779],
  [35.005, 1.9171],
  [34.9797, 1.8698],
  [34.9797, 1.6756],
  [34.9329, 1.576],
  [34.8825, 1.5524],
  [34.8609, 1.5186],
  [34.8393, 1.4375],
  [34.7781, 1.3886],
  [34.8105, 1.2721],
  [34.7961, 1.2315],
  [34.6845, 1.2096],
  [34.6305, 1.164],
  [34.5801, 1.1522],
  [34.5621, 1.0931],
  [34.5081, 1.1032],
  [34.4865, 1.0829],
  [34.4685, 1.0441],
  [34.4577, 0.958],
  [34.3893, 0.8161],
  [34.3065, 0.7689],
  [34.2777, 0.6811],
  [34.2525, 0.6557],
  [34.1481, 0.6034],
  [34.1085, 0.47],
  [34.0761, 0.4227],
  [34.0869, 0.3467],
  [34.0401, 0.3062],
  [33.8925, 0.1103],
  [33.8889, 0.0901],
  [33.9537, -0.116],
  [33.8961, -0.6631],
  [33.9033, -1.0025],
  [30.8289, -1.0025],
  [30.7785, -0.9856],
  [30.6885, -1.0244],
  [30.6381, -1.0734],
  [30.5913, -1.0632],
  [30.4725, -1.0666],
];

/** The border's bounding box. */
export const UGANDA_BOUNDS: Bounds = { west: 29.5473, south: -1.4736, east: 35.005, north: 4.2203 };

/**
 * How far outside the drawn border a position may be and still count as Uganda.
 * The outline is accurate to about a kilometre, and border towns' hotspots (Busia,
 * Malaba, Mutukula) sit on the line: in the dev database every hotspot just
 * outside it was within 2.3 km. A point further out is somewhere else.
 */
export const BORDER_TOLERANCE_KM = 3;

const KM_PER_DEGREE = 111.32;
const MARGIN = BORDER_TOLERANCE_KM / KM_PER_DEGREE / Math.cos((4.3 * Math.PI) / 180);

function insideBorder(latitude: number, longitude: number): boolean {
  let inside = false;
  for (let i = 0, j = UGANDA_BORDER.length - 1; i < UGANDA_BORDER.length; j = i++) {
    const [xi, yi] = UGANDA_BORDER[i] ?? [0, 0];
    const [xj, yj] = UGANDA_BORDER[j] ?? [0, 0];
    if (
      yi > latitude !== yj > latitude &&
      longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** Distance in km from a point to the nearest edge of the border (flat-earth, fine at this scale). */
export function kmToBorder(latitude: number, longitude: number): number {
  const k = Math.cos((latitude * Math.PI) / 180);
  let best = Infinity;
  for (let i = 0, j = UGANDA_BORDER.length - 1; i < UGANDA_BORDER.length; j = i++) {
    const [x1, y1] = UGANDA_BORDER[j] ?? [0, 0];
    const [x2, y2] = UGANDA_BORDER[i] ?? [0, 0];
    const ax = x1 * k;
    const bx = x2 * k;
    const px = longitude * k;
    const dx = bx - ax;
    const dy = y2 - y1;
    const t = Math.max(
      0,
      Math.min(1, ((px - ax) * dx + (latitude - y1) * dy) / (dx * dx + dy * dy || 1e-12)),
    );
    best = Math.min(best, Math.hypot(px - ax - t * dx, latitude - y1 - t * dy));
  }
  return best * KM_PER_DEGREE;
}

/** Whether a position is in Uganda, or within {@link BORDER_TOLERANCE_KM} of its border. */
export function isInUganda(latitude: number, longitude: number): boolean {
  if (
    latitude < UGANDA_BOUNDS.south - MARGIN ||
    latitude > UGANDA_BOUNDS.north + MARGIN ||
    longitude < UGANDA_BOUNDS.west - MARGIN ||
    longitude > UGANDA_BOUNDS.east + MARGIN
  ) {
    return false;
  }
  return (
    insideBorder(latitude, longitude) || kmToBorder(latitude, longitude) <= BORDER_TOLERANCE_KM
  );
}
