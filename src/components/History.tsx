import { Check, Mic, Trash2 } from 'lucide-react'

import { history, type HistoryStatus, useHistory } from '../history'
import { useT } from '../host'
import type { MessageKey } from '../messages/en'
import { WARNINGS } from '../voiceCommand'
import { agentName, readWorkspace } from '../workspace'
import styles from './History.module.css'

const STATUS_KEYS: Record<HistoryStatus, MessageKey> = {
  deciding: 'history.status.deciding',
  ran: 'history.status.ran',
  waiting: 'history.status.waiting',
  blocked: 'history.status.blocked',
  failed: 'history.status.failed',
}

function clock(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function History() {
  const t = useT()
  const entries = useHistory()
  const workspace = readWorkspace()

  return (
    <section className={styles.sidebar}>
      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.clearButton}
          onClick={history.clear}
          disabled={entries.length === 0}
          title={t('history.clear')}
          aria-label={t('history.clear')}
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className={styles.content}>
        {entries.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>
              <Mic size={18} />
            </span>
            <strong>{t('history.emptyTitle')}</strong>
            <span>{t('history.emptyBody')}</span>
          </div>
        ) : (
          <ol className={styles.list}>
            {entries.map((entry) => {
              const jobs =
                entry.plan?.kind === 'spawn'
                  ? entry.plan.jobs.filter((job) => job.prompt)
                  : entry.plan?.kind === 'reuse' && entry.plan.prompt
                    ? [{ agent: null, prompt: entry.plan.prompt }]
                    : []
              return (
                <li key={entry.id} className={styles.card} data-status={entry.status}>
                  <div className={styles.cardTop}>
                    <span className={styles.badge}>{t(STATUS_KEYS[entry.status])}</span>
                    <span className={styles.time}>{clock(entry.at)}</span>
                  </div>

                  <p className={styles.title}>{entry.summary}</p>
                  <p className={styles.meta}>{entry.spoken}</p>

                  {jobs.map((job, index) => (
                    <p key={`${job.agent ?? 'reuse'}-${index}`} className={styles.prompt}>
                      {job.agent ? `${agentName(workspace, job.agent)}: ` : ''}
                      {job.prompt}
                    </p>
                  ))}

                  {entry.warnings.map((warning) => (
                    <p key={warning} className={styles.note}>
                      {t(WARNINGS[warning])}
                    </p>
                  ))}

                  {entry.actions.length > 0 ? (
                    <ul className={styles.actions}>
                      {entry.actions.map((action, index) => (
                        <li key={index}>
                          <Check size={11} aria-hidden />
                          <span>{action}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {entry.error ? <p className={styles.error}>{entry.error}</p> : null}

                  {entry.decision ? (
                    <div className={styles.numbers}>
                      <span>
                        {entry.decision.action.choice} {entry.decision.action.confidence.toFixed(2)}
                      </span>
                      <span>
                        {t('history.agentConf', {
                          value: entry.decision.agent.confidence.toFixed(2),
                        })}
                      </span>
                      {entry.transcribeMs === null ? null : (
                        <span>{t('history.voiceMs', { ms: entry.transcribeMs })}</span>
                      )}
                      {entry.decideMs === null ? null : <span>jev {entry.decideMs} ms</span>}
                      <span>US$ {entry.decision.costUsd.toFixed(6)}</span>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </section>
  )
}
