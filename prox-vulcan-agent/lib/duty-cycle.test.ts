import assert from "node:assert/strict";
import {
  buildDutyCycleTool,
  calculateDutyCycleWindow,
  findExactDutyCycleResult,
} from "@/lib/duty-cycle";
import { normalizeAgentResponse } from "@/lib/agent";
import { buildToolPayload } from "@/lib/tooling";
import { buildTroubleshootingTool } from "@/lib/troubleshooting";

function runTest(name: string, assertion: () => void) {
  try {
    assertion();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("exact manual duty cycle points return weld and rest time", () => {
  const result = findExactDutyCycleResult("MIG", 240, 200);

  assert.deepEqual(result, {
    source: "manual",
    dutyCyclePercent: 25,
    weldMinutes: 2.5,
    restMinutes: 7.5,
    ratedPointAmperage: 200,
  });
});

runTest("unsupported amperage returns no result and points to manual ratings", () => {
  const tool = buildDutyCycleTool("How long can I weld with MIG on 240V at 150A?");

  assert.equal(tool?.type, "duty-cycle");
  assert.equal(tool?.process, "MIG");
  assert.equal(tool?.inputVoltage, 240);
  assert.equal(tool?.amperage, 150);
  assert.equal(tool?.result, undefined);
  assert.match(tool?.notes.join(" ") ?? "", /does not list a duty cycle rating/i);
  assert.match(tool?.notes.join(" ") ?? "", /manual-rated amperages/i);
});

runTest("incomplete duty cycle questions still return a tool payload", () => {
  const tool = buildDutyCycleTool("My welder overheated. Can you help?");

  assert.deepEqual(tool, {
    type: "duty-cycle",
    title: "Duty Cycle Calculator",
    process: undefined,
    inputVoltage: undefined,
    amperage: undefined,
    result: undefined,
    ratedPoints: [],
    notes: [
      "Duty cycle is the number of welding minutes allowed within a 10-minute window.",
      "Manual-listed ratings are shown as primary results.",
      "Pick a process, voltage, and manual-rated amperage to calculate weld time and required cool-down time.",
    ],
  });
});

runTest("non-duty-cycle questions do not produce a tool payload", () => {
  assert.equal(buildDutyCycleTool("What polarity do I need for TIG?"), null);
});

runTest("troubleshooting symptom questions return a troubleshooting tool payload", () => {
  const tool = buildTroubleshootingTool("My MIG wire keeps bird nesting during welding.");

  assert.equal(tool?.type, "troubleshooting-flowchart");
  assert.equal(tool?.process, "MIG");
  assert.equal(tool?.issueId, "mig-birds-nest");
  assert.equal(tool?.startNodeId, "mig-birds-nest-step-1");
});

runTest("ambiguous troubleshooting questions fall back to the picker", () => {
  const tool = buildTroubleshootingTool("Can you help me troubleshoot this welder?");

  assert.equal(tool?.type, "troubleshooting-flowchart");
  assert.equal(tool?.issueId, undefined);
  assert.equal(tool?.startNodeId, undefined);
});

runTest("non-troubleshooting questions do not produce a troubleshooting tool payload", () => {
  assert.equal(buildTroubleshootingTool("What polarity do I need for TIG?"), null);
});

runTest("shared tool builder prioritizes troubleshooting for relevant symptoms", () => {
  const tool = buildToolPayload("My LCD does not light when I turn on Stick mode.");

  assert.equal(tool?.type, "troubleshooting-flowchart");
  assert.equal(tool?.issueId, "stick-lcd-no-light");
});

runTest("agent normalization keeps citations constrained and attaches the tool", () => {
  const tool = buildToolPayload("What's the duty cycle for MIG welding at 200A on 240V?");
  const response: Parameters<typeof normalizeAgentResponse>[0] = {
    answer: "At 200A on 240V in MIG, the rated duty cycle is 25%.",
    citations: [
      { source: "selection-chart.pdf", page: 3 },
      { source: "owner-manual.pdf", page: 19 },
      { source: "owner-manual.pdf", page: 99 },
    ],
    visual: { source: "selection-chart.pdf", page: 3 },
  };

  const normalized = normalizeAgentResponse(
    response,
    new Set(["owner-manual.pdf:19", "selection-chart.pdf:3"]),
    tool
  );

  assert.equal(normalized.tool?.type, "duty-cycle");
  assert.deepEqual(normalized.citations, [
    { source: "owner-manual.pdf", page: 19 },
    { source: "selection-chart.pdf", page: 3 },
  ]);
  assert.deepEqual(normalized.visual, {
    source: "owner-manual.pdf",
    page: 19,
    label: "owner-manual.pdf - page 19",
  });
});

runTest("weld and rest time are calculated within a 10-minute window", () => {
  assert.deepEqual(calculateDutyCycleWindow(40), {
    weldMinutes: 4,
    restMinutes: 6,
  });
});

runTest("agent normalization prefers the troubleshooting manual page for troubleshooting tools", () => {
  const tool = buildToolPayload("My MIG wire keeps bird nesting during welding.");
  const response: Parameters<typeof normalizeAgentResponse>[0] = {
    answer: "Check feed pressure, contact tip size, and the gun cable connector.",
    citations: [
      { source: "selection-chart.pdf", page: 3 },
      { source: "owner-manual.pdf", page: 42 },
    ],
    visual: { source: "selection-chart.pdf", page: 3 },
  };

  const normalized = normalizeAgentResponse(
    response,
    new Set(["owner-manual.pdf:42", "selection-chart.pdf:3"]),
    tool
  );

  assert.equal(normalized.tool?.type, "troubleshooting-flowchart");
  assert.deepEqual(normalized.visual, {
    source: "owner-manual.pdf",
    page: 42,
    label: "owner-manual.pdf - page 42",
  });
});
