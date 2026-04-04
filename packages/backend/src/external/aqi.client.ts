import { env } from '../config/env.js';

export interface AQIData {
  aqi: number;
  dominant_pollutant: string;
  raw: Record<string, unknown>;
}

const MOCK_AQI: AQIData = {
  aqi: 156,
  dominant_pollutant: 'pm25',
  raw: {},
};

export async function fetchAQI(lat: number, lng: number): Promise<AQIData> {
  const key = env.AQICN_API_KEY;
  const url = `https://api.waqi.info/feed/geo:${lat};${lng}/?token=${key}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`[AQIClient] API HTTP error: ${response.status}, falling back to mock`);
      return { ...MOCK_AQI };
    }

    const json = (await response.json()) as Record<string, any>;

    if (json.status !== 'ok') {
      console.warn(`[AQIClient] API returned status: ${json.status}, falling back to mock`);
      return { ...MOCK_AQI };
    }

    const data = json.data;
    const aqi = typeof data.aqi === 'number' ? data.aqi : parseInt(data.aqi, 10);

    console.log(`[AQIClient] AQI for (${lat}, ${lng}): ${aqi}, dominant: ${data.dominentpol ?? 'unknown'}`);

    return {
      aqi,
      dominant_pollutant: data.dominentpol ?? 'unknown',
      raw: data,
    };
  } catch (err) {
    console.warn('[AQIClient] API call failed, falling back to mock:', (err as Error).message);
    return { ...MOCK_AQI };
  }
}
