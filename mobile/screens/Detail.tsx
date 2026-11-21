import React from "react";
import { useLocalSearchParams } from "expo-router";
import Screen from "@/components/m/Screen";
import { Banner } from "@/components/m/kit";
import { HM_HOTSPOT } from "@/lib/seed";
import { useMe } from "@/lib/session";
import { OrderScreen } from "./order";
import { RiderDelivery, RiderReceipt } from "./rider";
import { Help, Inbox } from "./shared";
import { StockoutForm } from "./stockout";
import { RequestForm, VhtHotspot, VhtMap, VhtMapDone } from "./vht";

/**
 * Renders `/<tab>/<kind>/<id?>` inside any tab's stack, so detail pages keep
 * the tab bar and the tab the user came from, as in the design.
 */
export default function Detail() {
  const { path } = useLocalSearchParams<{ path: string[] }>();
  const me = useMe();
  const [kind, id] = Array.isArray(path) ? path : [path];

  switch (kind) {
    case "order":
      return id ? <OrderScreen id={id} /> : null;
    case "hotspot":
      return id ? <VhtHotspot id={id} /> : null;
    case "request":
      // Signed-in VHTs send real stockout alerts; demo sign-ins and hotspot managers use samples.
      if (me.demo)
        return me.role === "hm" ? (
          <RequestForm hotspotId={HM_HOTSPOT} fixed />
        ) : (
          <RequestForm hotspotId={id} />
        );
      if (me.role === "hm")
        return me.hotspotId ? (
          <StockoutForm fixed={{ id: me.hotspotId, name: "Your hotspot" }} />
        ) : (
          <Screen title="Report stockout">
            <Banner
              tone="neutral"
              title="No hotspot linked to your account"
              body="Call your district focal person to link your hotspot."
            />
          </Screen>
        );
      return <StockoutForm hotspotId={id} />;
    case "map":
      return id ? <VhtMapDone id={id} /> : <VhtMap />;
    case "delivery":
      return id ? <RiderDelivery id={id} /> : null;
    case "receipt":
      return id ? <RiderReceipt id={id} /> : null;
    case "help":
      return <Help />;
    case "inbox":
      return <Inbox />;
  }
  return (
    <Screen title="Not found">
      <Banner tone="neutral" title="This page isn't available" />
    </Screen>
  );
}
