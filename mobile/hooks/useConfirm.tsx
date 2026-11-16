import React, { useCallback, useRef, useState } from "react";
import ConfirmDialog, { ConfirmOptions } from "@/components/ui/ConfirmDialog";

/**
 * Promise-based themed confirm/alert.
 *
 *   const { confirm, dialog } = useConfirm();
 *   if (await confirm({ title: "Log out?", tone: "danger", confirmLabel: "Log out" })) ...
 *   return <>...{dialog}</>
 *
 * Render `dialog` inside the same screen/modal that calls `confirm`, so it appears on top
 * (a second native modal can't show above an open one unless it is nested inside it).
 */
export function useConfirm() {
  // Options are kept after closing so the exit animation can finish with the same content.
  const [opts, setOpts] = useState<ConfirmOptions>({ title: "" });
  const [open, setOpen] = useState(false);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setOpts(options);
        setOpen(true);
      }),
    [],
  );

  const settle = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOpen(false);
  };

  const dialog = (
    <ConfirmDialog
      {...opts}
      visible={open}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  );

  return { confirm, dialog };
}
