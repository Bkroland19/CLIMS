import React, { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addHotSpot, getDistricts, getRegions, getUserHotSpots } from "../api/requests";
import HotspotCard from "@/components/HotSpotCard";
import {
  AppText,
  Button,
  Chip,
  EmptyState,
  Fab,
  FormModal,
  FormSection,
  Input,
  SegmentedControl,
  SelectSheet,
  Skeleton,
  useToast,
} from "@/components/ui";
import { useGlobalContext } from "@/context/auth/GlobalProvider";
import { useTheme } from "@/context/theme/ThemeProvider";
import { useResponsive } from "@/hooks/useResponsive";
import { useConfirm } from "@/hooks/useConfirm";
import { friendlyError } from "@/utils/errors";

interface Hotspot {
  id: number;
  status: string;
  name?: string;
  district?: string;
  contact_person_name?: string;
  type?: string;
  created_at?: string;
  [key: string]: any;
}

interface FormState {
  name: string;
  type: string;
  contactPersonName: string;
  contactPersonContact: string;
  region: string;
  district: string;
  division: string;
  village: string;
  latitude: string;
  longitude: string;
  has_condom_dispenser: string;
  dispenser_condition: string;
  comment: string;
}

const EMPTY: FormState = {
  name: "",
  type: "",
  contactPersonName: "",
  contactPersonContact: "",
  region: "",
  district: "",
  division: "",
  village: "",
  latitude: "",
  longitude: "",
  has_condom_dispenser: "",
  dispenser_condition: "",
  comment: "",
};

const TYPE_SUGGESTIONS = ["Bar", "Hotel", "Restaurant", "Lodge", "Nightclub"];
const REQUIRED = [
  "name",
  "contactPersonName",
  "contactPersonContact",
  "type",
  "region",
  "district",
  "division",
  "latitude",
  "longitude",
] as const;

const validate = (field: string, raw: string): string => {
  const value = raw ?? "";
  switch (field) {
    case "name":
      if (!value.trim()) return "Enter the hotspot's name";
      return value.trim().length < 2 ? "Name must be at least 2 characters" : "";
    case "type":
      return value.trim() ? "" : "Enter or choose a type";
    case "contactPersonName":
      if (!value.trim()) return "Enter the contact person's name";
      return value.trim().length < 2 ? "Name must be at least 2 characters" : "";
    case "contactPersonContact":
      if (!value.trim()) return "Enter a phone number";
      return /^[0-9+\-\s()]+$/.test(value) ? "" : "Enter a valid phone number";
    case "region":
      return value ? "" : "Choose a region";
    case "district":
      return value ? "" : "Choose a district";
    case "division":
      return value.trim() ? "" : "Enter the division";
    case "latitude":
      if (!value.trim()) return "Latitude is required";
      return isNaN(Number(value)) || Number(value) < -90 || Number(value) > 90
        ? "Must be between -90 and 90"
        : "";
    case "longitude":
      if (!value.trim()) return "Longitude is required";
      return isNaN(Number(value)) || Number(value) < -180 || Number(value) > 180
        ? "Must be between -180 and 180"
        : "";
  }
  return "";
};

const MappedHotspotsScreen: React.FC = () => {
  const { user } = useGlobalContext();
  const { colors } = useTheme();
  const { contentStyle, gutter, isCompact } = useResponsive();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();

  /* ---------------- mapped hotspots list ---------------- */
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [sortBy, setSortBy] = useState("name");
  const [refreshing, setRefreshing] = useState(false);

  const hotspotsQuery = useQuery({
    queryKey: ["hotspots-by-user", user?.id],
    queryFn: () => getUserHotSpots(user?.id),
    enabled: !!user?.id,
  });

  const hotspots: Hotspot[] = useMemo(() => {
    const d: any = hotspotsQuery.data;
    if (!d) return [];
    return Array.isArray(d) ? d : (Object.values(d) as Hotspot[]);
  }, [hotspotsQuery.data]);

  useFocusEffect(
    useCallback(() => {
      if (user?.id) hotspotsQuery.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]),
  );

  const counts = useMemo(
    () => ({
      all: hotspots.length,
      active: hotspots.filter((h) => h.status?.toLowerCase() === "active").length,
      inactive: hotspots.filter((h) => h.status?.toLowerCase() === "inactive").length,
    }),
    [hotspots],
  );

  const filteredHotspots = useMemo(() => {
    let list = [...hotspots];
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((h) =>
        [h.name, h.district, h.contact_person_name, h.type].some((v) =>
          v?.toLowerCase().includes(q),
        ),
      );
    }
    if (statusFilter !== "all") list = list.filter((h) => h.status?.toLowerCase() === statusFilter);
    list.sort((a, b) => {
      switch (sortBy) {
        case "district":
          return (a.district || "").localeCompare(b.district || "");
        case "status":
          return (a.status || "").localeCompare(b.status || "");
        case "date":
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        default:
          return (a.name || "").localeCompare(b.name || "");
      }
    });
    return list;
  }, [hotspots, searchQuery, statusFilter, sortBy]);

  const onRefresh = async () => {
    setRefreshing(true);
    await hotspotsQuery.refetch();
    setRefreshing(false);
  };

  /* ---------------- add-hotspot form ---------------- */
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [locationState, setLocationState] = useState<
    "idle" | "loading" | "ok" | "denied" | "failed"
  >("idle");
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [manualCoords, setManualCoords] = useState(false);

  const { data: regionsData } = useQuery<any[], Error>({
    queryKey: ["regions"],
    queryFn: getRegions,
    enabled: formOpen,
  });
  const {
    data: districtsData,
    error: districtsError,
    isLoading: districtsLoading,
  } = useQuery<any[], Error>({
    queryKey: ["districts", form.region],
    queryFn: () => getDistricts(form.region),
    enabled: !!form.region,
    retry: 1,
  });

  const isDirty = (Object.keys(EMPTY) as (keyof FormState)[]).some(
    (k) => k !== "latitude" && k !== "longitude" && form[k] !== "",
  );

  const setField = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (touched[field]) setErrors((prev) => ({ ...prev, [field]: validate(field, value) }));
    if (formError) setFormError(null);
  };
  const blurField = (field: keyof FormState) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setErrors((prev) => ({ ...prev, [field]: validate(field, form[field]) }));
  };
  const fieldErr = (f: string) => (touched[f] ? errors[f] || undefined : undefined);

  const getCurrentLocation = async () => {
    try {
      setLocationState("loading");
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationState("denied");
        setManualCoords(true);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setForm((prev) => ({
        ...prev,
        latitude: loc.coords.latitude.toFixed(6),
        longitude: loc.coords.longitude.toFixed(6),
      }));
      setErrors((prev) => ({ ...prev, latitude: "", longitude: "" }));
      setAccuracy(loc.coords.accuracy ?? null);
      setLocationState("ok");
    } catch {
      setLocationState("failed");
      setManualCoords(true);
    }
  };

  const openForm = () => {
    setFormOpen(true);
    // Capture the location when the rider starts adding a hotspot (they're usually standing at it).
    if (!form.latitude && locationState !== "loading") getCurrentLocation();
  };

  const resetForm = () => {
    setForm(EMPTY);
    setErrors({});
    setTouched({});
    setFormError(null);
    setLocationState("idle");
    setAccuracy(null);
    setManualCoords(false);
  };

  const closeForm = async () => {
    if (!isDirty) {
      setFormOpen(false);
      return;
    }
    const ok = await confirm({
      title: "Discard this hotspot?",
      message: "What you've entered won't be saved.",
      confirmLabel: "Discard",
      cancelLabel: "Keep editing",
      tone: "danger",
      icon: "trash",
    });
    if (ok) {
      resetForm();
      setFormOpen(false);
    }
  };

  const addMutation = useMutation({
    mutationFn: (payload: any) => addHotSpot(payload),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["hotspots", user?.id] });
      await hotspotsQuery.refetch();
      resetForm();
      setFormOpen(false);
      setStatusFilter("all");
      setSearchQuery("");
      toast.success("Hotspot added.");
    },
    onError: (error: any) => {
      setFormError(friendlyError(error, "Couldn't add the hotspot. Please try again."));
    },
  });

  const submit = () => {
    setTouched(Object.fromEntries(REQUIRED.map((f) => [f, true])));
    const next: Record<string, string> = {};
    REQUIRED.forEach((f) => {
      const e = validate(f, form[f]);
      if (e) next[f] = e;
    });
    setErrors(next);
    if (next.latitude || next.longitude) setManualCoords(true);
    if (Object.keys(next).length) {
      setFormError("Please fix the highlighted fields.");
      return;
    }
    setFormError(null);

    addMutation.mutate({
      name: form.name,
      contact_person_name: form.contactPersonName,
      contact_person_telephone: form.contactPersonContact,
      latitude: form.latitude,
      longtitude: form.longitude, // (sic) the API's field name
      type: form.type,
      district: form.district,
      division: form.division,
      village: form.village,
      comment: form.comment,
      has_condom_dispenser: form.has_condom_dispenser,
      dispenser_condition: form.dispenser_condition,
      entered_by: user?.id,
    });
  };

  const handleEditHotspot = (hotspot: any) => {
    toast.info(`Editing ${hotspot.name ?? "hotspots"} is coming soon.`);
  };

  /* ---------------- render ---------------- */
  const hasCoords = !!form.latitude && !!form.longitude;
  const filtered = searchQuery.trim() !== "" || statusFilter !== "all";

  const header = (
    <View style={{ marginBottom: 12 }}>
      <AppText variant="title">Mapped hotspots</AppText>
      <AppText variant="body" color="textMuted" style={{ marginBottom: 16 }}>
        {hotspotsQuery.isLoading
          ? "Loading your hotspots…"
          : `${counts.all} hotspot${counts.all === 1 ? "" : "s"} mapped by you`}
      </AppText>

      <Input
        label="Search"
        icon="search"
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Name, district, contact or type"
        returnKeyType="search"
        autoCorrect={false}
      />

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginTop: 12 }}
        data={[
          { k: "all", label: `All (${counts.all})` },
          { k: "active", label: `Active (${counts.active})` },
          { k: "inactive", label: `Inactive (${counts.inactive})` },
        ]}
        keyExtractor={(i) => i.k}
        renderItem={({ item }) => (
          <Chip
            label={item.label}
            active={statusFilter === item.k}
            onPress={() => setStatusFilter(item.k as any)}
          />
        )}
      />

      <View style={{ marginTop: 12 }}>
        <SelectSheet
          label="Sort by"
          icon="swap-vertical"
          value={sortBy}
          onChange={setSortBy}
          options={[
            { key: "name", label: "Name", value: "name" },
            { key: "district", label: "District", value: "district" },
            { key: "status", label: "Status", value: "status" },
            { key: "date", label: "Newest first", value: "date" },
          ]}
        />
      </View>

      {filtered ? (
        <AppText variant="caption" color="textMuted" style={{ marginTop: 12 }}>
          {filteredHotspots.length} match{filteredHotspots.length === 1 ? "" : "es"}
          {searchQuery.trim() ? ` for "${searchQuery.trim()}"` : ""}
        </AppText>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={filteredHotspots}
        keyExtractor={(h) => String(h.id)}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[contentStyle, { padding: gutter, paddingBottom: 112 }]}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item }) => <HotspotCard hotspot={item as any} onEdit={handleEditHotspot} />}
        ListEmptyComponent={
          hotspotsQuery.isLoading ? (
            <View style={{ gap: 12 }}>
              <Skeleton height={150} />
              <Skeleton height={150} />
            </View>
          ) : hotspotsQuery.isError ? (
            <EmptyState
              icon="cloud-offline-outline"
              title="Couldn't load hotspots"
              message={friendlyError(hotspotsQuery.error)}
              actionLabel="Try again"
              onAction={() => hotspotsQuery.refetch()}
            />
          ) : filtered ? (
            <EmptyState
              icon="search-outline"
              title="No hotspots found"
              message="Try a different search or filter."
              actionLabel="Clear filters"
              onAction={() => {
                setSearchQuery("");
                setStatusFilter("all");
              }}
            />
          ) : (
            <EmptyState
              icon="location-outline"
              title="No mapped hotspots yet"
              message="Map your first hotspot to start tracking it."
              actionLabel="Add hotspot"
              onAction={openForm}
            />
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.brand}
            colors={[colors.brand]}
          />
        }
      />

      <Fab label="Add hotspot" icon="add" onPress={openForm} />

      <FormModal
        visible={formOpen}
        title="Add hotspot"
        subtitle="Map a new distribution point"
        onClose={closeForm}
        error={formError}
        footer={
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Button title="Clear" variant="ghost" onPress={resetForm} style={{ flex: 1 }} />
            <Button
              title={addMutation.isPending ? "Saving…" : "Save hotspot"}
              icon="checkmark"
              onPress={submit}
              loading={addMutation.isPending}
              style={{ flex: 2 }}
            />
          </View>
        }
      >
        <FormSection icon="business-outline" title="About the hotspot">
          <Input
            label="Hotspot name *"
            value={form.name}
            onChangeText={(v) => setField("name", v)}
            onBlur={() => blurField("name")}
            placeholder="e.g. Sunset Bar"
            error={fieldErr("name")}
          />
          <Input
            label="Type *"
            value={form.type}
            onChangeText={(v) => setField("type", v)}
            onBlur={() => blurField("type")}
            placeholder="Choose below or type your own"
            error={fieldErr("type")}
            containerStyle={{ marginTop: 16 }}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 10 }}>
            {TYPE_SUGGESTIONS.map((t) => (
              <Chip
                key={t}
                label={t}
                active={form.type.toLowerCase() === t.toLowerCase()}
                onPress={() => setField("type", t)}
              />
            ))}
          </View>
        </FormSection>

        <FormSection icon="person-outline" title="Contact person">
          <Input
            label="Name *"
            value={form.contactPersonName}
            onChangeText={(v) => setField("contactPersonName", v)}
            onBlur={() => blurField("contactPersonName")}
            placeholder="Full name"
            error={fieldErr("contactPersonName")}
          />
          <Input
            label="Phone *"
            value={form.contactPersonContact}
            onChangeText={(v) => setField("contactPersonContact", v)}
            onBlur={() => blurField("contactPersonContact")}
            placeholder="e.g. 0700 000 000"
            keyboardType="phone-pad"
            error={fieldErr("contactPersonContact")}
            containerStyle={{ marginTop: 16 }}
          />
        </FormSection>

        <FormSection icon="map-outline" title="Where is it?">
          <SelectSheet
            label="Region *"
            placeholder="Choose a region"
            value={form.region}
            options={(regionsData ?? []).map((o, i) => ({
              key: i.toString(),
              label: o.region,
              value: o.region_uid,
            }))}
            onChange={(value: string) => {
              setForm((prev) => ({ ...prev, region: value, district: "" }));
              setTouched((p) => ({ ...p, region: true }));
              setErrors((p) => ({ ...p, region: "", district: "" }));
            }}
            error={fieldErr("region")}
          />
          <View style={{ marginTop: 16 }}>
            <SelectSheet
              label="District *"
              placeholder={form.region ? "Choose a district" : "Choose a region first"}
              value={form.district}
              options={(districtsData ?? []).map((o, i) => ({
                key: i.toString(),
                label: o.district || o.name || o.label,
                value: o.district || o.name || o.value,
              }))}
              onChange={(value: string) => {
                setField("district", value);
                setTouched((p) => ({ ...p, district: true }));
              }}
              error={
                fieldErr("district") ??
                (districtsError
                  ? "Couldn't load districts. Check your connection and try again."
                  : undefined)
              }
            />
            {districtsLoading ? (
              <AppText variant="caption" color="textMuted" style={{ marginTop: 6 }}>
                Loading districts…
              </AppText>
            ) : null}
          </View>
          <View style={{ flexDirection: isCompact ? "column" : "row", gap: 16, marginTop: 16 }}>
            <Input
              label="Division *"
              value={form.division}
              onChangeText={(v) => setField("division", v)}
              onBlur={() => blurField("division")}
              placeholder="Division"
              error={fieldErr("division")}
              containerStyle={{ flex: 1 }}
            />
            <Input
              label="Village"
              value={form.village}
              onChangeText={(v) => setField("village", v)}
              placeholder="Village"
              containerStyle={{ flex: 1 }}
            />
          </View>
        </FormSection>

        <FormSection
          icon="navigate-outline"
          title="Pin on the map"
          hint="Stand at the hotspot and capture your location for the most accurate pin."
        >
          <View
            accessibilityLiveRegion="polite"
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: locationState === "ok" ? colors.successSoft : colors.surfaceAlt,
              borderRadius: 12,
              padding: 12,
            }}
          >
            <Ionicons
              name={
                locationState === "ok"
                  ? "checkmark-circle"
                  : locationState === "loading"
                    ? "time-outline"
                    : "locate-outline"
              }
              size={22}
              color={locationState === "ok" ? colors.success : colors.textMuted}
            />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <AppText variant="bodyStrong">
                {locationState === "loading"
                  ? "Finding your location…"
                  : hasCoords
                    ? `${form.latitude}, ${form.longitude}`
                    : "No location yet"}
              </AppText>
              <AppText variant="caption" color="textMuted">
                {locationState === "ok" && accuracy
                  ? `Accurate to about ${Math.round(accuracy)} m`
                  : locationState === "denied"
                    ? "Location permission was denied. Enter coordinates manually."
                    : locationState === "failed"
                      ? "Couldn't get your location. Try again or enter it manually."
                      : "Tap below to capture where you are."}
              </AppText>
            </View>
          </View>
          <Button
            title={hasCoords ? "Update my location" : "Use my current location"}
            icon="locate"
            variant="secondary"
            loading={locationState === "loading"}
            onPress={getCurrentLocation}
            style={{ marginTop: 12 }}
          />
          <Chip
            label={manualCoords ? "Hide manual entry" : "Enter coordinates manually"}
            active={false}
            onPress={() => setManualCoords((v) => !v)}
          />
          {manualCoords ? (
            <View style={{ flexDirection: isCompact ? "column" : "row", gap: 16, marginTop: 12 }}>
              <Input
                label="Latitude *"
                value={form.latitude}
                onChangeText={(v) => setField("latitude", v)}
                onBlur={() => blurField("latitude")}
                placeholder="0.000000"
                keyboardType="numbers-and-punctuation"
                error={fieldErr("latitude")}
                containerStyle={{ flex: 1 }}
              />
              <Input
                label="Longitude *"
                value={form.longitude}
                onChangeText={(v) => setField("longitude", v)}
                onBlur={() => blurField("longitude")}
                placeholder="0.000000"
                keyboardType="numbers-and-punctuation"
                error={fieldErr("longitude")}
                containerStyle={{ flex: 1 }}
              />
            </View>
          ) : fieldErr("latitude") || fieldErr("longitude") ? (
            <AppText variant="caption" color="danger" style={{ marginTop: 8 }}>
              Capture your location or enter coordinates manually.
            </AppText>
          ) : null}
        </FormSection>

        <FormSection icon="shield-checkmark-outline" title="Condom dispenser">
          <AppText variant="label" color="textMuted" style={{ marginBottom: 8 }}>
            Does this hotspot have a dispenser?
          </AppText>
          <SegmentedControl
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]}
            value={form.has_condom_dispenser as "yes" | "no"}
            onChange={(v) => setField("has_condom_dispenser", v)}
          />
          {form.has_condom_dispenser === "yes" ? (
            <Input
              label="Dispenser condition"
              value={form.dispenser_condition}
              onChangeText={(v) => setField("dispenser_condition", v)}
              placeholder="e.g. Working, needs repair"
              containerStyle={{ marginTop: 16 }}
            />
          ) : null}
        </FormSection>

        <FormSection icon="chatbox-ellipses-outline" title="Notes">
          <Input
            label="Comments (optional)"
            value={form.comment}
            onChangeText={(v) => setField("comment", v)}
            placeholder="Anything else worth recording"
            multiline
            numberOfLines={3}
          />
        </FormSection>
        {dialog}
      </FormModal>
    </SafeAreaView>
  );
};

export default MappedHotspotsScreen;
