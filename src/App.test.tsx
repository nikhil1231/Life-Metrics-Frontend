import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTodayInLondon } from "./lib/date";
import { createEmptyDraft } from "./lib/records";
import { METRIC_KEYS } from "./types";

const mocks = vi.hoisted(() => ({
  auth: {
    status: "authenticated" as const,
    accessToken: "token",
    error: null,
    isGoogleReady: true,
    connect: vi.fn(),
    signOut: vi.fn(),
    markExpired: vi.fn(),
  },
  gateway: {
    loadDateIndex: vi.fn(),
    loadRecord: vi.fn(),
    updateRecord: vi.fn(),
    appendRecord: vi.fn(),
  },
}));

vi.mock("./config", () => ({
  APP_CONFIG: {
    googleClientId: "client-id",
    spreadsheetId: "spreadsheet-id",
    sheetName: "Main",
    errors: [],
  },
}));

vi.mock("./services/auth", () => ({ useGoogleAuth: () => mocks.auth }));
vi.mock("./services/sheets", () => ({
  createSheetsGateway: () => mocks.gateway,
  SheetsApiError: class SheetsApiError extends Error {
    code = "api";
  },
}));

import App from "./App";

describe("Life Metrics app", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.gateway.loadRecord.mockResolvedValue({
      draft: createEmptyDraft(getTodayInLondon()),
      rowNumber: null,
    });
  });

  it("shows validation for every required field", async () => {
    render(<App />);
    const createButton = await screen.findByRole("button", { name: "Create day" });
    await userEvent.click(createButton);

    expect(await screen.findAllByText("Enter a number from 1 to 10.")).toHaveLength(11);
    expect(screen.getByText("Choose Y or N.")).toBeInTheDocument();
    expect(screen.getByText("Choose a quality of day.")).toBeInTheDocument();
    expect(screen.getByText("Add a note for the day.")).toBeInTheDocument();
    expect(mocks.gateway.appendRecord).not.toHaveBeenCalled();
  });

  it("loads decimals, lets the integer slider replace them, and protects dirty date changes", async () => {
    const today = getTodayInLondon();
    const draft = createEmptyDraft(today);
    METRIC_KEYS.forEach((key) => {
      draft.scores[key] = "6";
    });
    draft.scores.discomfort = "3.7";
    draft.j = "N";
    draft.quality = "Good";
    draft.notes = "Existing notes";
    mocks.gateway.loadRecord.mockResolvedValue({ draft, rowNumber: 1262 });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<App />);
    const numberInput = await screen.findByLabelText("Discomfort");
    await waitFor(() => expect(numberInput).toHaveValue("3.7"));

    fireEvent.change(screen.getByLabelText("Discomfort integer slider"), { target: { value: "8" } });
    expect(numberInput).toHaveValue("8");

    const dateInput = screen.getByLabelText("Select date");
    fireEvent.change(dateInput, { target: { value: "2000-01-01" } });
    expect(confirm).toHaveBeenCalled();
    expect(dateInput).toHaveValue(today);
  });

  it("updates an existing row and reports success", async () => {
    const draft = createEmptyDraft(getTodayInLondon());
    METRIC_KEYS.forEach((key) => {
      draft.scores[key] = "5.5";
    });
    draft.j = "Y";
    draft.quality = "Amazing";
    draft.notes = "Complete notes";
    mocks.gateway.loadRecord.mockResolvedValue({ draft, rowNumber: 1262 });
    mocks.gateway.updateRecord.mockResolvedValue({ rowNumber: 1262, created: false });

    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.gateway.updateRecord).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Changes saved.")).toBeInTheDocument();
  });
});
