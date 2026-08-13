import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTodayInLondon } from "./lib/date";
import { createEmptyDraft } from "./lib/records";
import { METRIC_KEYS } from "./types";

const mocks = vi.hoisted(() => ({
  auth: {
    status: "authenticated" as "authenticated" | "expired",
    accessToken: "token" as string | null,
    error: null,
    isGoogleReady: true,
    hasAuthorizedBefore: true,
    connect: vi.fn(),
    signOut: vi.fn(),
    markExpired: vi.fn(),
  },
  gateway: {
    loadDateIndex: vi.fn(),
    loadRecord: vi.fn(),
    updateRecord: vi.fn(),
    appendRecord: vi.fn(),
    upsertRecord: vi.fn(),
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
    mocks.auth.status = "authenticated";
    mocks.auth.accessToken = "token";
    mocks.auth.hasAuthorizedBefore = true;
    mocks.gateway.loadRecord.mockResolvedValue({
      draft: createEmptyDraft(getTodayInLondon()),
      rowNumber: null,
    });
    mocks.gateway.upsertRecord.mockResolvedValue({ rowNumber: 1262, created: false });
  });

  it("allows a completely blank day to be saved", async () => {
    render(<App />);
    const createButton = await screen.findByRole("button", { name: /Create day|Save changes/ });
    await userEvent.click(createButton);

    await waitFor(() => expect(mocks.gateway.upsertRecord).toHaveBeenCalled());
    expect(await screen.findByText("All saved days are synced.")).toBeInTheDocument();
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
    mocks.gateway.upsertRecord.mockResolvedValue({ rowNumber: 1262, created: false });

    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.gateway.upsertRecord).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("All saved days are synced.")).toBeInTheDocument();
  });

  it("queues a day offline and syncs it when connectivity returns", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: /Create day|Save changes/ }));
    expect(await screen.findByText("Offline · 1 pending")).toBeInTheDocument();
    expect(screen.getByText("Saved on this device · waiting to sync")).toBeInTheDocument();
    expect(mocks.gateway.upsertRecord).not.toHaveBeenCalled();

    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    fireEvent(window, new Event("online"));
    await waitFor(() => expect(mocks.gateway.upsertRecord).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("All saved days are synced.")).toBeInTheDocument();
  });

  it("keeps the form available offline after a previous authorization expires", async () => {
    mocks.auth.status = "expired";
    mocks.auth.accessToken = null;
    mocks.auth.hasAuthorizedBefore = true;
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Life Metrics" })).toBeInTheDocument();
    expect(screen.getByText("Offline")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reconnect Google" })).toBeInTheDocument();
  });
});
