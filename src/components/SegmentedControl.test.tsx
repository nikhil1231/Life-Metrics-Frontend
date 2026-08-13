import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SegmentedControl } from "./SegmentedControl";

describe("SegmentedControl", () => {
  it("clears the active value when it is activated again", async () => {
    const onChange = vi.fn();
    render(<SegmentedControl legend="J" name="j" values={["Y", "N"]} value="Y" onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "Y" }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});
