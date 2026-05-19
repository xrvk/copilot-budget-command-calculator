/**
 * Simplified NOAA solar position algorithm.
 * Calculates sunrise and sunset times from geographic coordinates and date.
 * Pure math — no external API calls.
 *
 * Reference: https://gml.noaa.gov/grad/solcalc/solareqns.PDF
 */

const DEG = Math.PI / 180
const RAD = 180 / Math.PI

function toJulianDay(year: number, month: number, day: number): number {
  if (month <= 2) {
    year -= 1
    month += 12
  }
  const A = Math.floor(year / 100)
  const B = 2 - A + Math.floor(A / 4)
  return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + B - 1524.5
}

function julianCentury(jd: number): number {
  return (jd - 2451545) / 36525
}

function sunGeomMeanLongitude(t: number): number {
  let L0 = 280.46646 + t * (36000.76983 + 0.0003032 * t)
  L0 = L0 % 360
  if (L0 < 0) L0 += 360
  return L0
}

function sunGeomMeanAnomaly(t: number): number {
  return 357.52911 + t * (35999.05029 - 0.0001537 * t)
}

function eccentricityEarthOrbit(t: number): number {
  return 0.016708634 - t * (0.000042037 + 0.0000001267 * t)
}

function sunEquationOfCenter(t: number): number {
  const M = sunGeomMeanAnomaly(t) * DEG
  return Math.sin(M) * (1.914602 - t * (0.004817 + 0.000014 * t))
       + Math.sin(2 * M) * (0.019993 - 0.000101 * t)
       + Math.sin(3 * M) * 0.000289
}

function sunTrueLongitude(t: number): number {
  return sunGeomMeanLongitude(t) + sunEquationOfCenter(t)
}

function sunApparentLongitude(t: number): number {
  const omega = 125.04 - 1934.136 * t
  return sunTrueLongitude(t) - 0.00569 - 0.00478 * Math.sin(omega * DEG)
}

function meanObliquityOfEcliptic(t: number): number {
  return 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60
}

function obliquityCorrection(t: number): number {
  const omega = 125.04 - 1934.136 * t
  return meanObliquityOfEcliptic(t) + 0.00256 * Math.cos(omega * DEG)
}

function sunDeclination(t: number): number {
  const e = obliquityCorrection(t) * DEG
  const lambda = sunApparentLongitude(t) * DEG
  return Math.asin(Math.sin(e) * Math.sin(lambda)) * RAD
}

function equationOfTime(t: number): number {
  const epsilon = obliquityCorrection(t) * DEG
  const L0 = sunGeomMeanLongitude(t) * DEG
  const e = eccentricityEarthOrbit(t)
  const M = sunGeomMeanAnomaly(t) * DEG
  const y = Math.tan(epsilon / 2) ** 2

  return 4 * RAD * (
    y * Math.sin(2 * L0)
    - 2 * e * Math.sin(M)
    + 4 * e * y * Math.sin(M) * Math.cos(2 * L0)
    - 0.5 * y * y * Math.sin(4 * L0)
    - 1.25 * e * e * Math.sin(2 * M)
  )
}

/** Hour angle at sunrise/sunset for a given solar zenith (degrees). */
function hourAngle(lat: number, decl: number, zenith: number): number {
  const latRad = lat * DEG
  const declRad = decl * DEG
  const zenithRad = zenith * DEG
  const cosHA = (Math.cos(zenithRad) - Math.sin(latRad) * Math.sin(declRad))
              / (Math.cos(latRad) * Math.cos(declRad))
  // Clamp for polar regions (midnight sun / polar night)
  if (cosHA > 1) return NaN   // no sunrise (polar night)
  if (cosHA < -1) return NaN  // no sunset (midnight sun)
  return Math.acos(cosHA) * RAD
}

interface SunTimes {
  sunrise: Date
  sunset: Date
}

// Standard solar zenith for sunrise/sunset (accounting for refraction)
const ZENITH = 90.833

/**
 * Calculate sunrise and sunset for a given location and date.
 * Returns null if the sun doesn't rise or set (polar regions).
 */
function calcSunTimes(lat: number, lng: number, date: Date): SunTimes | null {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()

  const jd = toJulianDay(year, month, day)
  const t = julianCentury(jd)

  const eot = equationOfTime(t)
  const decl = sunDeclination(t)
  const ha = hourAngle(lat, decl, ZENITH)

  if (isNaN(ha)) return null

  // Solar noon in minutes from midnight UTC
  const solarNoonMinutes = (720 - 4 * lng - eot)
  const timezoneOffsetMinutes = date.getTimezoneOffset()

  // Sunrise and sunset in minutes from midnight local time
  // getTimezoneOffset() = UTC − local, so subtract to convert UTC → local
  const sunriseMinutes = solarNoonMinutes - ha * 4 - timezoneOffsetMinutes
  const sunsetMinutes = solarNoonMinutes + ha * 4 - timezoneOffsetMinutes

  const sunrise = new Date(date)
  sunrise.setHours(0, 0, 0, 0)
  sunrise.setMinutes(sunriseMinutes)

  const sunset = new Date(date)
  sunset.setHours(0, 0, 0, 0)
  sunset.setMinutes(sunsetMinutes)

  return { sunrise, sunset }
}

/**
 * Determine if it should be dark based on current time vs sunset/sunrise.
 * Dark: from sunset + offsetMinutes until sunrise of the next day.
 */
export function isDarkTime(
  lat: number,
  lng: number,
  now: Date = new Date(),
  offsetMinutes = 60
): boolean {
  const today = calcSunTimes(lat, lng, now)
  if (!today) {
    // Polar region fallback: check if sun is above or below horizon
    // by checking declination vs latitude
    const jd = toJulianDay(now.getFullYear(), now.getMonth() + 1, now.getDate())
    const decl = sunDeclination(julianCentury(jd))
    // If declination + lat > 90, it's midnight sun (light). Otherwise polar night (dark).
    return (decl + lat) < 0 || (lat - decl) > 90
  }

  const darkAfter = new Date(today.sunset.getTime() + offsetMinutes * 60_000)

  if (now >= darkAfter) {
    return true
  }

  if (now < today.sunrise) {
    return true
  }

  return false
}
