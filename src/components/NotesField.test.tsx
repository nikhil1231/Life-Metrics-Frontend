import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { NotesField } from "./NotesField";

const EditableNotes = ({ initialValue = "" }: { initialValue?: string }) => {
  const [value, setValue] = useState(initialValue);
  return (
    <>
      <NotesField
        value={value}
        isReading={false}
        onChange={setValue}
        onEdit={vi.fn()}
      />
      <output data-testid="notes-value">{value}</output>
    </>
  );
};

describe("NotesField", () => {
  it("promotes a short first line to a title when Return is entered", async () => {
    render(<EditableNotes />);

    await userEvent.type(screen.getByLabelText("Moment 1"), "Museum date{Enter}Greek rooms and ice cream.");

    expect(screen.getByLabelText("Moment title")).toHaveValue("Museum date");
    expect(screen.getByLabelText("Moment 1")).toHaveValue("Greek rooms and ice cream.");
    expect(screen.getByTestId("notes-value").textContent).toBe(
      "Museum date — Greek rooms and ice cream.",
    );
  });

  it("adds and removes body-only moments", async () => {
    render(<EditableNotes initialValue="First moment." />);

    await userEvent.click(screen.getByRole("button", { name: "Add moment" }));
    await userEvent.type(screen.getByLabelText("Moment 2"), "Second moment.");
    expect(screen.getByTestId("notes-value").textContent).toBe("First moment. // Second moment.");

    await userEvent.click(screen.getByRole("button", { name: "Remove moment 1" }));
    expect(screen.getByTestId("notes-value").textContent).toBe("Second moment.");
  });

  it("rejects reserved delimiters in entered text", () => {
    render(<EditableNotes initialValue="Existing text." />);
    const body = screen.getByLabelText("Moment 1");

    fireEvent.change(body, { target: { value: "Existing text — more." } });
    expect(body).toHaveValue("Existing text.");
    expect(screen.getByRole("alert")).toHaveTextContent("Em dashes and // are reserved.");

    fireEvent.change(body, { target: { value: "Existing text // more." } });
    expect(body).toHaveValue("Existing text.");
  });
});
