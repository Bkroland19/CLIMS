import { StyleProp, ViewStyle, TextStyle } from "react-native";

interface MyComponentProps {
  title: string;
  handlePress: () => void;
  containerStyles?: StyleProp<ViewStyle>;
  textStyles?: StyleProp<TextStyle>;
  isLoading: boolean;
}

interface Login {
  username: string;
  password: string;
}

interface Notification {
  user_id: number | null;
  hotspot_id: number | null;
}

interface IHotspot {
  id: number;
  hid?: string;
  mapped_on?: string;
  mapped_by?: string;
  type?: string;
  name?: string;
  district?: string;
  division?: string;
  village?: string;
  contact_person_id?: string;
  contact_person_name?: string;
  contact_person_telephone?: string;
  status?: string;
  has_condom_dispenser?: string;
  dispenser_condition?: string;
  comment?: string;
  latitude?: string;
  longtitude?: string;
  entered_by?: string;
  entry_date?: string;
  last_modified?: string;
  modified_by?: string;
  created_at?: string;
  updated_at?: string;
}

export type { MyComponentProps, Login, Notification, IHotspot };
