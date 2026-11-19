import type { AppEvent, DomainState, Hotspot, Order, Report } from "./types";

/**
 * Starting data for the field app while the API has no domain endpoints.
 * Mirrors the CLIMS prototype (Wakiso district). The signed-in person's name
 * replaces the prototype persona for their role so the data is "theirs".
 */

export interface Personas {
  vht: string;
  hm: string;
  rider: string;
}

export const DEFAULT_PERSONAS: Personas = {
  vht: "Joseph Ssemwogerere",
  hm: "Grace Nakato",
  rider: "Musa Kato",
};

export const DCFP = { name: "Sarah Namubiru", phone: "+256 701 220 415", district: "Wakiso" };
export const RIDER = { id: "R1", phone: "+256 701 334 920", plate: "UFB 412K" };
/** The hotspot the signed-in hotspot manager runs. */
export const HM_HOTSPOT = "HS-0231";

const MALE = { k: "male" as const, batch: "EG-24117", exp: "Mar 2028" };
const FEMALE = { k: "female" as const, batch: "FC-2309", exp: "Aug 2027" };

/** Last completed month as YYYY-MM: the period whose report is due now. */
export const currentPeriod = (now = Date.now()) => {
  const d = new Date(now);
  const p = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, "0")}`;
};
const prevPeriod = (p: string) => {
  const [y, m] = p.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export function createSeed(me: Personas, now = Date.now()): DomainState {
  const min = 60_000;
  const h = 60 * min;
  const day = 24 * h;
  const ago = (ms: number) => now - ms;

  const hotspots: Hotspot[] = [
    {
      id: "HS-0231",
      name: "Kasenyi Landing Site",
      kind: "Permanent",
      village: "Kasenyi",
      subcounty: "Katabi TC",
      district: "Wakiso",
      status: "Active",
      contact: me.hm,
      phone: "+256 772 418 903",
      vhts: [me.vht],
      stock: { male: 120, female: 0 },
      lat: 0.05982,
      lng: 32.47195,
      dispenser: true,
      dispCond: "Working",
      comment: "Busiest on Friday and Saturday nights.",
      mappedAt: ago(140 * day),
      lastDelivery: ago(26 * day),
    },
    {
      id: "HS-0218",
      name: "Bwebajja Nite Spot",
      kind: "Permanent",
      village: "Bwebajja",
      subcounty: "Kajjansi TC",
      district: "Wakiso",
      status: "Active",
      contact: "Peter Mugisha",
      phone: "+256 783 551 204",
      vhts: [me.vht],
      stock: { male: 1400, female: 80 },
      lat: 0.20143,
      lng: 32.53021,
      dispenser: true,
      dispCond: "Needs repair",
      mappedAt: ago(210 * day),
      lastDelivery: ago(1 * day),
    },
    {
      id: "HS-0244",
      name: "Kajjansi Weekly Market",
      kind: "Temporary",
      village: "Kajjansi",
      subcounty: "Kajjansi TC",
      district: "Wakiso",
      status: "Active",
      contact: me.vht,
      phone: "+256 776 902 331",
      vhts: [me.vht],
      stock: { male: 300, female: 20 },
      lat: 0.21704,
      lng: 32.55012,
      dispenser: false,
      comment: "Market day is Wednesday.",
      mappedAt: ago(60 * day),
      lastDelivery: ago(33 * day),
    },
    {
      id: "HS-0209",
      name: "Kigungu Lodge",
      kind: "Permanent",
      village: "Kigungu",
      subcounty: "Katabi TC",
      district: "Wakiso",
      status: "Active",
      contact: "Annet Nalwoga",
      phone: "+256 704 118 662",
      vhts: [me.vht],
      stock: { male: 0, female: 0 },
      lat: 0.03011,
      lng: 32.44523,
      dispenser: true,
      dispCond: "Working",
      mappedAt: ago(300 * day),
      lastDelivery: ago(41 * day),
    },
    {
      id: "HS-0197",
      name: "Abaita Taxi Stage",
      kind: "Permanent",
      village: "Abaita Ababiri",
      subcounty: "Katabi TC",
      district: "Wakiso",
      status: "Inactive",
      contact: "Moses Lubega",
      phone: "+256 750 300 118",
      vhts: [me.vht],
      stock: { male: 0, female: 0 },
      lat: 0.08801,
      lng: 32.49012,
      dispenser: false,
      mappedAt: ago(400 * day),
    },
  ];

  const rider = (
    o: Partial<NonNullable<Order["delivery"]>> & {
      dn: string;
      at: number;
      lines: NonNullable<Order["delivery"]>["lines"];
    },
  ) => ({
    riderId: RIDER.id,
    rider: me.rider,
    phone: RIDER.phone,
    plate: RIDER.plate,
    ...o,
  });

  const orders: Order[] = [
    {
      id: "ORD-1050",
      hotspotId: "HS-0244",
      hotspot: "Kajjansi Weekly Market",
      status: "review",
      items: { male: 1000, female: 50 },
      approved: { male: 1000, female: 50 },
      remaining: { male: 300, female: 20 },
      reason: "Running low",
      by: me.vht,
      byRole: "VHT",
      createdAt: ago(70 * min),
    },
    {
      id: "ORD-1047",
      hotspotId: "HS-0209",
      hotspot: "Kigungu Lodge",
      status: "dispatched",
      items: { male: 1500, female: 100 },
      approved: { male: 1500, female: 100 },
      remaining: { male: 0, female: 0 },
      reason: "Out of stock",
      by: me.vht,
      byRole: "VHT",
      createdAt: ago(1 * day + 3 * h),
      confirmedAt: ago(20 * h),
      delivery: rider({
        dn: "DN-WK-0388",
        at: ago(40 * min),
        lines: [
          { ...MALE, qty: 1500 },
          { ...FEMALE, qty: 100 },
        ],
      }),
    },
    {
      id: "ORD-1042",
      hotspotId: "HS-0231",
      hotspot: "Kasenyi Landing Site",
      status: "in_transit",
      items: { male: 2000, female: 100 },
      approved: { male: 2000, female: 100 },
      remaining: { male: 120, female: 0 },
      reason: "Out of stock",
      note: "Busy weekend coming",
      by: me.hm,
      byRole: "Hotspot manager",
      createdAt: ago(1 * day + 6 * h),
      confirmedAt: ago(5 * h),
      delivery: rider({
        dn: "DN-WK-0384",
        at: ago(4 * h),
        pickedAt: ago(2 * h),
        lines: [
          { ...MALE, qty: 2000 },
          { ...FEMALE, qty: 100 },
        ],
      }),
    },
    {
      id: "ORD-1031",
      hotspotId: "HS-0218",
      hotspot: "Bwebajja Nite Spot",
      status: "delivered",
      items: { male: 1000, female: 50 },
      approved: { male: 1000, female: 50 },
      remaining: { male: 400, female: 30 },
      reason: "Running low",
      by: me.vht,
      byRole: "VHT",
      createdAt: ago(4 * day),
      confirmedAt: ago(3 * day),
      delivery: rider({
        dn: "DN-WK-0371",
        at: ago(2 * day),
        pickedAt: ago(1 * day + 4 * h),
        deliveredAt: ago(1 * day + 2 * h),
        qty: { male: 1000, female: 50 },
        found: { male: 400, female: 30 },
        recipient: "Peter Mugisha",
        lines: [
          { ...MALE, qty: 1000 },
          { ...FEMALE, qty: 50 },
        ],
      }),
    },
    {
      id: "ORD-1019",
      hotspotId: "HS-0231",
      hotspot: "Kasenyi Landing Site",
      status: "received",
      items: { male: 2000, female: 100 },
      approved: { male: 1500, female: 100 },
      remaining: { male: 60, female: 0 },
      reason: "Out of stock",
      by: me.hm,
      byRole: "Hotspot manager",
      createdAt: ago(29 * day),
      confirmedAt: ago(28 * day),
      delivery: rider({
        dn: "DN-WK-0342",
        at: ago(28 * day),
        pickedAt: ago(27 * day),
        deliveredAt: ago(26 * day),
        qty: { male: 1500, female: 100 },
        found: { male: 60, female: 0 },
        recipient: me.hm,
        lines: [
          { ...MALE, qty: 1500 },
          { ...FEMALE, qty: 100 },
        ],
      }),
      receipt: {
        at: ago(26 * day - 30 * min),
        qty: { male: 1500, female: 100 },
        issue: "",
        by: me.hm,
      },
    },
  ];

  const period = currentPeriod(now);
  const prev = prevPeriod(period);
  const reports: Report[] = [
    {
      id: `RPT-HM-${period}`,
      own: "hm",
      form: "hotspot",
      period,
      status: "draft",
      runs: 0,
      errors: [],
      values: { male: { open: 1560, recv: 1500 }, female: { open: 100, recv: 100 } },
    },
    {
      id: `RPT-HM-${prev}`,
      own: "hm",
      form: "hotspot",
      period: prev,
      status: "sent",
      runs: 1,
      errors: [],
      values: {
        male: { open: 900, recv: 2000, dist: 1340, loss: 0, close: 1560 },
        female: { open: 40, recv: 100, dist: 40, loss: 0, close: 100 },
        daysOut: "0",
        dispenser: "Working",
      },
      savedAt: ago(44 * day),
      sentAt: ago(44 * day),
      receipt: "MOH-2611-0083",
      reporter: me.hm,
    },
    {
      id: `RPT-VHT-${period}`,
      own: "vht",
      form: "vht",
      period,
      status: "draft",
      runs: 0,
      errors: [],
      values: {
        male: { open: 400, recv: 1000, dist: 900 },
        female: { open: 30, recv: 50 },
        visited: "4",
      },
      savedAt: ago(2 * day),
    },
    {
      id: `RPT-VHT-${prev}`,
      own: "vht",
      form: "vht",
      period: prev,
      status: "sent",
      runs: 2,
      errors: [],
      values: {
        male: { open: 250, recv: 1000, dist: 850, loss: 0, close: 400 },
        female: { open: 10, recv: 50, dist: 30, loss: 0, close: 30 },
        visited: "5",
        sessions: "6",
        reached: "214",
      },
      savedAt: ago(41 * day),
      sentAt: ago(41 * day),
      receipt: "MOH-2611-0121",
      reporter: me.vht,
    },
  ];

  let n = 0;
  const ev = (o: Omit<AppEvent, "id">): AppEvent => ({ id: `EV-${++n}`, ...o });
  const events: AppEvent[] = [
    ev({
      t: ago(30 * min),
      ref: "ORD-1050",
      role: "DCFP",
      actor: DCFP.name,
      text: "Reviewing your stock request for Kajjansi Weekly Market",
      to: ["vht"],
    }),
    ev({
      t: ago(40 * min),
      ref: "ORD-1047",
      role: "DCFP",
      actor: DCFP.name,
      text: `New delivery for rider ${me.rider}: Kigungu Lodge · 1,500 male · 100 female`,
      to: ["rider"],
    }),
    ev({
      t: ago(2 * h),
      ref: "ORD-1042",
      role: "Rider",
      actor: me.rider,
      text: "Collected the stock at the district store and is on the way",
      to: ["hm", "vht"],
    }),
    ev({
      t: ago(4 * h),
      ref: "ORD-1042",
      role: "DCFP",
      actor: DCFP.name,
      text: `New delivery for rider ${me.rider}: Kasenyi Landing Site · 2,000 male · 100 female`,
      to: ["rider"],
    }),
    ev({
      t: ago(5 * h),
      ref: "ORD-1042",
      role: "DCFP",
      actor: DCFP.name,
      text: "Confirmed your order · 2,000 male · 100 female",
      to: ["hm", "vht"],
    }),
    ev({
      t: ago(20 * h),
      ref: "ORD-1047",
      role: "DCFP",
      actor: DCFP.name,
      text: "Confirmed the order for Kigungu Lodge",
      to: ["vht"],
    }),
    ev({
      t: ago(1 * day + 2 * h),
      ref: "ORD-1031",
      role: "Rider",
      actor: me.rider,
      text: "Delivered to Bwebajja Nite Spot. Peter Mugisha needs to confirm receipt",
      to: ["vht"],
    }),
    ev({
      t: ago(26 * day - 30 * min),
      ref: "ORD-1019",
      role: "Hotspot manager",
      actor: me.hm,
      text: "Confirmed receipt at Kasenyi Landing Site · counts matched",
      to: ["rider"],
    }),
    ev({
      t: ago(41 * day),
      ref: `RPT-VHT-${prev}`,
      role: "MOH",
      actor: "Ministry of Health",
      text: "Received your outreach report",
      to: ["vht"],
    }),
    ev({
      t: ago(44 * day),
      ref: `RPT-HM-${prev}`,
      role: "MOH",
      actor: "Ministry of Health",
      text: "Received your monthly hotspot report",
      to: ["hm"],
    }),
  ];

  const seen = ago(3 * h);
  return {
    hotspots,
    orders,
    reports,
    events,
    outbox: [],
    read: { vht: seen, hm: seen, rider: seen },
    seq: 1050,
  };
}
