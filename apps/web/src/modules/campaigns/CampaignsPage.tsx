import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './campaigns.css'

type ShowToast = (text: string, type?: 'success' | 'error') => void

type CampaignTemplate = {
  id: string
  name: string
  language: string
  category: string
  status: string
  headerType: string | null
  headerText: string | null
  bodyText: string
  variableCount: number
}

type ContactType = {
  id: string
  name: string
  color: string | null
}

type Campaign = {
  id: string
  name: string
  audienceType: string
  status: string
  totalRecipients: number
  sentCount: number
  failedCount: number
  createdAt?: string
  scheduledAt?: string | null
  lastError?: string | null
  template?: {
    id: string
    name: string
    language: string
    category: string
    status: string
  }
  contactType?: ContactType | null
}

type CampaignRecipient = {
  id: string
  phone: string
  status: string
  metaMessageId: string | null
  errorMessage: string | null
  retryCount: number
  sentAt: string | null
  createdAt?: string
  scheduledAt?: string | null
  lastError?: string | null
  contact?: {
    id: string
    name: string
    phone: string
    optedIn: boolean
    optInSource: string | null
  }
}

type CampaignDetail = Campaign & {
  template?: CampaignTemplate
  recipients: CampaignRecipient[]
}

type AudiencePreview = {
  totalMatching: number
  eligible: number
  blocked: {
    optedOut: number
    missingOptInSource: number
  }
}

type CampaignFailureSummary = {
  campaign: {
    id: string
    name: string
    status: string
    lastError: string | null
    totalRecipients: number
    sentCount: number
    deliveredCount: number
    readCount: number
    failedCount: number
    updatedAt: string
  }
  retryPolicy: {
    maxRecipientRetryCount: number
    retryableFailedCount: number
  }
  failedRecipients: Array<{
    id: string
    phone: string
    errorMessage: string | null
    retryCount: number
    failedAt: string | null
    statusWebhookAt: string | null
    contact: {
      id: string
      name: string
      optedIn: boolean
      optInSource: string | null
      deletedAt: string | null
    } | null
  }>
}

type CampaignsPageProps = {
  apiUrl: string
  showToast: ShowToast
}

async function readApiError(response: Response, fallback: string) {
  try {
    const data = await response.json()

    if (typeof data.message === 'string') {
      return data.message
    }

    if (typeof data.message?.message === 'string') {
      return data.message.message
    }

    if (typeof data.error === 'string') {
      return data.error
    }

    return fallback
  } catch {
    return fallback
  }
}

function getCampaignStatusLabel(status: string) {
if (status === 'DRAFT') return 'Draft'
if (status === 'SCHEDULED') return 'Scheduled'
if (status === 'QUEUED') return 'Queued'
if (status === 'SENDING') return 'Sending'
if (status === 'COMPLETED') return 'Completed'
if (status === 'FAILED') return 'Failed'
if (status === 'PARTIAL') return 'Partial'
if (status === 'CANCELED') return 'Canceled'
return status
}

function getCampaignStatusHelp(status: string) {
  if (status === 'SCHEDULED') {
    return 'Campaign is scheduled. Worker will send it automatically at the selected time.'
  }

  if (status === 'QUEUED') {
    return 'Campaign is queued. Worker will send safely in background batches.'
  }

  if (status === 'SENDING') {
    return 'Campaign worker is sending messages in background.'
  }

  if (status === 'PARTIAL') {
    return 'Campaign finished, but some recipients failed. Click Retry failed to try failed recipients again.'
  }

  if (status === 'COMPLETED') {
    return 'Campaign sending completed.'
  }

if (status === 'FAILED') {
 return 'Campaign failed. Open details to check recipient errors.'
}

if (status === 'CANCELED') {
 return 'Campaign was cancelled before sending.'
}

return 'Draft is ready. Preview audience before sending or schedule it.'
}

function formatCampaignDate(value?: string | null) {
  if (!value) {
    return ''
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toLocaleString()
}

export function CampaignsPage({ apiUrl, showToast }: CampaignsPageProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [templates, setTemplates] = useState<CampaignTemplate[]>([])
  const [contactTypes, setContactTypes] = useState<ContactType[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [audienceType, setAudienceType] = useState('ALL')
  const [loading, setLoading] = useState(false)
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [audiencePreview, setAudiencePreview] = useState<AudiencePreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [recipientStatusFilter, setRecipientStatusFilter] = useState('ALL')
  const [failureSummary, setFailureSummary] =
  useState<CampaignFailureSummary | null>(null)

  const approvedTemplates = useMemo(
    () => templates.filter((template) => template.status === 'APPROVED'),
    [templates],
  )

  const selectedTemplate = useMemo(
    () =>
      approvedTemplates.find((template) => template.id === selectedTemplateId) ||
      null,
    [approvedTemplates, selectedTemplateId],
  )

  const filteredCampaignRecipients = useMemo(() => {
    if (!selectedCampaign) {
      return []
    }

    if (recipientStatusFilter === 'ALL') {
      return selectedCampaign.recipients
    }

    return selectedCampaign.recipients.filter(
      (recipient) => recipient.status === recipientStatusFilter,
    )
  }, [selectedCampaign, recipientStatusFilter])

  const failedCampaignRecipients = useMemo(() => {
    if (!selectedCampaign) {
      return []
    }

    return selectedCampaign.recipients.filter(
      (recipient) => recipient.status === 'FAILED',
    )
  }, [selectedCampaign])

  async function loadCampaigns() {
    const response = await fetch(`${apiUrl}/campaigns`, {
      credentials: 'include',
    })

    if (!response.ok) {
      setCampaigns([])
      return
    }

    const data = await response.json()
    setCampaigns(Array.isArray(data) ? data : [])
  }

  async function loadTemplates() {
    const response = await fetch(`${apiUrl}/templates`, {
      credentials: 'include',
    })

    if (!response.ok) {
      setTemplates([])
      return
    }

    const data = await response.json()
    setTemplates(Array.isArray(data) ? data : [])
  }

  async function loadContactTypes() {
    const response = await fetch(`${apiUrl}/contact-types`, {
      credentials: 'include',
    })

    if (!response.ok) {
      setContactTypes([])
      return
    }

    const data = await response.json()
    setContactTypes(Array.isArray(data) ? data : [])
  }

useEffect(() => {
  const timer = window.setTimeout(() => {
    void loadCampaigns()
    void loadTemplates()
    void loadContactTypes()
  }, 0)

  return () => window.clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])

    async function previewAudience(form: HTMLFormElement) {
    const formData = new FormData(form)
    const contactTypeId = String(formData.get('contactTypeId') || '').trim()

    if (audienceType === 'CONTACT_TYPE' && !contactTypeId) {
      showToast('Select contact type before previewing audience', 'error')
      return
    }

    setPreviewLoading(true)

    try {
      const response = await fetch(`${apiUrl}/campaigns/preview`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audienceType,
          contactTypeId: audienceType === 'CONTACT_TYPE' ? contactTypeId : '',
        }),
      })

      if (!response.ok) {
        throw new Error(await readApiError(response, 'Failed to preview audience'))
      }

      const data = await response.json()
      setAudiencePreview({
        totalMatching: Number(data.totalMatching || 0),
        eligible: Number(data.eligible || 0),
        blocked: {
          optedOut: Number(data.blocked?.optedOut || 0),
          missingOptInSource: Number(data.blocked?.missingOptInSource || 0),
        },
      })
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Failed to preview audience',
        'error',
      )
    } finally {
      setPreviewLoading(false)
    }
  }

async function createCampaign(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()

  const formElement = event.currentTarget

  setLoading(true)

  const form = new FormData(formElement)
    const name = String(form.get('name') || '').trim()
    const templateId = String(form.get('templateId') || '').trim()
    const contactTypeId = String(form.get('contactTypeId') || '').trim()
    const scheduledAt = String(form.get('scheduledAt') || '').trim()

    if (!name) {
showToast('Campaign name is required', 'error')
setLoading(false)
return
}

if (!templateId) {
showToast('Select an approved template', 'error')
setLoading(false)
return
}

if (audienceType === 'CONTACT_TYPE' && !contactTypeId) {
showToast('Select contact type for this campaign', 'error')
setLoading(false)
return
}

    const variableValues = Array.from(
      {
        length: selectedTemplate?.variableCount || 0,
      },
      (_, index) => String(form.get(`variable${index + 1}`) || '').trim(),
    )

    try {
      const response = await fetch(`${apiUrl}/campaigns`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          templateId,
          audienceType,
          contactTypeId: audienceType === 'CONTACT_TYPE' ? contactTypeId : '',
          variableValues,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : '',
        }),
      })

      if (!response.ok) {
        throw new Error(await readApiError(response, 'Failed to create campaign'))
      }

      const createdCampaign = await response.json()

      setCampaigns((currentCampaigns) => [
        createdCampaign,
        ...currentCampaigns.filter(
          (campaign) => campaign.id !== createdCampaign.id,
        ),
      ])

formElement.reset()
setSelectedTemplateId('')
setAudienceType('ALL')
setAudiencePreview(null)
            showToast(
        createdCampaign.status === 'SCHEDULED'
          ? 'Campaign scheduled successfully'
          : 'Campaign draft created successfully',
      )
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Failed to create campaign',
        'error',
      )
    } finally {
      setLoading(false)
    }
  }

  async function sendCampaign(campaignId: string) {
    const confirmed = window.confirm(
      'Queue this campaign now? The worker will continue sending in safe batches.',
    )

    if (!confirmed) {
      return
    }

    setLoading(true)

    try {
      const response = await fetch(`${apiUrl}/campaigns/${campaignId}/send`, {
        method: 'POST',
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error(await readApiError(response, 'Failed to send campaign'))
      }

      const result = await response.json()

      setCampaigns((currentCampaigns) =>
        currentCampaigns.map((campaign) =>
          campaign.id === result.campaign.id ? result.campaign : campaign,
        ),
      )

            if (selectedCampaign?.id === campaignId) {
        await openCampaignDetail(campaignId)
      }

      showToast(
        result.queued
          ? `Campaign queued with ${result.pendingRecipients} pending recipients. Worker will send in background.`
          : `Campaign sent: ${result.sentNow} sent, ${result.failedNow} failed`,
      )

    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Failed to send campaign',
        'error',
      )
    } finally {
      setLoading(false)
    }
  }

    async function retryFailedCampaignRecipients(campaignId: string) {
    const confirmed = window.confirm(
     'Retry failed recipients now? Only contacts still opted-in, not deleted, and within retry limit will be retried.',
    )

    if (!confirmed) {
      return
    }

    setLoading(true)

    try {
      const response = await fetch(`${apiUrl}/campaigns/${campaignId}/retry-failed`, {
        method: 'POST',
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error(await readApiError(response, 'Failed to retry campaign'))
      }

      const result = await response.json()

      setCampaigns((currentCampaigns) =>
        currentCampaigns.map((campaign) =>
          campaign.id === result.campaign.id ? result.campaign : campaign,
        ),
      )

      if (selectedCampaign?.id === campaignId) {
        await openCampaignDetail(campaignId)
      }

      showToast(
        `Retry queued for ${result.retriedRecipients} failed recipients${
          result.blockedRecipients > 0
            ? `. ${result.blockedRecipients} recipients were blocked because they are no longer eligible.`
            : '.'
        }`,
      )
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Failed to retry campaign',
        'error',
      )
    } finally {
      setLoading(false)
    }
  }

async function cancelScheduledCampaign(campaignId: string) {
  const confirmed = window.confirm(
    'Cancel this campaign? Pending messages will not be sent.',
  )

 if (!confirmed) {
   return
 }

 setLoading(true)

 try {
   const response = await fetch(`${apiUrl}/campaigns/${campaignId}/cancel`, {
     method: 'POST',
     credentials: 'include',
   })

   if (!response.ok) {
     throw new Error(await readApiError(response, 'Failed to cancel campaign'))
   }

   const result = await response.json()

   setCampaigns((currentCampaigns) =>
     currentCampaigns.map((campaign) =>
       campaign.id === result.campaign.id ? result.campaign : campaign,
     ),
   )

   if (selectedCampaign?.id === campaignId) {
     await openCampaignDetail(campaignId)
   }

   showToast('Campaign cancelled successfully')
 } catch (error) {
   showToast(
     error instanceof Error ? error.message : 'Failed to cancel campaign',
     'error',
   )
 } finally {
   setLoading(false)
 }
}

  async function deleteCampaign(campaignId: string) {
    const confirmed = window.confirm(
      'Delete this campaign? This cannot be undone.',
    )

    if (!confirmed) {
      return
    }

    setLoading(true)

    try {
      const response = await fetch(`${apiUrl}/campaigns/${campaignId}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error(await readApiError(response, 'Failed to delete campaign'))
      }

      setCampaigns((currentCampaigns) =>
        currentCampaigns.filter((campaign) => campaign.id !== campaignId),
      )

      if (selectedCampaign?.id === campaignId) {
        setSelectedCampaign(null)
      }

      showToast('Campaign deleted')
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Failed to delete campaign',
        'error',
      )
    } finally {
      setLoading(false)
    }
  }

async function openCampaignDetail(campaignId: string) {
  setDetailLoading(true)

  try {
    const [detailResponse, failuresResponse] = await Promise.all([
      fetch(`${apiUrl}/campaigns/${campaignId}`, {
        credentials: 'include',
      }),
      fetch(`${apiUrl}/campaigns/${campaignId}/failures`, {
        credentials: 'include',
      }),
    ])

    if (!detailResponse.ok) {
      throw new Error(
        await readApiError(detailResponse, 'Failed to load campaign detail'),
      )
    }

    if (!failuresResponse.ok) {
      throw new Error(
        await readApiError(failuresResponse, 'Failed to load campaign failures'),
      )
    }

    const detailData = await detailResponse.json()
    const failuresData = await failuresResponse.json()

    setSelectedCampaign(detailData)
    setFailureSummary(failuresData)
    setRecipientStatusFilter('ALL')
  } catch (error) {
    showToast(
      error instanceof Error ? error.message : 'Failed to load campaign detail',
      'error',
    )
  } finally {
    setDetailLoading(false)
  }
}

async function exportFailedRecipientsCsv() {
  if (!selectedCampaign) {
    return
  }

  if (!failureSummary || failureSummary.failedRecipients.length === 0) {
    showToast('No failed recipients to export', 'error')
    return
  }

  try {
    const response = await fetch(
      `${apiUrl}/campaigns/${selectedCampaign.id}/failures/export.csv`,
      {
        credentials: 'include',
      },
    )

    if (!response.ok) {
      throw new Error(
        await readApiError(response, 'Failed to export failed recipients'),
      )
    }

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = `campaign-failures-${selectedCampaign.id}.csv`
    link.click()

    URL.revokeObjectURL(url)
    showToast('Failed recipients exported')
  } catch (error) {
    showToast(
      error instanceof Error ? error.message : 'Failed to export failed recipients',
      'error',
    )
  }
}

  return (
    <div className="content-card campaigns-workspace">
      <div className="contacts-topbar">
        <div>
          <h2>Campaigns</h2>
          <p>
            Send approved WhatsApp templates to opted-in contacts safely.
          </p>
        </div>

        <span className="status-pill">{campaigns.length} campaigns</span>
      </div>

      <section className="sub-card">
        <div className="section-heading">
          <div>
            <h3>Create or Schedule Campaign</h3>
            <p>
              Send now or schedule approved WhatsApp templates to opted-in contacts.
            </p>
          </div>
        </div>

        {approvedTemplates.length === 0 ? (
          <div className="campaign-warning-box">
            No approved templates found. First submit and approve a template from the Templates module.
          </div>
        ) : null}

        <form className="campaign-form" onSubmit={createCampaign}>
          <input name="name" placeholder="Campaign name e.g. June offer" />
                    <label className="campaign-schedule-field">
            <span>Schedule time optional</span>
            <input name="scheduledAt" type="datetime-local" />
          </label>

          <select
            name="templateId"
            value={selectedTemplateId}
            onChange={(event) => setSelectedTemplateId(event.target.value)}
          >
            <option value="">Select approved template</option>
            {approvedTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} · {template.language} · {template.category}
              </option>
            ))}
          </select>

          <select
            value={audienceType}
                        onChange={(event) => {
              setAudienceType(event.target.value)
              setAudiencePreview(null)
            }}
          >
            <option value="ALL">All opted-in contacts</option>
            <option value="CONTACT_TYPE">Specific contact type</option>
          </select>

          {audienceType === 'CONTACT_TYPE' ? (
                <select
              name="contactTypeId"
              defaultValue=""
              onChange={() => setAudiencePreview(null)}
            >
              <option value="">Select contact type</option>
              {contactTypes.map((contactType) => (
                <option key={contactType.id} value={contactType.id}>
                  {contactType.name}
                </option>
              ))}
            </select>
          ) : null}

          {selectedTemplate ? (
            <div className="campaign-template-preview">
              <strong>Selected template preview</strong>
              <span>
                {selectedTemplate.name} · {selectedTemplate.language} ·{' '}
                {selectedTemplate.category}
              </span>
              {selectedTemplate.headerText ? (
                <p>
                  <strong>Header:</strong> {selectedTemplate.headerText}
                </p>
              ) : null}

              <p>
                <strong>Body:</strong> {selectedTemplate.bodyText}
              </p>

              <small>
                Variables needed: {selectedTemplate.variableCount} · Fill order: header first, body second, URL button last
              </small>
            </div>
          ) : null}

          {selectedTemplate && selectedTemplate.variableCount > 0 ? (
            <div className="campaign-variable-grid">
              {Array.from(
                {
                  length: selectedTemplate.variableCount,
                },
                (_, index) => (
                  <input
                    key={index + 1}
                    name={`variable${index + 1}`}
                    placeholder={`Value for {{${index + 1}}}`}
                  />
                ),
              )}
            </div>
          ) : null}

          <div className="campaign-policy-box">
            <strong>Safety rules</strong>
            <span>Only approved templates are shown.</span>
            <span>Only opted-in contacts with opt-in source are selected.</span>
            <span>Opted-out contacts are blocked automatically.</span>
            <span>Scheduled campaigns are queued by backend worker, not browser timers.</span>
          </div>

          {audiencePreview ? (
            <div className="campaign-audience-preview">
              <strong>Audience preview</strong>
              <div>
                <span>Total matching: {audiencePreview.totalMatching}</span>
                <span>Eligible to send: {audiencePreview.eligible}</span>
                <span>Blocked opted-out: {audiencePreview.blocked.optedOut}</span>
                <span>
                  Missing opt-in source:{' '}
                  {audiencePreview.blocked.missingOptInSource}
                </span>
              </div>
            </div>
          ) : null}

          <button
            type="button"
            disabled={previewLoading}
            onClick={(event) => previewAudience(event.currentTarget.form!)}
          >
            {previewLoading ? 'Checking audience...' : 'Preview Audience'}
          </button>

<button disabled={loading || approvedTemplates.length === 0 || !selectedTemplateId}>
  Create / Schedule Campaign
</button>
        </form>
      </section>

      <section className="sub-card">
        <div className="section-heading">
          <div>
            <h3>Campaign List</h3>
            <p>Track draft, sending, completed, partial, and failed campaigns.</p>
          </div>

          <button
            className="campaign-refresh-button"
            type="button"
            onClick={loadCampaigns}
          >
            Refresh
          </button>
        </div>

        <div className="campaigns-list">
          {campaigns.length === 0 ? (
            <div className="empty-state">
              <strong>No campaigns yet</strong>
              <span>Create your first campaign draft above.</span>
            </div>
          ) : (
            campaigns.map((campaign) => (
              <article className="campaign-card" key={campaign.id}>
                <div className="campaign-card-header">
                  <div>
                    <strong>{campaign.name}</strong>
                    <span>
                      {campaign.template?.name || 'Template'} ·{' '}
                      {campaign.audienceType === 'CONTACT_TYPE'
                        ? campaign.contactType?.name || 'Contact type'
                        : 'All opted-in contacts'}
                    </span>
                  </div>

                  <span className={`campaign-status ${campaign.status.toLowerCase()}`}>
                    {getCampaignStatusLabel(campaign.status)}
                  </span>
                </div>

<div className="campaign-stats-grid">
  <span>Total: {campaign.totalRecipients}</span>
  <span>Sent: {campaign.sentCount}</span>
  <span>Failed: {campaign.failedCount}</span>
</div>

{campaign.scheduledAt ? (
  <div className="campaign-schedule-note">
    Scheduled for: {formatCampaignDate(campaign.scheduledAt)}
  </div>
) : null}

{campaign.lastError ? (
  <div className="campaign-last-error">
    {campaign.lastError}
  </div>
) : null}

<div className={`campaign-status-help ${campaign.status.toLowerCase()}`}>
  {getCampaignStatusHelp(campaign.status)}
</div>

<div className="contact-actions template-actions">
  <button
    className="small-secondary-button"
    disabled={detailLoading}
    type="button"
    onClick={() => openCampaignDetail(campaign.id)}
  >
    View details
  </button>

  {['DRAFT', 'SCHEDULED', 'FAILED', 'PARTIAL'].includes(campaign.status) ? (
                    <button
                      className="small-success-button"
                      disabled={loading}
                      type="button"
                      onClick={() =>
  ['FAILED', 'PARTIAL'].includes(campaign.status)
    ? retryFailedCampaignRecipients(campaign.id)
    : sendCampaign(campaign.id)
}
                    >
                      {['FAILED', 'PARTIAL'].includes(campaign.status)
                        ? 'Retry failed'
                        : campaign.status === 'SCHEDULED'
                          ? 'Send now instead'
                          : 'Send now'}
                    </button>
                  ) : null}

               {['SCHEDULED', 'QUEUED', 'SENDING'].includes(campaign.status) ? (
                 <button
                   className="small-warning-button"
                   disabled={loading}
                   type="button"
                   onClick={() => cancelScheduledCampaign(campaign.id)}
                 >
                   Cancel campaign
                 </button>
               ) : null}

               {['DRAFT', 'SCHEDULED', 'FAILED', 'CANCELED'].includes(campaign.status) ? (
                 <button
                   className="small-danger-button"
                   disabled={loading}
                   type="button"
                   onClick={() => deleteCampaign(campaign.id)}
                 >
                   Delete
                 </button>
               ) : null}
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      {selectedCampaign ? (
        <div className="modal-backdrop">
          <div className="modal-card campaign-detail-modal">
            <div className="modal-header">
              <div>
                <h3>{selectedCampaign.name}</h3>
                <p>
                  {selectedCampaign.template?.name || 'Template'} ·{' '}
                  {selectedCampaign.totalRecipients} recipients
                </p>
              </div>

<button
  type="button"
  onClick={() => {
    setSelectedCampaign(null)
    setFailureSummary(null)
  }}
>
  ×
</button>
            </div>

            <div className="campaign-detail-summary">
              <span>Total: {selectedCampaign.totalRecipients}</span>
              <span>Sent: {selectedCampaign.sentCount}</span>
              <span>Failed: {selectedCampaign.failedCount}</span>
              <span>Status: {getCampaignStatusLabel(selectedCampaign.status)}</span>
                            {selectedCampaign.scheduledAt ? (
                <span>
                  Scheduled: {formatCampaignDate(selectedCampaign.scheduledAt)}
                </span>
              ) : null}
            </div>

            {failureSummary ? (
  <div className="campaign-failure-dashboard">
    <div>
      <strong>Failure dashboard</strong>
      <span>
        Retryable failed recipients:{' '}
        {failureSummary.retryPolicy.retryableFailedCount}
      </span>
    </div>

    <div className="campaign-failure-grid">
      <span>Total: {failureSummary.campaign.totalRecipients}</span>
      <span>Sent: {failureSummary.campaign.sentCount}</span>
      <span>Delivered: {failureSummary.campaign.deliveredCount}</span>
      <span>Read: {failureSummary.campaign.readCount}</span>
      <span>Failed: {failureSummary.campaign.failedCount}</span>
      <span>
        Max retries: {failureSummary.retryPolicy.maxRecipientRetryCount}
      </span>
    </div>

    {failureSummary.failedRecipients.length > 0 ? (
      <div className="campaign-failure-list">
        {failureSummary.failedRecipients.slice(0, 10).map((recipient) => {
          const contactDeleted = Boolean(recipient.contact?.deletedAt)
          const retryable =
            recipient.retryCount <
              failureSummary.retryPolicy.maxRecipientRetryCount &&
            Boolean(recipient.contact?.optedIn) &&
            Boolean(recipient.contact?.optInSource) &&
            !contactDeleted

          return (
            <div className="campaign-failure-row" key={recipient.id}>
              <span>
                <strong>{recipient.contact?.name || 'Unknown contact'}</strong>
                <small>{recipient.phone}</small>
              </span>

              <span>
                <strong>{retryable ? 'Retryable' : 'Blocked'}</strong>
                <small>
                  {contactDeleted
                    ? 'Contact deleted'
                    : recipient.contact?.optedIn
                      ? `Opt-in: ${recipient.contact.optInSource || '-'}`
                      : 'Opted out / missing proof'}
                </small>
              </span>

              <span>
                <strong>Retries: {recipient.retryCount}</strong>
                <small className="campaign-error-text">
                  {recipient.errorMessage || 'Unknown failure'}
                </small>
              </span>
            </div>
          )
        })}
      </div>
    ) : (
      <div className="campaign-status-help completed">
        No failed recipients found.
      </div>
    )}
  </div>
) : null}

            {selectedCampaign.lastError ? (
              <div className="campaign-last-error">
                {selectedCampaign.lastError}
              </div>
            ) : null}

            <div className="campaign-detail-toolbar">
              <select
                value={recipientStatusFilter}
                onChange={(event) => setRecipientStatusFilter(event.target.value)}
              >
             <option value="ALL">All recipients</option>
             <option value="PENDING">Pending only</option>
             <option value="PROCESSING">Processing only</option>
             <option value="SENT">Sent only</option>
             <option value="DELIVERED">Delivered only</option>
             <option value="READ">Read only</option>
             <option value="FAILED">Failed only</option>
              </select>

<button
  className="small-secondary-button"
  disabled={failedCampaignRecipients.length === 0}
  type="button"
  onClick={exportFailedRecipientsCsv}
>
  Export failed CSV
</button>

              {['FAILED', 'PARTIAL'].includes(selectedCampaign.status) ? (
                <button
                  className="small-success-button"
                  disabled={
  loading ||
  !failureSummary ||
  failureSummary.retryPolicy.retryableFailedCount < 1
}
                  type="button"
                  onClick={() => retryFailedCampaignRecipients(selectedCampaign.id)}
                >
                  Retry failed
                </button>
              ) : null}
            </div>

            <div className="campaign-recipients-table">
              <div className="campaign-recipient-row header">
                <span>Contact</span>
                <span>Phone</span>
                <span>Status</span>
                <span>Meta ID / Error</span>
              </div>

              {filteredCampaignRecipients.length === 0 ? (
                <div className="empty-state">
                  <strong>No recipients found</strong>
                  <span>This campaign has no saved recipients.</span>
                </div>
              ) : (
                filteredCampaignRecipients.map((recipient) => (
                  <div className="campaign-recipient-row" key={recipient.id}>
                    <span>
                      <strong>{recipient.contact?.name || 'Unknown'}</strong>
                      <small>
                        {recipient.contact?.optedIn
                          ? `Opt-in: ${recipient.contact.optInSource || '-'}`
                          : 'Not opted in'}
                      </small>
                    </span>

                    <span>{recipient.phone}</span>

                    <span
                      className={`campaign-recipient-status ${recipient.status.toLowerCase()}`}
                    >
                      {recipient.status}
                    </span>

<span>
  {recipient.metaMessageId ? (
    <>
      {recipient.retryCount > 0 ? (
        <small>Retries: {recipient.retryCount}</small>
      ) : null}
      <small>{recipient.metaMessageId}</small>
    </>
  ) : recipient.errorMessage ? (
    <>
      {recipient.retryCount > 0 ? (
        <small>Retries: {recipient.retryCount}</small>
      ) : null}
      <small className="campaign-error-text">
        {recipient.errorMessage}
      </small>
    </>
  ) : (
    <>
      {recipient.retryCount > 0 ? (
        <small>Retries: {recipient.retryCount}</small>
      ) : null}
      <small>-</small>
    </>
  )}
</span>

                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
