"use client";

import { useRef, type ReactNode } from "react";

// Formularz publikacji: gdy trzeba potwierdzić obejście akceptacji (administrator,
// treść jeszcze nie zatwierdzona), pyta w oknie i dopisuje force=1.
export function PublishConfirm({
  action,
  confirmMessage,
  className,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  confirmMessage: string | null;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      action={action}
      className={className}
      onSubmit={(e) => {
        if (!confirmMessage) return;
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
          return;
        }
        const force = document.createElement("input");
        force.type = "hidden";
        force.name = "force";
        force.value = "1";
        ref.current?.appendChild(force);
      }}
    >
      {children}
    </form>
  );
}
