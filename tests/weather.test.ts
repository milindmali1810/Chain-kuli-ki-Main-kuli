import { describe, it, expect } from "vitest";
import { summariseWeather, type HourlyWeather } from "@/lib/weather";

// Hours 18:00 to 22:00. Only 19:00, 20:00 and 21:00 are inside the default window.
const hourly: HourlyWeather = {
  time: ["2026-10-06T18:00", "2026-10-06T19:00", "2026-10-06T20:00", "2026-10-06T21:00", "2026-10-06T22:00"],
  temperature_2m: [30, 28, 26, 24, 20],
  relative_humidity_2m: [50, 60, 70, 80, 99],
  dew_point_2m: [18, 19, 20, 21, 22],
  precipitation: [5, 0, 0.5, 0.25, 9],
  cloud_cover: [10, 20, 40, 60, 100],
  wind_speed_10m: [5, 6, 8, 10, 30],
};

describe("summariseWeather", () => {
  it("averages only the 19:00-21:59 hours", () => {
    // temp: (28 + 26 + 24) / 3 = 26      humidity: (60 + 70 + 80) / 3 = 70
    // dew: (19 + 20 + 21) / 3 = 20       cloud: (20 + 40 + 60) / 3 = 40
    // wind: (6 + 8 + 10) / 3 = 8         rain total: 0 + 0.5 + 0.25 = 0.8 (rounded to 1 decimal)
    expect(summariseWeather(hourly)).toEqual({
      tempC: 26,
      humidityPct: 70,
      dewPointC: 20,
      rainMm: 0.8,
      cloudPct: 40,
      windKmh: 8,
      hoursUsed: 3,
    });
  });

  it("a different window uses different hours", () => {
    expect(summariseWeather(hourly, 18, 19).tempC).toBe(30);
  });

  it("missing numbers stay null, nothing is invented", () => {
    const gaps = { ...hourly, relative_humidity_2m: [null, null, null, null, null], precipitation: [null, null, null, null, null] };
    const s = summariseWeather(gaps);
    expect(s.humidityPct).toBeNull();
    expect(s.rainMm).toBeNull();
    expect(s.tempC).toBe(26);
  });

  it("a window with no hours gives nulls and hoursUsed 0", () => {
    const s = summariseWeather(hourly, 3, 4);
    expect(s.hoursUsed).toBe(0);
    expect(s.tempC).toBeNull();
  });
});
