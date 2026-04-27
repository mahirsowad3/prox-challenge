export type WeldingProcess = "MIG" | "TIG" | "Stick";

export type InputVoltage = 120 | 240;

export type DutyCycleRating = {
  amperage: number;
  dutyCyclePercent: number;
};

export type DutyCycleCalculationResult = {
  source: "manual";
  dutyCyclePercent: number;
  weldMinutes: number;
  restMinutes: number;
  ratedPointAmperage?: number;
};

export type DutyCycleToolPayload = {
  type: "duty-cycle";
  title: string;
  process?: WeldingProcess;
  inputVoltage?: InputVoltage;
  amperage?: number;
  result?: DutyCycleCalculationResult;
  ratedPoints: DutyCycleRating[];
  notes: string[];
};

export const DUTY_CYCLE_MANUAL_PAGE = {
  source: "owner-manual.pdf",
  page: 19,
} as const;

export const DUTY_CYCLE_RATINGS: Record<
  WeldingProcess,
  Record<InputVoltage, DutyCycleRating[]>
> = {
  MIG: {
    120: [
      { amperage: 75, dutyCyclePercent: 100 },
      { amperage: 100, dutyCyclePercent: 40 },
    ],
    240: [
      { amperage: 115, dutyCyclePercent: 100 },
      { amperage: 200, dutyCyclePercent: 25 },
    ],
  },
  TIG: {
    120: [
      { amperage: 90, dutyCyclePercent: 100 },
      { amperage: 125, dutyCyclePercent: 40 },
    ],
    240: [
      { amperage: 105, dutyCyclePercent: 100 },
      { amperage: 175, dutyCyclePercent: 30 },
    ],
  },
  Stick: {
    120: [
      { amperage: 60, dutyCyclePercent: 100 },
      { amperage: 80, dutyCyclePercent: 40 },
    ],
    240: [
      { amperage: 100, dutyCyclePercent: 100 },
      { amperage: 175, dutyCyclePercent: 25 },
    ],
  },
};

const DUTY_CYCLE_INTENT_PATTERN =
  /\bduty\s*cycle\b|\boverheat(?:ing|ed)?\b|\bthermal protection\b|\bthermal overload\b|\bhow long can i weld\b|\bminutes?\s+(?:of\s+)?(?:welding|rest)\b|\brest(?:ing)?\s+time\b|\bweld(?:ing)?\s+time\b|\brated current\b|\brated limit\b/i;

const INPUT_VOLTAGE_PATTERN = /\b(120|240)\s*v(?:ac)?\b/i;
const AMPERAGE_PATTERN = /\b(\d{2,3}(?:\.\d+)?)\s*a\b/i;

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function isSupportedInputVoltage(value: number): value is InputVoltage {
  return value === 120 || value === 240;
}

function isDutyCycleIntent(message: string): boolean {
  return DUTY_CYCLE_INTENT_PATTERN.test(message);
}

function parseInputVoltage(message: string): InputVoltage | undefined {
  const match = message.match(INPUT_VOLTAGE_PATTERN);

  if (!match) {
    return undefined;
  }

  const voltage = Number(match[1]);
  return isSupportedInputVoltage(voltage) ? voltage : undefined;
}

function parseAmperage(message: string): number | undefined {
  const match = message.match(AMPERAGE_PATTERN);

  if (!match) {
    return undefined;
  }

  const amperage = Number(match[1]);
  return Number.isFinite(amperage) ? amperage : undefined;
}

function parseProcess(message: string): WeldingProcess | undefined {
  const normalized = message.toLowerCase();

  if (/\b(?:mig|wire feed|flux[- ]?cored?|flux core)\b/.test(normalized)) {
    return "MIG";
  }

  if (/\btig\b/.test(normalized)) {
    return "TIG";
  }

  if (/\bstick\b/.test(normalized)) {
    return "Stick";
  }

  return undefined;
}

export function calculateDutyCycleWindow(
  dutyCyclePercent: number
): Pick<DutyCycleCalculationResult, "weldMinutes" | "restMinutes"> {
  const weldMinutes = roundToTenth((10 * dutyCyclePercent) / 100);
  const restMinutes = roundToTenth(10 - weldMinutes);

  return { weldMinutes, restMinutes };
}

export function findExactDutyCycleResult(
  process: WeldingProcess,
  inputVoltage: InputVoltage,
  amperage: number
): DutyCycleCalculationResult | undefined {
  const rating = DUTY_CYCLE_RATINGS[process][inputVoltage].find(
    (candidate) => candidate.amperage === amperage
  );

  if (!rating) {
    return undefined;
  }

  return {
    source: "manual",
    dutyCyclePercent: rating.dutyCyclePercent,
    ratedPointAmperage: rating.amperage,
    ...calculateDutyCycleWindow(rating.dutyCyclePercent),
  };
}

export function buildDutyCycleTool(
  message: string
): DutyCycleToolPayload | null {
  if (!isDutyCycleIntent(message)) {
    return null;
  }

  const process = parseProcess(message);
  const inputVoltage = parseInputVoltage(message);
  const amperage = parseAmperage(message);
  const ratedPoints =
    process && inputVoltage ? DUTY_CYCLE_RATINGS[process][inputVoltage] : [];
  const notes = [
    "Duty cycle is the number of welding minutes allowed within a 10-minute window.",
    "Manual-listed ratings are shown as primary results.",
  ];

  let result: DutyCycleCalculationResult | undefined;

  if (process && inputVoltage && amperage !== undefined) {
    result = findExactDutyCycleResult(process, inputVoltage, amperage);

    if (!result) {
      notes.push(
        `The manual does not list a duty cycle rating at ${amperage}A for ${process} on ${inputVoltage}V. Choose one of the manual-rated amperages shown.`
      );
    }
  } else {
    notes.push(
      "Pick a process, voltage, and manual-rated amperage to calculate weld time and required cool-down time."
    );
  }

  return {
    type: "duty-cycle",
    title: "Duty Cycle Calculator",
    process,
    inputVoltage,
    amperage,
    result,
    ratedPoints,
    notes,
  };
}
