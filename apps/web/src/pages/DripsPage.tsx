import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import '../css/drips.css'

type ShowToast = (text: string, type?: 'success' | 'error') => void

type CurrentUser = {
  id: string
  name: string
  email: string
  role: string
}

type DripsPageProps = {
  apiUrl: string
  currentUser: CurrentUser
  showToast: ShowToast
}

const FIXED_DRIP_TIMEZONE = 'Asia/Kolkata'

type ContactType = {
  id: string
  name: string
  color: string | null
}

type Contact = {
  id: string
  name: string
  phone: string
  optedIn: boolean
  optInSource: string | null
  contactTypeId: string | null
}

type Template = {
  id: string
  name: string
  language: string
  category: string
  status: string
  headerType: string | null
  headerText: string | null
  bodyText: string
  components: unknown
}

type DripStep = {
  id: string
  name: string
  position: number
  dayOffset: number
  minuteOffset: number
  variableValues: unknown
  template: Template
}

type DripMessage = {
  id: string
  stepId: string
  status: string
  retryCount: number
  scheduledFor: string
  sentAt: string | null
  deliveredAt: string | null
  readAt: string | null
  failedAt: string | null
  errorMessage: string | null
  statusWebhookAt: string | null
  step: {
    id: string
    name: string
    position: number
  }
}

type DripEnrollment = {
  id: string
  status: string
  source: string
  enrollmentCycle: number
  currentStepPosition: number
  nextRunAt: string | null
  enrolledAt: string
  completedAt: string | null
  stoppedAt: string | null
  stopReason: string | null
  contact: {
    id: string
    name: string
    phone: string
    optedIn: boolean
    optInSource: string | null
    contactTypeId: string | null
  }
  messages: DripMessage[]
}

type DripWorkflow = {
  id: string
  name: string
  description: string | null
  status: string
  audienceType: string
  targetContactTypeId: string | null
  targetContactType: ContactType | null
  timezone: string
  sendingStartTime: string
  sendingEndTime: string
  sendingDays: unknown
  autoEnrollNewContacts: boolean
  autoEnrollInbound: boolean
  includeExistingContacts: boolean
  allowReentry: boolean
  reentryCooldownDays: number | null
  activatedAt: string | null
  pausedAt: string | null
  archivedAt: string | null
  createdAt: string
  steps: DripStep[]
  enrollments?: DripEnrollment[]
  _count?: {
    enrollments: number
  }
}

type DripSummary = {
  workflow: {
    id: string
    name: string
    status: string
  }
  enrollmentStatuses: Record<string, number>
  messageStatuses: Record<string, number>
  queueHealth: {
    pendingDue: number
    processingStuck: number
  }
  recentFailures: Array<{
    id: string
    errorMessage: string | null
    retryCount: number
    failedAt: string | null
    step: {
      id: string
      name: string
      position: number
    }
    contact: {
      id: string
      name: string
      phone: string
    }
  }>
  recentAuditLogs: Array<{
    id: string
    action: string
    contactId: string | null
    createdAt: string
  }>
}

type BuilderStep = {
  name: string
  templateId: string
  dayOffset: number
  minuteOffset: number
  variableValuesText: string
}

type BuilderState = {
  name: string
  description: string
  audienceType: 'ALL_OPTED_IN' | 'CONTACT_TYPE'
  targetContactTypeId: string
  timezone: string
  sendingStartTime: string
  sendingEndTime: string
  sendingDays: number[]
  autoEnrollNewContacts: boolean
  autoEnrollInbound: boolean
  includeExistingContacts: boolean
  allowReentry: boolean
  reentryCooldownDays: number
  steps: BuilderStep[]
}

const dayOptions = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
]

const emptyBuilder: BuilderState = {
  name: '',
  description: '',
  audienceType: 'ALL_OPTED_IN',
  targetContactTypeId: '',
  timezone: 'Asia/Kolkata',
  sendingStartTime: '09:00',
  sendingEndTime: '19:00',
  sendingDays: [1, 2, 3, 4, 5, 6],
  autoEnrollNewContacts: true,
  autoEnrollInbound: true,
  includeExistingContacts: false,
  allowReentry: false,
  reentryCooldownDays: 1,
  steps: [
    {
      name: 'Step 1',
      templateId: '',
      dayOffset: 0,
      minuteOffset: 0,
      variableValuesText: '',
    },
  ],
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

function parseVariableValues(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20)
}

function getTemplateVariableNumbers(text: string | null | undefined) {
  return Array.from(
    new Set(
      Array.from(String(text || '').matchAll(/{{\s*(\d+)\s*}}/g)).map(
        (match) => Number(match[1]),
      ),
    ),
  )
}

function getTemplateButtonVariableCount(components: unknown) {
  if (!Array.isArray(components)) {
    return 0
  }

  const buttonsComponent = components.find((component) => {
    const item = component as Record<string, unknown>

    return (
      String(item.type || '').toUpperCase() === 'BUTTONS' &&
      Array.isArray(item.buttons)
    )
  }) as Record<string, unknown> | undefined

  if (!buttonsComponent || !Array.isArray(buttonsComponent.buttons)) {
    return 0
  }

  return buttonsComponent.buttons.filter((button) => {
    const item = button as Record<string, unknown>

    return (
      String(item.type || '').toUpperCase() === 'URL' &&
      getTemplateVariableNumbers(String(item.url || '')).length > 0
    )
  }).length
}

function getTemplateVariableCount(template: Template | undefined) {
  if (!template) {
    return 0
  }

  return (
    getTemplateVariableNumbers(template.headerText).length +
    getTemplateVariableNumbers(template.bodyText).length +
    getTemplateButtonVariableCount(template.components)
  )
}

function getSendingDays(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return '—'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return date.toLocaleString()
}

function getStatusClass(status: string) {
  return String(status || '').trim().toLowerCase()
}

export function DripsPage({
  apiUrl,
  currentUser,
  showToast,
}: DripsPageProps) {
  const canEdit = [
    'admin',
    'manager',
    'platform_admin',
    'super_admin',
  ].includes(currentUser.role)
  const canEnroll = [
    'admin',
    'manager',
    'agent',
    'platform_admin',
    'super_admin',
  ].includes(currentUser.role)

  const [workflows, setWorkflows] = useState<DripWorkflow[]>([])
  const [selectedWorkflow, setSelectedWorkflow] =
    useState<DripWorkflow | null>(null)
  const [selectedWorkflowSummary, setSelectedWorkflowSummary] =
    useState<DripSummary | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [contactTypes, setContactTypes] = useState<ContactType[]>([])
  const [builder, setBuilder] = useState<BuilderState>(emptyBuilder)
  const [editingWorkflowId, setEditingWorkflowId] = useState('')
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [contactsLoaded, setContactsLoaded] = useState(false)
  const [activeTab, setActiveTab] = useState<
    'workflows' | 'builder' | 'details'
  >('workflows')
  const [workflowSearch, setWorkflowSearch] = useState('')
  const [contactSearch, setContactSearch] = useState('')

  const approvedTemplates = useMemo(
    () => templates.filter((template) => template.status === 'APPROVED'),
    [templates],
  )

  const eligibleContacts = useMemo(() => {
    if (!selectedWorkflow) {
      return []
    }

    return contacts.filter((contact) => {
      if (!contact.optedIn || !contact.optInSource) {
        return false
      }

      if (
        selectedWorkflow.audienceType === 'CONTACT_TYPE' &&
        selectedWorkflow.targetContactTypeId
      ) {
        return (
          contact.contactTypeId === selectedWorkflow.targetContactTypeId
        )
      }

      return true
    })
  }, [contacts, selectedWorkflow])

  const filteredWorkflows = useMemo(() => {
    const search = workflowSearch.trim().toLowerCase()

    if (!search) {
      return workflows
    }

    return workflows.filter(
      (workflow) =>
        workflow.name.toLowerCase().includes(search) ||
        workflow.status.toLowerCase().includes(search) ||
        String(workflow.description || '')
          .toLowerCase()
          .includes(search),
    )
  }, [workflows, workflowSearch])

  async function loadWorkflows() {
    const response = await fetch(`${apiUrl}/drips`, {
      credentials: 'include',
    })

    if (!response.ok) {
      throw new Error(
        await readApiError(response, 'Failed to load drip workflows'),
      )
    }

    const data = await response.json()
    setWorkflows(Array.isArray(data) ? data : [])
  }

  async function loadTemplates() {
    const response = await fetch(`${apiUrl}/templates`, {
      credentials: 'include',
    })

    if (!response.ok) {
      throw new Error(
        await readApiError(response, 'Failed to load templates'),
      )
    }

    const data = await response.json()
    setTemplates(Array.isArray(data) ? data : [])
  }

  async function loadContacts(searchValue = contactSearch) {
    const cleanSearch = searchValue.trim()
    if (cleanSearch.length < 2) {
      showToast(
        'Type at least 2 characters to search contacts',
        'error',
      )
      return
    }

    const query = cleanSearch
      ? `?search=${encodeURIComponent(cleanSearch)}`
      : ''

    const response = await fetch(`${apiUrl}/contacts${query}`, {
      credentials: 'include',
    })

    if (!response.ok) {
      throw new Error(
        await readApiError(response, 'Failed to load contacts'),
      )
    }

    const data = await response.json()
    setContacts(Array.isArray(data) ? data : [])
    setContactsLoaded(true)
  }

  async function loadContactTypes() {
    const response = await fetch(`${apiUrl}/contact-types`, {
      credentials: 'include',
    })

    if (!response.ok) {
      throw new Error(
        await readApiError(response, 'Failed to load contact types'),
      )
    }

    const data = await response.json()
    setContactTypes(Array.isArray(data) ? data : [])
  }

  async function loadInitialData() {
    setLoading(true)

    try {
      await Promise.all([
        loadWorkflows(),
        loadTemplates(),
        loadContactTypes(),
      ])
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : 'Failed to load drip automation',
        'error',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadInitialData()
    }, 0)

    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function openWorkflow(workflowId: string) {
    setLoading(true)

    try {
      const response = await fetch(`${apiUrl}/drips/${workflowId}`, {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error(
          await readApiError(response, 'Failed to load drip workflow'),
        )
      }

      const data = await response.json()
      setSelectedWorkflow(data)
      setSelectedWorkflowSummary(null)
      setSelectedContactIds([])
      setContacts([])
      setContactsLoaded(false)
      setContactSearch('')
      setActiveTab('details')
      await loadWorkflowSummary(workflowId)
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : 'Failed to load drip workflow',
        'error',
      )
    } finally {
      setLoading(false)
    }
  }

  async function loadWorkflowSummary(workflowId: string) {
    const response = await fetch(`${apiUrl}/drips/${workflowId}/summary`, {
      credentials: 'include',
    })

    if (!response.ok) {
      throw new Error(
        await readApiError(response, 'Failed to load drip summary'),
      )
    }

    const data = await response.json()
    setSelectedWorkflowSummary(data)
  }

  function startNewWorkflow() {
    setEditingWorkflowId('')
    setBuilder({
      ...emptyBuilder,
      steps: emptyBuilder.steps.map((step) => ({ ...step })),
    })
    setActiveTab('builder')
  }

  function editWorkflow(workflow: DripWorkflow) {
    if (workflow.status !== 'DRAFT') {
      showToast('Only draft drip workflows can be edited', 'error')
      return
    }

    setEditingWorkflowId(workflow.id)
    setBuilder({
      name: workflow.name,
      description: workflow.description || '',
      audienceType:
        workflow.audienceType === 'CONTACT_TYPE'
          ? 'CONTACT_TYPE'
          : 'ALL_OPTED_IN',
      targetContactTypeId: workflow.targetContactTypeId || '',
      timezone: FIXED_DRIP_TIMEZONE,
      sendingStartTime: workflow.sendingStartTime,
      sendingEndTime: workflow.sendingEndTime,
      sendingDays: getSendingDays(workflow.sendingDays),
      autoEnrollNewContacts: workflow.autoEnrollNewContacts,
      autoEnrollInbound: workflow.autoEnrollInbound,
      includeExistingContacts: workflow.includeExistingContacts,
      allowReentry: workflow.allowReentry,
      reentryCooldownDays: workflow.reentryCooldownDays || 1,
      steps: workflow.steps.map((step) => ({
        name: step.name,
        templateId: step.template.id,
        dayOffset: step.dayOffset,
        minuteOffset: step.minuteOffset,
        variableValuesText: Array.isArray(step.variableValues)
          ? step.variableValues.join('\n')
          : '',
      })),
    })
    setActiveTab('builder')
  }

  function updateStep(
    index: number,
    patch: Partial<BuilderStep>,
  ) {
    setBuilder((current) => ({
      ...current,
      steps: current.steps.map((step, stepIndex) =>
        stepIndex === index
          ? {
              ...step,
              ...patch,
            }
          : step,
      ),
    }))
  }

  function addStep() {
    setBuilder((current) => ({
      ...current,
      steps: [
        ...current.steps,
        {
          name: `Step ${current.steps.length + 1}`,
          templateId: '',
          dayOffset: 0,
          minuteOffset: 0,
          variableValuesText: '',
        },
      ],
    }))
  }

  function removeStep(index: number) {
    setBuilder((current) => {
      if (current.steps.length <= 1) {
        return current
      }

      return {
        ...current,
        steps: current.steps.filter(
          (_, stepIndex) => stepIndex !== index,
        ),
      }
    })
  }

  function toggleSendingDay(day: number) {
    setBuilder((current) => ({
      ...current,
      sendingDays: current.sendingDays.includes(day)
        ? current.sendingDays.filter((value) => value !== day)
        : [...current.sendingDays, day].sort(
            (left, right) => left - right,
          ),
    }))
  }

  async function saveWorkflow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!canEdit) {
      showToast(
        'Only admin and manager can save drip workflows',
        'error',
      )
      return
    }

    if (!builder.name.trim()) {
      showToast('Workflow name is required', 'error')
      return
    }

    if (builder.sendingDays.length === 0) {
      showToast('Select at least one sending day', 'error')
      return
    }

    if (
      builder.audienceType === 'CONTACT_TYPE' &&
      !builder.targetContactTypeId
    ) {
      showToast('Select a contact type', 'error')
      return
    }

    if (
      builder.allowReentry &&
      (!Number.isInteger(builder.reentryCooldownDays) ||
        builder.reentryCooldownDays < 1)
    ) {
      showToast(
        'Re-entry cooldown must be at least 1 day',
        'error',
      )
      return
    }

    if (
      builder.steps.some(
        (step) =>
          !step.templateId ||
          step.dayOffset < 0 ||
          step.minuteOffset < 0 ||
          step.minuteOffset > 1439,
      )
    ) {
      showToast(
        'Every drip step needs a valid approved template and schedule',
        'error',
      )
      return
    }

    setLoading(true)

    try {
      const endpoint = editingWorkflowId
        ? `${apiUrl}/drips/${editingWorkflowId}`
        : `${apiUrl}/drips`

      const response = await fetch(endpoint, {
        method: editingWorkflowId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          name: builder.name.trim(),
          description: builder.description.trim(),
          audienceType: builder.audienceType,
          targetContactTypeId:
            builder.audienceType === 'CONTACT_TYPE'
              ? builder.targetContactTypeId
              : null,
          timezone: FIXED_DRIP_TIMEZONE,
          sendingStartTime: builder.sendingStartTime,
          sendingEndTime: builder.sendingEndTime,
          sendingDays: builder.sendingDays,
          autoEnrollNewContacts: builder.autoEnrollNewContacts,
          autoEnrollInbound: builder.autoEnrollInbound,
          includeExistingContacts: builder.includeExistingContacts,
          allowReentry: builder.allowReentry,
          reentryCooldownDays: builder.allowReentry
            ? builder.reentryCooldownDays
            : null,
          steps: builder.steps.map((step) => ({
            name: step.name.trim(),
            templateId: step.templateId,
            dayOffset: Number(step.dayOffset),
            minuteOffset: Number(step.minuteOffset),
            variableValues: parseVariableValues(
              step.variableValuesText,
            ),
          })),
        }),
      })

      if (!response.ok) {
        throw new Error(
          await readApiError(response, 'Failed to save drip workflow'),
        )
      }

      const savedWorkflow = await response.json()

      showToast(
        editingWorkflowId
          ? 'Drip workflow updated'
          : 'Drip workflow created',
      )

      setEditingWorkflowId('')
      setBuilder({
        ...emptyBuilder,
        steps: emptyBuilder.steps.map((step) => ({ ...step })),
      })

      await loadWorkflows()
      await openWorkflow(savedWorkflow.id)
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : 'Failed to save drip workflow',
        'error',
      )
    } finally {
      setLoading(false)
    }
  }

  async function runWorkflowAction(
    workflowId: string,
    action: 'activate' | 'pause' | 'archive',
  ) {
    if (!canEdit) {
      showToast(
        'Only admin and manager can manage drip workflows',
        'error',
      )
      return
    }

    const actionLabel =
      action === 'activate'
        ? 'activate'
        : action === 'pause'
          ? 'pause'
          : 'archive'

    if (
      action === 'archive' &&
      !window.confirm(
        'Archive this workflow? Active enrolments will stop and pending messages will be canceled.',
      )
    ) {
      return
    }

    setLoading(true)

    try {
      const response = await fetch(
        `${apiUrl}/drips/${workflowId}/${action}`,
        {
          method: 'POST',
          credentials: 'include',
        },
      )

      if (!response.ok) {
        throw new Error(
          await readApiError(
            response,
            `Failed to ${actionLabel} drip workflow`,
          ),
        )
      }

      const actionResult = await response.json()
      const enrollmentQueued =
        action === 'activate' &&
        Boolean(actionResult?.enrollmentResult?.queued)

      showToast(
        enrollmentQueued
          ? 'Drip workflow activated. Existing contacts are being enrolled in background batches.'
          : `Drip workflow ${actionLabel}d`,
      )
      await loadWorkflows()
      await openWorkflow(workflowId)
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : `Failed to ${actionLabel} drip workflow`,
        'error',
      )
    } finally {
      setLoading(false)
    }
  }

  function toggleContact(contactId: string) {
    setSelectedContactIds((current) =>
      current.includes(contactId)
        ? current.filter((id) => id !== contactId)
        : [...current, contactId],
    )
  }

  async function enrollSelectedContacts() {
    if (!selectedWorkflow || !canEnroll) {
      return
    }

    if (selectedContactIds.length === 0) {
      showToast('Select at least one eligible contact', 'error')
      return
    }

    setLoading(true)

    try {
      const response = await fetch(
        `${apiUrl}/drips/${selectedWorkflow.id}/enroll`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            contactIds: selectedContactIds,
          }),
        },
      )

      if (!response.ok) {
        throw new Error(
          await readApiError(response, 'Failed to enrol contacts'),
        )
      }

      const result = await response.json()

      showToast(
        `${result.enrolled || 0} contact(s) enrolled, ${
          result.skipped || 0
        } skipped`,
      )

      setSelectedContactIds([])
      await openWorkflow(selectedWorkflow.id)
      await loadWorkflows()
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : 'Failed to enrol contacts',
        'error',
      )
    } finally {
      setLoading(false)
    }
  }

  async function stopEnrollment(enrollmentId: string) {
    if (!selectedWorkflow || !canEnroll) {
      return
    }

    if (
      !window.confirm(
        'Stop this contact enrolment and cancel its pending drip messages?',
      )
    ) {
      return
    }

    setLoading(true)

    try {
      const response = await fetch(
        `${apiUrl}/drips/${selectedWorkflow.id}/enrollments/${enrollmentId}/stop`,
        {
          method: 'POST',
          credentials: 'include',
        },
      )

      if (!response.ok) {
        throw new Error(
          await readApiError(response, 'Failed to stop enrolment'),
        )
      }

      showToast('Drip enrolment stopped')
      await openWorkflow(selectedWorkflow.id)
      await loadWorkflows()
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : 'Failed to stop enrolment',
        'error',
      )
    } finally {
      setLoading(false)
    }
  }

  async function retryMessage(messageId: string) {
    if (!selectedWorkflow || !canEdit) {
      return
    }

    setLoading(true)

    try {
      const response = await fetch(
        `${apiUrl}/drips/${selectedWorkflow.id}/messages/${messageId}/retry`,
        {
          method: 'POST',
          credentials: 'include',
        },
      )

      if (!response.ok) {
        throw new Error(
          await readApiError(
            response,
            'Failed to retry drip message',
          ),
        )
      }

      showToast('Failed drip message scheduled for retry')
      await openWorkflow(selectedWorkflow.id)
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : 'Failed to retry drip message',
        'error',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="drips-page">
      <div className="drips-toolbar">
        <div>
          <h2>Drip Automation</h2>
          <p>
            Send approved WhatsApp templates on secure,
            timezone-aware schedules.
          </p>
        </div>

        <div className="drips-toolbar-actions">
          <button
            type="button"
            className={activeTab === 'workflows' ? 'active' : ''}
            onClick={() => setActiveTab('workflows')}
          >
            Workflows
          </button>

          {canEdit ? (
            <button
              type="button"
              className={activeTab === 'builder' ? 'active' : ''}
              onClick={startNewWorkflow}
            >
              New Workflow
            </button>
          ) : null}

          {selectedWorkflow ? (
            <button
              type="button"
              className={activeTab === 'details' ? 'active' : ''}
              onClick={() => setActiveTab('details')}
            >
              Current Details
            </button>
          ) : null}

          <button
            type="button"
            disabled={loading}
            onClick={() => void loadInitialData()}
          >
            Refresh
          </button>
        </div>
      </div>

      {activeTab === 'workflows' ? (
        <div className="drips-panel">
          <div className="drips-filter-row">
            <input
              value={workflowSearch}
              onChange={(event) =>
                setWorkflowSearch(event.target.value)
              }
              placeholder="Search workflows"
            />

            <span>
              {filteredWorkflows.length} workflow(s)
            </span>
          </div>

          <div className="drips-workflow-grid">
            {filteredWorkflows.map((workflow) => (
              <article
                className="drip-workflow-card"
                key={workflow.id}
              >
                <div className="drip-workflow-header">
                  <div>
                    <strong>{workflow.name}</strong>
                    <span>
                      {workflow.description || 'No description'}
                    </span>
                  </div>

                  <span
                    className={`drip-status ${getStatusClass(
                      workflow.status,
                    )}`}
                  >
                    {workflow.status}
                  </span>
                </div>

                <div className="drip-summary-grid">
                  <div>
                    <span>Steps</span>
                    <strong>{workflow.steps.length}</strong>
                  </div>
                  <div>
                    <span>Enrolments</span>
                    <strong>
                      {workflow._count?.enrollments || 0}
                    </strong>
                  </div>
                  <div>
                    <span>Timezone</span>
                    <strong>{workflow.timezone}</strong>
                  </div>
                  <div>
                    <span>Window</span>
                    <strong>
                      {workflow.sendingStartTime}–
                      {workflow.sendingEndTime}
                    </strong>
                  </div>
                </div>

                <div className="drip-card-actions">
                  <button
                    type="button"
                    onClick={() => void openWorkflow(workflow.id)}
                  >
                    View
                  </button>

                  {canEdit && workflow.status === 'DRAFT' ? (
                    <button
                      type="button"
                      onClick={() => editWorkflow(workflow)}
                    >
                      Edit
                    </button>
                  ) : null}

                  {canEdit &&
                  ['DRAFT', 'PAUSED'].includes(workflow.status) ? (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() =>
                        void runWorkflowAction(
                          workflow.id,
                          'activate',
                        )
                      }
                    >
                      {workflow.status === 'PAUSED'
                        ? 'Resume'
                        : 'Activate'}
                    </button>
                  ) : null}

                  {canEdit && workflow.status === 'ACTIVE' ? (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() =>
                        void runWorkflowAction(
                          workflow.id,
                          'pause',
                        )
                      }
                    >
                      Pause
                    </button>
                  ) : null}

                  {canEdit && workflow.status !== 'ARCHIVED' ? (
                    <button
                      type="button"
                      className="danger"
                      disabled={loading}
                      onClick={() =>
                        void runWorkflowAction(
                          workflow.id,
                          'archive',
                        )
                      }
                    >
                      Archive
                    </button>
                  ) : null}
                </div>
              </article>
            ))}

            {filteredWorkflows.length === 0 ? (
              <div className="drips-empty-state">
                <span>No drip workflows found.</span>
                {canEdit ? (
                  <button type="button" onClick={startNewWorkflow}>
                    Create Workflow
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {activeTab === 'builder' && canEdit ? (
        <form className="drips-panel" onSubmit={saveWorkflow}>
          <div className="drips-section-heading">
            <div>
              <h3>
                {editingWorkflowId
                  ? 'Edit Draft Workflow'
                  : 'Create Workflow'}
              </h3>
              <p>
                Only approved tenant templates can be selected.
              </p>
            </div>
          </div>

          <div className="drips-form-grid">
            <label>
              <span>Workflow name</span>
              <input
                value={builder.name}
                maxLength={120}
                onChange={(event) =>
                  setBuilder((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                required
              />
            </label>

            <div className="drips-fixed-field">
              <span>Timezone</span>
              <strong>{FIXED_DRIP_TIMEZONE}</strong>
            </div>

            <label>
              <span>Audience</span>
              <select
                value={builder.audienceType}
                onChange={(event) =>
                  setBuilder((current) => ({
                    ...current,
                    audienceType: event.target.value as
                      | 'ALL_OPTED_IN'
                      | 'CONTACT_TYPE',
                    targetContactTypeId:
                      event.target.value === 'CONTACT_TYPE'
                        ? current.targetContactTypeId
                        : '',
                  }))
                }
              >
                <option value="ALL_OPTED_IN">
                  All opted-in contacts
                </option>
                <option value="CONTACT_TYPE">
                  Selected contact type
                </option>
              </select>
            </label>

            {builder.audienceType === 'CONTACT_TYPE' ? (
              <label>
                <span>Contact type</span>
                <select
                  value={builder.targetContactTypeId}
                  onChange={(event) =>
                    setBuilder((current) => ({
                      ...current,
                      targetContactTypeId: event.target.value,
                    }))
                  }
                  required
                >
                  <option value="">Select contact type</option>
                  {contactTypes.map((contactType) => (
                    <option
                      value={contactType.id}
                      key={contactType.id}
                    >
                      {contactType.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label>
              <span>Sending start</span>
              <input
                type="time"
                value={builder.sendingStartTime}
                onChange={(event) =>
                  setBuilder((current) => ({
                    ...current,
                    sendingStartTime: event.target.value,
                  }))
                }
                required
              />
            </label>

            <label>
              <span>Sending end</span>
              <input
                type="time"
                value={builder.sendingEndTime}
                onChange={(event) =>
                  setBuilder((current) => ({
                    ...current,
                    sendingEndTime: event.target.value,
                  }))
                }
                required
              />
            </label>

            <label className="drips-full-width">
              <span>Description</span>
              <textarea
                value={builder.description}
                rows={3}
                maxLength={500}
                onChange={(event) =>
                  setBuilder((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <div className="drips-days">
            <strong>Allowed sending days</strong>
            <div>
              {dayOptions.map((day) => (
                <label key={day.value}>
                  <input
                    type="checkbox"
                    checked={builder.sendingDays.includes(day.value)}
                    onChange={() => toggleSendingDay(day.value)}
                  />
                  <span>{day.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="drips-option-grid">
            <label>
              <input
                type="checkbox"
                checked={builder.autoEnrollNewContacts}
                onChange={(event) =>
                  setBuilder((current) => ({
                    ...current,
                    autoEnrollNewContacts: event.target.checked,
                  }))
                }
              />
              <span>Auto-enrol new contacts</span>
            </label>

            <label>
              <input
                type="checkbox"
                checked={builder.autoEnrollInbound}
                onChange={(event) =>
                  setBuilder((current) => ({
                    ...current,
                    autoEnrollInbound: event.target.checked,
                  }))
                }
              />
              <span>Auto-enrol eligible inbound senders</span>
            </label>

            <label>
              <input
                type="checkbox"
                checked={builder.includeExistingContacts}
                onChange={(event) =>
                  setBuilder((current) => ({
                    ...current,
                    includeExistingContacts: event.target.checked,
                  }))
                }
              />
              <span>Enrol eligible existing contacts on first activation</span>
            </label>

            <label>
              <input
                type="checkbox"
                checked={builder.allowReentry}
                onChange={(event) =>
                  setBuilder((current) => ({
                    ...current,
                    allowReentry: event.target.checked,
                  }))
                }
              />
              <span>Allow workflow re-entry</span>
            </label>
          </div>

          {builder.allowReentry ? (
            <label className="drips-cooldown-field">
              <span>Re-entry cooldown in days</span>
              <input
                type="number"
                min={1}
                max={3650}
                value={builder.reentryCooldownDays}
                onChange={(event) =>
                  setBuilder((current) => ({
                    ...current,
                    reentryCooldownDays: Number(
                      event.target.value,
                    ),
                  }))
                }
                required
              />
            </label>
          ) : null}

          <div className="drips-step-list">
            <div className="drips-section-heading">
              <div>
                <h3>Workflow Steps</h3>
                <p>
                  Variable values must follow the template order:
                  header, body, then URL button.
                </p>
              </div>

              <button type="button" onClick={addStep}>
                Add Step
              </button>
            </div>

            {builder.steps.map((step, index) => {
              const selectedTemplate = approvedTemplates.find(
                (template) => template.id === step.templateId,
              )
              const requiredVariableCount =
                getTemplateVariableCount(selectedTemplate)
              const enteredVariableCount = parseVariableValues(
                step.variableValuesText,
              ).length
              const variableCountMatches =
                enteredVariableCount === requiredVariableCount

              return (
              <article className="drips-step-card" key={index}>
                <div className="drips-step-header">
                  <strong>Step {index + 1}</strong>

                  {builder.steps.length > 1 ? (
                    <button
                      type="button"
                      className="danger"
                      onClick={() => removeStep(index)}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>

                <div className="drips-form-grid">
                  <label>
                    <span>Step name</span>
                    <input
                      value={step.name}
                      maxLength={120}
                      onChange={(event) =>
                        updateStep(index, {
                          name: event.target.value,
                        })
                      }
                      required
                    />
                  </label>

                  <label>
                    <span>Approved template</span>
                    <select
                      value={step.templateId}
                      onChange={(event) =>
                        updateStep(index, {
                          templateId: event.target.value,
                        })
                      }
                      required
                    >
                      <option value="">Select template</option>
                      {approvedTemplates.map((template) => (
                        <option
                          value={template.id}
                          key={template.id}
                        >
                          {template.name} · {template.language} ·{' '}
                          {template.category}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span>Day offset</span>
                    <input
                      type="number"
                      min={0}
                      max={3650}
                      value={step.dayOffset}
                      onChange={(event) =>
                        updateStep(index, {
                          dayOffset: Number(event.target.value),
                        })
                      }
                      required
                    />
                  </label>

                  <label>
                    <span>Minute offset</span>
                    <input
                      type="number"
                      min={0}
                      max={1439}
                      value={step.minuteOffset}
                      onChange={(event) =>
                        updateStep(index, {
                          minuteOffset: Number(
                            event.target.value,
                          ),
                        })
                      }
                      required
                    />
                  </label>

                  <label className="drips-full-width">
                    <span>
                      Variable values — one value per line
                    </span>
                    {selectedTemplate ? (
                      <small
                        className={
                          variableCountMatches
                            ? 'drips-helper-text'
                            : 'drips-helper-text warning'
                        }
                      >
                        {enteredVariableCount}/{requiredVariableCount}{' '}
                        value(s) entered for this template.
                      </small>
                    ) : null}
                    <textarea
                      rows={4}
                      value={step.variableValuesText}
                      placeholder={'Customer Name\nOrder Number'}
                      onChange={(event) =>
                        updateStep(index, {
                          variableValuesText:
                            event.target.value,
                        })
                      }
                    />
                  </label>
                </div>
              </article>
              )
            })}
          </div>

          <div className="drips-submit-row">
            <button type="submit" disabled={loading}>
              {editingWorkflowId
                ? 'Save Draft Changes'
                : 'Create Draft Workflow'}
            </button>

            <button
              type="button"
              className="secondary"
              disabled={loading}
              onClick={() => setActiveTab('workflows')}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {activeTab === 'details' && selectedWorkflow ? (
        <div className="drips-details-layout">
          <section className="drips-panel">
            <div className="drip-workflow-header">
              <div>
                <h3>{selectedWorkflow.name}</h3>
                <span>
                  {selectedWorkflow.description || 'No description'}
                </span>
              </div>

              <span
                className={`drip-status ${getStatusClass(
                  selectedWorkflow.status,
                )}`}
              >
                {selectedWorkflow.status}
              </span>
            </div>

            <div className="drip-summary-grid">
              <div>
                <span>Audience</span>
                <strong>
                  {selectedWorkflow.audienceType === 'CONTACT_TYPE'
                    ? selectedWorkflow.targetContactType?.name ||
                      'Contact type'
                    : 'All opted-in'}
                </strong>
              </div>
              <div>
                <span>Timezone</span>
                <strong>{selectedWorkflow.timezone}</strong>
              </div>
              <div>
                <span>Sending window</span>
                <strong>
                  {selectedWorkflow.sendingStartTime}–
                  {selectedWorkflow.sendingEndTime}
                </strong>
              </div>
              <div>
                <span>Re-entry</span>
                <strong>
                  {selectedWorkflow.allowReentry
                    ? `${selectedWorkflow.reentryCooldownDays} day cooldown`
                    : 'Disabled'}
                </strong>
              </div>
            </div>

            <div className="drip-card-actions">
              {canEdit && selectedWorkflow.status === 'DRAFT' ? (
                <>
                  <button
                    type="button"
                    onClick={() => editWorkflow(selectedWorkflow)}
                  >
                    Edit Draft
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() =>
                      void runWorkflowAction(
                        selectedWorkflow.id,
                        'activate',
                      )
                    }
                  >
                    Activate
                  </button>
                </>
              ) : null}

              {canEdit && selectedWorkflow.status === 'ACTIVE' ? (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() =>
                    void runWorkflowAction(
                      selectedWorkflow.id,
                      'pause',
                    )
                  }
                >
                  Pause
                </button>
              ) : null}

              {canEdit && selectedWorkflow.status === 'PAUSED' ? (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() =>
                    void runWorkflowAction(
                      selectedWorkflow.id,
                      'activate',
                    )
                  }
                >
                  Resume
                </button>
              ) : null}

              {canEdit &&
              selectedWorkflow.status !== 'ARCHIVED' ? (
                <button
                  type="button"
                  className="danger"
                  disabled={loading}
                  onClick={() =>
                    void runWorkflowAction(
                      selectedWorkflow.id,
                      'archive',
                    )
                  }
                >
                  Archive
                </button>
              ) : null}
            </div>
          </section>

          {selectedWorkflowSummary ? (
            <section className="drips-panel">
              <div className="drips-section-heading">
                <div>
                  <h3>Workflow Health</h3>
                  <p>
                    Live delivery and queue checks for this workflow.
                  </p>
                </div>
              </div>

              <div className="drip-summary-grid">
                <div>
                  <span>Active enrolments</span>
                  <strong>
                    {selectedWorkflowSummary.enrollmentStatuses.ACTIVE ||
                      0}
                  </strong>
                </div>
                <div>
                  <span>Completed</span>
                  <strong>
                    {selectedWorkflowSummary.enrollmentStatuses
                      .COMPLETED || 0}
                  </strong>
                </div>
                <div>
                  <span>Failed messages</span>
                  <strong>
                    {selectedWorkflowSummary.messageStatuses.FAILED ||
                      0}
                  </strong>
                </div>
                <div>
                  <span>Due now</span>
                  <strong>
                    {selectedWorkflowSummary.queueHealth.pendingDue}
                  </strong>
                </div>
              </div>

              {selectedWorkflowSummary.queueHealth.processingStuck > 0 ? (
                <div className="drips-summary-alert">
                  {
                    selectedWorkflowSummary.queueHealth.processingStuck
                  }{' '}
                  processing message(s) need worker recovery.
                </div>
              ) : null}

              {selectedWorkflowSummary.recentFailures.length > 0 ? (
                <div className="drips-message-list">
                  {selectedWorkflowSummary.recentFailures.map(
                    (failure) => (
                      <div
                        className="drips-message-row"
                        key={failure.id}
                      >
                        <div>
                          <strong>{failure.step.name}</strong>
                          <span>{failure.contact.name}</span>
                          <small className="drips-error-text">
                            {failure.errorMessage ||
                              'Message failed'}
                          </small>
                        </div>
                        <div className="drips-message-action">
                          <span className="drip-status failed">
                            FAILED
                          </span>
                          <span>
                            Retry count {failure.retryCount}
                          </span>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="drips-panel">
            <div className="drips-section-heading">
              <div>
                <h3>Steps</h3>
                <p>
                  Messages are adjusted to valid sending days and hours.
                </p>
              </div>
            </div>

            <div className="drips-step-list">
              {selectedWorkflow.steps.map((step) => (
                <article className="drips-step-card" key={step.id}>
                  <div className="drips-step-header">
                    <strong>
                      {step.position + 1}. {step.name}
                    </strong>
                    <span className="drip-status approved">
                      {step.template.status}
                    </span>
                  </div>

                  <p>
                    Template: <strong>{step.template.name}</strong>
                  </p>
                  <p>
                    Schedule: day {step.dayOffset}, minute{' '}
                    {step.minuteOffset}
                  </p>
                </article>
              ))}
            </div>
          </section>

          {canEnroll && selectedWorkflow.status === 'ACTIVE' ? (
            <section className="drips-panel">
              <div className="drips-section-heading">
                <div>
                  <h3>Manual Enrolment</h3>
                  <p>
                    Only opted-in contacts with consent proof are shown.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={
                    loading || selectedContactIds.length === 0
                  }
                  onClick={() => void enrollSelectedContacts()}
                >
                  Enrol Selected
                </button>
              </div>

              <div className="drips-contact-search">
                <input
                  value={contactSearch}
                  placeholder="Search contact name, phone, or email"
                  onChange={(event) =>
                    setContactSearch(event.target.value)
                  }
                />
                <button
                  type="button"
                  className="secondary"
                  disabled={loading}
                  onClick={() => void loadContacts(contactSearch)}
                >
                  Search Contacts
                </button>
              </div>

              <div className="drips-contact-list">
                {eligibleContacts.map((contact) => (
                  <label key={contact.id}>
                    <input
                      type="checkbox"
                      checked={selectedContactIds.includes(contact.id)}
                      onChange={() => toggleContact(contact.id)}
                    />
                    <span>
                      <strong>{contact.name}</strong>
                      <small>{contact.phone}</small>
                    </span>
                  </label>
                ))}

                {!contactsLoaded ? (
                  <div className="drips-empty-state">
                    Search contacts before manual enrolment.
                  </div>
                ) : eligibleContacts.length === 0 ? (
                  <div className="drips-empty-state">
                    No eligible contacts are available.
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className="drips-panel">
            <div className="drips-section-heading">
              <div>
                <h3>Enrolments and Delivery</h3>
                <p>
                  Latest 200 enrolments and 50 messages per enrolment.
                </p>
              </div>
            </div>

            <div className="drips-enrollment-list">
              {(selectedWorkflow.enrollments || []).map(
                (enrollment) => (
                  <article
                    className="drips-enrollment-card"
                    key={enrollment.id}
                  >
                    <div className="drips-enrollment-header">
                      <div>
                        <strong>{enrollment.contact.name}</strong>
                        <span>{enrollment.contact.phone}</span>
                      </div>

                      <span
                        className={`drip-status ${getStatusClass(
                          enrollment.status,
                        )}`}
                      >
                        {enrollment.status}
                      </span>
                    </div>

                    <div className="drip-summary-grid">
                      <div>
                        <span>Source</span>
                        <strong>{enrollment.source}</strong>
                      </div>
                      <div>
                        <span>Cycle</span>
                        <strong>{enrollment.enrollmentCycle}</strong>
                      </div>
                      <div>
                        <span>Enrolled</span>
                        <strong>
                          {formatDate(enrollment.enrolledAt)}
                        </strong>
                      </div>
                      <div>
                        <span>Next run</span>
                        <strong>
                          {formatDate(enrollment.nextRunAt)}
                        </strong>
                      </div>
                    </div>

                    {canEnroll &&
                    ['ACTIVE', 'WAITING', 'PAUSED'].includes(
                      enrollment.status,
                    ) ? (
                      <button
                        type="button"
                        className="danger"
                        disabled={loading}
                        onClick={() =>
                          void stopEnrollment(enrollment.id)
                        }
                      >
                        Stop Enrolment
                      </button>
                    ) : null}

                    <div className="drips-message-list">
                      {enrollment.messages.map((message) => (
                        <div
                          className="drips-message-row"
                          key={message.id}
                        >
                          <div>
                            <strong>{message.step.name}</strong>
                            <span>
                              Scheduled:{' '}
                              {formatDate(message.scheduledFor)}
                            </span>
                            <span>
                              Sent: {formatDate(message.sentAt)}
                            </span>
                            <span>
                              Delivered:{' '}
                              {formatDate(message.deliveredAt)}
                            </span>
                            <span>
                              Read: {formatDate(message.readAt)}
                            </span>
                            {message.errorMessage ? (
                              <small className="drips-error-text">
                                {message.errorMessage}
                              </small>
                            ) : null}
                          </div>

                          <div className="drips-message-action">
                            <span
                              className={`drip-status ${getStatusClass(
                                message.status,
                              )}`}
                            >
                              {message.status}
                            </span>

                            {canEdit &&
                            message.status === 'FAILED' ? (
                              <button
                                type="button"
                                disabled={loading}
                                onClick={() =>
                                  void retryMessage(message.id)
                                }
                              >
                                Retry
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ))}

                      {enrollment.messages.length === 0 ? (
                        <div className="drips-empty-state">
                          No message records.
                        </div>
                      ) : null}
                    </div>
                  </article>
                ),
              )}

              {(selectedWorkflow.enrollments || []).length === 0 ? (
                <div className="drips-empty-state">
                  No contacts have entered this workflow.
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  )
}
