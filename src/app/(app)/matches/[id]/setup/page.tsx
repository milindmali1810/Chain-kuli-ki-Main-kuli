import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Icon } from "@/components/icons";
import { loadSetup } from "@/lib/liveSetup";
import { SetupForm } from "./SetupForm";

export const metadata = { title: "Change the playing XI" };
export const maxDuration = 60; // picking a team reads the match history and calls Gemini

async function Loader({ params }: { params: Promise<{ id: string }> }) {
  await connection(); // read live data per visit; never run this while the app is being built
  const { id } = await params;
  const setup = await loadSetup(id);
  if (!setup) notFound();
  return (
    <>
      <div className="stack">
        <Link href={`/matches/${id}`} className="row" style={{ minHeight: 44, textDecoration: "none" }}><Icon name="back" />Back to the match</Link>
        <div className="page-head" style={{ marginBottom: 0 }}>
          <h1>Change the playing XI</h1>
          <p className="muted">{setup.teams[0].name} v {setup.teams[1].name}</p>
        </div>
      </div>
      {setup.locked ? (
        <div className="banner"><Icon name="alert" /><p>This match has started, so the squad, XI and credits can no longer be changed.</p></div>
      ) : (
        <>
          <p className="muted">The agent has already picked a team, so you do not need this page. Use it only if the real playing XI is different, or you know the Dream11 credits.</p>
          <SetupForm cricsheetId={id} teams={setup.teams} />
        </>
      )}
    </>
  );
}

export default function SetupPage(props: { params: Promise<{ id: string }> }) {
  return (
    <div className="stack-lg">
      <Suspense fallback={<div className="stack-lg" aria-busy="true"><div className="skeleton" /><div className="skeleton" style={{ minHeight: 280 }} /></div>}>
        <Loader params={props.params} />
      </Suspense>
    </div>
  );
}
