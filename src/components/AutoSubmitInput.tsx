"use client";

export function AutoSubmitInput({
  type,
  name,
  defaultValue,
  className,
}: {
  type: string;
  name: string;
  defaultValue?: string;
  className?: string;
}) {
  return (
    <input
      type={type}
      name={name}
      defaultValue={defaultValue}
      className={className}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
    />
  );
}
