import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Button, Chip, Empty, ErrorText, FullPageSpinner, Header, Tag } from '../components/ui';
import type { ReportStatus } from '../lib/types';
import { useLoader, useMe, useSession } from '../state/session';

const FILTERS: (ReportStatus | 'all')[] = ['open', 'actioned', 'dismissed', 'all'];

export default function Admin() {
  const { backend } = useSession();
  const me = useMe();
  const [status, setStatus] = useState<ReportStatus | 'all'>('open');
  const queue = useLoader(() => backend.adminReportQueue(status), [backend, status]);
  const [error, setError] = useState<string | null>(null);

  if (!me.is_admin) return <Navigate to="/me" replace />;

  const act = (fn: () => Promise<void>) => async () => {
    setError(null);
    try {
      await fn();
      await queue.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-2xl pb-12">
      <Header title="Report queue" back="/me" />
      <div className="px-4">
        <div className="mb-4 flex gap-2">
          {FILTERS.map((f) => (
            <Chip key={f} small selected={status === f} onClick={() => setStatus(f)}>
              {f}
            </Chip>
          ))}
        </div>
        <ErrorText>{queue.error ?? error}</ErrorText>
        {queue.loading ? (
          <FullPageSpinner />
        ) : queue.data?.length === 0 ? (
          <Empty icon="🛡️" title="Nothing here">No {status === 'all' ? '' : status} reports.</Empty>
        ) : (
          <div className="space-y-3">
            {queue.data?.map((r) => (
              <article key={r.id} className="rounded-3xl bg-surface p-4 shadow-sm ring-1 ring-plum-100/60">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold">{r.target.name}</h3>
                  {r.target.flagged && <Tag tone="coral">⚑ auto-flagged</Tag>}
                  {r.target.banned && <Tag tone="coral">banned</Tag>}
                  {!r.target.verified && <Tag>unverified</Tag>}
                  <Tag>{r.target.report_count} report{r.target.report_count === 1 ? '' : 's'}</Tag>
                  <span className="ml-auto text-xs text-muted">{new Date(r.created_at).toLocaleString()}</span>
                </div>
                <p className="mt-2 text-sm">
                  <b>{r.reason}</b> · reported by {r.reporter.name}
                </p>
                {r.details && <p className="mt-1 text-sm text-muted">“{r.details}”</p>}
                {r.note_body && (
                  <p className="mt-2 rounded-xl bg-coral-50 px-3 py-2 text-sm">
                    <span className="text-xs font-semibold text-coral-600">Reported note: </span>
                    {r.note_body}
                  </p>
                )}
                <div className="mt-3 flex gap-2 overflow-x-auto">
                  {r.target.photos.map((ph) => (
                    <div key={ph.id} className="relative shrink-0">
                      <img src={ph.url} alt="" className={`h-28 w-22 rounded-xl object-cover ${ph.removed ? 'opacity-30 grayscale' : ''}`} />
                      {ph.nsfw_score !== null && ph.nsfw_score > 0.3 && (
                        <span className="absolute left-1 top-1 rounded bg-coral-500 px-1 text-[10px] text-white">nsfw {Math.round(ph.nsfw_score * 100)}%</span>
                      )}
                      {ph.nsfw_score === null && (
                        <span className="absolute left-1 top-1 rounded bg-amber-500 px-1 text-[10px] text-white">unscored</span>
                      )}
                      {!ph.removed && (
                        <button
                          onClick={act(() => backend.adminRemovePhoto(ph.id))}
                          className="absolute bottom-1 left-1 right-1 rounded-lg bg-surface/90 py-0.5 text-[11px] font-semibold text-coral-600"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {r.target.prompts.length > 0 && (
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer text-muted">Prompts</summary>
                    {r.target.prompts.map((p) => (
                      <p key={p.prompt} className="mt-1">
                        <span className="text-xs font-semibold text-plum-700">{p.prompt}</span> {p.answer}
                      </p>
                    ))}
                  </details>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant={r.target.banned ? 'secondary' : 'danger'}
                    className="!px-4 !py-2 text-sm"
                    onClick={act(() => backend.adminSetBanned(r.target.id, !r.target.banned))}
                  >
                    {r.target.banned ? 'Unban' : 'Ban'}
                  </Button>
                  {r.status === 'open' ? (
                    <>
                      <Button className="!px-4 !py-2 text-sm" onClick={act(() => backend.adminResolveReport(r.id, 'actioned'))}>
                        Mark actioned
                      </Button>
                      <Button variant="ghost" className="!px-4 !py-2 text-sm" onClick={act(() => backend.adminResolveReport(r.id, 'dismissed'))}>
                        Dismiss
                      </Button>
                    </>
                  ) : (
                    <Button variant="ghost" className="!px-4 !py-2 text-sm" onClick={act(() => backend.adminResolveReport(r.id, 'open'))}>
                      Reopen
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
