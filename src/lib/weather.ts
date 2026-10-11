// Weather for a match, from Open-Meteo (free, no key).
// summariseWeather is pure and tested; fetchMatchWeather does the network calls.

export interface HourlyWeather {
  time: string[]; // local time, e.g. "2026-10-06T19:00"
  temperature_2m: (number | null)[];
  relative_humidity_2m: (number | null)[];
  dew_point_2m: (number | null)[];
  precipitation: (number | null)[];
  cloud_cover: (number | null)[];
  wind_speed_10m: (number | null)[];
}

export interface WeatherSummary {
  tempC: number | null;
  humidityPct: number | null;
  dewPointC: number | null;
  rainMm: number | null; // total over the window
  cloudPct: number | null;
  windKmh: number | null;
  hoursUsed: number;
}

const avg = (xs: (number | null)[]): number | null => {
  const ok = xs.filter((x): x is number => x !== null);
  return ok.length === 0 ? null : Math.round((ok.reduce((a, b) => a + b, 0) / ok.length) * 10) / 10;
};

// Averages the hours from startHour (inclusive) to endHour (exclusive), local time.
// Missing numbers stay null: nothing is made up.
export function summariseWeather(h: HourlyWeather, startHour = 19, endHour = 22): WeatherSummary {
  const idx = h.time.map((t, i) => ({ hour: Number(t.slice(11, 13)), i })).filter((x) => x.hour >= startHour && x.hour < endHour).map((x) => x.i);
  const pick = (xs: (number | null)[]) => idx.map((i) => xs[i] ?? null);
  const rain = pick(h.precipitation).filter((x): x is number => x !== null);
  return {
    tempC: avg(pick(h.temperature_2m)),
    humidityPct: avg(pick(h.relative_humidity_2m)),
    dewPointC: avg(pick(h.dew_point_2m)),
    rainMm: rain.length === 0 ? null : Math.round(rain.reduce((a, b) => a + b, 0) * 10) / 10,
    cloudPct: avg(pick(h.cloud_cover)),
    windKmh: avg(pick(h.wind_speed_10m)),
    hoursUsed: idx.length,
  };
}

export interface MatchWeather {
  source: "open-meteo-archive";
  kind: "observed"; // actual weather on the day, used in place of a pre-match forecast
  place: string;
  latitude: number;
  longitude: number;
  timezone: string;
  date: string;
  window: string;
  assumption: string;
  summary: WeatherSummary;
}

export async function fetchMatchWeather(city: string, date: string): Promise<MatchWeather> {
  const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`);
  if (!geo.ok) throw new Error(`Geocoding failed: HTTP ${geo.status}`);
  const place = (await geo.json()).results?.[0];
  if (!place) throw new Error(`Open-Meteo could not find a place called "${city}"`);

  const vars = "temperature_2m,relative_humidity_2m,dew_point_2m,precipitation,cloud_cover,wind_speed_10m";
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${place.latitude}&longitude=${place.longitude}` +
    `&start_date=${date}&end_date=${date}&hourly=${vars}&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather request failed: HTTP ${res.status}`);
  const body = await res.json();
  if (!body.hourly) throw new Error("Open-Meteo returned no hourly weather");

  return {
    source: "open-meteo-archive",
    kind: "observed",
    place: `${place.name}, ${place.country}`,
    latitude: place.latitude,
    longitude: place.longitude,
    timezone: body.timezone,
    date,
    window: "19:00-22:00 local",
    assumption: "Cricsheet has no start time, so an evening start is assumed.",
    summary: summariseWeather(body.hourly as HourlyWeather),
  };
}
