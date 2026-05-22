import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import {
  BarChart3,
  Activity,
  Boxes,
  Building2,
  ClipboardList,
  LayoutDashboard,
  ShoppingCart,
  Sparkles,
  Bell,
  Bot,
  CheckCircle2,
  Clock3,
  FileText,
  Inbox,
  LogOut,
  MessageCircle,
  PackageCheck,
  Pencil,
  RefreshCw,
  Search,
  Send,
  Settings,
  Shield,
  Trash2,
  UserPlus,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import './App.css'

const isProduction = import.meta.env.PROD
const configuredApiUrl = import.meta.env.VITE_API_URL || ''
const apiBaseUrl = configuredApiUrl.replace(/\/$/, '')
const api = axios.create({ baseURL: apiBaseUrl, withCredentials: true })

function formatApiIssue(error) {
  const status = error.response?.status
  const method = String(error.config?.method || 'GET').toUpperCase()
  const requestUrl = error.config?.url || 'unknown endpoint'
  const backendMessage = error.response?.data?.error || error.response?.data?.message
  const message = backendMessage || error.message || 'Unknown frontend/API issue'

  return status
    ? `${method} ${requestUrl} failed (${status}): ${message}`
    : `${method} ${requestUrl} failed: ${message}`
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    const requestUrl = error.config?.url || ''

    if (!error.config?.silentError) {
      window.dispatchEvent(new CustomEvent('bos-api-error', {
        detail: { message: formatApiIssue(error) },
      }))
    }

    if (status === 401 && !requestUrl.includes('/api/auth/login')) {
      window.dispatchEvent(new Event('bos-auth-expired'))
    }

    return Promise.reject(error)
  },
)

function mediaSrc(url) {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${apiBaseUrl}${url}`
}

function ProtectedImage({ url, alt }) {
  const [src, setSrc] = useState('')

  useEffect(() => {
    if (!url) return undefined

    if (url.startsWith('http')) {
      return undefined
    }

    let objectUrl = ''
    let cancelled = false

    api.get(url, { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(res.data)
        setSrc(objectUrl)
      })
      .catch(() => setSrc(''))

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [url])

  const displaySrc = url?.startsWith('http') ? url : src

  if (!displaySrc) return <span>Loading media...</span>

  return <img src={displaySrc} alt={alt || 'WhatsApp media'} />
}

function ProtectedMediaLink({ url, children, className }) {
  async function openMedia(event) {
    event.preventDefault()

    if (!url) return

    if (url.startsWith('http')) {
      window.open(url, '_blank', 'noopener,noreferrer')
      return
    }

    const res = await api.get(url, { responseType: 'blob' })
    const objectUrl = URL.createObjectURL(res.data)
    window.open(objectUrl, '_blank', 'noopener,noreferrer')
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000)
  }

  return (
    <a className={className} href={mediaSrc(url)} onClick={openMedia}>
      {children}
    </a>
  )
}

const defaultAppSettings = {
  appName: 'WhatsApp Sales CRM',
  companyName: 'Your Company',
  industry: 'General Sales',
  primaryColor: '#0b7f69',
  currency: 'INR',
  labels: ['New Enquiry', 'Quotation Required', 'Dispatch Query', 'Payment Follow-up', 'Complaint', 'Review Required'],
  stages: ['new', 'qualified', 'quoted', 'won', 'lost'],
  quotationPrefix: 'QT-WA',
  orderPrefix: 'SO-WA',
  botEnabled: true,
  botGreeting: 'Hello, please share the product, size, and quantity you need.',
  handoffKeywords: ['urgent', 'complaint', 'stuck', 'salesperson'],
  inventoryFields: ['sku', 'name', 'grade', 'size', 'shape', 'stock_qty', 'price'],

  quoteApprovalEnabled: true,
  quoteApprovalManagerName: '',
  quoteApprovalManagerPhone: '',
  quoteApprovalTemplateName: 'quote_manager_approval_request',
  quoteApprovalTemplateLanguage: 'en',
  customerQuoteTemplateName: 'quote_customer_approval_request',
  customerQuoteTemplateLanguage: 'en',
  orderAcknowledgementTemplateName: 'order_acknowledgement',
  orderAcknowledgementTemplateLanguage: 'en',
  orderAcknowledgementTemplateName: 'order_acknowledgement',
  orderAcknowledgementTemplateLanguage: 'en',
}

function toCsv(value) {
  return Array.isArray(value) ? value.join(', ') : value || ''
}

function fromCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseCsv(text) {
  const rows = []
  let row = []
  let value = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]
    if (char === '"' && quoted && next === '"') {
      value += '"'
      index += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(value)
      value = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1
      row.push(value)
      if (row.some((cell) => String(cell).trim())) rows.push(row)
      row = []
      value = ''
    } else {
      value += char
    }
  }
  row.push(value)
  if (row.some((cell) => String(cell).trim())) rows.push(row)
  const headers = rows.shift()?.map((item) => item.trim()) || []
  return rows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] || ''])))
}

function csvEscape(value) {
  const text = String(value ?? '')
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function downloadCsv(filename, headers, sample) {
  const csv = [headers, sample].map((row) => row.map(csvEscape).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

function formatMoney(value) {
  return `Rs ${Number(value || 0).toLocaleString('en-IN')}`
}

function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'C'
}

function clearStoredSession() {
  delete api.defaults.headers.common.Authorization
}

function Login({ onLogin, appSettings }) {
const [form, setForm] = useState({ email: '', password: '' })
const [error, setError] = useState('')
const [submitting, setSubmitting] = useState(false)

async function submit(event) {
  event.preventDefault()
  if (submitting) return

  setError('')
  setSubmitting(true)

  try {
    const res = await api.post('/api/auth/login', {
      email: form.email.trim().toLowerCase(),
      password: form.password,
    })

    onLogin(res.data.user)
  } catch (err) {
    setError(err.response?.data?.error || 'Login failed')
  } finally {
    setSubmitting(false)
  }
}

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <MessageCircle size={34} />
          <div>
            <h1>{appSettings.appName}</h1>
            <span>{appSettings.companyName} - {appSettings.industry}</span>
          </div>
        </div>
        <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" />
        <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Password" />
        {error && <p className="error-text">{error}</p>}
        <button type="submit" disabled={submitting}>
  {submitting ? 'Logging in...' : 'Login'}
</button>
        <small>Use your assigned CRM credentials.</small>
      </form>
    </main>
  )
}

function WhatsAppConnectGate({ onboarding, connecting, onComplete, onLogout }) {
  const signupInfoRef = useRef({})
  const metaAppId = onboarding?.metaAppId || import.meta.env.VITE_META_APP_ID || ''
  const configId = onboarding?.embeddedSignupConfigId || import.meta.env.VITE_META_EMBEDDED_SIGNUP_CONFIG_ID || ''
  const hasRealMetaAppId = Boolean(metaAppId && !metaAppId.startsWith('your_') && !metaAppId.startsWith('your-'))
  const hasRealConfigId = Boolean(configId && !configId.startsWith('your_') && !configId.startsWith('your-'))
  const setupMessage = !hasRealMetaAppId
    ? 'Platform Meta setup pending hai. Platform owner ko Meta App ID configure karna hoga; client ko backend access ki zarurat nahi hai.'
    : !hasRealConfigId
      ? 'Platform Meta setup pending hai. Platform owner ko Embedded Signup Configuration ID configure karna hoga; client ko backend access ki zarurat nahi hai.'
      : ''

  useEffect(() => {
    function handleEmbeddedSignupMessage(event) {
      let host = ''

      try {
        host = new URL(event.origin).hostname
      } catch {
        return
      }

      if (!host.endsWith('facebook.com')) return

      let payload = event.data

      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload)
        } catch {
          return
        }
      }

      if (payload?.type !== 'WA_EMBEDDED_SIGNUP') return

      if (payload.event === 'FINISH' || payload.event === 'FINISH_ONLY_WABA') {
        signupInfoRef.current = {
          phoneNumberId: payload.data?.phone_number_id || payload.data?.phoneNumberId || '',
          wabaId: payload.data?.waba_id || payload.data?.wabaId || '',
          businessId: payload.data?.business_id || payload.data?.businessId || '',
        }
      }
    }

    window.addEventListener('message', handleEmbeddedSignupMessage)

    return () => window.removeEventListener('message', handleEmbeddedSignupMessage)
  }, [])

  useEffect(() => {
    if (!hasRealMetaAppId) return undefined
    if (document.getElementById('facebook-jssdk')) return undefined

    window.fbAsyncInit = function fbAsyncInit() {
      window.FB.init({
        appId: metaAppId,
        autoLogAppEvents: true,
        xfbml: true,
        version: 'v24.0',
      })
    }

    const script = document.createElement('script')
    script.id = 'facebook-jssdk'
    script.async = true
    script.defer = true
    script.crossOrigin = 'anonymous'
    script.src = 'https://connect.facebook.net/en_US/sdk.js'
    document.body.appendChild(script)

    return undefined
  }, [hasRealMetaAppId, metaAppId])

  function startSignup() {
    if (setupMessage) {
      alert(setupMessage)
      return
    }

    if (!window.FB) {
      alert('Meta SDK is still loading. Please try again.')
      return
    }

    signupInfoRef.current = {}

    window.FB.login((response) => {
      const code = response?.authResponse?.code
      const phoneNumberId = signupInfoRef.current.phoneNumberId || ''
      const wabaId = signupInfoRef.current.wabaId || ''

      if (!code) {
        alert('Meta signup was cancelled or authorization failed.')
        return
      }

      if (!phoneNumberId || !wabaId) {
        alert('Meta signup completed but phone number ID / WABA ID was not received. Please check Embedded Signup configuration.')
        return
      }

      onComplete({
        code,
        phoneNumberId,
        wabaId,
      })
    }, {
      config_id: configId,
      response_type: 'code',
      override_default_response_type: true,
      extras: {
        setup: {},
      },
    })
  }

  return (
    <main className="connect-gate">
      <section className="connect-card">
        <div className="login-brand">
          <MessageCircle size={38} />
          <div>
            <h1>Connect Meta WhatsApp</h1>
            <span>{onboarding?.tenant?.name || 'Your company'}</span>
          </div>
        </div>

        <p>
          Dashboard unlock karne ke liye apna official Meta WhatsApp Business account connect kijiye.
          Meta login popup me credentials Meta ke paas hi rahenge. Backend sirf secure token exchange karke encrypted storage karega.
        </p>

        <div className="flow-list">
          <p><b>1</b><span>Meta Business login / permission</span></p>
          <p><b>2</b><span>Business portfolio, WABA aur phone number select/create</span></p>
          <p><b>3</b><span>Backend token encrypt karke tenant ke saath save karega</span></p>
          <p><b>4</b><span>Connection complete hone ke baad CRM dashboard unlock hoga</span></p>
        </div>

        {setupMessage && <div className="connect-setup-warning">{setupMessage}</div>}

        <button type="button" onClick={startSignup} disabled={connecting}>
          {connecting ? 'Connecting...' : 'Connect Meta WhatsApp'}
        </button>

        <button className="connect-logout" type="button" onClick={onLogout}>
          Logout
        </button>

        <small>
          Policy safety: marketing sirf opted-in customers ko approved templates se send hoga.
          Free-form replies sirf 24-hour customer service window ke andar allowed hain.
        </small>
      </section>
    </main>
  )
}

function App() {
  const [user, setUser] = useState(null)
const [authChecking, setAuthChecking] = useState(true)
  const [activePage, setActivePage] = useState('inbox')
  const [status, setStatus] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [users, setUsers] = useState([])
  const [conversations, setConversations] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [messages, setMessages] = useState([])
  const [templates, setTemplates] = useState([])
  const [managedTemplates, setManagedTemplates] = useState([])
  const emptyTemplate = { name: '', language: 'en', body: '', active: true }
  const [templateForm, setTemplateForm] = useState(emptyTemplate)
  const [editingTemplateId, setEditingTemplateId] = useState('')
  const [drafts, setDrafts] = useState([])
  const [products, setProducts] = useState([])
  const [quotations, setQuotations] = useState([])
  const [orders, setOrders] = useState([])
  const [whatsappConfig, setWhatsappConfig] = useState(null)
  const [whatsappOnboarding, setWhatsappOnboarding] = useState(null)
  const [connectingWhatsApp, setConnectingWhatsApp] = useState(false)
  const [assignmentHistory, setAssignmentHistory] = useState([])
  const [timeline, setTimeline] = useState([])
  const [auditEvents, setAuditEvents] = useState([])
  const [filter, setFilter] = useState('all')
  const [windowFilter, setWindowFilter] = useState('all')
  const [stageFilter, setStageFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState('')
  const [templateName, setTemplateName] = useState('')
  const [sendError, setSendError] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [leadForm, setLeadForm] = useState({ name: '', company: '', stage: 'new', notes: '', label: 'New Enquiry', assigned_to: '', assignment_reason: '' })
  const emptyUser = { name: '', email: '', password: '', role: 'sales' }
  const [newUser, setNewUser] = useState(emptyUser)
  const [editingUserId, setEditingUserId] = useState('')
  const [simulator, setSimulator] = useState({ phone: '', name: '', message: 'Need quotation for round bar grade EN8 size 20mm qty 25 pcs' })
  const [testMessage, setTestMessage] = useState({ to: '', text: 'BOS WhatsApp CRM test message' })
  const [testResult, setTestResult] = useState('')
  const [quoteRates, setQuoteRates] = useState({})
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [profileOpen, setProfileOpen] = useState(false)
  const [appSettings, setAppSettings] = useState(defaultAppSettings)
  const [customForm, setCustomForm] = useState({
    ...defaultAppSettings,
    labelsText: toCsv(defaultAppSettings.labels),
    stagesText: toCsv(defaultAppSettings.stages),
    handoffKeywordsText: toCsv(defaultAppSettings.handoffKeywords),
    inventoryFieldsText: toCsv(defaultAppSettings.inventoryFields),
  })
  const [settingsSaved, setSettingsSaved] = useState('')
  const [notice, setNotice] = useState(null)
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const emptyProduct = { sku: '', name: '', category: '', grade: '', size: '', shape: '', unit: 'pcs', price: '', stock_qty: '', active: true }
  const [productForm, setProductForm] = useState(emptyProduct)
  const [editingProductId, setEditingProductId] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [inventoryColumnsText, setInventoryColumnsText] = useState(toCsv(defaultAppSettings.inventoryFields))
  const [importResult, setImportResult] = useState('')
  const emptyTenantForm = {
    name: '',
    slug: '',
    industry: 'General',
    plan: 'starter',
    status: 'active',
    businessPhone: '',
    businessEmail: '',
    logoUrl: '',
    metaBusinessId: '',
  }
  const emptyClientAdminForm = { tenantId: '', name: '', email: '', password: '' }
  const [platformTenants, setPlatformTenants] = useState([])
  const [platformStatus, setPlatformStatus] = useState(null)
  const [selectedPlatformTenantId, setSelectedPlatformTenantId] = useState('')
  const [tenantForm, setTenantForm] = useState(emptyTenantForm)
  const [clientAdminForm, setClientAdminForm] = useState(emptyClientAdminForm)
  const [platformLoading, setPlatformLoading] = useState(false)
  const [platformError, setPlatformError] = useState('')

  const isSuperAdminUser = user?.role === 'super_admin'
  const canMonitor = !isSuperAdminUser && (user?.role === 'admin' || user?.role === 'manager')
  const selected = useMemo(() => conversations.find((item) => item.id === selectedId) || conversations[0], [conversations, selectedId])
  const labels = useMemo(() => ['all', ...(appSettings.labels || defaultAppSettings.labels)], [appSettings.labels])
  const stages = useMemo(() => appSettings.stages || defaultAppSettings.stages, [appSettings.stages])

  const pageItems = useMemo(() => {
    if (isSuperAdminUser) {
      return [
        { id: 'platformTenants', label: 'Clients', icon: Building2 },
        { id: 'platformStatus', label: 'Status', icon: Activity },
      ]
    }

    const common = [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'inbox', label: 'Inbox', icon: Inbox },
      { id: 'new', label: 'Enquiries', icon: Bell },
      { id: 'sales', label: 'Pipeline', icon: Activity },
      { id: 'inventory', label: 'Inventory', icon: Boxes },
      { id: 'bot', label: 'Automation', icon: Sparkles },
      { id: 'quotes', label: 'Quotes', icon: ClipboardList },
      { id: 'orders', label: 'Orders', icon: ShoppingCart },
      { id: 'activeOrders', label: 'Active', icon: Clock3 },
    ]
    if (canMonitor) common.push({ id: 'settings', label: 'Settings', icon: Settings })
    if (canMonitor) common.push({ id: 'audit', label: 'Audit', icon: Shield })
    if (user?.role === 'admin') common.push({ id: 'users', label: 'Users', icon: Users })
    return common
  }, [canMonitor, isSuperAdminUser, user?.role])

 useEffect(() => {
  api.get('/api/me', { silentError: true })
    .then((res) => {
      setUser(res.data)
    })
    .catch(() => {
      clearStoredSession()
      setUser(null)
    })
    .finally(() => {
      setAuthChecking(false)
    })
}, [])

  useEffect(() => {
    api.get('/api/public/app-settings')
      .then((res) => setAppSettings({ ...defaultAppSettings, ...res.data }))
      .catch(() => {})
  }, [])

  useEffect(() => {
    document.documentElement.style.setProperty('--green', appSettings.primaryColor || defaultAppSettings.primaryColor)
    document.title = appSettings.appName || defaultAppSettings.appName
  }, [appSettings])

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60000)
    return () => window.clearInterval(timer)
  }, [])

  function notify(text, type = 'success') {
    setNotice({ text, type })
    window.setTimeout(() => setNotice(null), 3200)
  }

  async function loadPlatformTenants(options = {}) {
    if (!user?.id) return
    if (!options.silent) setPlatformLoading(true)
    setPlatformError('')

    try {
      const res = await api.get('/api/platform/tenants')
      setPlatformTenants(res.data)

      const firstClientTenant = res.data.find((tenant) => tenant.slug !== 'platform')

      if (!selectedPlatformTenantId && firstClientTenant) {
        setSelectedPlatformTenantId(firstClientTenant.id)
      }
    } catch (err) {
      setPlatformError(apiErrorMessage(err, 'Unable to load client companies'))
    } finally {
      if (!options.silent) setPlatformLoading(false)
    }
  }

  async function loadPlatformTenantStatus(tenantId = selectedPlatformTenantId) {
    if (!tenantId) {
      setPlatformStatus(null)
      return
    }

    setPlatformLoading(true)
    setPlatformError('')

    try {
      const res = await api.get(`/api/platform/tenants/${tenantId}/status`)
      setPlatformStatus(res.data)
    } catch (err) {
      setPlatformError(apiErrorMessage(err, 'Unable to load client status'))
    } finally {
      setPlatformLoading(false)
    }
  }

  async function createPlatformTenant(event) {
    event.preventDefault()

    try {
      const res = await api.post('/api/platform/tenants', tenantForm)
      notify('Client company created')
      setTenantForm(emptyTenantForm)
      setSelectedPlatformTenantId(res.data.id)
      setClientAdminForm({ ...emptyClientAdminForm, tenantId: res.data.id })
      await loadPlatformTenants()
      await loadPlatformTenantStatus(res.data.id)
      setActivePage('platformStatus')
    } catch (err) {
      notify(apiErrorMessage(err, 'Client company create failed'), 'error')
    }
  }

  async function createPlatformClientAdmin(event) {
    event.preventDefault()

    const tenantId = clientAdminForm.tenantId || selectedPlatformTenantId

    if (!tenantId) {
      notify('Select a client company first', 'error')
      return
    }

    try {
      await api.post(`/api/platform/tenants/${tenantId}/admin`, {
        name: clientAdminForm.name,
        email: clientAdminForm.email,
        password: clientAdminForm.password,
      })
      notify('Client admin created')
      setClientAdminForm({ ...emptyClientAdminForm, tenantId })
      await loadPlatformTenants()
      await loadPlatformTenantStatus(tenantId)
    } catch (err) {
      notify(apiErrorMessage(err, 'Client admin create failed'), 'error')
    }
  }

  function openPlatformStatus(tenantId) {
    setSelectedPlatformTenantId(tenantId)
    setClientAdminForm((current) => ({ ...current, tenantId }))
    setActivePage('platformStatus')
    loadPlatformTenantStatus(tenantId)
  }

  useEffect(() => {
    function showIssueToast(text) {
      setNotice({ text, type: 'error' })
      window.setTimeout(() => {
        setNotice((current) => (current?.text === text ? null : current))
      }, 8000)
    }

    function showApiIssue(event) {
      showIssueToast(event.detail?.message || 'Frontend/API issue detected')
    }

    function showFrontendIssue(event) {
      const location = event.filename ? ` (${event.filename}:${event.lineno || 0}:${event.colno || 0})` : ''
      showIssueToast(`Frontend error: ${event.message || 'Unknown browser error'}${location}`)
    }

    function showPromiseIssue(event) {
      const reason = event.reason
      const text = reason?.response || reason?.config
        ? formatApiIssue(reason)
        : reason?.message || String(reason || 'Unhandled promise rejection')
      showIssueToast(`Frontend promise error: ${text}`)
    }

    window.addEventListener('bos-api-error', showApiIssue)
    window.addEventListener('error', showFrontendIssue)
    window.addEventListener('unhandledrejection', showPromiseIssue)

    return () => {
      window.removeEventListener('bos-api-error', showApiIssue)
      window.removeEventListener('error', showFrontendIssue)
      window.removeEventListener('unhandledrejection', showPromiseIssue)
    }
  }, [])

  function apiErrorMessage(err, fallback) {
    return err.response?.data?.error || err.message || fallback
  }

  async function loadAll(overrides = {}) {
    if (!user?.id) return
    if (isSuperAdminUser) return
    const requestFilter = overrides.filter ?? filter
    const requestWindowFilter = overrides.windowFilter ?? windowFilter
    const requestSearch = overrides.search ?? search
    const requestProductSearch = overrides.productSearch ?? productSearch
    setLoading(true)
    setLoadError('')
    try {
  const calls = [
        api.get('/api/whatsapp/onboarding').catch(() => ({
  data: {
    connected: false,
    connectionMode: 'api_failed',
    tenant: {
      onboardingStatus: 'pending',
    },
  },
})),
        api.get('/api/settings/status'),
        api.get('/api/dashboard'),
        api.get('/api/conversations', { params: { label: requestFilter, q: requestSearch, window: requestWindowFilter } }),
        api.get('/api/templates'),
        api.get('/api/enquiry-drafts'),
        api.get('/api/products', { params: { q: requestProductSearch } }),
        api.get('/api/quotations'),
        api.get('/api/orders'),
        api.get('/api/app-settings').catch(() => ({ data: defaultAppSettings })),
      ]
      if (canMonitor) {
        calls.push(api.get('/api/users').catch(() => ({ data: [] })))
        calls.push(api.get('/api/whatsapp/config', { silentError: true }).catch(() => ({ data: null })))
        calls.push(api.get('/api/audit-events').catch(() => ({ data: [] })))
        calls.push(api.get('/api/templates/manage').catch(() => ({ data: [] })))
      }

const [
        onboardingRes,
        statusRes,
        dashRes,
        convoRes,
        templateRes,
        draftRes,
        productRes,
        quoteRes,
        orderRes,
        appSettingsRes,
        usersRes,
        whatsappConfigRes,
        auditRes,
        manageTemplateRes,
      ] = await Promise.all(calls)

      if (onboardingRes?.data) setWhatsappOnboarding(onboardingRes.data)
      setStatus(statusRes.data)
      setDashboard(dashRes.data)
      setConversations(convoRes.data)

      // Composer should use only active templates.
      setTemplates(templateRes.data)

      // Settings page can use manageTemplateRes later if we separate state.

      setDrafts(draftRes.data)
      setProducts(productRes.data)
      setQuotations(quoteRes.data)
      setOrders(orderRes.data)
      const nextSettings = { ...defaultAppSettings, ...appSettingsRes.data }
      setAppSettings(nextSettings)
      setCustomForm({
        ...nextSettings,
        labelsText: toCsv(nextSettings.labels),
        stagesText: toCsv(nextSettings.stages),
        handoffKeywordsText: toCsv(nextSettings.handoffKeywords),
        inventoryFieldsText: toCsv(nextSettings.inventoryFields),
      })
      setInventoryColumnsText(toCsv(nextSettings.inventoryFields))
      if (usersRes) setUsers(usersRes.data)
      if (whatsappConfigRes) setWhatsappConfig(whatsappConfigRes.data)
      if (auditRes) setAuditEvents(auditRes.data)
      if (manageTemplateRes) setManagedTemplates(manageTemplateRes.data)
      if (!selectedId && convoRes.data[0]) setSelectedId(convoRes.data[0].id)
    } catch (err) {
      const message = err.response?.data?.error || err.message || 'Unable to load CRM data'
      setLoadError(message)
      if (err.response?.status === 401) {
        clearStoredSession()
        setUser(null)
      }
    } finally {
      setLoading(false)
    }
  }

  async function loadMessages(contactId, markRead = false) {
    if (!contactId) return
    if (markRead) await api.post(`/api/conversations/${contactId}/read`)
    const res = await api.get(`/api/conversations/${contactId}/messages`)
    setMessages(res.data)
  }

  useEffect(() => {
    // Data fetch is intentionally triggered by auth/filter changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, filter, windowFilter])

  useEffect(() => {
    if (!user?.id || !isSuperAdminUser) return

    if (!['platformTenants', 'platformStatus'].includes(activePage)) {
      setActivePage('platformTenants')
    }

    loadPlatformTenants()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isSuperAdminUser])

  useEffect(() => {
    if (isSuperAdminUser) return
    if (!selected?.id) return
    // Selection drives the editable profile form and read receipt state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSendError('')
    loadMessages(selected.id, true).then(() => loadAll())
    if (canMonitor) api.get(`/api/contacts/${selected.id}/assignment-history`).then((res) => setAssignmentHistory(res.data))
    api.get(`/api/contacts/${selected.id}/timeline`).then((res) => setTimeline(res.data)).catch(() => setTimeline([]))
    setLeadForm({
      name: selected.name || '',
      company: selected.company || '',
      stage: selected.stage || 'new',
      notes: selected.notes || '',
      label: selected.label || 'New Enquiry',
      assigned_to: selected.assigned_to || '',
      assignment_reason: '',
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id])

function logout() {
  api.post('/api/auth/logout', {}, { silentError: true }).catch(() => {})
  clearStoredSession()
  setUser(null)
  setSelectedId(null)
  setMessages([])
  setConversations([])
  setDashboard(null)
  setDraft('')
  setTemplateName('')
  setSendError('')
  setLoadError('')
  setPlatformTenants([])
  setPlatformStatus(null)
  setSelectedPlatformTenantId('')
  setPlatformError('')
}

useEffect(() => {
  window.addEventListener('bos-auth-expired', logout)
  return () => window.removeEventListener('bos-auth-expired', logout)
}, [])

useEffect(() => {
  if (!user?.id) return undefined
  if (isSuperAdminUser) return undefined

  const interval = window.setInterval(() => {
    loadAll({ filter, windowFilter, search })

    if (selectedId) {
      loadMessages(selectedId)
    }
  }, 10000)

  return () => window.clearInterval(interval)
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [user?.id, selectedId, filter, windowFilter, search])

if (authChecking) {
  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <MessageCircle size={34} />
          <div>
            <h1>{appSettings.appName}</h1>
            <span>Checking secure session...</span>
          </div>
        </div>
      </div>
    </main>
  )
}

async function completeEmbeddedSignup({ code, phoneNumberId, wabaId }) {
  setConnectingWhatsApp(true)

  try {
    await api.post('/api/whatsapp/embedded-signup/complete', {
      code,
      phoneNumberId,
      wabaId,
    })

    notify('Meta WhatsApp connected successfully')
    await loadAll()
  } catch (err) {
    notify(err.response?.data?.error || err.message || 'Meta WhatsApp connection failed', 'error')
  } finally {
    setConnectingWhatsApp(false)
  }
}

if (!user) return <Login onLogin={setUser} appSettings={appSettings} />

if (
  user &&
  !isSuperAdminUser &&
  (!whatsappOnboarding || !whatsappOnboarding.connected)
) {
  return (
    <WhatsAppConnectGate
      onboarding={whatsappOnboarding}
      connecting={connectingWhatsApp}
      onComplete={completeEmbeddedSignup}
      onLogout={logout}
    />
  )
}

function showPage(page, pageFilter = {}) {
  const platformPages = ['platformTenants', 'platformStatus']
  const monitorOnlyPages = ['settings', 'audit']
  const adminOnlyPages = ['users']

  if (isSuperAdminUser) {
    if (!platformPages.includes(page)) {
      notify('Super Admin uses platform routes only', 'error')
      setActivePage('platformTenants')
      return
    }

    setActivePage(page)
    if (page === 'platformTenants') loadPlatformTenants()
    if (page === 'platformStatus') loadPlatformTenantStatus()
    return
  }

  if (platformPages.includes(page)) {
    notify('Super Admin access required', 'error')
    setActivePage('inbox')
    return
  }

  if (monitorOnlyPages.includes(page) && !canMonitor) {
    notify('Manager/Admin access required', 'error')
    setActivePage('inbox')
    return
  }

  if (adminOnlyPages.includes(page) && user?.role !== 'admin') {
    notify('Admin access required', 'error')
    setActivePage('inbox')
    return
  }

  setActivePage(page)

  if (page === 'inbox') {
    const nextFilter = pageFilter.label || 'all'
    const nextWindowFilter = pageFilter.window || 'all'
    setFilter(nextFilter)
    setWindowFilter(nextWindowFilter)
    setStageFilter('all')
    setSearch('')
    loadAll({ filter: nextFilter, windowFilter: nextWindowFilter, search: '' })
  } else if (page === 'new') {
    setFilter('New Enquiry')
    setWindowFilter('all')
    setStageFilter('all')
    loadAll({ filter: 'New Enquiry', windowFilter: 'all' })
  } else if (page === 'sales') {
    setFilter('all')
    setWindowFilter('open')
    setStageFilter('all')
    loadAll({ filter: 'all', windowFilter: 'open' })
  } else {
    if (pageFilter.label) setFilter(pageFilter.label)
    if (pageFilter.window) setWindowFilter(pageFilter.window)
  }
}

async function sendMessage(event) {
  event.preventDefault()

  if (!selected || sendingMessage) return

  if (selected.opted_out) {
    setSendError('Customer has opted out. Do not send WhatsApp messages to this contact.')
    return
  }

  const cleanText = draft.trim()
  const selectedTemplate = templates.find((template) => template.name === templateName)

  setSendError('')

  if (!selected.reply_window_open && !templateName) {
    setSendError('24-hour reply window expired. Use an approved WhatsApp template.')
    return
  }

  const payload = templateName
    ? { templateName, language: selectedTemplate?.language || 'en' }
    : { text: cleanText }

  if (!payload.templateName && !payload.text) {
    setSendError('Message text required hai, ya template select karo.')
    return
  }

  setSendingMessage(true)

  try {
    await api.post(`/api/conversations/${selected.id}/messages`, payload)
    setDraft('')
    setTemplateName('')
    notify('Message queued/sent')
    await Promise.all([loadMessages(selected.id), loadAll()])
  } catch (err) {
    setSendError(apiErrorMessage(err, 'Message send failed'))
  } finally {
    setSendingMessage(false)
  }
}

  async function saveLead(event) {
    event.preventDefault()
    if (!selected) return
    await api.patch(`/api/contacts/${selected.id}`, leadForm)
    notify('Customer profile saved')
    await loadAll()
    if (canMonitor) {
      const res = await api.get(`/api/contacts/${selected.id}/assignment-history`)
      setAssignmentHistory(res.data)
    }
  }

async function simulateInbound(event) {
  event.preventDefault()

  if (!canMonitor) {
    notify('Manager/Admin access required', 'error')
    return
  }

  try {
    await api.post('/api/local/inbound-message', simulator)
    notify('Inbound message captured')
    setActivePage('inbox')
    setFilter('all')
    await loadAll()
  } catch (err) {
    notify(apiErrorMessage(err, 'Inbound simulator failed'), 'error')
  }
}

  async function createQuoteFromDraft(draftItem) {
    await api.post(`/api/enquiry-drafts/${draftItem.id}/create-quote`, {
      rate: Number(quoteRates[draftItem.id] || 0),
      notes: `Quote for ${draftItem.grade || ''} ${draftItem.size || ''} ${draftItem.quantity || ''}`.trim(),
    })
    setQuoteRates({ ...quoteRates, [draftItem.id]: '' })
    notify('Quotation created')
    await loadAll()
  }

  async function createErp(draftId) {
    await api.post(`/api/enquiry-drafts/${draftId}/create-erp`)
    notify('ERP enquiry marked')
    await loadAll()
  }

  async function updateQuote(quote, statusValue) {
    await api.patch(`/api/quotations/${quote.id}`, { status: statusValue })
    notify(`Quotation marked ${statusValue}`)
    await loadAll()
  }

    async function sendQuoteForManagerApproval(quote) {
    try {
      await api.post(`/api/quotations/${quote.id}/send-manager-approval`)
      notify('Quotation sent to manager for approval')
      await loadAll()
    } catch (err) {
      notify(apiErrorMessage(err, 'Manager approval send failed'), 'error')
    }
  }

  async function sendQuoteToCustomer(quote) {
    try {
      await api.post(`/api/quotations/${quote.id}/send-to-customer`)
      notify('Approved quotation sent to customer')
      await loadAll()
    } catch (err) {
      notify(apiErrorMessage(err, 'Customer quote send failed'), 'error')
    }
  }

  async function convertQuote(quote) {
    if (quote.status !== 'accepted' || quote.approval_status !== 'customer_approved') {
      notify('Order can be created only after customer approves the quotation', 'error')
      return
    }

    try {
      await api.post(`/api/quotations/${quote.id}/convert-order`)
      notify('Customer-approved quotation converted to order')
      setActivePage('orders')
      await loadAll()
    } catch (err) {
      notify(apiErrorMessage(err, 'Order creation failed'), 'error')
    }
  }

  async function updateOrder(order, patch) {
    await api.patch(`/api/orders/${order.id}`, patch)
    notify('Order updated')
    await loadAll()
  }

  async function saveProduct(event) {
    event.preventDefault()
    const payload = {
      ...productForm,
      price: Number(productForm.price || 0),
      stock_qty: Number(productForm.stock_qty || 0),
    }
    try {
      if (editingProductId) await api.patch(`/api/products/${editingProductId}`, payload)
      else await api.post('/api/products', payload)
      notify(editingProductId ? 'Product updated' : 'Product added')
      setProductForm(emptyProduct)
      setEditingProductId('')
      await loadAll()
    } catch (err) {
      notify(apiErrorMessage(err, 'Product save failed'), 'error')
    }
  }

  function editProduct(product) {
    setEditingProductId(product.id)
    setProductForm({
      sku: product.sku || '',
      name: product.name || '',
      category: product.category || '',
      grade: product.grade || '',
      size: product.size || '',
      shape: product.shape || '',
      unit: product.unit || 'pcs',
      price: product.price || '',
      stock_qty: product.stock_qty || '',
      active: product.active !== false,
    })
  }

  async function deleteProduct(product) {
    await api.delete(`/api/products/${product.id}`)
    notify('Product deleted')
    if (editingProductId === product.id) {
      setEditingProductId('')
      setProductForm(emptyProduct)
    }
    await loadAll()
  }

  async function importProducts(rows) {
    setImportResult('')
    const res = await api.post('/api/products/import', { rows })
    setImportResult(`Imported: ${res.data.inserted} new, ${res.data.updated} updated, ${res.data.skipped?.length || 0} skipped`)
    notify('Inventory import completed')
    await loadAll()
  }

  async function createUser(event) {
    event.preventDefault()
    try {
      if (editingUserId) {
        const payload = { name: newUser.name, role: newUser.role }
        if (newUser.password) payload.password = newUser.password
        await api.patch(`/api/users/${editingUserId}`, payload)
        notify('User updated')
      } else {
        await api.post('/api/users', newUser)
        notify('User created')
      }
      setNewUser(emptyUser)
      setEditingUserId('')
      await loadAll()
      return true
    } catch (err) {
      notify(apiErrorMessage(err, editingUserId ? 'User update failed' : 'User create failed'), 'error')
      return false
    }
  }

  function editUser(userItem) {
    setEditingUserId(userItem.id)
    setNewUser({
      name: userItem.name || '',
      email: userItem.email || '',
      password: '',
      role: userItem.role || 'sales',
    })
  }

  function cancelUserEdit() {
    setEditingUserId('')
    setNewUser(emptyUser)
  }

  async function toggleUser(userItem) {
    try {
      await api.patch(`/api/users/${userItem.id}`, { active: !userItem.active })
      notify('User status updated')
      await loadAll()
    } catch (err) {
      notify(apiErrorMessage(err, 'User status update failed'), 'error')
    }
  }

  async function deleteUser(userItem) {
    if (userItem.id === user.id) {
      notify('You cannot delete your own logged-in user', 'error')
      return
    }
    try {
      await api.delete(`/api/users/${userItem.id}`)
      notify('User deleted')
      if (editingUserId === userItem.id) cancelUserEdit()
      await loadAll()
    } catch (err) {
      notify(apiErrorMessage(err, 'User delete failed'), 'error')
    }
  }

  async function saveTemplate(event) {
  event.preventDefault()

  if (!canMonitor) {
    notify('Manager/Admin access required', 'error')
    return
  }

  const payload = {
    name: templateForm.name.trim().toLowerCase(),
    language: templateForm.language.trim() || 'en',
    body: templateForm.body.trim(),
    active: Boolean(templateForm.active),
  }

  if (!payload.name || !payload.body) {
    notify('Template name and body required', 'error')
    return
  }

  try {
    if (editingTemplateId) {
      await api.patch(`/api/templates/${editingTemplateId}`, payload)
      notify('Template updated')
    } else {
      await api.post('/api/templates', payload)
      notify('Template saved')
    }

    setTemplateForm(emptyTemplate)
    setEditingTemplateId('')
    await loadAll()
  } catch (err) {
    notify(apiErrorMessage(err, 'Template save failed'), 'error')
  }
}

function editTemplate(template) {
  setEditingTemplateId(template.id)
  setTemplateForm({
    name: template.name || '',
    language: template.language || 'en',
    body: template.body || '',
    active: template.active !== false,
  })
}

function cancelTemplateEdit() {
  setEditingTemplateId('')
  setTemplateForm(emptyTemplate)
}

async function toggleTemplate(template) {
  try {
    await api.patch(`/api/templates/${template.id}`, {
      name: template.name,
      language: template.language,
      body: template.body,
      active: !template.active,
    })

    notify(template.active ? 'Template deactivated' : 'Template activated')
    await loadAll()
  } catch (err) {
    notify(apiErrorMessage(err, 'Template update failed'), 'error')
  }
}

async function saveCustomization(event) {
  event.preventDefault()

  if (!canMonitor) {
    notify('Manager/Admin access required', 'error')
    return
  }

  setSettingsSaved('')

  const payload = {
    ...customForm,
    labels: fromCsv(customForm.labelsText),
    stages: fromCsv(customForm.stagesText),
    handoffKeywords: fromCsv(customForm.handoffKeywordsText),
    inventoryFields: fromCsv(customForm.inventoryFieldsText),
  }

  try {
    const res = await api.put('/api/app-settings', payload)
    const nextSettings = { ...defaultAppSettings, ...res.data }

    setAppSettings(nextSettings)
    setCustomForm({
      ...nextSettings,
      labelsText: toCsv(nextSettings.labels),
      stagesText: toCsv(nextSettings.stages),
      handoffKeywordsText: toCsv(nextSettings.handoffKeywords),
      inventoryFieldsText: toCsv(nextSettings.inventoryFields),
    })
    setSettingsSaved('Customization saved')
    notify('Customization saved')
    await loadAll()
  } catch (err) {
    notify(apiErrorMessage(err, 'Customization save failed'), 'error')
  }
}

  async function sendTestMessage(event) {
    event.preventDefault()
    setTestResult('')
    try {
      const res = await api.post('/api/whatsapp/test-message', testMessage)
      setTestResult(`Accepted by Meta. To: ${res.data.to}. Message ID: ${res.data.messageId || 'not returned'}`)
      notify('Test message accepted')
      setActivePage('inbox')
      setFilter('all')
      setWindowFilter('all')
      setSearch('')
      if (res.data.contactId) setSelectedId(res.data.contactId)
      await loadAll()
    } catch (err) {
      setTestResult(err.response?.data?.error || 'Test message failed')
    }
  }

  async function mapCurrentWhatsAppPhone() {
  if (user?.role !== 'admin') {
    notify('Admin access required', 'error')
    return
  }

  try {
    await api.post('/api/whatsapp/map-current-phone', {})
    notify('WhatsApp phone mapped to this company')
    await loadAll()
  } catch (err) {
    notify(apiErrorMessage(err, 'Phone mapping failed'), 'error')
  }
}

  async function downloadQuote(quote) {
    const res = await api.get(`/api/quotations/${quote.id}/print-text`, { responseType: 'blob' })
    const blob = new Blob([res.data], { type: 'text/plain;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${quote.quote_no}.txt`
    link.click()
    URL.revokeObjectURL(link.href)
    notify('Quotation file downloaded')
  }

  async function refreshCurrentPage() {
    if (!isSuperAdminUser) {
      await loadAll()
      return
    }

    await loadPlatformTenants()

    if (activePage === 'platformStatus') {
      await loadPlatformTenantStatus()
    }
  }

  const newEnquiries = drafts.filter((item) => item.status === 'draft')
  const activeOrders = orders.filter((item) => item.status !== 'closed')
  const chatPages = !isSuperAdminUser && (activePage === 'inbox' || activePage === 'new' || activePage === 'sales')
  const lowStockProducts = products.filter((item) => item.active !== false && Number(item.stock_qty || 0) <= 5)
  const stageOptions = ['all', ...stages]
  const visibleConversations = stageFilter === 'all'
    ? conversations
    : conversations.filter((item) => String(item.stage || '').toLowerCase() === String(stageFilter).toLowerCase())
  const chatMode = {
    inbox: {
      title: 'Inbox',
      kicker: 'All conversations',
      helper: 'Customer chats, owner, stage and reply window in one clean view.',
    },
    new: {
      title: 'New Enquiries',
      kicker: 'Fresh leads',
      helper: 'Only new customer enquiries that need qualification or assignment.',
    },
    sales: {
      title: 'Sales Pipeline',
      kicker: 'Follow-up queue',
      helper: 'Open-window conversations where sales action is pending.',
    },
  }[activePage] || {
    title: 'Inbox',
    kicker: 'All conversations',
    helper: 'Customer chats, owner, stage and reply window in one clean view.',
  }

  return (
    <main className={`app-shell ${chatPages ? '' : 'workspace-mode'}`}>
      {notice && <div className={`toast ${notice.type}`}>{notice.text}</div>}
      <aside className="nav-rail">
        <div className="rail-logo"><MessageCircle size={26} /></div>
        {pageItems.map((item) => {
          const Icon = item.icon
          return (
            <button key={item.id} className={activePage === item.id ? 'active' : ''} type="button" onClick={() => showPage(item.id)}>
              <Icon size={20} />
              <span>{item.label}</span>
            </button>
          )
        })}
        <button className="logout-btn" type="button" onClick={logout}><LogOut size={20} /><span>Logout</span></button>
      </aside>

      <section className="module-panel">
        <div className="app-title inbox-title">
          <div>
            <h1>{isSuperAdminUser ? 'Platform Console' : appSettings.appName}</h1>
            <span>{isSuperAdminUser ? `Platform Owner - ${user.name} / ${user.role}` : `${appSettings.companyName} - ${user.name} / ${user.role}`}</span>
          </div>
          <button type="button" onClick={refreshCurrentPage} disabled={loading || platformLoading}><RefreshCw size={17} /> Refresh</button>
        </div>
        {loadError && <div className="load-error">{loadError}</div>}
        {platformError && <div className="load-error">{platformError}</div>}

        {isSuperAdminUser && (
          <PlatformPage
            activePage={activePage}
            tenants={platformTenants}
            tenantForm={tenantForm}
            setTenantForm={setTenantForm}
            clientAdminForm={clientAdminForm}
            setClientAdminForm={setClientAdminForm}
            selectedTenantId={selectedPlatformTenantId}
            setSelectedTenantId={setSelectedPlatformTenantId}
            platformStatus={platformStatus}
            platformLoading={platformLoading}
            onCreateTenant={createPlatformTenant}
            onCreateClientAdmin={createPlatformClientAdmin}
            onOpenStatus={openPlatformStatus}
            onLoadStatus={loadPlatformTenantStatus}
          />
        )}

        {!isSuperAdminUser && chatPages && (
          <>
            <div className={`chat-mode-head chat-mode-${activePage}`}>
              <div>
                <span>{chatMode.kicker}</span>
                <h2>{chatMode.title}</h2>
                <small>{visibleConversations.length} chats shown - {chatMode.helper}</small>
              </div>
            </div>
            <div className="filter-toolbar compact-filter">
              <div className="search-box"><Search size={17} /><input placeholder="Search customer, phone, company" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') loadAll() }} /></div>
              <div className="filter-row">
                <select value={filter} onChange={(e) => { const next = e.target.value; setFilter(next); loadAll({ filter: next }) }} aria-label="Enquiry type">{labels.map((label) => <option key={label} value={label}>{label === 'all' ? 'All enquiry types' : label}</option>)}</select>
                <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} aria-label="Enquiry stage">{stageOptions.map((stage) => <option key={stage} value={stage}>{stage === 'all' ? 'All stages' : `Stage: ${stage}`}</option>)}</select>
                <select value={windowFilter} onChange={(e) => { const next = e.target.value; setWindowFilter(next); loadAll({ windowFilter: next }) }} aria-label="Reply window"><option value="all">All windows</option><option value="open">24h open</option><option value="expired">Expired</option></select>
              </div>
            </div>
            <ConversationList conversations={visibleConversations} selectedId={selected?.id} onSelect={setSelectedId} onReset={() => { setStageFilter('all'); showPage('inbox') }} />
          </>
        )}

        {!isSuperAdminUser && activePage === 'dashboard' && <DashboardPage dashboard={dashboard} conversations={conversations} drafts={drafts} products={products} lowStockProducts={lowStockProducts} quotations={quotations} orders={orders} onOpenPage={showPage} />}
        {!isSuperAdminUser && activePage === 'inventory' && <InventoryPage products={products} productForm={productForm} setProductForm={setProductForm} editingProductId={editingProductId} onSave={saveProduct} onEdit={editProduct} onDelete={deleteProduct} onCancel={() => { setEditingProductId(''); setProductForm(emptyProduct) }} productSearch={productSearch} setProductSearch={setProductSearch} onSearch={loadAll} canManage={canMonitor} currency={appSettings.currency} inventoryColumnsText={inventoryColumnsText} setInventoryColumnsText={setInventoryColumnsText} onImport={importProducts} importResult={importResult} />}
        {!isSuperAdminUser && activePage === 'bot' && <BotStudioPage appSettings={appSettings} products={products} drafts={drafts} lowStockProducts={lowStockProducts} onOpenSettings={() => showPage('settings')} />}
        {!isSuperAdminUser && activePage === 'quotes' && <QuotesPage quotations={quotations} onStatus={updateQuote} onConvert={convertQuote} onDownload={downloadQuote} onSendManagerApproval={sendQuoteForManagerApproval} onSendCustomer={sendQuoteToCustomer} />}        {!isSuperAdminUser && activePage === 'activeOrders' && <OrdersPage orders={activeOrders} onUpdate={updateOrder} title="Active Orders" />}
        {!isSuperAdminUser && activePage === 'users' && user.role === 'admin' && <UsersPage users={users} newUser={newUser} setNewUser={setNewUser} editingUserId={editingUserId} onCreate={createUser} onEdit={editUser} onCancel={cancelUserEdit} onToggle={toggleUser} onDelete={deleteUser} />}
        {!isSuperAdminUser && activePage === 'settings' && canMonitor && <SettingsPage status={status} whatsappConfig={whatsappConfig} testMessage={testMessage} setTestMessage={setTestMessage} testResult={testResult} onTest={sendTestMessage} onMapPhone={mapCurrentWhatsAppPhone} simulator={simulator} setSimulator={setSimulator} onSimulate={simulateInbound} customForm={customForm} setCustomForm={setCustomForm} onSaveCustomization={saveCustomization} settingsSaved={settingsSaved} templates={managedTemplates} templateForm={templateForm} setTemplateForm={setTemplateForm} editingTemplateId={editingTemplateId} onSaveTemplate={saveTemplate} onEditTemplate={editTemplate} onToggleTemplate={toggleTemplate} onCancelTemplateEdit={cancelTemplateEdit} userRole={user.role} isProduction={isProduction} />}
        {!isSuperAdminUser && activePage === 'audit' && canMonitor && <AuditPage events={auditEvents} />}
        {!isSuperAdminUser && !chatPages && activePage !== 'dashboard' && activePage !== 'inventory' && activePage !== 'bot' && activePage !== 'quotes' && activePage !== 'orders' && activePage !== 'activeOrders' && activePage !== 'users' && activePage !== 'settings' && activePage !== 'audit' && (
          <DraftsPanel drafts={drafts} quoteRates={quoteRates} setQuoteRates={setQuoteRates} onQuote={createQuoteFromDraft} onErp={createErp} />
        )}
      </section>

      {chatPages && (
        <>
          <section className="chat-shell">
            <ChatHeader selected={selected} onProfile={() => setProfileOpen(true)} currentTime={currentTime} />
            <div className="message-list">
           {messages.map((message) => (
  <div className={`message ${message.direction}`} key={message.id}>
    <b>{message.direction === 'inbound' ? 'Incoming' : 'Outgoing'}</b>

    {message.type === 'image' && message.media_url ? (
      <div className="media-message">
       <ProtectedImage url={message.media_url} alt={message.caption || 'WhatsApp image'} />
        {(message.caption || message.body) && <span>{message.caption || message.body}</span>}
      </div>
    ) : message.type === 'image' ? (
      <div className="media-placeholder">
        <PackageCheck size={18} />
        <span>{message.caption || message.body || 'Image received'}</span>
        <small>Preview unavailable. Check Meta token/media download.</small>
      </div>
    ) : message.type === 'document' && message.media_url ? (
<ProtectedMediaLink className="doc-message" url={message.media_url}>
  {message.file_name || message.body || 'Open document'}
</ProtectedMediaLink>
    ) : message.type === 'document' ? (
      <div className="media-placeholder">
        <FileText size={18} />
        <span>{message.file_name || message.body || 'Document received'}</span>
        <small>Download unavailable. Check Meta token/media download.</small>
      </div>
    ) : ['audio', 'video', 'sticker'].includes(message.type) && message.media_url ? (
<ProtectedMediaLink className="doc-message" url={message.media_url}>
  {message.file_name || message.body || `Open ${message.type}`}
</ProtectedMediaLink>
    ) : message.type === 'interactive' && message.interactive_payload ? (
      <div className="interactive-message">
        <strong>{message.interactive_payload?.header?.text || 'Menu'}</strong>
        <span>{message.interactive_payload?.body?.text || message.body}</span>
        <div>
          {(message.interactive_payload?.action?.sections || []).flatMap((section) => section.rows || []).map((row) => (
            <small key={row.id || row.title}>› {row.title}</small>
          ))}
        </div>
      </div>
    ) : (
      <span>{message.body}</span>
    )}

    <small>{message.type} - {message.status === 'queued-local' ? 'Local demo only' : message.status}</small>
  </div>
))}
              {!messages.length && <div className="empty-chat">Select a customer conversation</div>}
            </div>
<form className="composer" onSubmit={sendMessage}>
  {selected?.opted_out && (
    <p>Customer has opted out. WhatsApp sending is locked for this contact.</p>
  )}

  {!selected?.opted_out && selected && !selected.reply_window_open && !templateName && (
    <p>24-hour window expired. Select approved template before sending.</p>
  )}

  {sendError && <p>{sendError}</p>}

  <input
    value={draft}
    onChange={(e) => setDraft(e.target.value)}
    placeholder={selected?.reply_window_open ? 'Type WhatsApp reply' : 'Template required after 24h'}
    disabled={!selected || selected.opted_out || Boolean(templateName) || sendingMessage || !selected.reply_window_open}
  />

  <select
    value={templateName}
    onChange={(e) => {
      setTemplateName(e.target.value)
      setDraft('')
      setSendError('')
    }}
    disabled={!selected || selected.opted_out || sendingMessage}
  >
    <option value="">Text Reply</option>
    {templates.map((template) => (
      <option key={template.id} value={template.name}>
        {template.name}{template.language ? ` (${template.language})` : ''}
      </option>
    ))}
  </select>

  <button type="submit" disabled={!selected || selected.opted_out || sendingMessage || (!selected.reply_window_open && !templateName)}>
    {sendingMessage ? 'Sending' : <Send size={18} />}
  </button>
</form>
          </section>

          {profileOpen && <button className="drawer-backdrop" type="button" aria-label="Close profile" onClick={() => setProfileOpen(false)} />}
          <aside className={`profile-panel ${profileOpen ? 'open' : ''}`}>
            <button className="drawer-close" type="button" onClick={() => setProfileOpen(false)}>Close</button>
            <ProfilePanel selected={selected} leadForm={leadForm} setLeadForm={setLeadForm} users={users} canMonitor={canMonitor} stages={stages} labels={labels} onSave={saveLead} assignmentHistory={assignmentHistory} timeline={timeline} />
          </aside>
        </>
      )}
    </main>
  )
}

function PlatformPage({
  activePage,
  tenants,
  tenantForm,
  setTenantForm,
  clientAdminForm,
  setClientAdminForm,
  selectedTenantId,
  setSelectedTenantId,
  platformStatus,
  platformLoading,
  onCreateTenant,
  onCreateClientAdmin,
  onOpenStatus,
  onLoadStatus,
}) {
  const clientTenants = tenants.filter((tenant) => tenant.slug !== 'platform')
  const selectedTenant = clientTenants.find((tenant) => tenant.id === selectedTenantId) || clientTenants[0]
  const connectedClients = clientTenants.filter((tenant) => tenant.onboardingStatus === 'whatsapp_mapped').length
  const activeClients = clientTenants.filter((tenant) => tenant.status === 'active').length

  function selectTenant(tenantId) {
    setSelectedTenantId(tenantId)
    setClientAdminForm({ ...clientAdminForm, tenantId })
  }

  return (
    <section className="workspace-page platform-page">
      <div className="workspace-head">
        <div>
          <h2>Client Company Control</h2>
          <span>Create client companies, create the first admin, and verify WhatsApp/account status.</span>
        </div>
      </div>

      <div className="kpi-grid platform-kpis">
        <button type="button"><strong>{clientTenants.length}</strong><span>Client Companies</span></button>
        <button type="button"><strong>{activeClients}</strong><span>Active Clients</span></button>
        <button type="button"><strong>{connectedClients}</strong><span>WhatsApp Mapped</span></button>
        <button type="button"><strong>{tenants.length}</strong><span>Total Tenants</span></button>
      </div>

      {activePage === 'platformTenants' && (
        <div className="platform-grid">
          <section className="table-module">
            <div className="module-title"><Building2 size={18} /><h3>Create Client Company</h3></div>
            <form className="platform-form" onSubmit={onCreateTenant}>
              <label>Company Name<input value={tenantForm.name} onChange={(e) => setTenantForm({ ...tenantForm, name: e.target.value })} placeholder="ABC Steels Pvt Ltd" /></label>
              <label>Slug<input value={tenantForm.slug} onChange={(e) => setTenantForm({ ...tenantForm, slug: e.target.value })} placeholder="abc-steels" /></label>
              <label>Industry<input value={tenantForm.industry} onChange={(e) => setTenantForm({ ...tenantForm, industry: e.target.value })} placeholder="Steel / Retail / Service" /></label>
              <label>Plan<input value={tenantForm.plan} onChange={(e) => setTenantForm({ ...tenantForm, plan: e.target.value })} placeholder="starter" /></label>
              <label>Status<select value={tenantForm.status} onChange={(e) => setTenantForm({ ...tenantForm, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option></select></label>
              <label>Business Phone<input value={tenantForm.businessPhone} onChange={(e) => setTenantForm({ ...tenantForm, businessPhone: e.target.value })} placeholder="919876543210" /></label>
              <label>Business Email<input value={tenantForm.businessEmail} onChange={(e) => setTenantForm({ ...tenantForm, businessEmail: e.target.value })} placeholder="admin@abcsteels.com" /></label>
              <label>Meta Business ID<input value={tenantForm.metaBusinessId} onChange={(e) => setTenantForm({ ...tenantForm, metaBusinessId: e.target.value })} placeholder="Optional" /></label>
              <div className="user-form-actions">
                <button className="user-action-primary" type="submit"><CheckCircle2 size={16} /> Create Client</button>
              </div>
            </form>
          </section>

          <section className="table-module">
            <div className="module-title"><UserPlus size={18} /><h3>Create First Client Admin</h3></div>
            <form className="platform-form" onSubmit={onCreateClientAdmin}>
              <label>Client Company<select value={clientAdminForm.tenantId || selectedTenant?.id || ''} onChange={(e) => selectTenant(e.target.value)}><option value="">Select client</option>{clientTenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select></label>
              <label>Admin Name<input value={clientAdminForm.name} onChange={(e) => setClientAdminForm({ ...clientAdminForm, name: e.target.value })} placeholder="Company Admin" /></label>
              <label>Admin Email<input value={clientAdminForm.email} onChange={(e) => setClientAdminForm({ ...clientAdminForm, email: e.target.value })} placeholder="admin@client.com" /></label>
              <label>Temporary Password<input type="password" value={clientAdminForm.password} onChange={(e) => setClientAdminForm({ ...clientAdminForm, password: e.target.value })} placeholder="Minimum 8 characters" /></label>
              <div className="user-form-actions">
                <button className="user-action-primary" type="submit"><UserPlus size={16} /> Create Admin</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {activePage === 'platformTenants' && (
        <section className="table-module">
          <div className="module-title"><Users size={18} /><h3>Client Companies</h3></div>
          <div className="platform-tenant-list">
            {!clientTenants.length && <EmptyState title="No client companies" text="Create the first client company to start onboarding." />}
            {clientTenants.map((tenant) => (
              <div className="platform-tenant-row" key={tenant.id}>
                <div>
                  <strong>{tenant.name}</strong>
                  <span>{tenant.slug} - {tenant.industry || 'General'} - {tenant.plan || 'starter'}</span>
                  <small>{tenant.businessEmail || 'No email'} - {tenant.businessPhone || 'No phone'}</small>
                </div>
                <b className={`status-${tenant.status === 'active' ? 'active' : 'inactive'}`}>{tenant.status}</b>
                <i>{tenant.onboardingStatus || 'pending'}</i>
                <span>{tenant.activeUserCount || 0}/{tenant.userCount || 0} users</span>
                <button type="button" onClick={() => onOpenStatus(tenant.id)}>Status</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {activePage === 'platformStatus' && (
        <section className="table-module">
          <div className="module-title"><Activity size={18} /><h3>Client Status</h3></div>
          <div className="platform-status-toolbar">
            <select value={selectedTenant?.id || ''} onChange={(e) => selectTenant(e.target.value)}>
              <option value="">Select client</option>
              {clientTenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
            </select>
            <button type="button" onClick={() => onLoadStatus(selectedTenant?.id)} disabled={!selectedTenant || platformLoading}>Load Status</button>
          </div>

          {!platformStatus && <EmptyState title="No client selected" text="Select a client company and load status." />}

          {platformStatus && (
            <div className="platform-status-grid">
              <div className="mini-row">
                <strong>{platformStatus.tenant?.name}</strong>
                <span>{platformStatus.tenant?.slug} - {platformStatus.tenant?.status} - {platformStatus.tenant?.onboardingStatus}</span>
              </div>
              <div className="mini-row">
                <strong>{platformStatus.totals?.contacts || 0}</strong>
                <span>Contacts</span>
              </div>
              <div className="mini-row">
                <strong>{platformStatus.totals?.messages || 0}</strong>
                <span>Messages</span>
              </div>
              <section className="table-module">
                <div className="module-title"><Users size={18} /><h3>User Summary</h3></div>
                {platformStatus.users?.map((item) => (
                  <div className="mini-row" key={`${item.role}-${item.active}`}>
                    <strong>{item.role} - {item.active ? 'active' : 'inactive'}</strong>
                    <span>{item.count} users</span>
                  </div>
                ))}
                {!platformStatus.users?.length && <EmptyState title="No users" text="Create the first admin for this client." />}
              </section>
              <section className="table-module">
                <div className="module-title"><MessageCircle size={18} /><h3>WhatsApp Accounts</h3></div>
                {platformStatus.whatsappAccounts?.map((account) => (
                  <div className="mini-row" key={account.id}>
                    <strong>{account.displayPhoneNumber || 'No display number'}</strong>
                    <span>Phone ID: {account.phoneNumberId || '-'}</span>
                    <small>{account.active ? 'Active mapping' : 'Inactive mapping'}</small>
                  </div>
                ))}
                {!platformStatus.whatsappAccounts?.length && <EmptyState title="WhatsApp not mapped" text="Client Admin must map/connect their WhatsApp phone number before inbound routing is live." />}
              </section>
            </div>
          )}
        </section>
      )}
    </section>
  )
}

function ConnectionStrip({ status, whatsappConfig, canMonitor }) {
  const outgoingOk = canMonitor ? Boolean(whatsappConfig?.configured) : Boolean(status?.whatsappTokenSet && status?.phoneNumberIdSet)
  const hasCallbackUrl = canMonitor ? Boolean(whatsappConfig?.callbackUrl && !String(whatsappConfig.callbackUrl).startsWith('Set ')) : Boolean(status?.webhookVerifyTokenSet)
  const phoneMapped = canMonitor ? Boolean(whatsappConfig?.phoneNumberMapped) : Boolean(status?.phoneNumberMapped)
  const signatureRequired = canMonitor ? Boolean(whatsappConfig?.webhookSignatureRequired) : Boolean(status?.webhookSignatureRequired)
  const signatureReady = !signatureRequired || (canMonitor ? Boolean(whatsappConfig?.appSecretSet) : Boolean(status?.webhookAppSecretSet))
  const incomingReady = hasCallbackUrl && phoneMapped && signatureReady
  const incomingLabel = incomingReady
    ? 'ready'
    : !phoneMapped
      ? 'phone not mapped'
      : !signatureReady
        ? 'app secret missing'
        : 'needs URL'

  return (
    <div className="connection-strip">
      <span className={outgoingOk ? 'ok' : 'warn'}><CheckCircle2 size={15} /> Outgoing {outgoingOk ? 'connected' : 'not ready'}</span>
      <span className={incomingReady ? 'ok' : 'warn'}><Shield size={15} /> Incoming webhook {incomingLabel}</span>
    </div>
  )
}

function ConversationList({ conversations, selectedId, onSelect, onReset }) {
  return (
    <div className="conversation-list">
      {!conversations.length && (
        <div className="empty-list">
          <strong>No chats in this filter</strong>
          <span>Inbox ko All chats par reset karo, ya Settings me Local Inbound Test se customer message capture karke check karo.</span>
          <button type="button" onClick={onReset}>Show all chats</button>
        </div>
      )}
      {conversations.map((conversation) => (
        <button className={`conversation ${selectedId === conversation.id ? 'active' : ''}`} key={conversation.id} type="button" onClick={() => onSelect(conversation.id)}>
          <span className="avatar">{initials(conversation.name || conversation.phone)}</span>
          <span className="conversation-copy">
            <strong>{conversation.name || conversation.phone}</strong>
            <small className="conversation-pills">
              <span>{conversation.label || 'New Enquiry'}</span>
              <span>{conversation.stage || 'new'}</span>
            </small>
            <small>{conversation.assigned_name || 'Unassigned'} - {conversation.reply_window_open ? '24h open' : 'template needed'}</small>
            <small>{conversation.last_message || 'No message yet'}</small>
          </span>
          {Number(conversation.unread_count || 0) > 0 ? <span className="badge">{conversation.unread_count}</span> : <span className={`window-dot ${conversation.reply_window_open ? 'open' : 'expired'}`} />}
        </button>
      ))}
    </div>
  )
}

function ChatHeader({ selected, onProfile, currentTime }) {
  const hoursLeft = selected?.last_inbound_at
    ? Math.max(0, Math.ceil((24 * 60 * 60 * 1000 - (currentTime - new Date(selected.last_inbound_at).getTime())) / (60 * 60 * 1000)))
    : 0
  return (
    <header className="chat-header">
      <span className="avatar large">{initials(selected?.name || selected?.phone)}</span>
      <div>
        <h2>{selected?.name || 'No conversation selected'}</h2>
        <span>{selected?.phone || ''} {selected?.reply_window_open ? `- ${hoursLeft}h reply window left` : '- template required'}</span>
      </div>
      <span className={`status-pill ${selected?.reply_window_open ? 'ok' : 'warn'}`}>{selected?.label || 'No label'}</span>
      <button className="profile-toggle" type="button" onClick={onProfile} disabled={!selected}><UserRound size={18} /></button>
    </header>
  )
}

function ProfilePanel({ selected, leadForm, setLeadForm, users, canMonitor, stages, labels, onSave, assignmentHistory, timeline }) {
  if (!selected) return <div className="empty-profile">Customer profile will appear here.</div>
  return (
    <div className="profile-content">
      <div className="profile-head">
        <span className="avatar xl">{initials(selected.name || selected.phone)}</span>
        <h3>{selected.name || selected.phone}</h3>
        <span>{selected.phone}</span>
      </div>
      <form className="profile-form" onSubmit={onSave}>
        <label>Name<input value={leadForm.name} onChange={(e) => setLeadForm({ ...leadForm, name: e.target.value })} /></label>
        <label>Company<input value={leadForm.company} onChange={(e) => setLeadForm({ ...leadForm, company: e.target.value })} /></label>
        <label>Label<select value={leadForm.label} onChange={(e) => setLeadForm({ ...leadForm, label: e.target.value })}>{labels.filter((label) => label !== 'all').map((label) => <option key={label} value={label}>{label}</option>)}</select></label>
        <label>Stage<select value={leadForm.stage} onChange={(e) => setLeadForm({ ...leadForm, stage: e.target.value })}>{stages.map((stage) => <option key={stage} value={stage}>{stage}</option>)}</select></label>
        {canMonitor && <label>Assigned To<select value={leadForm.assigned_to} onChange={(e) => setLeadForm({ ...leadForm, assigned_to: e.target.value })}><option value="">Unassigned</option>{users.filter((item) => item.role === 'sales').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        {canMonitor && <label>Assignment Reason<input value={leadForm.assignment_reason || ''} onChange={(e) => setLeadForm({ ...leadForm, assignment_reason: e.target.value })} /></label>}
        <label>Notes<textarea value={leadForm.notes} onChange={(e) => setLeadForm({ ...leadForm, notes: e.target.value })} /></label>
        <button type="submit">Save Profile</button>
      </form>
      {canMonitor && (
        <section className="profile-section">
          <h4>Assignment History</h4>
          {assignmentHistory.slice(0, 5).map((item) => <p key={item.id}>{item.from_user_name || 'Unassigned'} {'->'} {item.to_user_name || 'Unassigned'}<span>{item.reason || 'No reason'}</span></p>)}
          {!assignmentHistory.length && <small>No reassignment yet</small>}
        </section>
      )}
      <section className="profile-section">
        <h4>Customer Timeline</h4>
        {timeline.slice(0, 10).map((item, index) => (
          <p key={`${item.kind}-${item.at}-${index}`}>
            {item.title}<span>{item.status || item.kind} - {new Date(item.at).toLocaleString()}</span>
            <small>{item.text || '-'}</small>
          </p>
        ))}
        {!timeline.length && <small>No activity yet</small>}
      </section>
    </div>
  )
}

function DraftsPanel({ drafts, quoteRates, setQuoteRates, onQuote, onErp }) {
  return (
    <section className="compact-module">
      <div className="module-title"><FileText size={18} /><h3>WhatsApp Enquiry Drafts</h3></div>
      <div className="draft-list">
        {drafts.slice(0, 4).map((item) => (
          <div className="draft-row" key={item.id}>
            <strong>{item.contact_name || 'Customer'}</strong>
            <span>Grade: {item.grade || '-'} | Size: {item.size || '-'} | Qty: {item.quantity || '-'}</span>
            <small>{item.source} - {item.status}</small>
            {item.status === 'draft' && (
              <div className="inline-actions">
                <input placeholder="Rate" value={quoteRates[item.id] || ''} onChange={(e) => setQuoteRates({ ...quoteRates, [item.id]: e.target.value })} />
                <button type="button" onClick={() => onQuote(item)}>Quote</button>
                <button type="button" onClick={() => onErp(item.id)}>ERP</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function DashboardPage({ dashboard, conversations, drafts, products, lowStockProducts, quotations, orders, onOpenPage }) {
  const cards = [
    { label: 'Conversations', value: dashboard?.total_conversations || conversations.length, action: 'inbox' },
    { label: 'Open Windows', value: dashboard?.open_windows || 0, action: 'inbox' },
    { label: 'Draft Enquiries', value: drafts.filter((item) => item.status === 'draft').length, action: 'new' },
    { label: 'Products', value: products.length, action: 'inventory' },
    { label: 'Low Stock', value: lowStockProducts.length, action: 'inventory' },
    { label: 'Open Quotes', value: quotations.filter((item) => !['converted', 'lost'].includes(item.status)).length, action: 'quotes' },
    { label: 'Active Orders', value: orders.filter((item) => item.status !== 'closed').length, action: 'activeOrders' },
    { label: 'Pending Dispatch', value: orders.filter((item) => item.dispatch_status !== 'dispatched').length, action: 'orders' },
  ]
  return (
    <section className="workspace-page">
      <div className="workspace-head">
        <div>
          <h2>Control Dashboard</h2>
          <span>Sales, inventory, quotations, and WhatsApp activity in one view.</span>
        </div>
      </div>
      <div className="kpi-grid">
        {cards.map((card) => (
          <button type="button" key={card.label} onClick={() => onOpenPage(card.action)}>
            <strong>{card.value}</strong>
            <span>{card.label}</span>
          </button>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="table-module">
          <div className="module-title"><Inbox size={18} /><h3>Recent Chats</h3></div>
          {conversations.slice(0, 5).map((item) => (
            <div className="mini-row" key={item.id}>
              <strong>{item.name || item.phone}</strong>
              <span>{item.label} - {item.last_message || 'No message yet'}</span>
            </div>
          ))}
          {!conversations.length && <EmptyState title="No chats yet" text="Incoming WhatsApp conversations will appear here." />}
        </section>
        <section className="table-module">
          <div className="module-title"><PackageCheck size={18} /><h3>Inventory Alerts</h3></div>
          {lowStockProducts.slice(0, 5).map((item) => (
            <div className="mini-row" key={item.id}>
              <strong>{item.sku} - {item.name}</strong>
              <span>{Number(item.stock_qty || 0).toLocaleString('en-IN')} {item.unit || 'pcs'} remaining</span>
            </div>
          ))}
          {!lowStockProducts.length && <EmptyState title="Stock healthy" text="No active product is currently at low stock threshold." />}
        </section>
        <section className="table-module">
          <div className="module-title"><FileText size={18} /><h3>Enquiry Drafts</h3></div>
          {drafts.slice(0, 5).map((item) => (
            <div className="mini-row" key={item.id}>
              <strong>{item.contact_name || 'Customer'} - {item.status}</strong>
              <span>{[item.grade, item.size, item.shape, item.quantity].filter(Boolean).join(' | ') || 'Needs review'}</span>
            </div>
          ))}
          {!drafts.length && <EmptyState title="No drafts" text="Product enquiries extracted from WhatsApp will appear here." />}
        </section>
        <section className="table-module">
          <div className="module-title"><Clock3 size={18} /><h3>Order Attention</h3></div>
          {orders.filter((item) => item.status !== 'closed' || item.payment_status !== 'paid' || item.dispatch_status !== 'dispatched').slice(0, 5).map((item) => (
            <div className="mini-row" key={item.id}>
              <strong>{item.order_no}</strong>
              <span>Pay: {item.payment_status} | Dispatch: {item.dispatch_status}</span>
            </div>
          ))}
          {!orders.length && <EmptyState title="No orders" text="Converted quotations and confirmed WhatsApp orders will appear here." />}
        </section>
      </div>
    </section>
  )
}

function BotStudioPage({ appSettings, products, drafts, lowStockProducts, onOpenSettings }) {
  const activeProducts = products.filter((item) => item.active !== false)
  const matchedDrafts = drafts.filter((item) => item.grade || item.size || item.shape || item.quantity)
  const flow = [
    'Receive WhatsApp enquiry',
    'Extract product, size, grade, quantity',
    'Match live inventory',
    appSettings.botEnabled ? 'Send configured bot reply or quote draft' : 'Prepare reply draft for sales review',
    'Handoff on keywords or low confidence',
  ]
  return (
    <section className="workspace-page">
      <div className="workspace-head">
        <div>
          <h2>Bot Studio</h2>
          <span>Configure and monitor the automation layer before making it fully automatic.</span>
        </div>
        <button type="button" onClick={onOpenSettings}>Open Settings</button>
      </div>
      <div className="kpi-grid">
        <button type="button"><strong>{appSettings.botEnabled ? 'On' : 'Off'}</strong><span>Auto Bot</span></button>
        <button type="button"><strong>{activeProducts.length}</strong><span>Active Products</span></button>
        <button type="button"><strong>{matchedDrafts.length}</strong><span>Parsed Enquiries</span></button>
        <button type="button"><strong>{lowStockProducts.length}</strong><span>Low Stock Risks</span></button>
      </div>
      <div className="dashboard-grid">
        <section className="table-module">
          <div className="module-title"><Bot size={18} /><h3>Automation Flow</h3></div>
          <div className="flow-list">
            {flow.map((item, index) => <p key={item}><b>{index + 1}</b><span>{item}</span></p>)}
          </div>
        </section>
        <section className="table-module">
          <div className="module-title"><MessageCircle size={18} /><h3>Bot Greeting</h3></div>
          <div className="preview-card">{appSettings.botGreeting}</div>
          <small>Handoff keywords: {(appSettings.handoffKeywords || []).join(', ') || '-'}</small>
        </section>
        <section className="table-module">
          <div className="module-title"><PackageCheck size={18} /><h3>Inventory Fields</h3></div>
          <div className="chip-list">{(appSettings.inventoryFields || []).map((item) => <span key={item}>{item}</span>)}</div>
        </section>
        <section className="table-module">
          <div className="module-title"><Shield size={18} /><h3>Sales Handoff Rules</h3></div>
          <div className="mini-row"><strong>Always handoff when:</strong><span>Complaint, urgent keyword, no stock, unclear product, expired 24h reply window, or order exception.</span></div>
        </section>
      </div>
    </section>
  )
}

function EmptyState({ title, text }) {
  return <div className="empty-list"><strong>{title}</strong><span>{text}</span></div>
}

function InventoryPage({ products, productForm, setProductForm, editingProductId, onSave, onEdit, onDelete, onCancel, productSearch, setProductSearch, onSearch, canManage, currency, inventoryColumnsText, setInventoryColumnsText, onImport, importResult }) {
  const templateColumns = fromCsv(inventoryColumnsText)
  const sample = templateColumns.map((header) => {
    const key = header.toLowerCase()
    if (key.includes('sku') || key.includes('code')) return 'SKU-001'
    if (key.includes('name') || key.includes('product') || key.includes('item')) return 'Round Bar'
    if (key.includes('category')) return 'Steel'
    if (key.includes('grade')) return 'EN8'
    if (key.includes('size')) return '20mm'
    if (key.includes('shape')) return 'Round'
    if (key.includes('unit') || key.includes('uom')) return 'pcs'
    if (key.includes('price') || key.includes('rate')) return '1200'
    if (key.includes('stock') || key.includes('qty')) return '50'
    if (key.includes('active')) return 'true'
    return 'Custom value'
  })

  async function handleImport(event) {
    const file = event.target.files?.[0]
    if (!file) return
    const text = await file.text()
    await onImport(parseCsv(text))
    event.target.value = ''
  }

  return (
    <section className="table-module inventory-module">
      <div className="module-title"><PackageCheck size={18} /><h3>Inventory</h3></div>
      {canManage && (
        <div className="import-panel">
          <label>Template Columns<textarea value={inventoryColumnsText} onChange={(e) => setInventoryColumnsText(e.target.value)} /></label>
          <div className="import-actions">
            <button type="button" onClick={() => downloadCsv('inventory-template.csv', templateColumns, sample)}>Download Template</button>
            <label className="file-button">Import CSV<input type="file" accept=".csv,text/csv" onChange={handleImport} /></label>
          </div>
          <small>Known columns are mapped automatically. Extra columns are saved as custom fields for that product.</small>
          {importResult && <small className="success-text">{importResult}</small>}
        </div>
      )}
      <div className="inventory-toolbar">
        <div className="search-box"><Search size={17} /><input placeholder="Search SKU, product, grade, size" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onSearch() }} /></div>
        <button type="button" onClick={onSearch}>Search</button>
      </div>
      {canManage && (
        <form className="product-form" onSubmit={onSave}>
          <input placeholder="SKU" value={productForm.sku} onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })} />
          <input placeholder="Product name" value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} />
          <input placeholder="Category" value={productForm.category} onChange={(e) => setProductForm({ ...productForm, category: e.target.value })} />
          <input placeholder="Grade" value={productForm.grade} onChange={(e) => setProductForm({ ...productForm, grade: e.target.value })} />
          <input placeholder="Size" value={productForm.size} onChange={(e) => setProductForm({ ...productForm, size: e.target.value })} />
          <input placeholder="Shape" value={productForm.shape} onChange={(e) => setProductForm({ ...productForm, shape: e.target.value })} />
          <input placeholder="Unit" value={productForm.unit} onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })} />
          <input placeholder="Price" type="number" value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: e.target.value })} />
          <input placeholder="Stock" type="number" value={productForm.stock_qty} onChange={(e) => setProductForm({ ...productForm, stock_qty: e.target.value })} />
          <label className="toggle-row"><input type="checkbox" checked={Boolean(productForm.active)} onChange={(e) => setProductForm({ ...productForm, active: e.target.checked })} /> Active</label>
          <button type="submit">{editingProductId ? 'Update Product' : 'Add Product'}</button>
          {editingProductId && <button type="button" onClick={onCancel}>Cancel</button>}
        </form>
      )}
      <div className="product-list">
        {products.map((product) => (
          <div className="product-row" key={product.id}>
            <strong>{product.sku}</strong>
            <span>{product.name}</span>
            <small>{[product.category, product.grade, product.size, product.shape].filter(Boolean).join(' | ') || 'No attributes'}</small>
            {product.custom_fields && Object.keys(product.custom_fields).length > 0 && <small className="custom-field-line">Custom: {Object.entries(product.custom_fields).slice(0, 3).map(([key, value]) => `${key}: ${value}`).join(' | ')}</small>}
            <b>{currency || 'INR'} {Number(product.price || 0).toLocaleString('en-IN')}</b>
            <em>{Number(product.stock_qty || 0).toLocaleString('en-IN')} {product.unit || 'pcs'}</em>
            <i className={product.active ? 'ok' : 'warn'}>{product.active ? 'Active' : 'Inactive'}</i>
            {canManage && (
              <div className="doc-actions">
                <button type="button" onClick={() => onEdit(product)}>Edit</button>
                <button type="button" onClick={() => onDelete(product)}>Delete</button>
              </div>
            )}
          </div>
        ))}
        {!products.length && <div className="empty-list"><strong>No products found</strong><span>Add products so the bot can match inventory and prepare quotations.</span></div>}
      </div>
    </section>
  )
}

function QuotesPage({ quotations, onStatus, onConvert, onDownload, onSendManagerApproval, onSendCustomer }) {
  return (
    <section className="table-module">
      <div className="module-title"><FileText size={18} /><h3>Quotations</h3></div>
      {!quotations.length && <EmptyState title="No quotations" text="Quotation drafts created from WhatsApp enquiries will appear here." />}
      {quotations.map((quote) => (
        <div className="doc-row" key={quote.id}>
          <strong>{quote.quote_no}</strong>
          <span>
            {quote.contact_name || 'Customer'} - {quote.status}
            {quote.manager_approval_status && quote.manager_approval_status !== 'not_requested'
              ? ` / Manager: ${quote.manager_approval_status}`
              : ''}
          </span>

          {quote.manager_rejection_reason && (
            <small className="quote-reason">Manager reason: {quote.manager_rejection_reason}</small>
          )}

          <b>{formatMoney(quote.amount)}</b>

          <div className="doc-actions">
            {quote.manager_approval_status !== 'pending' && quote.status !== 'customer_sent' && quote.status !== 'converted' && (
              <button type="button" onClick={() => onSendManagerApproval(quote)}>Manager Approval</button>
            )}

            {quote.manager_approval_status === 'approved' && quote.status !== 'customer_sent' && (
              <button type="button" onClick={() => onSendCustomer(quote)}>Send Customer</button>
            )}

            <button type="button" onClick={() => onStatus(quote, 'lost')}>Lost</button>
            {quote.status === 'accepted' && quote.approval_status === 'customer_approved' && (
  <button type="button" onClick={() => onConvert(quote)}>Create Order</button>
)}
            <button type="button" onClick={() => onDownload(quote)}>Download</button>
          </div>
        </div>
      ))}
    </section>
  )
}

function OrdersPage({ orders, onUpdate, title = 'Orders' }) {
  return (
    <section className="table-module">
      <div className="module-title"><PackageCheck size={18} /><h3>{title}</h3></div>
      {!orders.length && <EmptyState title="No orders" text="Converted quotations and confirmed orders will appear here." />}
      {orders.map((order) => (
        <div className="doc-row" key={order.id}>
          <strong>{order.order_no}</strong>
          <span>{order.contact_name || 'Customer'} - Pay: {order.payment_status} - Dispatch: {order.dispatch_status}</span>
          <b>{formatMoney(order.amount)}</b>
          <div className="doc-actions">
            <button type="button" onClick={() => onUpdate(order, { payment_status: 'paid' })}>Paid</button>
            <button type="button" onClick={() => onUpdate(order, { dispatch_status: 'dispatched' })}>Dispatch</button>
            <button type="button" onClick={() => onUpdate(order, { status: 'closed' })}>Close</button>
          </div>
        </div>
      ))}
    </section>
  )
}

function UsersPage({ users, newUser, setNewUser, editingUserId, onCreate, onEdit, onCancel, onToggle, onDelete }) {
  const [activeUserView, setActiveUserView] = useState('list')
  const activeCount = users.filter((item) => item.active).length
  const inactiveCount = users.length - activeCount

  async function handleSubmit(event) {
    const saved = await onCreate(event)
    if (saved) setActiveUserView('list')
  }

  function handleEdit(userItem) {
    onEdit(userItem)
    setActiveUserView('form')
  }

  function handleCancel() {
    onCancel()
    setActiveUserView('list')
  }

  return (
    <section className="table-module users-module">
      <div className="module-title user-module-head">
        <div><Users size={18} /><h3>User Management</h3></div>
        <div className="user-summary">
          <span>{users.length} total</span>
          <span>{activeCount} active</span>
          <span>{inactiveCount} inactive</span>
        </div>
      </div>
      <div className="user-tabs">
        <button className={activeUserView === 'form' ? 'active' : ''} type="button" onClick={() => setActiveUserView('form')}>
          <UserPlus size={16} /> {editingUserId ? 'Edit User' : 'Add User'}
        </button>
        <button className={activeUserView === 'list' ? 'active' : ''} type="button" onClick={() => setActiveUserView('list')}>
          <Users size={16} /> User List
        </button>
      </div>

      {activeUserView === 'form' && (
        <form className="user-form user-form-panel" onSubmit={handleSubmit}>
          <div className="user-form-title">
            <strong>{editingUserId ? 'Edit existing user' : 'Create new user'}</strong>
            <span>{editingUserId ? 'Email stays locked for account identity.' : 'Add one team member with role-based access.'}</span>
          </div>
          <label>Name<input placeholder="Full name" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} /></label>
          <label>Email<input placeholder="name@company.com" value={newUser.email} disabled={Boolean(editingUserId)} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} /></label>
          <label>Password<input placeholder={editingUserId ? 'Leave blank to keep old password' : 'Temporary password'} value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} /></label>
          <label>Role<select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}><option value="sales">Sales</option><option value="manager">Manager</option><option value="admin">Admin</option></select></label>
          <div className="user-form-actions">
            <button className="user-action-primary" type="submit">{editingUserId ? <CheckCircle2 size={16} /> : <UserPlus size={16} />} {editingUserId ? 'Update User' : 'Create User'}</button>
            {editingUserId && <button className="user-action-neutral" type="button" onClick={handleCancel}><X size={16} /> Cancel</button>}
          </div>
        </form>
      )}

      {activeUserView === 'list' && (
        <div className="user-list-panel">
          {!users.length && <EmptyState title="No users" text="Create sales, manager, and admin users for this client." />}
          {!!users.length && (
            <div className="user-table">
              <div className="user-table-head">
                <span>User</span>
                <span>Email</span>
                <span>Role</span>
                <span>Status</span>
                <span>Actions</span>
              </div>
              {users.map((item) => (
                <div className="user-row" key={item.id}>
                  <div className="user-name-cell">
                    <strong>{item.name}</strong>
                    <small>ID: {String(item.id).slice(0, 8)}</small>
                  </div>
                  <span>{item.email}</span>
                  <b className={`role-badge role-${item.role}`}>{item.role}</b>
                  <i className={item.active ? 'status-active' : 'status-inactive'}>{item.active ? 'Active' : 'Inactive'}</i>
                  <div className="user-actions">
                    <button className="user-action-edit" type="button" onClick={() => handleEdit(item)}><Pencil size={15} /> Edit</button>
                    <button className={item.active ? 'user-action-pause' : 'user-action-enable'} type="button" onClick={() => onToggle(item)}>
                      {item.active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button className="user-action-delete" type="button" onClick={() => onDelete(item)}><Trash2 size={15} /> Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function AuditPage({ events }) {
  return (
    <section className="table-module">
      <div className="module-title"><Shield size={18} /><h3>Audit Log</h3></div>
      {!events.length && <EmptyState title="No audit events" text="System and user actions will appear here." />}
      {events.map((event) => (
        <div className="audit-row" key={event.id}>
          <strong>{event.action}</strong>
          <span>{event.actor_name || 'System'} - {event.entity_type}</span>
          <small>{new Date(event.created_at).toLocaleString()}</small>
        </div>
      ))}
    </section>
  )
}

function KnowledgeBaseManager() {
  const emptyKnowledge = { title: '', category: 'general', content: '', keywordsText: '', active: true }
  const [items, setItems] = useState([])
  const [form, setForm] = useState(emptyKnowledge)
  const [editingId, setEditingId] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function loadKnowledge() {
    const res = await api.get('/api/knowledge-base')
    setItems(res.data)
  }

  useEffect(() => {
    loadKnowledge().catch(() => setMessage('Unable to load knowledge base'))
  }, [])

  async function saveKnowledge(event) {
    event.preventDefault()
    setSaving(true)
    setMessage('')

    const payload = {
      title: form.title,
      category: form.category,
      content: form.content,
      keywords: fromCsv(form.keywordsText),
      active: Boolean(form.active),
    }

    try {
      if (editingId) {
        await api.patch(`/api/knowledge-base/${editingId}`, payload)
        setMessage('Knowledge updated')
      } else {
        await api.post('/api/knowledge-base', payload)
        setMessage('Knowledge added')
      }

      setForm(emptyKnowledge)
      setEditingId('')
      await loadKnowledge()
    } catch (err) {
      setMessage(err.response?.data?.error || 'Knowledge save failed')
    } finally {
      setSaving(false)
    }
  }

  function editKnowledge(item) {
    setEditingId(item.id)
    setForm({
      title: item.title || '',
      category: item.category || 'general',
      content: item.content || '',
      keywordsText: toCsv(item.keywords || []),
      active: item.active !== false,
    })
  }

  async function deactivateKnowledge(item) {
    await api.delete(`/api/knowledge-base/${item.id}`)
    setMessage('Knowledge deactivated')
    if (editingId === item.id) {
      setEditingId('')
      setForm(emptyKnowledge)
    }
    await loadKnowledge()
  }

  return (
    <section className="table-module">
      <div className="module-title"><FileText size={18} /><h3>Company Knowledge Base</h3></div>

      <form className="knowledge-form" onSubmit={saveKnowledge}>
        <input
          placeholder="Title, example: Payment Terms"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />

        <input
          placeholder="Category, example: payment / delivery / company"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        />

        <textarea
          placeholder="Write company-approved answer/policy here. Bot will use this only when relevant."
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
        />

        <input
          placeholder="Keywords comma separated, example: payment terms, advance, credit"
          value={form.keywordsText}
          onChange={(e) => setForm({ ...form, keywordsText: e.target.value })}
        />

        <label className="toggle-row">
          <input
            type="checkbox"
            checked={Boolean(form.active)}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          Active
        </label>

        <div className="doc-actions">
          {editingId && <button type="button" onClick={() => { setEditingId(''); setForm(emptyKnowledge) }}>Cancel Edit</button>}
          <button type="submit" disabled={saving}>{saving ? 'Saving...' : editingId ? 'Update Knowledge' : 'Add Knowledge'}</button>
        </div>

        {message && <small className="success-text">{message}</small>}
      </form>

      <div className="knowledge-list">
        {!items.length && <EmptyState title="No knowledge added" text="Add company FAQ, policies, delivery terms, payment terms, and safe bot answers here." />}

        {items.map((item) => (
          <div className="knowledge-row" key={item.id}>
            <strong>{item.title}</strong>
            <span>{item.category} | {item.active ? 'Active' : 'Inactive'}</span>
            <p>{item.content}</p>
            <small>Keywords: {(item.keywords || []).join(', ') || '-'}</small>
            <div className="doc-actions">
              <button type="button" onClick={() => editKnowledge(item)}>Edit</button>
              {item.active && <button type="button" onClick={() => deactivateKnowledge(item)}>Deactivate</button>}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function SettingsPage({ status, whatsappConfig, testMessage, setTestMessage, testResult, onTest, onMapPhone, simulator, setSimulator, onSimulate, customForm, setCustomForm, onSaveCustomization, settingsSaved, templates, templateForm, setTemplateForm, editingTemplateId, onSaveTemplate, onEditTemplate, onToggleTemplate, onCancelTemplateEdit, userRole, isProduction }) {
      const warnings = status?.warnings || []

  return (
        <div className="settings-stack">
      <section className="table-module">
        <div className="module-title"><Settings size={18} /><h3>Business Customization</h3></div>
        <form className="custom-form" onSubmit={onSaveCustomization}>
          <label>App Name<input value={customForm.appName} onChange={(e) => setCustomForm({ ...customForm, appName: e.target.value })} /></label>
          <label>Company Name<input value={customForm.companyName} onChange={(e) => setCustomForm({ ...customForm, companyName: e.target.value })} /></label>
          <label>Industry<input value={customForm.industry} onChange={(e) => setCustomForm({ ...customForm, industry: e.target.value })} /></label>
          <label>Theme Color<input type="color" value={customForm.primaryColor} onChange={(e) => setCustomForm({ ...customForm, primaryColor: e.target.value })} /></label>
          <label>Currency<input value={customForm.currency} onChange={(e) => setCustomForm({ ...customForm, currency: e.target.value })} /></label>
          <label>Quotation Prefix<input value={customForm.quotationPrefix} onChange={(e) => setCustomForm({ ...customForm, quotationPrefix: e.target.value })} /></label>
          <label>Order Prefix<input value={customForm.orderPrefix} onChange={(e) => setCustomForm({ ...customForm, orderPrefix: e.target.value })} /></label>
          <label>Labels<textarea value={customForm.labelsText} onChange={(e) => setCustomForm({ ...customForm, labelsText: e.target.value })} /></label>
          <label>Sales Stages<textarea value={customForm.stagesText} onChange={(e) => setCustomForm({ ...customForm, stagesText: e.target.value })} /></label>
          <label>Bot Greeting<textarea value={customForm.botGreeting} onChange={(e) => setCustomForm({ ...customForm, botGreeting: e.target.value })} /></label>
          <label>Handoff Keywords<textarea value={customForm.handoffKeywordsText} onChange={(e) => setCustomForm({ ...customForm, handoffKeywordsText: e.target.value })} /></label>
          <label>Inventory Fields<textarea value={customForm.inventoryFieldsText} onChange={(e) => setCustomForm({ ...customForm, inventoryFieldsText: e.target.value })} /></label>

          <label className="toggle-row"><input type="checkbox" checked={Boolean(customForm.botEnabled)} onChange={(e) => setCustomForm({ ...customForm, botEnabled: e.target.checked })} /> Enable Auto Bot</label>

          <div className="approval-settings-box">
            <strong>Quotation Approval Workflow</strong>
            <small>Customer quotation will go to manager first. Customer will receive it only after manager approval.</small>

            <label className="toggle-row">
              <input
                type="checkbox"
                checked={Boolean(customForm.quoteApprovalEnabled)}
                onChange={(e) => setCustomForm({ ...customForm, quoteApprovalEnabled: e.target.checked })}
              />
              Enable Manager Approval Before Customer Quote
            </label>

            <label>
              Manager Name
              <input
                value={customForm.quoteApprovalManagerName || ''}
                onChange={(e) => setCustomForm({ ...customForm, quoteApprovalManagerName: e.target.value })}
                placeholder="Example: Sales Manager"
              />
            </label>

            <label>
              Manager WhatsApp Number
              <input
                value={customForm.quoteApprovalManagerPhone || ''}
                onChange={(e) => setCustomForm({ ...customForm, quoteApprovalManagerPhone: e.target.value.replace(/\D/g, '') })}
                placeholder="Example: 919876543210"
              />
            </label>

            <label>
              Manager Approval Template Name
              <input
                value={customForm.quoteApprovalTemplateName || ''}
                onChange={(e) => setCustomForm({ ...customForm, quoteApprovalTemplateName: e.target.value })}
                placeholder="quote_manager_approval_request"
              />
            </label>

            <label>
              Manager Approval Template Language
              <input
                value={customForm.quoteApprovalTemplateLanguage || 'en'}
                onChange={(e) => setCustomForm({ ...customForm, quoteApprovalTemplateLanguage: e.target.value })}
                placeholder="en"
              />
            </label>

            <label>
              Customer Quote Template Name
              <input
                value={customForm.customerQuoteTemplateName || ''}
                onChange={(e) => setCustomForm({ ...customForm, customerQuoteTemplateName: e.target.value })}
                placeholder="quote_customer_approval_request"
              />
            </label>

            <label>
              Customer Quote Template Language
              <input
                value={customForm.customerQuoteTemplateLanguage || 'en'}
                onChange={(e) => setCustomForm({ ...customForm, customerQuoteTemplateLanguage: e.target.value })}
                placeholder="en"
              />
            </label>
                        <label>
              Order Acknowledgement Template Name
              <input
                value={customForm.orderAcknowledgementTemplateName || ''}
                onChange={(e) => setCustomForm({ ...customForm, orderAcknowledgementTemplateName: e.target.value })}
                placeholder="order_acknowledgement"
              />
            </label>

            <label>
              Order Acknowledgement Template Language
              <input
                value={customForm.orderAcknowledgementTemplateLanguage || 'en'}
                onChange={(e) => setCustomForm({ ...customForm, orderAcknowledgementTemplateLanguage: e.target.value })}
                placeholder="en"
              />
            </label>
          </div>

          <button type="submit">Save Customization</button>
          {settingsSaved && <small className="success-text">{settingsSaved}</small>}
        </form>
      </section>

      <KnowledgeBaseManager />

      <section className="table-module">
        <div className="module-title"><Settings size={18} /><h3>WhatsApp Setup</h3></div>
<div className="setup-grid">
  <span className={whatsappConfig?.accessTokenSet ? 'ok' : 'warn'}>Access token</span>
  <span className={whatsappConfig?.phoneNumberIdSet ? 'ok' : 'warn'}>Phone number ID</span>
  <span className={whatsappConfig?.phoneNumberMapped ? 'ok' : 'warn'}>Phone mapped</span>
  <span className={whatsappConfig?.verifyTokenSet ? 'ok' : 'warn'}>Verify token</span>
  <span className={whatsappConfig?.appSecretSet || !whatsappConfig?.webhookSignatureRequired ? 'ok' : 'warn'}>App secret</span>
  <span className={whatsappConfig?.testNumbersSet || status?.whatsappTestNumbersSet ? 'ok' : 'warn'}>Test numbers</span>
</div>
        {whatsappConfig?.phoneNumberMappedTenantSlug && (
          <p className="setup-copy">Incoming messages map to tenant: {whatsappConfig.phoneNumberMappedTenantSlug}</p>
        )}
{userRole === 'admin' && whatsappConfig?.phoneNumberIdSet && !whatsappConfig?.phoneNumberMappedToCurrentTenant && (
  <div className="inline-actions">
    <span className="setup-copy">Phone number ID is not mapped to this company.</span>
    <button type="button" onClick={onMapPhone}>Map Phone To This Company</button>
  </div>
)}

        {warnings.length > 0 && (
          <div className="warning-list">
            {warnings.map((warning) => <span key={warning}>{warning}</span>)}
          </div>
        )}
        <p className="setup-copy">Webhook: {whatsappConfig?.callbackUrl || '-'}</p>
        {userRole === 'admin' ? (
  <>
    <form className="dual-form" onSubmit={onTest}>
      <input placeholder="Customer number" value={testMessage.to} onChange={(e) => setTestMessage({ ...testMessage, to: e.target.value })} />
      <input placeholder="Test message inside 24-hour window only" value={testMessage.text} onChange={(e) => setTestMessage({ ...testMessage, text: e.target.value })} />
      <button type="submit">Send Test</button>
    </form>
    <small className="setup-copy">Free-form test messages are allowed only inside the customer&apos;s 24-hour WhatsApp reply window.</small>
    {testResult && <small>{testResult}</small>}
  </>
) : (
  <p className="setup-copy">WhatsApp test message is admin-only.</p>
)}
        {!isProduction && (
          <>
            <div className="module-title"><MessageCircle size={18} /><h3>Local Inbound Test</h3></div>
            <form className="sim-form" onSubmit={onSimulate}>
              <input placeholder="Customer number" value={simulator.phone} onChange={(e) => setSimulator({ ...simulator, phone: e.target.value })} />
              <input placeholder="Customer name" value={simulator.name} onChange={(e) => setSimulator({ ...simulator, name: e.target.value })} />
              <textarea placeholder="Customer WhatsApp message" value={simulator.message} onChange={(e) => setSimulator({ ...simulator, message: e.target.value })} />
              <button type="submit">Capture Message</button>
            </form>
          </>
        )}
      </section>
            <section className="table-module">
        <div className="module-title"><MessageCircle size={18} /><h3>Approved WhatsApp Templates</h3></div>
        <small className="setup-copy">
          Add only templates that are already approved in Meta WhatsApp Manager. This does not create templates inside Meta.
        </small>

        <form className="custom-form" onSubmit={onSaveTemplate}>
          <label>
            Template Name
            <input
              placeholder="quotation_followup"
              value={templateForm.name}
              onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
            />
          </label>

          <label>
            Language
            <input
              placeholder="en_US"
              value={templateForm.language}
              onChange={(e) => setTemplateForm({ ...templateForm, language: e.target.value })}
            />
          </label>

          <label>
            Body Preview
            <textarea
              placeholder="Your quotation is ready. Please confirm."
              value={templateForm.body}
              onChange={(e) => setTemplateForm({ ...templateForm, body: e.target.value })}
            />
          </label>

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={Boolean(templateForm.active)}
              onChange={(e) => setTemplateForm({ ...templateForm, active: e.target.checked })}
            />
            Active
          </label>

          <div className="user-form-actions">
            <button className="user-action-primary" type="submit">
              {editingTemplateId ? 'Update Template' : 'Save Template'}
            </button>
            {editingTemplateId && (
              <button className="user-action-neutral" type="button" onClick={onCancelTemplateEdit}>
                Cancel
              </button>
            )}
          </div>
        </form>

        {!templates.length && <EmptyState title="No templates" text="Add approved Meta templates for expired 24-hour conversations." />}

        {!!templates.length && (
          <div className="user-table">
            <div className="user-table-head">
              <span>Name</span>
              <span>Language</span>
              <span>Status</span>
              <span>Body</span>
              <span>Actions</span>
            </div>

            {templates.map((template) => (
              <div className="user-row" key={template.id}>
                <div className="user-name-cell">
                  <strong>{template.name}</strong>
                  <small>ID: {String(template.id).slice(0, 8)}</small>
                </div>
                <span>{template.language}</span>
                <i className={template.active ? 'status-active' : 'status-inactive'}>
                  {template.active ? 'Active' : 'Inactive'}
                </i>
                <span>{template.body}</span>
                <div className="user-actions">
                  <button className="user-action-edit" type="button" onClick={() => onEditTemplate(template)}>
                    Edit
                  </button>
                  <button className={template.active ? 'user-action-pause' : 'user-action-enable'} type="button" onClick={() => onToggleTemplate(template)}>
                    {template.active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default App
