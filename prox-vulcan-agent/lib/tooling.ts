import {
  buildDutyCycleTool,
  DUTY_CYCLE_MANUAL_PAGE,
  type DutyCycleToolPayload,
} from "@/lib/duty-cycle";
import {
  buildTroubleshootingTool,
  TROUBLESHOOTING_MANUAL_PAGES,
  type TroubleshootingFlowchartToolPayload,
} from "@/lib/troubleshooting";

export type ToolPayload =
  | DutyCycleToolPayload
  | TroubleshootingFlowchartToolPayload;

export type ToolVisualReference = {
  source: string;
  page: number;
};

export function buildToolPayload(message: string): ToolPayload | null {
  const troubleshootingTool = buildTroubleshootingTool(message);

  if (troubleshootingTool) {
    return troubleshootingTool;
  }

  return buildDutyCycleTool(message);
}

export function getPreferredToolVisual(
  tool: ToolPayload | null | undefined
): ToolVisualReference | null {
  if (!tool) {
    return null;
  }

  if (tool.type === "duty-cycle") {
    return DUTY_CYCLE_MANUAL_PAGE;
  }

  if (tool.process) {
    return TROUBLESHOOTING_MANUAL_PAGES[tool.process];
  }

  return null;
}
