import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Icon } from "@/components/icons";
import { serverDb } from "@/lib/db";
import { venueLabel } from "@/lib/format";
import { NewMatchForm } from "./NewMatchForm";

export const metadata = { title: "Add upcoming match" };

async function FormLoader() {
  await connection(); // read live data per visit; never run this while the app is being built
  const db = serverDb();
  const { data: league } = await db.from("leagues").select("id").eq("tier", "international").eq("gender", "male").limit(1).maybeSingle();
  const [{ data: teams }, { data: venues }] = await Promise.all([
    db.from("teams").select("name").eq("league_id", league?.id ?? -1).order("name"),
    db.from("venues").select("name, city").order("name"),
  ]);
  return (
    <NewMatchForm
      teams={(teams ?? []).map((t) => t.name as string)}
      venues={[...new Set((venues ?? []).map((v) => venueLabel(v.name, v.city)))]} // the database holds some grounds twice: list each name once
    />
  );
}

export default function NewMatchPage() {
  return (
    <div className="stack-lg">
      <div className="stack">
        <Link href="/" className="row" style={{ minHeight: 44, textDecoration: "none" }}><Icon name="back" />All matches</Link>
        <div className="page-head" style={{ marginBottom: 0 }}>
          <h1>Add an upcoming match</h1>
          <p className="muted">Step 1 of the live path: the teams, the ground and the exact start time. The squad, the playing XI and the real Dream11 credits come next.</p>
        </div>
      </div>
      <div className="card">
        <Suspense fallback={<div className="skeleton" aria-busy="true" />}>
          <FormLoader />
        </Suspense>
      </div>
    </div>
  );
}
