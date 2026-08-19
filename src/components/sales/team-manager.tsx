"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { createRep, createTeam } from "@/lib/sales/actions";
import { cn } from "@/lib/utils";

interface TeamOption {
  id: string;
  name: string;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      {children}
    </label>
  );
}

const selectClass =
  "border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const toNum = (s: string) => (s.trim() === "" ? undefined : Number(s));

export function TeamManager({ teams }: { teams: TeamOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [team, setTeam] = useState({ name: "", closer: "", setter: "", manager: "" });
  const [teamErr, setTeamErr] = useState<string | null>(null);

  const [rep, setRep] = useState({
    clientId: teams[0]?.id ?? "",
    name: "",
    role: "closer" as "closer" | "setter" | "dm_setter" | "manager",
    commission: "",
    skim: "",
  });
  const [repErr, setRepErr] = useState<string | null>(null);

  function submitTeam(e: FormEvent) {
    e.preventDefault();
    setTeamErr(null);
    start(async () => {
      try {
        await createTeam({
          name: team.name,
          defaultCloserPct: toNum(team.closer),
          defaultSetterPct: toNum(team.setter),
          defaultManagerPct: toNum(team.manager),
        });
        setTeam({ name: "", closer: "", setter: "", manager: "" });
        router.refresh();
      } catch (err) {
        setTeamErr(err instanceof Error ? err.message : "Could not add the team.");
      }
    });
  }

  function submitRep(e: FormEvent) {
    e.preventDefault();
    setRepErr(null);
    if (!rep.clientId) {
      setRepErr("Create a team first.");
      return;
    }
    start(async () => {
      try {
        await createRep({
          clientId: rep.clientId,
          name: rep.name,
          role: rep.role,
          commissionPct: toNum(rep.commission),
          topLineSkimPct: toNum(rep.skim),
        });
        setRep((r) => ({ ...r, name: "", commission: "", skim: "" }));
        router.refresh();
      } catch (err) {
        setRepErr(err instanceof Error ? err.message : "Could not add the rep.");
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="New team">
        <form onSubmit={submitTeam} className="space-y-4">
          <Field label="Team name">
            <Input
              value={team.name}
              onChange={(e) => setTeam({ ...team, name: e.target.value })}
              placeholder="The Grid"
              required
            />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Closer %">
              <Input
                value={team.closer}
                onChange={(e) => setTeam({ ...team, closer: e.target.value })}
                inputMode="decimal"
                placeholder="10"
              />
            </Field>
            <Field label="Setter %">
              <Input
                value={team.setter}
                onChange={(e) => setTeam({ ...team, setter: e.target.value })}
                inputMode="decimal"
                placeholder="5"
              />
            </Field>
            <Field label="Mgr skim %">
              <Input
                value={team.manager}
                onChange={(e) => setTeam({ ...team, manager: e.target.value })}
                inputMode="decimal"
                placeholder="3"
              />
            </Field>
          </div>
          <p className="text-faint text-xs">
            Defaults apply to a deal with no explicit split.
          </p>
          {teamErr && <p className="text-destructive text-xs">{teamErr}</p>}
          <Button type="submit" disabled={pending || !team.name} className="gap-2">
            <Plus className="size-3.5" /> Add team
          </Button>
        </form>
      </Panel>

      <Panel title="New rep">
        <form onSubmit={submitRep} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Team">
              <select
                className={selectClass}
                value={rep.clientId}
                onChange={(e) => setRep({ ...rep, clientId: e.target.value })}
              >
                {teams.length === 0 && <option value="">— add a team first —</option>}
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Role">
              <select
                className={selectClass}
                value={rep.role}
                onChange={(e) =>
                  setRep({ ...rep, role: e.target.value as typeof rep.role })
                }
              >
                <option value="closer">Closer</option>
                <option value="setter">Setter</option>
                <option value="dm_setter">DM Setter</option>
                <option value="manager">Manager</option>
              </select>
            </Field>
          </div>
          <Field label="Rep name">
            <Input
              value={rep.name}
              onChange={(e) => setRep({ ...rep, name: e.target.value })}
              placeholder="Lorenzo"
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Commission %">
              <Input
                value={rep.commission}
                onChange={(e) => setRep({ ...rep, commission: e.target.value })}
                inputMode="decimal"
                placeholder="10"
              />
            </Field>
            <Field label="Top-line skim % (manager)">
              <Input
                value={rep.skim}
                onChange={(e) => setRep({ ...rep, skim: e.target.value })}
                inputMode="decimal"
                placeholder="3"
              />
            </Field>
          </div>
          {repErr && <p className="text-destructive text-xs">{repErr}</p>}
          <Button
            type="submit"
            disabled={pending || !rep.name || !rep.clientId}
            className={cn("gap-2")}
          >
            <Plus className="size-3.5" /> Add rep
          </Button>
        </form>
      </Panel>
    </div>
  );
}
