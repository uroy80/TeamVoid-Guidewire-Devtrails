export interface WeatherData {
  temp: number;
  rainfall_1h: number;
  humidity: number;
  weather_description: string;
  raw: Record<string, unknown>;
}

/**
 * Map WMO weather codes to human-readable descriptions.
 * https://open-meteo.com/en/docs  (WMO Weather interpretation codes)
 */
function weatherCodeToDescription(code: number): string {
  if (code === 0) return 'clear sky';
  if (code >= 1 && code <= 3) return 'partly cloudy';
  if (code === 45 || code === 48) return 'foggy';
  if (code >= 51 && code <= 55) return 'drizzle';
  if (code >= 56 && code <= 57) return 'freezing drizzle';
  if (code >= 61 && code <= 65) return 'rain';
  if (code >= 66 && code <= 67) return 'freezing rain';
  if (code >= 71 && code <= 75) return 'snowfall';
  if (code === 77) return 'snow grains';
  if (code >= 80 && code <= 82) return 'rain showers';
  if (code === 85 || code === 86) return 'snow showers';
  if (code === 95) return 'thunderstorm';
  if (code === 96 || code === 99) return 'thunderstorm with hail';
  return 'unknown';
}

/**
 * Fetch current weather from Open-Meteo (free, no API key required).
 */
export async function fetchWeather(lat: number, lng: number): Promise<WeatherData> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,relative_humidity_2m,rain,weather_code,wind_speed_10m` +
    `&timezone=auto`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Open-Meteo API error: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as Record<string, any>;
  const current = data.current ?? {};

  return {
    temp: current.temperature_2m ?? 0,
    rainfall_1h: current.rain ?? 0,
    humidity: current.relative_humidity_2m ?? 0,
    weather_description: weatherCodeToDescription(current.weather_code ?? -1),
    raw: data,
  };
}
