export interface DeliveryZone {
  id: string;
  pin_code: string;
  name: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  base_risk: number;
}

export interface DarkStore {
  id: string;
  store_code: string;
  name: string;
  delivery_zone_id: string;
  platform: 'blinkit' | 'zepto' | 'instamart';
  latitude: number;
  longitude: number;
}
