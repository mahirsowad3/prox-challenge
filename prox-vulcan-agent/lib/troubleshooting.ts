export type TroubleshootingProcess = "MIG" | "TIG" | "Stick";

export type TroubleshootingIssueId =
  | "mig-wire-feed-no-feed"
  | "mig-birds-nest"
  | "mig-wire-stops"
  | "mig-arc-not-stable"
  | "mig-weak-arc"
  | "tig-welder-no-function"
  | "tig-lcd-no-light"
  | "tig-weak-arc"
  | "tig-arc-not-stable"
  | "stick-welder-no-function"
  | "stick-lcd-no-light"
  | "stick-weak-arc"
  | "stick-arc-not-stable";

export type TroubleshootingFlowAnswer = {
  label: string;
  targetNodeId: string;
};

export type TroubleshootingFlowNode = {
  id: string;
  prompt: string;
  process?: TroubleshootingProcess;
  source?: string;
  page?: number;
  note?: string;
  answers: TroubleshootingFlowAnswer[];
  terminalOutcome?: string;
};

export type TroubleshootingFlowDefinition = {
  issueId: TroubleshootingIssueId;
  label: string;
  process: TroubleshootingProcess;
  rootNodeId: string;
  nodes: Record<string, TroubleshootingFlowNode>;
  source: string;
  page: number;
};

export type TroubleshootingIssueOption = {
  id: TroubleshootingIssueId;
  label: string;
  process: TroubleshootingProcess;
};

export type TroubleshootingFlowchartToolPayload = {
  type: "troubleshooting-flowchart";
  title: string;
  process?: TroubleshootingProcess;
  issueId?: TroubleshootingIssueId;
  issues: TroubleshootingIssueOption[];
  flows: Record<TroubleshootingIssueId, TroubleshootingFlowDefinition>;
  startNodeId?: string;
  notes: string[];
};

const OWNER_MANUAL_SOURCE = "owner-manual.pdf";

export const TROUBLESHOOTING_MANUAL_PAGES = {
  MIG: {
    source: OWNER_MANUAL_SOURCE,
    page: 42,
  },
  TIG: {
    source: OWNER_MANUAL_SOURCE,
    page: 44,
  },
  Stick: {
    source: OWNER_MANUAL_SOURCE,
    page: 44,
  },
} as const;

type FlowSeed = {
  id: TroubleshootingIssueId;
  label: string;
  process: TroubleshootingProcess;
  rootPrompt: string;
  steps: Array<{
    question: string;
    positiveOutcome: string;
    note?: string;
  }>;
  terminalOutcome: string;
};

function buildFlow(seed: FlowSeed): TroubleshootingFlowDefinition {
  const pageReference = TROUBLESHOOTING_MANUAL_PAGES[seed.process];
  const nodes: Record<string, TroubleshootingFlowNode> = {};
  const rootNodeId = `${seed.id}-step-1`;

  seed.steps.forEach((step, index) => {
    const stepNodeId = `${seed.id}-step-${index + 1}`;
    const nextStepNodeId =
      index < seed.steps.length - 1 ? `${seed.id}-step-${index + 2}` : `${seed.id}-end`;

    nodes[stepNodeId] = {
      id: stepNodeId,
      process: seed.process,
      source: pageReference.source,
      page: pageReference.page,
      prompt: index === 0 ? seed.rootPrompt : step.question,
      note: step.note,
      answers: [
        {
          label: index === 0 ? "Yes" : "No",
          targetNodeId: nextStepNodeId,
        },
        {
          label: index === 0 ? "No" : "Yes",
          targetNodeId: `${stepNodeId}-outcome`,
        },
      ],
    };

    nodes[`${stepNodeId}-outcome`] = {
      id: `${stepNodeId}-outcome`,
      process: seed.process,
      source: pageReference.source,
      page: pageReference.page,
      prompt: step.question,
      note: step.note,
      terminalOutcome: step.positiveOutcome,
      answers: [],
    };
  });

  nodes[`${seed.id}-end`] = {
    id: `${seed.id}-end`,
    process: seed.process,
    source: pageReference.source,
    page: pageReference.page,
    prompt: "You have worked through the manual's main checks for this symptom.",
    terminalOutcome: seed.terminalOutcome,
    answers: [],
  };

  return {
    issueId: seed.id,
    label: seed.label,
    process: seed.process,
    rootNodeId,
    nodes,
    source: pageReference.source,
    page: pageReference.page,
  };
}

const FLOW_SEEDS: FlowSeed[] = [
  {
    id: "mig-wire-feed-no-feed",
    label: "Wire feed motor runs but wire does not feed properly",
    process: "MIG",
    rootPrompt: "Is the wire slipping instead of feeding cleanly through the drive system?",
    steps: [
      {
        question: "Is the wire feed pressure set correctly?",
        positiveOutcome:
          "Increase wire feed pressure properly. The manual points you to step 27 on page 17 to set tension.",
      },
      {
        question: "Is the feed roller sized for the wire you are using?",
        positiveOutcome:
          "Flip or change the feed roller to the correct size, following the feed roller instructions on page 12.",
      },
      {
        question: "Is the feed tensioner set only tight enough to stop slipping after trigger release?",
        positiveOutcome:
          "Loosen the feed tensioner so it applies only enough pressure to prevent continued spinning after the trigger is released.",
      },
    ],
    terminalOutcome:
      "The remaining manual cause is a damaged MIG gun, cable, or liner assembly. Stop here and have a qualified technician inspect and replace parts as needed.",
  },
  {
    id: "mig-birds-nest",
    label: "Wire creates a bird's nest during operation",
    process: "MIG",
    rootPrompt: "Is the wire bunching up into a bird's nest during feeding or welding?",
    steps: [
      {
        question: "Is wire feed pressure higher than needed?",
        positiveOutcome:
          "Reduce wire feed pressure and recheck the drive tension. The manual again points to step 27 on page 17.",
      },
      {
        question: "Is the contact tip the proper size for your wire?",
        positiveOutcome:
          "Replace the contact tip with the correct size for the wire being used.",
      },
      {
        question: "Is the MIG gun cable connector fully inserted into the wire feed mechanism?",
        positiveOutcome:
          "Insert the gun cable connector fully and verify it is seated correctly, following steps 13 and 14 on page 13.",
      },
    ],
    terminalOutcome:
      "The remaining manual cause is a damaged liner. Have a qualified technician inspect and repair or replace it.",
  },
  {
    id: "mig-wire-stops",
    label: "Wire stops during welding",
    process: "MIG",
    rootPrompt: "Does the wire stop feeding after welding begins?",
    steps: [
      {
        question: "Is the gun cable sharply bent or kinked?",
        positiveOutcome: "Straighten the gun cable and test again.",
      },
      {
        question: "Is the gun liner clogged, worn, or too small for the wire?",
        positiveOutcome:
          "Check the liner for obstruction and confirm it matches the wire size. Replace it if needed.",
      },
      {
        question: "Is the wire tangled or cross-wound on the spool?",
        positiveOutcome: "Correct the spool issue before feeding wire again.",
      },
      {
        question: "Are the feed rollers using the correct groove and actually gripping the wire?",
        positiveOutcome:
          "Check the feed roller groove for your wire diameter and adjust the feed tensioner so the rollers grip without crushing the wire.",
      },
    ],
    terminalOutcome:
      "The manual's remaining checks are all feed-path related. Reinspect the spool, rollers, liner, and tensioner before continuing to weld.",
  },
  {
    id: "mig-arc-not-stable",
    label: "Welding arc not stable",
    process: "MIG",
    rootPrompt: "Is the arc unstable, sputtering, or inconsistent during MIG or flux-cored welding?",
    steps: [
      {
        question: "Does the wire appear to be feeding properly?",
        positiveOutcome:
          "Start with the wire-feed troubleshooting path first. The manual says unstable MIG arc can begin with wire-feed problems.",
      },
      {
        question: "Are the contact tip and liner the correct size and still in good condition?",
        positiveOutcome:
          "Replace the contact tip or liner with the proper size for the wire if they are worn or incorrect.",
      },
      {
        question: "Are wire feed speed and polarity set correctly for the process?",
        positiveOutcome:
          "Adjust wire feed speed for a more stable arc and confirm polarity: DCEP for MIG, DCEN for self-shielded flux-cored welding.",
      },
      {
        question: "Are the gun cable, ground cable, and workpiece connection all tight and secure?",
        positiveOutcome:
          "Tighten all connections and make sure the ground clamp and MIG gun are properly secured to the machine and workpiece.",
      },
      {
        question: "Is shielding gas flow in range with the gun cable connector fully inserted and no O-rings exposed?",
        positiveOutcome:
          "Correct gas flow according to the settings chart and fully seat the MIG gun cable connector.",
      },
    ],
    terminalOutcome:
      "The remaining manual cause is a damaged MIG gun or an internal loose connection. Have a qualified technician inspect and repair or replace it.",
  },
  {
    id: "mig-weak-arc",
    label: "Weak arc strength",
    process: "MIG",
    rootPrompt: "Does the arc feel weak or lack enough heat during MIG or flux-cored welding?",
    steps: [
      {
        question: "Is your line voltage correct for the machine?",
        positiveOutcome:
          "Check the line voltage. If it is low, the manual recommends having a licensed electrician correct the supply issue.",
      },
      {
        question: "Are you using an extension cord or a non-matching power cord?",
        positiveOutcome:
          "Remove the extension cord. Use only one of the supplied power cords or an identical replacement cord.",
      },
    ],
    terminalOutcome:
      "If power delivery looks correct, switch current to the proper setting for the metal thickness before welding again.",
  },
  {
    id: "tig-welder-no-function",
    label: "Welder does not function when switched on",
    process: "TIG",
    rootPrompt: "When you switch the welder on for TIG, does it fail to function correctly?",
    steps: [
      {
        question: "Did the welder recently run long enough to trip thermal protection?",
        positiveOutcome:
          "Let the unit cool and reduce the duration or frequency of welding periods. The manual points back to duty cycle guidance.",
      },
      {
        question: "Is the ground clamp attached to the workpiece?",
        positiveOutcome: "Attach the ground clamp securely to the workpiece.",
      },
      {
        question: "Is shielding gas connected to the welder?",
        positiveOutcome: "Connect shielding gas before trying again.",
      },
    ],
    terminalOutcome:
      "The remaining manual cause is a faulty or improperly connected trigger. A qualified technician should inspect and secure or replace it.",
  },
  {
    id: "tig-lcd-no-light",
    label: "LCD display does not light when welder is switched on",
    process: "TIG",
    rootPrompt: "Does the LCD stay dark when you switch the welder on for TIG?",
    steps: [
      {
        question: "Is the unit fully connected to a powered outlet?",
        positiveOutcome:
          "Verify the outlet voltage and confirm the connection to the outlet is fully seated.",
      },
    ],
    terminalOutcome:
      "If the outlet connection looks correct, check breaker and GFCI devices and confirm the circuit can supply the required input amperage before resetting anything.",
  },
  {
    id: "tig-weak-arc",
    label: "Weak arc strength",
    process: "TIG",
    rootPrompt: "Does the TIG arc feel weak or underpowered?",
    steps: [
      {
        question: "Is the line voltage correct?",
        positiveOutcome:
          "Check line voltage and have a licensed electrician correct it if it is low.",
      },
      {
        question: "Are you using an extension cord or an incorrect power cord setup?",
        positiveOutcome:
          "Do not use an extension cord. Use only one of the supplied power cords or an identical replacement cord.",
      },
    ],
    terminalOutcome:
      "If both checks look good, stop troubleshooting at the card and verify the rest of the setup against the manual before welding again.",
  },
  {
    id: "tig-arc-not-stable",
    label: "Welding arc not stable",
    process: "TIG",
    rootPrompt: "Is the TIG arc unstable or wandering?",
    steps: [
      {
        question: "Are the electrode cable and ground cable connections tight?",
        positiveOutcome: "Tighten all cable connections before continuing.",
      },
      {
        question: "Does the current setting match the recommended setting on the chart?",
        positiveOutcome:
          "Adjust the current setting so it matches the recommended setting on the machine's chart.",
      },
      {
        question: "Is shielding gas getting low?",
        positiveOutcome: "Replace the shielding gas cylinder.",
      },
    ],
    terminalOutcome:
      "The remaining manual cause is a damaged electrode holder or a loose internal connection. Have a qualified technician inspect and repair or replace it.",
  },
  {
    id: "stick-welder-no-function",
    label: "Welder does not function when switched on",
    process: "Stick",
    rootPrompt: "When you switch the welder on for Stick, does it fail to function correctly?",
    steps: [
      {
        question: "Did the welder recently run long enough to trip thermal protection?",
        positiveOutcome:
          "Let the unit cool and reduce the duration or frequency of welding periods before trying again.",
      },
      {
        question: "Is the ground clamp attached to the workpiece?",
        positiveOutcome: "Attach the ground clamp to the workpiece.",
      },
    ],
    terminalOutcome:
      "The remaining manual causes are a faulty or improperly connected trigger, or for the shared TIG/Stick table, an incomplete setup requiring qualified inspection.",
  },
  {
    id: "stick-lcd-no-light",
    label: "LCD display does not light when welder is switched on",
    process: "Stick",
    rootPrompt: "Does the LCD stay dark when you switch the welder on for Stick?",
    steps: [
      {
        question: "Is the unit fully connected to a powered outlet?",
        positiveOutcome:
          "Verify outlet voltage and confirm the machine is connected properly.",
      },
    ],
    terminalOutcome:
      "If that looks correct, check breaker and GFCI devices and verify the circuit can supply the required input amperage.",
  },
  {
    id: "stick-weak-arc",
    label: "Weak arc strength",
    process: "Stick",
    rootPrompt: "Does the Stick arc feel weak or underpowered?",
    steps: [
      {
        question: "Is the line voltage correct?",
        positiveOutcome:
          "Check line voltage and have a licensed electrician correct it if needed.",
      },
      {
        question: "Are you using an extension cord or the wrong power cord?",
        positiveOutcome:
          "Remove the extension cord and use only a supplied power cord or an identical replacement.",
      },
    ],
    terminalOutcome:
      "If supply power looks correct, verify the rest of the Stick setup against the manual before welding again.",
  },
  {
    id: "stick-arc-not-stable",
    label: "Welding arc not stable",
    process: "Stick",
    rootPrompt: "Is the Stick arc unstable or inconsistent?",
    steps: [
      {
        question: "Are the electrode cable and ground cable connections tight?",
        positiveOutcome: "Tighten the electrode and ground cable connections.",
      },
      {
        question: "Does the current setting match the recommended setting on the chart?",
        positiveOutcome:
          "Adjust current so it matches the recommended setting on the chart.",
      },
    ],
    terminalOutcome:
      "The remaining manual causes are low shielding gas in the shared table or a damaged electrode holder/internal connection, so stop here and inspect the hardware carefully.",
  },
];

export const TROUBLESHOOTING_FLOWS = Object.fromEntries(
  FLOW_SEEDS.map((seed) => {
    const flow = buildFlow(seed);
    return [flow.issueId, flow];
  })
) as Record<TroubleshootingIssueId, TroubleshootingFlowDefinition>;

export const TROUBLESHOOTING_ISSUES = FLOW_SEEDS.map((seed) => ({
  id: seed.id,
  label: seed.label,
  process: seed.process,
})) as TroubleshootingIssueOption[];

const TROUBLESHOOTING_INTENT_PATTERN =
  /\b(troubleshoot|troubleshooting|diagnos(?:e|ing|is)|fix|problem|issue|not working|won't|wont|does not|doesn't|cant|can't|help)\b/i;

const MIG_PROCESS_PATTERN = /\b(?:mig|wire\s*feed|flux[- ]?cored?|flux\s*core|contact\s*tip|bird(?:'|’)s?\s*nest)\b/i;
const TIG_PROCESS_PATTERN = /\btig\b|\btungsten\b|\btorch\b/i;
const STICK_PROCESS_PATTERN = /\bstick\b|\belectrode\b|\brod\b/i;

type IssueMatcher = {
  id: TroubleshootingIssueId;
  process: TroubleshootingProcess;
  pattern: RegExp;
};

const ISSUE_MATCHERS: IssueMatcher[] = [
  {
    id: "mig-wire-feed-no-feed",
    process: "MIG",
    pattern:
      /\bwire\s*feed\s*motor\b.*\bdoes\s*not\s*feed\b|\bwire\s*(?:does\s*not|won't|wont|will\s*not)\s*feed\b|\bfeed(?:ing)?\s*but\s*not\s*feed(?:ing)?\b/i,
  },
  {
    id: "mig-birds-nest",
    process: "MIG",
    pattern:
      /\bbird(?:'|’)s?\s*nest(?:ing)?\b|\bbird\s*nesting\b|\bwire\s*bunch(?:ing|es)?\b/i,
  },
  {
    id: "mig-wire-stops",
    process: "MIG",
    pattern: /\bwire\s*stops?\b|\bwire\s*keeps?\s*stopping\b/i,
  },
  {
    id: "mig-arc-not-stable",
    process: "MIG",
    pattern:
      /\b(?:mig|flux[- ]?cored?|wire\s*feed)\b.*\barc\b.*\b(?:not\s*stable|unstable|sputter|erratic)\b|\barc\b.*\b(?:not\s*stable|unstable|sputter|erratic)\b.*\b(?:mig|flux[- ]?cored?|wire\s*feed)\b/i,
  },
  {
    id: "mig-weak-arc",
    process: "MIG",
    pattern:
      /\b(?:mig|flux[- ]?cored?|wire\s*feed)\b.*\bweak\s*arc\b|\bweak\s*arc\b.*\b(?:mig|flux[- ]?cored?|wire\s*feed)\b/i,
  },
  {
    id: "tig-welder-no-function",
    process: "TIG",
    pattern:
      /\b(?:tig)\b.*\b(?:does\s*not\s*function|won't\s*start|wont\s*start|not\s*working)\b|\bwelder\s*does\s*not\s*function\b.*\btig\b/i,
  },
  {
    id: "tig-lcd-no-light",
    process: "TIG",
    pattern: /\btig\b.*\b(?:lcd|display)\b.*\b(?:does\s*not\s*light|dark|won't\s*turn\s*on|blank)\b/i,
  },
  {
    id: "tig-weak-arc",
    process: "TIG",
    pattern: /\btig\b.*\bweak\s*arc\b|\bweak\s*arc\b.*\btig\b/i,
  },
  {
    id: "tig-arc-not-stable",
    process: "TIG",
    pattern: /\btig\b.*\barc\b.*\b(?:not\s*stable|unstable|sputter|erratic)\b|\barc\b.*\b(?:not\s*stable|unstable|sputter|erratic)\b.*\btig\b/i,
  },
  {
    id: "stick-welder-no-function",
    process: "Stick",
    pattern:
      /\bstick\b.*\b(?:does\s*not\s*function|won't\s*start|wont\s*start|not\s*working)\b|\bwelder\s*does\s*not\s*function\b.*\bstick\b/i,
  },
  {
    id: "stick-lcd-no-light",
    process: "Stick",
    pattern: /\bstick\b.*\b(?:lcd|display)\b.*\b(?:does\s*not\s*light|dark|won't\s*turn\s*on|blank)\b/i,
  },
  {
    id: "stick-weak-arc",
    process: "Stick",
    pattern: /\bstick\b.*\bweak\s*arc\b|\bweak\s*arc\b.*\bstick\b/i,
  },
  {
    id: "stick-arc-not-stable",
    process: "Stick",
    pattern:
      /\bstick\b.*\barc\b.*\b(?:not\s*stable|unstable|sputter|erratic)\b|\barc\b.*\b(?:not\s*stable|unstable|sputter|erratic)\b.*\bstick\b/i,
  },
];

function detectProcess(message: string): TroubleshootingProcess | undefined {
  if (MIG_PROCESS_PATTERN.test(message)) {
    return "MIG";
  }

  if (TIG_PROCESS_PATTERN.test(message)) {
    return "TIG";
  }

  if (STICK_PROCESS_PATTERN.test(message)) {
    return "Stick";
  }

  return undefined;
}

function detectIssue(
  message: string,
  process: TroubleshootingProcess | undefined
): TroubleshootingIssueId | undefined {
  const directMatch = ISSUE_MATCHERS.find((matcher) => matcher.pattern.test(message));

  if (directMatch) {
    return directMatch.id;
  }

  if (/\bbird(?:'|’)s?\s*nest(?:ing)?\b|\bwire\s*bunch(?:ing|es)?\b/i.test(message)) {
    return "mig-birds-nest";
  }

  if (/\bwire\s*stops?\b|\bwire\s*keeps?\s*stopping\b/i.test(message)) {
    return "mig-wire-stops";
  }

  if (
    /\bwire\s*(?:does\s*not|won't|wont|will\s*not)\s*feed\b|\bwire\s*feed\s*motor\b/i.test(
      message
    )
  ) {
    return "mig-wire-feed-no-feed";
  }

  if (/\b(?:lcd|display)\b.*\b(?:does\s*not\s*light|dark|won't\s*turn\s*on|blank)\b/i.test(message)) {
    if (process === "TIG") {
      return "tig-lcd-no-light";
    }

    if (process === "Stick") {
      return "stick-lcd-no-light";
    }
  }

  if (/\bweak\s*arc\b/i.test(message)) {
    if (process === "MIG") {
      return "mig-weak-arc";
    }

    if (process === "TIG") {
      return "tig-weak-arc";
    }

    if (process === "Stick") {
      return "stick-weak-arc";
    }
  }

  if (/\barc\b.*\b(?:not\s*stable|unstable|sputter|erratic)\b/i.test(message)) {
    if (process === "MIG") {
      return "mig-arc-not-stable";
    }

    if (process === "TIG") {
      return "tig-arc-not-stable";
    }

    if (process === "Stick") {
      return "stick-arc-not-stable";
    }
  }

  if (/\bwelder\s*does\s*not\s*function\b|\bnot\s*working\b|\bwon't\s*start\b|\bwont\s*start\b/i.test(message)) {
    if (process === "TIG") {
      return "tig-welder-no-function";
    }

    if (process === "Stick") {
      return "stick-welder-no-function";
    }
  }

  return undefined;
}

function isTroubleshootingIntent(message: string): boolean {
  if (TROUBLESHOOTING_INTENT_PATTERN.test(message)) {
    return true;
  }

  return ISSUE_MATCHERS.some((matcher) => matcher.pattern.test(message));
}

export function buildTroubleshootingTool(
  message: string
): TroubleshootingFlowchartToolPayload | null {
  if (!isTroubleshootingIntent(message)) {
    return null;
  }

  const process = detectProcess(message);
  const issueId = detectIssue(message, process);
  const flow = issueId ? TROUBLESHOOTING_FLOWS[issueId] : undefined;

  return {
    type: "troubleshooting-flowchart",
    title: "Troubleshooting Flowchart",
    process: flow?.process ?? process,
    issueId,
    issues: TROUBLESHOOTING_ISSUES,
    flows: TROUBLESHOOTING_FLOWS,
    startNodeId: flow?.rootNodeId,
    notes: issueId
      ? [
          "This guided flow only covers the manual's troubleshooting table for the selected symptom.",
          "Stop before adjusting, cleaning, or repairing the machine, disconnect power, and follow the manual's safety precautions.",
        ]
      : [
          "Pick a process and symptom to walk through the manual's troubleshooting checks.",
          "This card stays within the manual's listed causes and does not replace technician service.",
        ],
  };
}
