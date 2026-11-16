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
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setOpts(options);
      }),
    [],
  );

  const settle = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOpts(null);
  };

  // Keep the last options while the exit animation plays.
  const last = useRef<ConfirmOptions>({ title: "" });
  if (opts) last.current = opts;

  const dialog = (
    <ConfirmDialog
      {...last.current}
      visible={!!opts}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  );

  return { confirm, dialog };
}
