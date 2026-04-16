import { db } from '../config/database.js';
import { redis } from '../config/redis.js';
import { fetchWeather, type WeatherData } from '../external/weather.client.js';
import { fetchAQI, type AQIData } from '../external/aqi.client.js';
import {
  WEATHER_CACHE_TTL_SECONDS,
  TRIGGER_DEDUP_WINDOW_HOURS,
} from '@gigshield/shared';
import type { DisruptionType, Severity, DisruptionEvent } from '@gigshield/shared';
import { randomUUID } from 'crypto';
import { events } from './events.service.js';

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

interface ZoneEnvironment {
  weather: WeatherData;
  aqi: AQIData;
}

async function getCachedWeather(zoneId: string, lat: number, lng: number): Promise<WeatherData> {
  const key = `weather:${zoneId}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const data = await fetchWeather(lat, lng);
  await redis.set(key, JSON.stringify(data), 'EX', WEATHER_CACHE_TTL_SECONDS);
  return data;
}

async function getCachedAQI(zoneId: string, lat: number, lng: number): Promise<AQIData> {
  const key = `aqi:${zoneId}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const data = await fetchAQI(lat, lng);
  await redis.set(key, JSON.stringify(data), 'EX', WEATHER_CACHE_TTL_SECONDS);
  return data;
}

function determineSeverity(eventType: DisruptionType, value: number): Severity {
  switch (eventType) {
    case 'EXTREME_HEAT':
      if (value > 50) return 'EXTREME';
      if (value > 48) return 'SEVERE';
      return 'MODERATE';
    case 'HEAVY_RAINFALL':
      if (value > 120) return 'EXTREME';
      if (value > 90) return 'SEVERE';
      return 'MODERATE';
    case 'SEVERE_POLLUTION':
      if (value > 500) return 'EXTREME';
      if (value > 450) return 'SEVERE';
      return 'MODERATE';
    default:
      return 'MODERATE';
  }
}

function estimateDuration(severity: Severity): number {
  switch (severity) {
    case 'EXTREME': return 12;
    case 'SEVERE': return 8;
    case 'MODERATE': return 4;
  }
}

async function hasDuplicate(zoneId: string, eventType: DisruptionType): Promise<boolean> {
  const cutoff = new Date(Date.now() - TRIGGER_DEDUP_WINDOW_HOURS * 60 * 60 * 1000);
  const existing = await db('disruption_events')
    .where({ delivery_zone_id: zoneId, event_type: eventType })
    .where('event_timestamp', '>=', cutoff)
    .first();
  return !!existing;
}

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

export async function checkAllZones(): Promise<DisruptionEvent[]> {
  const zones = await db('delivery_zones').select('*');
  const newEvents: DisruptionEvent[] = [];

  for (const zone of zones) {
    try {
      const weather = await getCachedWeather(zone.id, zone.latitude, zone.longitude);
      const aqi = await getCachedAQI(zone.id, zone.latitude, zone.longitude);

      // Evaluate each threshold
      const breaches: { type: DisruptionType; value: number; sourceData: Record<string, unknown> }[] = [];

      if (weather.temp > 45) {
        breaches.push({
          type: 'EXTREME_HEAT',
          value: weather.temp,
          sourceData: { temp: weather.temp, source: 'openweathermap', raw: weather.raw },
        });
      }

      if (weather.rainfall_1h > 65) {
        breaches.push({
          type: 'HEAVY_RAINFALL',
          value: weather.rainfall_1h,
          sourceData: { rainfall_1h: weather.rainfall_1h, source: 'openweathermap', raw: weather.raw },
        });
      }

      if (aqi.aqi > 400) {
        breaches.push({
          type: 'SEVERE_POLLUTION',
          value: aqi.aqi,
          sourceData: { aqi: aqi.aqi, dominant_pollutant: aqi.dominant_pollutant, source: 'aqicn', raw: aqi.raw },
        });
      }

      for (const breach of breaches) {
        const duplicate = await hasDuplicate(zone.id, breach.type);
        if (duplicate) continue;

        const severity = determineSeverity(breach.type, breach.value);
        const durationHours = estimateDuration(severity);

        const id = randomUUID();
        const now = new Date();

        await db('disruption_events').insert({
          id,
          event_type: breach.type,
          severity,
          delivery_zone_id: zone.id,
          affected_dark_store_ids: JSON.stringify([]),
          duration_estimate_hours: durationHours,
          source_data: JSON.stringify(breach.sourceData),
          verified_by_sources: JSON.stringify(['automated_trigger']),
          event_timestamp: now,
          created_at: now,
        });

        const created = await db('disruption_events').where({ id }).first();
        newEvents.push(created as DisruptionEvent);

        console.log(
          `[TriggerService] New ${breach.type} event in zone ${zone.name} (severity: ${severity})`
        );
      }
    } catch (err) {
      console.error(`[TriggerService] Error checking zone ${zone.id}:`, err);
    }
  }

  return newEvents;
}

export async function createManualEvent(
  zoneId: string,
  eventType: DisruptionType,
  severity: Severity,
  durationHours: number
): Promise<DisruptionEvent> {
  const id = randomUUID();
  const now = new Date();

  await db('disruption_events').insert({
    id,
    event_type: eventType,
    severity,
    delivery_zone_id: zoneId,
    affected_dark_store_ids: '{}',
    duration_estimate_hours: durationHours,
    source_data: JSON.stringify({ source: 'manual_admin' }),
    verified_by_sources: '{admin}',
    event_timestamp: now,
    created_at: now,
  });

  const event = await db('disruption_events').where({ id }).first();

  try {
    events.emitEvent('TRIGGER_FIRED', {
      event_id: event.id,
      event_type: eventType,
      severity,
      zone_id: zoneId,
      source: 'ADMIN_TRIGGER',
    });
  } catch {}

  return event as DisruptionEvent;
}

export async function getZoneWeather(
  zoneId: string
): Promise<{ weather: WeatherData; aqi: AQIData }> {
  const zone = await db('delivery_zones').where({ id: zoneId }).first();
  if (!zone) throw new Error(`Zone ${zoneId} not found`);

  const weather = await getCachedWeather(zone.id, zone.latitude, zone.longitude);
  const aqi = await getCachedAQI(zone.id, zone.latitude, zone.longitude);

  return { weather, aqi };
}
