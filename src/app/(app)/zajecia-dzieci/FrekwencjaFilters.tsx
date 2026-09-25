"use client";

import { useRouter } from "next/navigation";
import { groupLabel, type KidsClassGroup } from "@/lib/kids-classes";

const INPUT_SM = "rounded-lg border-[1.5px] border-zinc-300 px-2 py-1 text-xs";

export function FrekwencjaFilters({
  groups,
  groupId,
  monthKey,
  basePath,
}: {
  groups: KidsClassGroup[];
  groupId?: string;
  monthKey: string;
  basePath: string;
}) {
  const router = useRouter();

  function navigate(nextGroupId: string, nextMonth: string) {
    router.push(`${basePath}?tab=frekwencja&frekwencja_grupa=${nextGroupId}&frekwencja_miesiac=${nextMonth}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-semibold text-zinc-500">Grupa</label>
        <select
          value={groupId ?? ""}
          onChange={(e) => navigate(e.target.value, monthKey)}
          className={INPUT_SM}
        >
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {groupLabel(g)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-semibold text-zinc-500">Miesiąc</label>
        <input type="month" value={monthKey} onChange={(e) => navigate(groupId ?? "", e.target.value)} className={INPUT_SM} />
      </div>
    </div>
  );
}
