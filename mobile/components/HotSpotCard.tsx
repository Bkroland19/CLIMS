import React, { useState } from "react";
import { View, Linking, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { IHotspot } from "@/constants/interfaces";
import { useTheme } from "@/context/theme/ThemeProvider";
import { AppText, Badge, BadgeTone, Button, Card } from "@/components/ui";

interface HotspotCardProps {
  hotspot: IHotspot;
  onEdit?: (hotspot: IHotspot) => void;
}

const statusTone = (status?: string): BadgeTone => {
  switch (status?.toLowerCase()) {
    case "active":
      return "success";
    case "inactive":
      return "danger";
    default:
      return "warning";
  }
};

const Row: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string | null;
}> = ({ icon, label, value }) => {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", paddingVertical: 6 }}>
      <Ionicons name={icon} size={18} color={colors.textMuted} style={{ marginTop: 2 }} />
      <View style={{ marginLeft: 10, flex: 1 }}>
        <AppText variant="caption" color="textMuted">
          {label}
        </AppText>
        <AppText variant="body">{value || "Not provided"}</AppText>
      </View>
    </View>
  );
};

const HotspotCard: React.FC<HotspotCardProps> = React.memo(function HotspotCard({
  hotspot,
  onEdit,
}) {
  const { colors, radius } = useTheme();
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const h: any = hotspot;
  const hasDispenser = h.has_condom_dispenser === "yes";
  const hasCoords = !!h.latitude && !!h.longtitude;

  const openMaps = () => {
    const label = encodeURIComponent(h.name || "Hotspot");
    const url = Platform.select({
      ios: `http://maps.apple.com/?ll=${h.latitude},${h.longtitude}&q=${label}`,
      default: `geo:${h.latitude},${h.longtitude}?q=${h.latitude},${h.longtitude}(${label})`,
    })!;
    Linking.openURL(url).catch(() => {});
  };

  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            backgroundColor: colors.brandSoft,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 12,
          }}
        >
          <Ionicons name="location" size={22} color={colors.brandText} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="heading" numberOfLines={2}>
            {h.name || "Unnamed hotspot"}
          </AppText>
          <AppText variant="caption" color="textMuted" style={{ marginBottom: 6 }}>
            {h.type || "Type not set"}
          </AppText>
          <Badge label={h.status || "Unknown"} tone={statusTone(h.status)} />
        </View>
      </View>

      <View style={{ marginTop: 12 }}>
        <Row
          icon="map-outline"
          label="District · Division"
          value={[h.district, h.division].filter(Boolean).join(" · ")}
        />
        <Row icon="person-outline" label="Contact person" value={h.contact_person_name} />
      </View>

      {showDetails && (
        <View
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <Row icon="home-outline" label="Village" value={h.village} />
          <Row
            icon="navigate-outline"
            label="Coordinates"
            value={h.latitude && h.longtitude ? `${h.latitude}, ${h.longtitude}` : null}
          />
          <Row icon="call-outline" label="Phone" value={h.contact_person_telephone} />
          <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6 }}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.textMuted} />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <AppText variant="caption" color="textMuted">
                Condom dispenser
              </AppText>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Badge
                  label={hasDispenser ? "Available" : "None"}
                  tone={hasDispenser ? "success" : "neutral"}
                />
                {hasDispenser && h.dispenser_condition ? (
                  <AppText variant="caption" color="textMuted" style={{ flex: 1 }}>
                    {h.dispenser_condition}
                  </AppText>
                ) : null}
              </View>
            </View>
          </View>
          {h.comment ? (
            <View
              style={{
                marginTop: 8,
                padding: 12,
                backgroundColor: colors.surfaceAlt,
                borderRadius: radius.md,
              }}
            >
              <AppText variant="caption" color="textMuted">
                Comments
              </AppText>
              <AppText variant="body">{h.comment}</AppText>
            </View>
          ) : null}
        </View>
      )}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
        <Button
          title={showDetails ? "Hide details" : "View details"}
          variant="secondary"
          icon={showDetails ? "chevron-up" : "chevron-down"}
          onPress={() => setShowDetails((v) => !v)}
          style={{ flexGrow: 1, flexBasis: "100%", minHeight: 48 }}
        />
        {hasCoords ? (
          <Button
            title="Directions"
            variant="ghost"
            icon="navigate-outline"
            onPress={openMaps}
            style={{ flexGrow: 1, minHeight: 48 }}
          />
        ) : null}
        {h.contact_person_telephone ? (
          <Button
            title="Call"
            variant="ghost"
            icon="call-outline"
            onPress={() => Linking.openURL(`tel:${h.contact_person_telephone}`)}
            style={{ flexGrow: 1, minHeight: 48 }}
          />
        ) : null}
        {onEdit ? (
          <Button
            title="Edit"
            variant="ghost"
            icon="create-outline"
            onPress={() => onEdit(hotspot)}
            style={{ flexGrow: 1, minHeight: 48 }}
          />
        ) : null}
      </View>
    </Card>
  );
});

export default HotspotCard;
