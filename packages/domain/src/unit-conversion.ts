import { ValidationError } from "./errors";

// Restricted, independently authored mathematical pack, not a general UCUM parser.
export const UNIT_PACK_VERSION = "curasphere-units-2026.11.1";
export const UNIT_ROUNDING = "half-away-from-zero";
type Rational = { n: bigint; d: bigint };
const q = (n: bigint, d = 1n): Rational => ({ n, d });
const add = (a: Rational, b: Rational) => q(a.n * b.d + b.n * a.d, a.d * b.d);
const mul = (a: Rational, b: Rational) => q(a.n * b.n, a.d * b.d);
const div = (a: Rational, b: Rational) => q(a.n * b.d, a.d * b.n);
type Unit = { dimension: string; canonical: string; factor: Rational; offset: Rational };
const unit = (dimension: string, canonical: string, n: bigint, d = 1n, offset = q(0n)): Unit => ({ dimension, canonical, factor: q(n, d), offset });
const units: Record<string, Unit> = {
  kg: unit("mass", "kg", 1n), g: unit("mass", "kg", 1n, 1000n), mg: unit("mass", "kg", 1n, 1000000n),
  m: unit("length", "m", 1n), cm: unit("length", "m", 1n, 100n),
  L: unit("volume", "L", 1n), mL: unit("volume", "L", 1n, 1000n),
  K: unit("temperature", "K", 1n), Cel: unit("temperature", "K", 1n, 1n, q(27315n,100n)),
  "[degF]": unit("temperature", "K", 5n, 9n, q(45967n,180n)),
  "g/L": unit("mass concentration", "g/L", 1n), "mg/L": unit("mass concentration", "g/L", 1n,1000n), "mg/dL": unit("mass concentration", "g/L", 1n,100n),
  "mol/L": unit("substance concentration", "mol/L", 1n), "mmol/L": unit("substance concentration", "mol/L", 1n,1000n),
};
export const SUPPORTED_UNIT_CODES = Object.freeze(Object.keys(units));
export type ConversionInput = { value: string; from: string; to: string; precision: number; packVersion: string };

function decimal(text: string): Rational {
  if (typeof text !== "string" || !/^-?(?:0|[1-9]\d{0,11})(?:\.\d{1,9})?$/.test(text)) {
    throw new ValidationError("invalid", "Enter a decimal string with up to 12 integer and 9 fractional digits; exponent and locale notation are unsupported.");
  }
  const [whole, fraction = ""] = text.split(".");
  return q(BigInt(whole + fraction), 10n ** BigInt(fraction.length));
}
function rounded(value: Rational, places: number) {
  const scale = 10n ** BigInt(places);
  const negative = value.n < 0n;
  const numerator = (negative ? -value.n : value.n) * scale;
  let result = numerator / value.d;
  if ((numerator % value.d) * 2n >= value.d) result += 1n;
  const digits = result.toString().padStart(places + 1, "0");
  return `${negative && result !== 0n ? "-" : ""}${places ? `${digits.slice(0,-places)}.${digits.slice(-places)}` : digits}`;
}
export function convertRestrictedQuantity(input: ConversionInput) {
  if (!input || input.packVersion !== UNIT_PACK_VERSION) throw new ValidationError("invalid", "Select the supported unit-pack version explicitly.");
  if (!Number.isInteger(input.precision) || input.precision < 0 || input.precision > 6) throw new ValidationError("invalid", "Precision must be an integer from 0 to 6.");
  if (typeof input.from !== "string" || typeof input.to !== "string" || !Object.hasOwn(units,input.from) || !Object.hasOwn(units,input.to)) throw new ValidationError("invalid", "Unknown or ambiguous unit. Select an exact supported symbol; aliases are not inferred.");
  const source = units[input.from]; const target = units[input.to];
  if (source.dimension !== target.dimension) throw new ValidationError("invalid", "The units describe different dimensions. Analyte-specific conversions are not inferred.");
  const base = add(mul(decimal(input.value),source.factor),source.offset);
  if (source.dimension === "temperature" && base.n < 0n) throw new ValidationError("invalid", "Temperature is below absolute zero.");
  const output = div(add(base,q(-target.offset.n,target.offset.d)),target.factor);
  return { input: { value:input.value, unit:input.from }, output: { value:rounded(output,input.precision), unit:input.to }, canonical: { value:rounded(base,input.precision), unit:source.canonical }, dimension:source.dimension, packVersion:UNIT_PACK_VERSION, precision:input.precision, rounding:UNIT_ROUNDING, synthetic:true, scope:"restricted-mathematical-pack" };
}
