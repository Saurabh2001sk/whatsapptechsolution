import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './audit-logs.css'

type AuditTab =
| 'security'
| 'billing'
| 'campaigns'
| 'notifications'
| 'webhooks'
| 'production'

type AuditLog = {
id: string
action?: string
event?: string
entityType?: string
entityId?: string | null
campaignId?: string | null
actorUserId?: string | null
recipientEmail?: string | null
subject?: string | null
status?: string | null
channel?: string | null
error?: string | null
createdAt: string
metadata: unknown
}

type WebhookEvent = {
id: string
source: string
status: string
metaObject: string | null
phoneNumberId: string | null
processedCount: number
syncedCount: number
ignoredCount: number
replayCount: number
lastError: string | null
lastReplayedAt: string | null
createdAt: string
}

type ProductionCheck = {
key: string
title: string
status: 'pass' | 'fail'
details: string
}

type ProductionReadiness = {
ok: boolean
checkedAt: string
environment: {
nodeEnv: string
isProduction: boolean
}
checks: ProductionCheck[]
}

type AuditFilters = {
q: string
action: string
actorUserId: string
from: string
to: string
limit: string
}

type AuditLogsPageProps = {
apiUrl: string
showToast: (message: string, type?: 'success' | 'error') => void
}

const auditTabs: Array<{
key: AuditTab
label: string
endpoint: string
exportEndpoint?: string
}> = [
{
key: 'security',
label: 'Security',
endpoint: '/audit-logs',
exportEndpoint: '/audit-logs/export',
},
{
key: 'billing',
label: 'Billing',
endpoint: '/audit-logs/billing',
exportEndpoint: '/audit-logs/billing/export',
},
{
key: 'campaigns',
label: 'Campaigns',
endpoint: '/audit-logs/campaigns',
exportEndpoint: '/audit-logs/campaigns/export',
},
{
key: 'notifications',
label: 'Notifications',
endpoint: '/audit-logs/notifications',
exportEndpoint: '/audit-logs/notifications/export',
},
{
key: 'webhooks',
label: 'Webhook Replay',
endpoint: '/meta-accounts/webhook-events',
},
{
key: 'production',
label: 'Production Readiness',
endpoint: '/audit-logs/production-readiness',
},
]

const defaultFilters: AuditFilters = {
q: '',
action: '',
actorUserId: '',
from: '',
to: '',
limit: '50',
}

export function AuditLogsPage({ apiUrl, showToast }: AuditLogsPageProps) {
const [activeTab, setActiveTab] = useState<AuditTab>('security')
const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
const [webhookEvents, setWebhookEvents] = useState<WebhookEvent[]>([])
const [productionReadiness, setProductionReadiness] =
useState<ProductionReadiness | null>(null)
const [filters, setFilters] = useState<AuditFilters>(defaultFilters)
const [loading, setLoading] = useState(true)
const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)

const currentTab = useMemo(
() => auditTabs.find((tab) => tab.key === activeTab) || auditTabs[0],
[activeTab],
)

useEffect(() => {
void loadAuditLogs(activeTab, filters)
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [activeTab])

async function readApiError(response: Response, fallback: string) {
try {
const data = await response.json()

  if (typeof data.message === 'string') {
    return data.message
  }

  if (typeof data.error === 'string') {
    return data.error
  }

  return fallback
} catch {
  return fallback
}

}

function buildQueryString(nextFilters: AuditFilters) {
const params = new URLSearchParams()

params.set('limit', nextFilters.limit)

if (nextFilters.q.trim()) {
  params.set('q', nextFilters.q.trim())
}

if (activeTab === 'webhooks' && nextFilters.action.trim()) {
  params.set('status', nextFilters.action.trim())
}

if (!['webhooks', 'production'].includes(activeTab)) {
  Object.entries(nextFilters).forEach(([key, value]) => {
    const cleanValue = String(value || '').trim()

    if (cleanValue) {
      params.set(key, cleanValue)
    }
  })
}

return params.toString()

}

async function loadAuditLogs(
tab: AuditTab = activeTab,
nextFilters: AuditFilters = filters,
) {
const selectedTab = auditTabs.find((item) => item.key === tab) || auditTabs[0]
const queryString = buildQueryString(nextFilters)

setLoading(true)

try {
  const response = await fetch(
    `${apiUrl}${selectedTab.endpoint}${
      queryString && tab !== 'production' ? `?${queryString}` : ''
    }`,
    {
      credentials: 'include',
    },
  )

  if (!response.ok) {
    throw new Error(await readApiError(response, 'Failed to load audit logs'))
  }

  const data = await response.json()

  if (tab === 'webhooks') {
    setWebhookEvents(Array.isArray(data) ? data : [])
    setAuditLogs([])
    setProductionReadiness(null)
    return
  }

  if (tab === 'production') {
    setProductionReadiness(data)
    setAuditLogs([])
    setWebhookEvents([])
    return
  }

  setAuditLogs(Array.isArray(data) ? data : [])
  setWebhookEvents([])
  setProductionReadiness(null)
} catch (error) {
  setAuditLogs([])
  setWebhookEvents([])
  setProductionReadiness(null)
  showToast(
    error instanceof Error ? error.message : 'Failed to load audit logs',
    'error',
  )
} finally {
  setLoading(false)
}

}

function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
event.preventDefault()
void loadAuditLogs(activeTab, filters)
}

function resetFilters() {
setFilters(defaultFilters)
void loadAuditLogs(activeTab, defaultFilters)
}

async function exportLogs() {
if (!currentTab.exportEndpoint) {
showToast('CSV export is not available for this tab', 'error')
return
}

const queryString = buildQueryString(filters)

try {
  const response = await fetch(
    `${apiUrl}${currentTab.exportEndpoint}${queryString ? `?${queryString}` : ''}`,
    {
      credentials: 'include',
    },
  )

  if (!response.ok) {
    throw new Error(await readApiError(response, 'Failed to export audit logs'))
  }

  const blob = await response.blob()
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = `${currentTab.key}-audit-logs.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)

  showToast('Audit export downloaded')
} catch (error) {
  showToast(
    error instanceof Error ? error.message : 'Failed to export audit logs',
    'error',
  )
}

}

async function replayWebhookEvent(id: string) {
if (!confirm('Replay this webhook event now?')) {
return
}

setActionLoadingId(id)

try {
  const response = await fetch(`${apiUrl}/meta-accounts/webhook-events/${id}/replay`, {
    method: 'POST',
    credentials: 'include',
  })

  if (!response.ok) {
    throw new Error(await readApiError(response, 'Failed to replay webhook'))
  }

  showToast('Webhook replay completed')
  await loadAuditLogs('webhooks', filters)
} catch (error) {
  showToast(
    error instanceof Error ? error.message : 'Failed to replay webhook',
    'error',
  )
} finally {
  setActionLoadingId(null)
}

}

function formatDate(value: string | null) {
if (!value) {
return 'Not available'
}

const date = new Date(value)

if (Number.isNaN(date.getTime())) {
  return 'Not available'
}

return date.toLocaleString()

}

function formatMetadata(metadata: unknown) {
if (!metadata || typeof metadata !== 'object') {
return 'No metadata'
}

return JSON.stringify(metadata, null, 2)

}

function getPrimaryAction(log: AuditLog) {
return String(log.action || log.event || 'AUDIT_EVENT').replaceAll('_', ' ')
}

function getEntityLine(log: AuditLog) {
if (activeTab === 'campaigns') {
return `Campaign: ${log.campaignId || 'Not available'}`
}

if (activeTab === 'notifications') {
  return `${log.channel || 'Email'} · ${log.status || 'Unknown'}`
}

return `${log.entityType || 'Record'}${
  log.entityId ? ` · ${log.entityId}` : ''
}`

}

function getActorLine(log: AuditLog) {
if (activeTab === 'notifications') {
return log.recipientEmail || 'No recipient'
}

return log.actorUserId || 'System'

}

function renderWebhookEvents() {
if (loading) {
return <div className="audit-empty">Loading webhook events...</div>
}

if (webhookEvents.length < 1) {
  return <div className="audit-empty">No webhook events found yet.</div>
}

return (
  <section className="webhook-event-list">
    {webhookEvents.map((event) => (
      <article className="webhook-event-card" key={event.id}>
        <div className="webhook-event-header">
          <div>
            <strong>{event.source} webhook</strong>
            <span>Phone number id: {event.phoneNumberId || 'Unknown'}</span>
          </div>

          <span className={`webhook-status ${event.status.toLowerCase()}`}>
            {event.status}
          </span>
        </div>

        <div className="webhook-stats-grid">
          <span>Processed: {event.processedCount}</span>
          <span>Synced: {event.syncedCount}</span>
          <span>Ignored: {event.ignoredCount}</span>
          <span>Replays: {event.replayCount}</span>
        </div>

        {event.lastError ? (
          <div className="audit-error-line">
            <small>Last error</small>
            <span>{event.lastError}</span>
          </div>
        ) : null}

        <div className="webhook-event-footer">
          <span>Received: {formatDate(event.createdAt)}</span>
          <span>Last replay: {formatDate(event.lastReplayedAt)}</span>
          <button
            type="button"
            disabled={actionLoadingId === event.id}
            onClick={() => replayWebhookEvent(event.id)}
          >
            {actionLoadingId === event.id ? 'Replaying...' : 'Replay / Retry'}
          </button>
        </div>
      </article>
    ))}
  </section>
)

}

function renderProductionReadiness() {
if (loading) {
return <div className="audit-empty">Checking production readiness...</div>
}

if (!productionReadiness) {
  return <div className="audit-empty">No production readiness data found.</div>
}

return (
  <section className="production-readiness-panel">
    <div className={`production-summary ${productionReadiness.ok ? 'pass' : 'fail'}`}>
      <strong>
        {productionReadiness.ok
          ? 'Production readiness passed'
          : 'Production readiness has blockers'}
      </strong>
      <span>
        Environment: {productionReadiness.environment.nodeEnv} · Checked:{' '}
        {formatDate(productionReadiness.checkedAt)}
      </span>
    </div>

    <div className="production-check-list">
      {productionReadiness.checks.map((check) => (
        <article className={`production-check ${check.status}`} key={check.key}>
          <strong>{check.title}</strong>
          <span>{check.details}</span>
          <small>{check.status === 'pass' ? 'PASS' : 'FAIL'}</small>
        </article>
      ))}
    </div>
  </section>
)

}

return (
<div className="audit-page">
<section className="audit-hero">
<div>
<p className="audit-eyebrow">Security center</p>
<h2>Audit Logs</h2>
<p>
Review sensitive tenant actions, replay webhook events, and check
production readiness.
</p>
</div>

    <div className="audit-hero-actions">
      <button type="button" disabled={loading} onClick={() => loadAuditLogs()}>
        {loading ? 'Refreshing...' : 'Refresh'}
      </button>
      <button
        type="button"
        disabled={loading || !currentTab.exportEndpoint}
        onClick={exportLogs}
      >
        Export CSV
      </button>
    </div>
  </section>

  <section className="audit-warning">
    <strong>Tenant-isolated control center</strong>
    <span>
      The frontend never sends tenantId. Backend uses your HttpOnly cookie
      session and role to return only your tenant data.
    </span>
  </section>

  <div className="audit-tabs">
    {auditTabs.map((tab) => (
      <button
        className={activeTab === tab.key ? 'active' : ''}
        key={tab.key}
        type="button"
        onClick={() => setActiveTab(tab.key)}
      >
        {tab.label}
      </button>
    ))}
  </div>

  {activeTab !== 'production' ? (
    <form className="audit-filter-panel" onSubmit={handleFilterSubmit}>
      <input
        placeholder="Search action, entity, webhook error..."
        value={filters.q}
        onChange={(event) =>
          setFilters((current) => ({ ...current, q: event.target.value }))
        }
      />

      <input
        placeholder={activeTab === 'webhooks' ? 'Webhook status' : 'Action filter'}
        value={filters.action}
        onChange={(event) =>
          setFilters((current) => ({
            ...current,
            action: event.target.value,
          }))
        }
      />

      <input
        disabled={activeTab === 'notifications' || activeTab === 'webhooks'}
        placeholder="Actor user id"
        value={filters.actorUserId}
        onChange={(event) =>
          setFilters((current) => ({
            ...current,
            actorUserId: event.target.value,
          }))
        }
      />

      <input
        disabled={activeTab === 'webhooks'}
        type="date"
        value={filters.from}
        onChange={(event) =>
          setFilters((current) => ({ ...current, from: event.target.value }))
        }
      />

      <input
        disabled={activeTab === 'webhooks'}
        type="date"
        value={filters.to}
        onChange={(event) =>
          setFilters((current) => ({ ...current, to: event.target.value }))
        }
      />

      <select
        value={filters.limit}
        onChange={(event) =>
          setFilters((current) => ({ ...current, limit: event.target.value }))
        }
      >
        <option value="25">25 records</option>
        <option value="50">50 records</option>
        <option value="100">100 records</option>
        <option value="200">200 records</option>
      </select>

      <button type="submit" disabled={loading}>
        Apply filters
      </button>

      <button type="button" disabled={loading} onClick={resetFilters}>
        Reset
      </button>
    </form>
  ) : null}

  <section className="audit-section-header">
    <div>
      <h3>{currentTab.label}</h3>
      <p>
        {activeTab === 'webhooks'
          ? 'Replay or retry stored Meta webhook events.'
          : activeTab === 'production'
            ? 'Check deployment blockers before production launch.'
            : 'Filtered records from this audit source.'}
      </p>
    </div>

    <span>
      {activeTab === 'webhooks'
        ? `${webhookEvents.length} records`
        : activeTab === 'production'
          ? productionReadiness?.ok
            ? 'Ready'
            : 'Needs fixes'
          : `${auditLogs.length} records`}
    </span>
  </section>

  {activeTab === 'webhooks' ? (
    renderWebhookEvents()
  ) : activeTab === 'production' ? (
    renderProductionReadiness()
  ) : loading ? (
    <div className="audit-empty">Loading audit logs...</div>
  ) : auditLogs.length > 0 ? (
    <section className="audit-list">
      {auditLogs.map((log) => (
        <article className="audit-row" key={log.id}>
          <div>
            <small>Action</small>
            <strong>{getPrimaryAction(log)}</strong>
          </div>

          <div>
            <small>Entity</small>
            <span>{getEntityLine(log)}</span>
          </div>

          <div>
            <small>{activeTab === 'notifications' ? 'Recipient' : 'Actor'}</small>
            <span>{getActorLine(log)}</span>
          </div>

          <div>
            <small>Time</small>
            <span>{formatDate(log.createdAt)}</span>
          </div>

          {log.subject ? (
            <div className="audit-wide-line">
              <small>Subject</small>
              <span>{log.subject}</span>
            </div>
          ) : null}

          {log.error ? (
            <div className="audit-error-line">
              <small>Error</small>
              <span>{log.error}</span>
            </div>
          ) : null}

          <pre>{formatMetadata(log.metadata)}</pre>
        </article>
      ))}
    </section>
  ) : (
    <div className="audit-empty">
      No {currentTab.label.toLowerCase()} logs found yet.
    </div>
  )}
</div>

)
}