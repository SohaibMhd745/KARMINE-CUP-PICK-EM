import { getStreams } from "@/lib/data";

export const dynamic = "force-dynamic";

export const metadata = { title: "Streams — Karmine Cup" };

export default async function StreamsPage() {
  const streams = await getStreams();

  return (
    <>
      <div className="hero">
        <div>
          <div className="ey">À NE PAS MANQUER</div>
          <h1 className="title">Les streams de la Cup.</h1>
          <p>Retrouve les participants qui streament les matchs en direct.</p>
        </div>
      </div>

      <div className="card">
        {streams.length === 0 ? (
          <div className="empty">Aucun stream annoncé pour l&apos;instant.</div>
        ) : (
          <div className="streams">
            {streams.map((stream) => (
              <div className="stream" key={stream.id}>
                <strong>{stream.display_name}</strong>
                <a href={stream.url} target="_blank" rel="noopener noreferrer">
                  {stream.url.replace(/^https?:\/\/(www\.)?/, "")}
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
