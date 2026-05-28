import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import {
  BarChart3,
  Activity,
  ArrowRight,
  Boxes,
  Building2,
  CalendarClock,
  ChevronDown,
  ClipboardList,
  Code2,
  Copy,
  CreditCard,
  LayoutDashboard,
  Headphones,
  HelpCircle,
  Info,
  Link2,
  Menu,
  Megaphone,
  PhoneCall,
  Plus,
  Save,
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
  Upload,
  Wallet,
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
  ftpAccessEnabled: false,
  twoFactorEnabled: false,
  wabaMmLiteEnabled: false,
  wabaHealthyRetryEnabled: false,
  wabaConversionEventsEnabled: false,
  billingBusinessName: '',
  billingGstNumber: '',
  billingPanNumber: '',
  billingCountry: 'India',
  billingState: '',
  billingCity: '',
  billingAddress: '',
  billingPinCode: '',
  billingEmail: '',
  billingContactNumber: '',
  voiceCallsEnabled: false,
  voiceCallbackEnabled: false,
  voiceDisplayCallButtons: true,
  voiceCallHoursMode: 'specific',
  voiceTimeZone: 'Asia/Kolkata (GMT+05:30)',
  voiceWeeklyHours: null,
  voiceUnavailableHours: [],
  inboxAutoAssign: false,
}

const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DEFAULT_VOICE_WEEKLY_HOURS = WEEK_DAYS.reduce((acc, day) => ({
  ...acc,
  [day]: { enabled: true, slots: [{ start: '00:00', end: '23:59' }] },
}), {})
const DEFAULT_BILLING_FIELDS = {
  billingBusinessName: '',
  billingGstNumber: '',
  billingPanNumber: '',
  billingCountry: 'India',
  billingState: '',
  billingCity: '',
  billingAddress: '',
  billingPinCode: '',
  billingEmail: '',
  billingContactNumber: '',
}

function buildAppSettingsPayload(form) {
  return {
    ...form,
    labels: fromCsv(form.labelsText),
    stages: fromCsv(form.stagesText),
    handoffKeywords: fromCsv(form.handoffKeywordsText),
    inventoryFields: fromCsv(form.inventoryFieldsText),
  }
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

function PublicWebsite({ onAuthenticate, appSettings }) {
  const [mode, setMode] = useState('')
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [registerForm, setRegisterForm] = useState({
    companyName: '',
    industry: '',
    adminName: '',
    email: '',
    password: '',
    confirmPassword: '',
    acceptedPolicy: false,
  })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const platformName = appSettings.appName || 'BOS WhatsApp CRM'

  const capabilities = [
    { icon: MessageCircle, title: 'Meta WhatsApp Setup', copy: 'Connect an official WhatsApp Business account through secure Embedded Signup.' },
    { icon: Inbox, title: 'Shared Team Inbox', copy: 'Organize customer conversations, assignment and reply-window controls in one place.' },
    { icon: ClipboardList, title: 'Templates & Quotations', copy: 'Manage approved templates and transform enquiries into controlled sales documents.' },
    { icon: ShoppingCart, title: 'Orders & Follow-up', copy: 'Track converted orders, payment progress and dispatch activity from the same workflow.' },
    { icon: Users, title: 'Contacts & Customers', copy: 'Maintain tenant-isolated customer history, labels, stages and ownership.' },
    { icon: Settings, title: 'Business Controls', copy: 'Configure business profile, branding, automations and monitoring settings.' },
    { icon: UserRound, title: 'Team Access', copy: 'Keep administrators, managers and sales users inside their permitted workspace.' },
    { icon: Shield, title: 'Audit & Compliance', copy: 'Track operational activity while enforcing opt-out and reply-window protection.' },
  ]

  function openAccess(nextMode) {
    setMode(nextMode)
    setError('')
  }

  useEffect(() => {
    if (!mode) return undefined

    function closeOnEscape(event) {
      if (event.key === 'Escape') setMode('')
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [mode])

  async function submitLogin(event) {
    event.preventDefault()
    if (submitting) return
    setError('')
    setSubmitting(true)

    try {
      const res = await api.post('/api/auth/login', {
        email: loginForm.email.trim().toLowerCase(),
        password: loginForm.password,
      })
      onAuthenticate(res.data.user)
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function submitRegistration(event) {
    event.preventDefault()
    if (submitting) return
    if (registerForm.password !== registerForm.confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setError('')
    setSubmitting(true)

    try {
      const res = await api.post('/api/auth/register', {
        companyName: registerForm.companyName.trim(),
        industry: registerForm.industry.trim(),
        adminName: registerForm.adminName.trim(),
        email: registerForm.email.trim().toLowerCase(),
        password: registerForm.password,
        acceptedPolicy: registerForm.acceptedPolicy,
      })
      onAuthenticate(res.data.user)
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="public-site">
      <header className="public-header">
        <a className="public-brand" href="#home" aria-label={`${platformName} home`}>
          <span><MessageCircle size={26} /></span>
          <div>
            <strong>{platformName}</strong>
            <small>Business Automation Platform</small>
          </div>
        </a>
        <nav className="public-nav">
          <a href="#home">Home</a>
          <a href="#capabilities">Features</a>
          <a href="#workflow">How it works</a>
          <a href="#security">Security</a>
        </nav>
        <div className="public-actions">
          <button className="public-ghost" type="button" onClick={() => openAccess('login')}>Login</button>
          <button className="public-primary" type="button" onClick={() => openAccess('register')}>Register</button>
        </div>
      </header>

      <section className="public-hero" id="home">
        <div className="hero-copy">
          <span className="hero-kicker"><Shield size={15} /> WhatsApp Business Management Platform</span>
          <h1>Manage WhatsApp sales, customers and operations in one place</h1>
          <p>
            Connect Meta WhatsApp, manage customer conversations, create templates, track
            quotations and orders, and run your business with a secure professional workspace.
          </p>
          <div className="hero-actions">
            <a className="public-primary" href="#capabilities">Explore features <ArrowRight size={18} /></a>
            <a className="public-ghost" href="#workflow">See how it works</a>
          </div>
          <div className="hero-trust">
            <span><CheckCircle2 size={16} /> Tenant-isolated data</span>
            <span><CheckCircle2 size={16} /> Backend-only Meta tokens</span>
            <span><CheckCircle2 size={16} /> Policy-aware messaging</span>
          </div>
        </div>
        <div className="hero-stage">
          <div className="hero-console" aria-hidden="true">
            <div className="console-top"><span /><span /><span /><small>Operations command center</small></div>
            <div className="console-status">
              <div><strong>Connected</strong><span>Meta Cloud API</span></div>
              <div><strong>24h</strong><span>Reply guard</span></div>
              <div><strong>Secure</strong><span>Tenant access</span></div>
            </div>
            <div className="console-layout">
              <div className="console-menu">
                <span className="active">Inbox</span>
                <span>Contacts</span>
                <span>Quotes</span>
                <span>Orders</span>
              </div>
              <div className="console-thread">
                <p>New enquiry received</p>
                <b>Need price for 250 units</b>
                <small>Assigned to Sales Team</small>
                <div className="console-tags"><span>Quotation</span><span>24h Open</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="public-metrics" aria-label="Platform value">
        <article><strong>1</strong><span>Secure shared workspace for every business</span></article>
        <article><strong>24h</strong><span>Customer service window controls</span></article>
        <article><strong>360</strong><span>Customer journey from inbox to order</span></article>
        <article><strong>Meta</strong><span>Official WhatsApp Cloud API connection</span></article>
      </section>

      <section className="public-section" id="capabilities">
        <div className="section-heading">
          <span>Features</span>
          <h2>Powerful tools to operate your customer communication</h2>
          <p>Every feature is organized around real business work, team accountability and policy-safe WhatsApp messaging.</p>
        </div>
        <div className="capability-grid">
          {capabilities.map(({ icon: Icon, title, copy }) => (
            <article key={title}>
              <Icon size={22} />
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="public-workflow" id="workflow">
        <div className="section-heading">
          <span>Workflow</span>
          <h2>From connection to customer conversion</h2>
        </div>
        <div className="workflow-steps">
          <article><b>01</b><h3>Register business</h3><p>Create a protected company workspace and admin account.</p></article>
          <article><b>02</b><h3>Connect Meta</h3><p>Use official Embedded Signup to connect your WhatsApp Business account.</p></article>
          <article><b>03</b><h3>Configure operations</h3><p>Set business profile, templates, users and automation controls.</p></article>
          <article><b>04</b><h3>Manage customers</h3><p>Handle inbox, quotations and orders with policy-safe messaging.</p></article>
        </div>
      </section>

      <section className="security-showcase" id="security">
        <div className="security-panel">
          <span className="hero-kicker"><Shield size={15} /> Security by design</span>
          <h2>Built for responsible customer communication</h2>
          <p className="security-description">Your team gets a modern workspace without compromising tenant isolation or WhatsApp policy controls.</p>
          <div className="security-points">
            <p><CheckCircle2 size={17} /> Every business operates inside an isolated tenant workspace.</p>
            <p><CheckCircle2 size={17} /> Meta access tokens stay encrypted on backend storage only.</p>
            <p><CheckCircle2 size={17} /> Free-form replies follow the WhatsApp 24-hour service window.</p>
            <p><CheckCircle2 size={17} /> Opt-out customers are protected from unauthorized messaging.</p>
          </div>
        </div>
        <div className="security-visual" aria-hidden="true">
          <div><Shield size={28} /><strong>Protected Operations</strong><small>Role access and audit history</small></div>
          <span><CheckCircle2 size={18} /> Tenant isolated records</span>
          <span><CheckCircle2 size={18} /> Encrypted token storage</span>
          <span><CheckCircle2 size={18} /> Opt-out enforcement</span>
          <span><CheckCircle2 size={18} /> Template-aware messaging</span>
        </div>
      </section>

      <footer className="public-footer">
        <div className="public-brand">
          <span><MessageCircle size={23} /></span>
          <strong>{platformName}</strong>
        </div>
        <p>WhatsApp Business operations with tenant-aware security and policy controls.</p>
      </footer>

      {mode && (
        <div className="access-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setMode('') }}>
          <div className="access-card access-dialog" role="dialog" aria-modal="true" aria-labelledby="access-title">
            <button className="access-close" type="button" onClick={() => setMode('')} aria-label="Close account access"><X size={19} /></button>
            {mode === 'login' ? (
              <form className="access-form" onSubmit={submitLogin}>
                <span className="access-label">Secure Login</span>
                <h2 id="access-title">Welcome back</h2>
                <p>Access your secured business operations dashboard.</p>
                <label>Work email<input type="email" autoComplete="email" required value={loginForm.email} onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })} placeholder="admin@company.com" /></label>
                <label>Password<input type="password" autoComplete="current-password" required value={loginForm.password} onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })} placeholder="Enter your password" /></label>
                {error && <p className="error-text">{error}</p>}
                <button className="public-primary" type="submit" disabled={submitting}>
                  {submitting ? 'Signing in...' : 'Continue securely'} <ArrowRight size={17} />
                </button>
                <small>Session access is managed securely by the backend.</small>
              </form>
            ) : (
              <form className="access-form register-form" onSubmit={submitRegistration}>
                <span className="access-label">New Business Workspace</span>
                <h2 id="access-title">Create your account</h2>
                <p>Start with an administrator account for your business.</p>
                <label>Business name<input required value={registerForm.companyName} onChange={(event) => setRegisterForm({ ...registerForm, companyName: event.target.value })} placeholder="Your business name" /></label>
                <label>Industry<input value={registerForm.industry} onChange={(event) => setRegisterForm({ ...registerForm, industry: event.target.value })} placeholder="Manufacturing, Retail, Services..." /></label>
                <label>Administrator name<input required autoComplete="name" value={registerForm.adminName} onChange={(event) => setRegisterForm({ ...registerForm, adminName: event.target.value })} placeholder="Full name" /></label>
                <label>Work email<input required type="email" autoComplete="email" value={registerForm.email} onChange={(event) => setRegisterForm({ ...registerForm, email: event.target.value })} placeholder="admin@company.com" /></label>
                <div className="register-passwords">
                  <label>Password<input required type="password" autoComplete="new-password" value={registerForm.password} onChange={(event) => setRegisterForm({ ...registerForm, password: event.target.value })} placeholder="Minimum 12 characters" /></label>
                  <label>Confirm password<input required type="password" autoComplete="new-password" value={registerForm.confirmPassword} onChange={(event) => setRegisterForm({ ...registerForm, confirmPassword: event.target.value })} placeholder="Repeat password" /></label>
                </div>
                <small>Use 12+ characters with uppercase, lowercase, a number and a symbol.</small>
                <label className="policy-consent">
                  <input type="checkbox" checked={registerForm.acceptedPolicy} onChange={(event) => setRegisterForm({ ...registerForm, acceptedPolicy: event.target.checked })} />
                  <span>I will send WhatsApp communications only to opted-in customers and follow Meta messaging policies.</span>
                </label>
                {error && <p className="error-text">{error}</p>}
                <button className="public-primary" type="submit" disabled={submitting}>
                  {submitting ? 'Creating workspace...' : 'Create workspace'} <ArrowRight size={17} />
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </main>
  )
}

function WhatsAppConnectGate({ onboarding, connecting, onComplete, onLogout }) {
  const signupInfoRef = useRef({})
  const authCodeRef = useRef('')
  const signupTimeoutRef = useRef(null)

  const metaAppId = onboarding?.metaAppId || import.meta.env.VITE_META_APP_ID || ''
  const configId = onboarding?.embeddedSignupConfigId || import.meta.env.VITE_META_EMBEDDED_SIGNUP_CONFIG_ID || ''

  const hasRealMetaAppId = Boolean(metaAppId && !metaAppId.startsWith('your_') && !metaAppId.startsWith('your-'))
  const hasRealConfigId = Boolean(configId && !configId.startsWith('your_') && !configId.startsWith('your-'))

  const setupMessage = !hasRealMetaAppId
    ? 'Platform Meta setup pending hai. Platform owner ko Meta App ID configure karna hoga; client ko backend access ki zarurat nahi hai.'
    : !hasRealConfigId
      ? 'Platform Meta setup pending hai. Platform owner ko Embedded Signup Configuration ID configure karna hoga; client ko backend access ki zarurat nahi hai.'
      : ''

  function clearSignupTimeout() {
    if (signupTimeoutRef.current) {
      window.clearTimeout(signupTimeoutRef.current)
      signupTimeoutRef.current = null
    }
  }

  async function completeIfReady(nextInfo = {}) {
    const code = authCodeRef.current || ''
    const phoneNumberId = nextInfo.phoneNumberId || signupInfoRef.current.phoneNumberId || ''
    const wabaId = nextInfo.wabaId || signupInfoRef.current.wabaId || ''

    if (!code || !phoneNumberId || !wabaId) return false

    clearSignupTimeout()

    await onComplete({
      code,
      phoneNumberId,
      wabaId,
    })

    return true
  }

  useEffect(() => {
    function handleEmbeddedSignupMessage(event) {
      let host

      try {
        host = new URL(event.origin).hostname
      } catch {
        return
      }

      if (host !== 'facebook.com' && !host.endsWith('.facebook.com')) return

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
        const nextInfo = {
          phoneNumberId:
            payload.data?.phone_number_id ||
            payload.data?.phoneNumberId ||
            payload.data?.phone_number?.id ||
            payload.data?.phoneNumber?.id ||
            '',
          wabaId:
            payload.data?.waba_id ||
            payload.data?.wabaId ||
            payload.data?.whatsapp_business_account_id ||
            payload.data?.whatsappBusinessAccountId ||
            '',
          businessId:
            payload.data?.business_id ||
            payload.data?.businessId ||
            '',
        }

        signupInfoRef.current = nextInfo

        completeIfReady(nextInfo).catch((error) => {
          console.error('Embedded signup completion failed:', error)
        })
      }

      if (payload.event === 'CANCEL') {
        clearSignupTimeout()
        alert('Meta signup was cancelled.')
      }

      if (payload.event === 'ERROR') {
        clearSignupTimeout()
        console.error('WA Embedded Signup returned an error event')
        alert(payload.data?.error_message || payload.data?.message || 'Meta signup failed.')
      }
    }

    window.addEventListener('message', handleEmbeddedSignupMessage)

    return () => {
      clearSignupTimeout()
      window.removeEventListener('message', handleEmbeddedSignupMessage)
    }
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
    authCodeRef.current = ''
    clearSignupTimeout()

    window.FB.login((response) => {
      const code = response?.authResponse?.code || ''

      if (!code) {
        clearSignupTimeout()
        alert('Meta signup was cancelled or authorization failed.')
        return
      }

      authCodeRef.current = code

      completeIfReady().catch((error) => {
        console.error('Embedded signup completion failed:', error)
      })

      signupTimeoutRef.current = window.setTimeout(() => {
        const phoneNumberId = signupInfoRef.current.phoneNumberId || ''
        const wabaId = signupInfoRef.current.wabaId || ''

        if (!phoneNumberId || !wabaId) {
          console.error('WA Embedded Signup completed without required phone or WABA identifiers')

          alert('Meta signup completed but phone number ID / WABA ID was not received. Please click Finish in the Meta popup. If it still fails, check Embedded Signup configuration/session info version.')
        }
      }, 12000)
    }, {
      config_id: configId,
      response_type: 'code',
      override_default_response_type: true,
      extras: {
        feature: 'whatsapp_embedded_signup',
        featureType: 'whatsapp_business_app_onboarding',
        sessionInfoVersion: '3',
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
  const [expandedSuiteMenu, setExpandedSuiteMenu] = useState('sendMessage')
  const [expandedSuiteSubmenu, setExpandedSuiteSubmenu] = useState('')
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
  const [templateSyncing, setTemplateSyncing] = useState(false)
  const [drafts, setDrafts] = useState([])
  const [products, setProducts] = useState([])
  const [quotations, setQuotations] = useState([])
  const [orders, setOrders] = useState([])
  const [whatsappConfig, setWhatsappConfig] = useState(null)
  const [whatsappOnboarding, setWhatsappOnboarding] = useState(null)
  const [whatsappHealth, setWhatsappHealth] = useState(null)
  const [connectingWhatsApp, setConnectingWhatsApp] = useState(false)
  const [assignmentHistory, setAssignmentHistory] = useState([])
  const [timeline, setTimeline] = useState([])
  const [auditEvents, setAuditEvents] = useState([])
  const [webhookEvents, setWebhookEvents] = useState([])
  const [webhookActionLoading, setWebhookActionLoading] = useState('')
  const [outboundEvents, setOutboundEvents] = useState([])
  const [outboundActionLoading, setOutboundActionLoading] = useState('')
  const [optOutContacts, setOptOutContacts] = useState([])
  const [optOutActionLoading, setOptOutActionLoading] = useState('')
  const [salesWorkspaceTab, setSalesWorkspaceTab] = useState('quotes')
  const [controlCenterTab, setControlCenterTab] = useState('settings')
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
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
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

  const navigationGroups = useMemo(() => {
    if (isSuperAdminUser) {
      return [
        {
          label: 'Platform',
          items: [
            { id: 'platformTenants', label: 'Clients', icon: Building2 },
            { id: 'platformStatus', label: 'Status', icon: Activity },
          ],
        },
        {
          label: 'Client Preview',
          items: [
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'inbox', label: 'Inbox', icon: Inbox },
            { id: 'salesWorkspace', label: 'Sales Workspace', icon: ClipboardList },
          ],
        },
      ]
    }

    const groups = [
      {
        label: 'Overview',
        items: [
          { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
          { id: 'inbox', label: 'Inbox', icon: Inbox },
        ],
      },
      {
        label: 'Sales',
        items: [
          { id: 'new', label: 'Enquiries', icon: Bell },
          { id: 'sales', label: 'Pipeline', icon: Activity },
          { id: 'salesWorkspace', label: 'Sales Workspace', icon: ClipboardList },
          { id: 'inventory', label: 'Inventory', icon: Boxes },
        ],
      },
      {
        label: 'Automation',
        items: [
          { id: 'bot', label: 'Automation Studio', icon: Sparkles },
        ],
      },
    ]

    if (user?.role === 'admin') {
      groups[2].items.unshift({ id: 'connectWhatsApp', label: 'Meta WhatsApp Setup', icon: MessageCircle })
    }

    if (canMonitor) {
      const administrationItems = [
        { id: 'controlCenter', label: 'Control Center', icon: Settings },
      ]
      if (user?.role === 'admin') administrationItems.push({ id: 'users', label: 'Team & Roles', icon: Users })
      groups.push({ label: 'Administration', items: administrationItems })
    }

    return groups
  }, [canMonitor, isSuperAdminUser, user?.role])

  const suiteNavigation = useMemo(() => [
    { id: 'connectedAccounts', label: 'Connected Accounts', icon: Link2, page: user?.role === 'admin' ? 'connectWhatsApp' : 'connectedAccounts' },
    { id: 'inbox', label: 'Inbox', icon: Inbox, page: 'inbox' },
    {
      id: 'sendMessage',
      label: 'Send Message',
      icon: MessageCircle,
      children: [
        { id: 'sendSingle', label: 'Single', icon: Send },
        { id: 'sendBulk', label: 'Bulk Message', icon: Megaphone },
        { id: 'sendCanned', label: 'Canned Message', icon: Inbox },
      ],
    },
    {
      id: 'reports',
      label: 'Reports',
      icon: ClipboardList,
      children: [
        { id: 'dashboard', label: 'Messages', icon: MessageCircle },
        { id: 'campaignReports', label: 'Campaigns', icon: Megaphone },
        { id: 'callingReports', label: 'Calling Reports', icon: PhoneCall },
        { id: 'chatbotReports', label: 'Chatbot Executions', icon: Bot },
        { id: 'orders', label: 'Catalog Orders', icon: ShoppingCart },
        { id: 'paymentTransactions', label: 'Payment Transactions', icon: CreditCard },
        {
          id: 'scheduledItems',
          label: 'Scheduled Items',
          icon: CalendarClock,
          children: [
            { id: 'scheduledSingleMessages', label: 'Single Messages', icon: MessageCircle },
            { id: 'scheduledCampaigns', label: 'Campaigns', icon: Megaphone },
            { id: 'scheduledChatbots', label: 'Chatbots', icon: Bot },
          ],
        },
        { id: 'analytics', label: 'Analytics', icon: BarChart3 },
      ],
    },
    {
      id: 'money',
      label: 'Money',
      icon: Wallet,
      children: [
        { id: 'creditCenter', label: 'Credit Center', icon: CreditCard },
        { id: 'subscriptionPlan', label: 'Subscription Plan', icon: ClipboardList },
        { id: 'whatsappCredits', label: 'WhatsApp Credits', icon: MessageCircle },
        { id: 'aiCredits', label: 'AI Credits', icon: Sparkles },
      ],
    },
    {
      id: 'automation',
      label: 'Automation',
      icon: Bot,
      children: [
        { id: 'bot', label: 'Advanced Chatbot', icon: Bot },
        { id: 'basicChatbot', label: 'Basic Chatbot', icon: MessageCircle },
        { id: 'drips', label: 'Drips', icon: Megaphone, badge: 'New' },
        { id: 'settings', label: 'Canned Messages', icon: Inbox },
      ],
    },
    {
      id: 'contact',
      label: 'Contact',
      icon: Users,
      children: [
        { id: 'contactsList', label: 'Contacts List', icon: Users },
        { id: 'settings', label: 'Contact Settings', icon: Settings },
        { id: 'optOuts', label: 'Blocked Contacts', icon: Shield },
        { id: 'contactAddresses', label: 'Contact Addresses', icon: Building2 },
      ],
    },
    {
      id: 'whatsappItems',
      label: 'WhatsApp Items',
      icon: MessageCircle,
      children: [
        { id: 'settings', label: 'Templates', icon: FileText },
        {
          id: 'catalogs',
          label: 'Catalogs',
          icon: ShoppingCart,
          children: [
            { id: 'inventory', label: 'Products / Items', icon: Boxes },
            { id: 'catalogSettings', label: 'Catalog Settings', icon: Settings },
            { id: 'catalogManager', label: 'Catalog Manager (Beta)', icon: ShoppingCart },
          ],
        },
        { id: 'flows', label: 'Flows', icon: Activity },
        { id: 'paymentConfigurations', label: 'Payment Configurations', icon: CreditCard },
        { id: 'whatsappGroups', label: 'WhatsApp Groups', icon: Users },
      ],
    },
    {
      id: 'integrationsUtilities',
      label: 'Integrations & Utilities',
      icon: Sparkles,
      children: [
        { id: 'integrations', label: 'Integrations', icon: Sparkles },
        { id: 'openaiIntegration', label: 'ChatGPT / OpenAI', icon: Bot },
        { id: 'googleSheets', label: 'Google Sheets', icon: ClipboardList },
        {
          id: 'developer',
          label: 'Developer',
          icon: Code2,
          children: [
            { id: 'apiKeys', label: 'API Keys', icon: Code2 },
            { id: 'webhooks', label: 'Webhooks', icon: Activity },
            { id: 'apiDocumentation', label: 'API Documentation', icon: FileText },
          ],
        },
        { id: 'cloneItems', label: 'Clone Items', icon: Copy },
        { id: 'chatLink', label: 'WhatsApp Chat Link', icon: Link2 },
        { id: 'widget', label: 'WhatsApp Widget', icon: MessageCircle },
        { id: 'templateMatchLogs', label: 'Template Match Logs', icon: ClipboardList },
      ],
    },
    { id: 'controlCenter', label: 'Settings', icon: Settings, page: 'settings' },
  ], [user?.role])

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

  async function enterClientCrm(tenantId, targetPage = 'dashboard') {
    if (!tenantId) {
      notify('Select a client company first', 'error')
      return
    }

    try {
      const res = await api.post(`/api/platform/tenants/${tenantId}/enter-crm`)
      notify(`Entered ${res.data.tenant?.name || 'client'} CRM for testing`)

      setUser(res.data.user)
      setActivePage(targetPage)
      setSelectedPlatformTenantId('')
      setPlatformTenants([])
      setPlatformStatus(null)
      setSelectedId(null)
      setMessages([])
      setConversations([])
      await loadAll()
    } catch (err) {
      notify(apiErrorMessage(err, 'Unable to enter client CRM'), 'error')
    }
  }

  async function removeClientAccess(tenant) {
    if (!tenant?.id) {
      notify('Select a client company first', 'error')
      return
    }

    const confirmed = window.confirm(
      `Remove access for ${tenant.name}?\n\nThis will suspend the client, deactivate all client users, and disable WhatsApp account mapping. The client will not be able to login. Existing data will be preserved for audit/compliance.`
    )

    if (!confirmed) return

    try {
      await api.post(`/api/platform/tenants/${tenant.id}/remove-access`)
      notify(`${tenant.name} access removed`)
      await loadPlatformTenants()
      if (selectedPlatformTenantId === tenant.id) {
        await loadPlatformTenantStatus(tenant.id)
      }
    } catch (err) {
      notify(apiErrorMessage(err, 'Unable to remove client access'), 'error')
    }
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
        calls.push(api.get('/api/whatsapp/health', { silentError: true }).catch(() => ({ data: null })))
        calls.push(api.get('/api/audit-events').catch(() => ({ data: [] })))
        calls.push(api.get('/api/webhook-events/failed', { silentError: true }).catch(() => ({ data: [] })))
calls.push(api.get('/api/outbound-messages/failed', { silentError: true }).catch(() => ({ data: [] })))
calls.push(api.get('/api/contacts/opt-outs', { silentError: true }).catch(() => ({ data: [] })))
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
        whatsappHealthRes,
        auditRes,
     webhookEventsRes,
outboundEventsRes,
optOutContactsRes,
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
      if (whatsappHealthRes) setWhatsappHealth(whatsappHealthRes.data)
      if (auditRes) setAuditEvents(auditRes.data)
if (webhookEventsRes) setWebhookEvents(webhookEventsRes.data)
if (outboundEventsRes) setOutboundEvents(outboundEventsRes.data)
if (optOutContactsRes) setOptOutContacts(optOutContactsRes.data)
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

async function retryWebhookEvent(eventId) {
  if (!eventId) return

  setWebhookActionLoading(eventId)

  try {
    await api.post(`/api/webhook-events/${eventId}/retry`)
    notify('Webhook event retried successfully')
    await loadAll()
  } catch (err) {
    notify(err.response?.data?.error || 'Webhook retry failed', 'error')
  } finally {
    setWebhookActionLoading('')
  }
}

async function recoverStuckWebhookEvents() {
  setWebhookActionLoading('recover-stuck')

  try {
    const res = await api.post('/api/webhook-events/recover-stuck', { stuckMinutes: 10 })
    notify(`Recovered ${res.data?.recoveredCount || 0} stuck webhook event(s)`)
    await loadAll()
  } catch (err) {
    notify(err.response?.data?.error || 'Recover stuck webhooks failed', 'error')
  } finally {
    setWebhookActionLoading('')
  }
}

async function retryOutboundMessage(outboundId) {
  if (!outboundId) return

  setOutboundActionLoading(outboundId)

  try {
    await api.post(`/api/outbound-messages/${outboundId}/retry`)
    notify('Outbound message retried successfully')
    await loadAll()
  } catch (err) {
    notify(err.response?.data?.error || 'Outbound retry failed', 'error')
  } finally {
    setOutboundActionLoading('')
  }
}

async function retryFailedOutboundMessages() {
  setOutboundActionLoading('retry-all')

  try {
    const res = await api.post('/api/outbound-messages/retry-failed', { limit: 10 })
    notify(`Retried ${res.data?.retried || 0}, sent ${res.data?.sent || 0}, skipped ${res.data?.skipped || 0}, failed ${res.data?.failed || 0}`)
    await loadAll()
  } catch (err) {
    notify(err.response?.data?.error || 'Bulk outbound retry failed', 'error')
  } finally {
    setOutboundActionLoading('')
  }
}

async function updateContactOptOut(contactId, optedOut, reason = '') {
  if (!canMonitor || optOutActionLoading) return

  setOptOutActionLoading(contactId)

  try {
    await api.patch(`/api/contacts/${contactId}/opt-out`, {
      optedOut,
      reason,
    })

    notify(optedOut ? 'Contact marked as opted-out' : 'Contact marked as opted-in')
    await loadAll()
  } catch (err) {
    notify(apiErrorMessage(err, 'Unable to update opt-out status'), 'error')
  } finally {
    setOptOutActionLoading('')
  }
}

function manualOptOut(contact) {
  const reason = window.prompt(
    `Reason for opting out ${contact.name || contact.phone}?`,
    'Manual compliance update'
  )

  if (reason === null) return

  updateContactOptOut(contact.id, true, reason)
}

function manualOptIn(contact) {
  const confirmed = window.confirm(
    `Mark ${contact.name || contact.phone} as opted-in again? Only do this if the customer has clearly requested opt-in.`
  )

  if (!confirmed) return

  updateContactOptOut(contact.id, false, '')
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

function enterWorkspace(authenticatedUser) {
  setActivePage(authenticatedUser.role === 'super_admin' ? 'platformTenants' : 'inbox')
  setUser(authenticatedUser)
}

if (!user) return <PublicWebsite onAuthenticate={enterWorkspace} appSettings={appSettings} />

  function showPage(page, pageFilter = {}) {
    const platformPages = ['platformTenants', 'platformStatus']
    const clientPreviewPages = [
    'dashboard',
    'inbox',
    'new',
    'sales',
    'inventory',
      'bot',
      'salesWorkspace',
      'quotes',
      'orders',
      'activeOrders',
      'controlCenter',
      'settings',
      'webhooks',
      'outbound',
      'optOuts',
      'audit',
      'users',
    ]
    const monitorOnlyPages = ['controlCenter', 'settings', 'webhooks', 'outbound', 'optOuts', 'audit']
    const adminOnlyPages = ['users', 'connectWhatsApp']
    const salesSubPages = ['quotes', 'orders', 'activeOrders']
    const controlSubPages = ['settings', 'webhooks', 'outbound', 'optOuts', 'audit']

  if (isSuperAdminUser) {
    if (clientPreviewPages.includes(page)) {
      const targetTenantId =
        selectedPlatformTenantId ||
        platformTenants.find((tenant) => tenant.slug !== 'platform' && tenant.status === 'active')?.id ||
        platformTenants.find((tenant) => tenant.slug !== 'platform')?.id

      if (!targetTenantId) {
        notify('Create or select an active client company first', 'error')
        setActivePage('platformTenants')
        return
      }

      enterClientCrm(targetTenantId, page)
      return
    }

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

  if (salesSubPages.includes(page)) {
    setSalesWorkspaceTab(page)
    setActivePage('salesWorkspace')
    return
  }

  if (controlSubPages.includes(page)) {
    setControlCenterTab(page)
    setActivePage('controlCenter')
    return
  }

  setActivePage(page)

  if (page === 'sendSingle') {
    setTemplateName('')
    setSendError('')
    setFilter('all')
    setWindowFilter('all')
    setStageFilter('all')
    loadAll({ filter: 'all', windowFilter: 'all', search: '' })
  } else if (page === 'sendCanned') {
    setDraft('')
    setSendError('')
    setFilter('all')
    setWindowFilter('all')
    setStageFilter('all')
    loadAll({ filter: 'all', windowFilter: 'all', search: '' })
  } else if (page === 'sendBulk' || page === 'contactsList') {
    setFilter('all')
    setWindowFilter('all')
    setStageFilter('all')
    loadAll({ filter: 'all', windowFilter: 'all', search: '' })
  } else if (page === 'inbox') {
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
      setSalesWorkspaceTab('orders')
      setActivePage('salesWorkspace')
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

  async function syncTemplatesFromMeta() {
  if (!canMonitor) {
    notify('Manager/Admin access required', 'error')
    return
  }

  setTemplateSyncing(true)

  try {
    const res = await api.post('/api/templates/sync-meta')
    notify(`Synced ${res.data?.syncedCount || 0} Meta template(s)`)
    await loadAll()
  } catch (err) {
    notify(apiErrorMessage(err, 'Meta template sync failed'), 'error')
  } finally {
    setTemplateSyncing(false)
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

async function saveSettingsPayload(form, successMessage = 'Settings saved') {
  if (!canMonitor) {
    notify('Manager/Admin access required', 'error')
    return false
  }

  setSettingsSaved('')
  const payload = buildAppSettingsPayload(form)

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
    setSettingsSaved(successMessage)
    notify(successMessage)
    await loadAll()
    return true
  } catch (err) {
    notify(apiErrorMessage(err, 'Settings save failed'), 'error')
    return false
  }
}

async function saveCustomization(event) {
  event.preventDefault()
  await saveSettingsPayload(customForm, 'Customization saved')
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
  const failedOperationsCount = webhookEvents.length + outboundEvents.length
  const featureGate = {
    connectedAccounts: {
      title: 'Connected Accounts',
      text: 'WhatsApp account connection and phone mapping can be changed only by an Admin.',
    },
    campaignReports: {
      title: 'Campaign Reports',
      text: 'Campaign reports will be available after compliant opt-in campaign sending is enabled.',
    },
    callingReports: {
      title: 'Calling Reports',
      text: 'Calling activity is not recorded by the current WhatsApp Cloud API module.',
    },
    chatbotReports: {
      title: 'Chatbot Executions',
      text: 'Execution reporting will activate after chatbot run logging is stored tenant-wise.',
    },
    paymentTransactions: {
      title: 'Payment Transactions',
      text: 'Orders currently store payment status only. No payment gateway transaction feed is connected.',
    },
    scheduledItems: {
      title: 'Scheduled Items',
      text: 'Scheduling is not enabled until approved-template and consent checks are stored for every queued message.',
    },
    scheduledSingleMessages: {
      title: 'Scheduled Single Messages',
      text: 'Single message scheduling is not enabled until approved-template checks are stored for each queued send.',
    },
    scheduledCampaigns: {
      title: 'Scheduled Campaigns',
      text: 'Campaign scheduling remains locked until explicit marketing opt-in and campaign audit storage are implemented.',
    },
    scheduledChatbots: {
      title: 'Scheduled Chatbots',
      text: 'Chatbot scheduling is not stored by the current tenant-scoped backend.',
    },
    analytics: {
      title: 'Analytics',
      text: 'Use Messages report for live conversation totals. Extended analytics needs reporting endpoints.',
    },
    creditCenter: {
      title: 'Credit Center',
      text: 'Credit ledger and recharge settlement are not configured for this tenant.',
    },
    subscriptionPlan: {
      title: 'Subscription Plan',
      text: 'Subscription billing is not connected to this workspace yet.',
    },
    whatsappCredits: {
      title: 'WhatsApp Credits',
      text: 'Meta conversation charges need a billing integration before credits can be displayed.',
    },
    aiCredits: {
      title: 'AI Credits',
      text: 'AI usage billing is not enabled in the current WhatsApp CRM engine.',
    },
    basicChatbot: {
      title: 'Basic Chatbot',
      text: 'Use Advanced Chatbot for the current supported automation controls.',
    },
    drips: {
      title: 'Drips',
      text: 'Drip campaigns remain locked until explicit marketing opt-in and approved-template scheduling are implemented.',
    },
    contactSettings: {
      title: 'Contact Settings',
      text: 'Customer labels and sales stages are available to Manager/Admin from Settings.',
    },
    contactAddresses: {
      title: 'Contact Addresses',
      text: 'Address storage is not part of the current tenant-isolated contacts schema.',
    },
    catalogSettings: {
      title: 'Catalog Settings',
      text: 'Catalog sync requires a Meta Commerce catalog connection.',
    },
    catalogManager: {
      title: 'Catalog Manager (Beta)',
      text: 'Use Products / Items for the current live inventory catalog.',
    },
    flows: {
      title: 'Flows',
      text: 'WhatsApp Flows publishing is not configured for this tenant.',
    },
    paymentConfigurations: {
      title: 'Payment Configurations',
      text: 'Payment providers are not configured; order payment status remains available in Catalog Orders.',
    },
    whatsappGroups: {
      title: 'WhatsApp Groups',
      text: 'WhatsApp Business Cloud API customer messaging does not use unauthorised group broadcasting.',
    },
    integrations: {
      title: 'Integrations',
      text: 'No external integration credentials are configured in this module.',
    },
    openaiIntegration: {
      title: 'ChatGPT / OpenAI',
      text: 'AI automation remains off until data handling and tenant configuration are defined.',
    },
    googleSheets: {
      title: 'Google Sheets',
      text: 'Google Sheets sync is not connected to the backend.',
    },
    developer: {
      title: 'Developer',
      text: 'Webhook monitoring is available through Settings for authorised users.',
    },
    apiKeys: {
      title: 'API Keys',
      text: 'Sensitive API key management is not exposed in the browser.',
    },
    apiDocumentation: {
      title: 'API Documentation',
      text: 'API documentation publishing is not configured for this workspace.',
    },
    cloneItems: {
      title: 'Clone Items',
      text: 'Use Products / Items import for controlled tenant inventory creation.',
    },
    chatLink: {
      title: 'WhatsApp Chat Link',
      text: 'Link generation needs the connected business phone configuration.',
    },
    widget: {
      title: 'WhatsApp Widget',
      text: 'Website widget publishing is not configured in this module.',
    },
    templateMatchLogs: {
      title: 'Template Match Logs',
      text: 'Approved templates are visible in Templates; per-match logging is not stored yet.',
    },
  }[activePage]
  return (
    <main className={`app-shell suite-shell ${chatPages ? '' : 'workspace-mode'}`}>
      {notice && <div className={`toast ${notice.type}`}>{notice.text}</div>}
      <aside className="nav-rail workspace-sidebar">
        <nav className="sidebar-navigation" aria-label="Workspace navigation">
          {isSuperAdminUser && navigationGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-group-label">{group.label}</span>
              {group.items.map((item) => {
                const Icon = item.icon
                const badgeCount = item.id === 'controlCenter'
                  ? failedOperationsCount + optOutContacts.length
                  : item.id === 'salesWorkspace'
                    ? activeOrders.length
                    : null
                return (
                  <button key={item.id} className={activePage === item.id ? 'active' : ''} type="button" onClick={() => showPage(item.id)}>
                    <Icon size={19} />
                    <span>{item.label}</span>
                    {badgeCount > 0 && <b>{badgeCount}</b>}
                  </button>
                )
              })}
            </div>
          ))}
          {!isSuperAdminUser && suiteNavigation.map((item) => {
            const Icon = item.icon
            const children = item.children || []
            const hasChildren = children.length > 0
            const includesCurrentPage = children.some((child) => (
              child.id === activePage ||
              (child.id === 'settings' && activePage === 'controlCenter') ||
              (child.id === 'orders' && activePage === 'salesWorkspace') ||
              (child.children || []).some((nestedChild) => (
                nestedChild.id === activePage ||
                (nestedChild.id === 'webhooks' && activePage === 'controlCenter') ||
                (nestedChild.id === 'inventory' && activePage === 'inventory')
              ))
            ))
            const isExpanded = hasChildren && expandedSuiteMenu === item.id
            const isActive = item.page ? activePage === item.page || (item.page === 'settings' && activePage === 'controlCenter') : includesCurrentPage

            return (
              <div className={`suite-nav-item ${isExpanded ? 'expanded' : ''}`} key={item.id}>
                <button
                  className={isActive ? 'active' : ''}
                  type="button"
                  onClick={() => {
                    if (hasChildren) {
                      setExpandedSuiteMenu((current) => (current === item.id ? '' : item.id))
                    } else {
                      showPage(item.page)
                    }
                  }}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                  {hasChildren && <ChevronDown className="suite-chevron" size={16} />}
                </button>
                {isExpanded && (
                  <div className="suite-subnav">
                    {children.map((child) => {
                      const ChildIcon = child.icon
                      const nestedChildren = child.children || []
                      const hasNestedChildren = nestedChildren.length > 0
                      const nestedActive = nestedChildren.some((nestedChild) => (
                        nestedChild.id === activePage ||
                        (nestedChild.id === 'webhooks' && activePage === 'controlCenter') ||
                        (nestedChild.id === 'inventory' && activePage === 'inventory')
                      ))
                      const nestedExpanded = hasNestedChildren && (expandedSuiteSubmenu === child.id || nestedActive)
                      const childActive =
                        child.id === activePage ||
                        (child.id === 'settings' && activePage === 'controlCenter') ||
                        (child.id === 'orders' && activePage === 'salesWorkspace') ||
                        nestedActive

                      return (
                        <div className={`suite-subnav-group ${nestedExpanded ? 'expanded' : ''}`} key={child.id}>
                          <button
                            className={childActive ? 'active' : ''}
                            type="button"
                            onClick={() => {
                              if (hasNestedChildren) {
                                setExpandedSuiteSubmenu((current) => (current === child.id ? '' : child.id))
                              } else {
                                showPage(child.id)
                              }
                            }}
                          >
                            <ChildIcon size={16} />
                            <span>{child.label}</span>
                            {child.badge && <b className="new-badge">{child.badge}</b>}
                            {hasNestedChildren && <ChevronDown className="suite-chevron" size={14} />}
                          </button>
                          {nestedExpanded && (
                            <div className="suite-thirdnav">
                              {nestedChildren.map((nestedChild) => {
                                const NestedIcon = nestedChild.icon
                                const active =
                                  nestedChild.id === activePage ||
                                  (nestedChild.id === 'webhooks' && activePage === 'controlCenter') ||
                                  (nestedChild.id === 'inventory' && activePage === 'inventory')

                                return (
                                  <button className={active ? 'active' : ''} type="button" key={nestedChild.id} onClick={() => showPage(nestedChild.id)}>
                                    <NestedIcon size={15} />
                                    <span>{nestedChild.label}</span>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
        <div className="sidebar-account">
          <button className="logout-btn" type="button" onClick={logout}><LogOut size={18} /><span>Logout</span></button>
        </div>
      </aside>

      <header className="suite-topbar">
        <div className="suite-topbar-left">
          <button className="suite-icon-button" type="button" aria-label="Navigation menu"><Menu size={19} /></button>
          <span><Headphones size={17} /> Support</span>
        </div>
        <div className="suite-topbar-right">
          {!isSuperAdminUser && canMonitor && (
            <span className={`workspace-status ${whatsappHealth?.setupComplete ? 'ready' : 'attention'}`}>
              {whatsappHealth?.setupComplete ? 'WhatsApp Ready' : 'Setup Attention'}
            </span>
          )}
          <button className="suite-refresh" type="button" onClick={refreshCurrentPage} disabled={loading || platformLoading}><RefreshCw size={16} /></button>
          <div className="suite-account-menu">
            <button className="suite-account-trigger" type="button" onClick={() => setAccountMenuOpen((current) => !current)}>
              <span className="suite-avatar">{initials(user.name)}</span>
              <span className="suite-account-copy">
                <strong>{user.name}</strong>
                <small>{user.role}</small>
              </span>
              <ChevronDown size={16} />
            </button>
            {accountMenuOpen && (
              <div className="suite-account-dropdown">
                {!isSuperAdminUser && canMonitor && (
                  <button
                    type="button"
                    onClick={() => {
                      setAccountMenuOpen(false)
                      showPage('settings')
                    }}
                  >
                    <UserRound size={17} /> Profile
                  </button>
                )}
                <button type="button" onClick={logout}><LogOut size={17} /> Logout</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <section className="module-panel">
        {loadError && <div className="load-error">{loadError}</div>}
        {platformError && <div className="load-error">{platformError}</div>}
        {!isSuperAdminUser && user.role === 'admin' && whatsappOnboarding && !whatsappOnboarding.connected && activePage !== 'connectWhatsApp' && (
          <div className="workspace-alert warning">
            <MessageCircle size={20} />
            <div>
              <strong>Meta WhatsApp connection is pending</strong>
              <span>Connect the official account before enabling production customer messaging.</span>
            </div>
            <button type="button" onClick={() => showPage('connectWhatsApp')}>Complete Setup</button>
          </div>
        )}
        {!isSuperAdminUser && canMonitor && failedOperationsCount > 0 && activePage !== 'controlCenter' && (
          <div className="workspace-alert danger">
            <Activity size={20} />
            <div>
              <strong>{failedOperationsCount} messaging event{failedOperationsCount === 1 ? '' : 's'} need review</strong>
              <span>Check failed webhook and outbound activity before retrying any customer communication.</span>
            </div>
            <button type="button" onClick={() => showPage('webhooks')}>Review Events</button>
          </div>
        )}

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
            onEnterClientCrm={enterClientCrm}
            onRemoveClientAccess={removeClientAccess}
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

        {!isSuperAdminUser && activePage === 'sendSingle' && (
          <SingleMessagePage
            contacts={conversations}
            selected={selected}
            selectedId={selected?.id || ''}
            onSelectContact={setSelectedId}
            templates={templates}
            draft={draft}
            setDraft={setDraft}
            templateName={templateName}
            setTemplateName={setTemplateName}
            onSend={sendMessage}
            sendError={sendError}
            sending={sendingMessage}
          />
        )}
        {!isSuperAdminUser && activePage === 'sendBulk' && (
          <BulkMessagePage templates={templates} contacts={conversations} />
        )}
        {!isSuperAdminUser && activePage === 'sendCanned' && (
          <CannedMessagePage
            contacts={conversations}
            selected={selected}
            selectedId={selected?.id || ''}
            onSelectContact={setSelectedId}
            templates={templates}
            templateName={templateName}
            setTemplateName={setTemplateName}
            setDraft={setDraft}
            onSend={sendMessage}
            sendError={sendError}
            sending={sendingMessage}
          />
        )}
        {!isSuperAdminUser && activePage === 'contactsList' && (
          <ContactsListPage
            contacts={conversations}
            onOpenChat={(contactId) => {
              setSelectedId(contactId)
              showPage('inbox')
            }}
          />
        )}
        {!isSuperAdminUser && featureGate && <FeatureGatePage title={featureGate.title} text={featureGate.text} />}
        {!isSuperAdminUser && activePage === 'dashboard' && <DashboardPage dashboard={dashboard} conversations={conversations} drafts={drafts} products={products} lowStockProducts={lowStockProducts} quotations={quotations} orders={orders} onboarding={whatsappOnboarding} whatsappHealth={whatsappHealth} isAdmin={user.role === 'admin'} canManage={canMonitor} onOpenPage={showPage} />}
        {!isSuperAdminUser && activePage === 'inventory' && (
          <section className="workspace-page">
            <WorkspaceHeading title="Inventory & Product Catalog" description="Manage product stock, pricing and searchable fields used in sales workflows." />
            <InventoryPage products={products} productForm={productForm} setProductForm={setProductForm} editingProductId={editingProductId} onSave={saveProduct} onEdit={editProduct} onDelete={deleteProduct} onCancel={() => { setEditingProductId(''); setProductForm(emptyProduct) }} productSearch={productSearch} setProductSearch={setProductSearch} onSearch={loadAll} canManage={canMonitor} currency={appSettings.currency} inventoryColumnsText={inventoryColumnsText} setInventoryColumnsText={setInventoryColumnsText} onImport={importProducts} importResult={importResult} />
          </section>
        )}
        {!isSuperAdminUser && activePage === 'bot' && <BotStudioPage appSettings={appSettings} products={products} drafts={drafts} lowStockProducts={lowStockProducts} onOpenSettings={() => showPage('settings')} />}
        {!isSuperAdminUser && activePage === 'salesWorkspace' && (
          <SalesWorkspacePage
            activeTab={salesWorkspaceTab}
            onChangeTab={setSalesWorkspaceTab}
            quotations={quotations}
            orders={orders}
            activeOrders={activeOrders}
            onQuoteStatus={updateQuote}
            onConvertQuote={convertQuote}
            onDownloadQuote={downloadQuote}
            onSendManagerApproval={sendQuoteForManagerApproval}
            onSendCustomer={sendQuoteToCustomer}
            onUpdateOrder={updateOrder}
          />
        )}
        {!isSuperAdminUser && activePage === 'users' && user.role === 'admin' && (
          <section className="workspace-page">
            <WorkspaceHeading title="Team & Role Access" description="Create and manage authorised workspace users for this company only." />
            <UsersPage users={users} newUser={newUser} setNewUser={setNewUser} editingUserId={editingUserId} onCreate={createUser} onEdit={editUser} onCancel={cancelUserEdit} onToggle={toggleUser} onDelete={deleteUser} />
          </section>
        )}
{!isSuperAdminUser && activePage === 'connectWhatsApp' && user.role === 'admin' && (
  <WhatsAppConnectGate
    onboarding={whatsappOnboarding}
    connecting={connectingWhatsApp}
    onComplete={completeEmbeddedSignup}
    onLogout={logout}
  />
)}

        {!isSuperAdminUser && activePage === 'controlCenter' && canMonitor && (
          <ControlCenterPage
            activeTab={controlCenterTab}
            onChangeTab={setControlCenterTab}
            onboarding={whatsappOnboarding}
            onOpenMetaSetup={() => showPage('connectWhatsApp')}
            status={status}
            whatsappConfig={whatsappConfig}
            testMessage={testMessage}
            setTestMessage={setTestMessage}
            testResult={testResult}
            onTest={sendTestMessage}
            onMapPhone={mapCurrentWhatsAppPhone}
            simulator={simulator}
            setSimulator={setSimulator}
            onSimulate={simulateInbound}
            customForm={customForm}
            setCustomForm={setCustomForm}
            onSaveCustomization={saveCustomization}
            settingsSaved={settingsSaved}
            onSaveSettings={saveSettingsPayload}
            currentUser={user}
            users={users}
            newUser={newUser}
            setNewUser={setNewUser}
            editingUserId={editingUserId}
            onCreateUser={createUser}
            onEditUser={editUser}
            onCancelUserEdit={cancelUserEdit}
            onToggleUser={toggleUser}
            onDeleteUser={deleteUser}
            templates={managedTemplates}
            templateForm={templateForm}
            setTemplateForm={setTemplateForm}
            editingTemplateId={editingTemplateId}
            onSaveTemplate={saveTemplate}
            onEditTemplate={editTemplate}
            onToggleTemplate={toggleTemplate}
            onCancelTemplateEdit={cancelTemplateEdit}
            onSyncTemplates={syncTemplatesFromMeta}
            templateSyncing={templateSyncing}
            userRole={user.role}
            isProduction={isProduction}
            webhookEvents={webhookEvents}
            webhookActionLoading={webhookActionLoading}
            onRetryWebhook={retryWebhookEvent}
            onRecoverStuck={recoverStuckWebhookEvents}
            outboundEvents={outboundEvents}
            outboundActionLoading={outboundActionLoading}
            onRetryOutbound={retryOutboundMessage}
            onRetryFailedOutbound={retryFailedOutboundMessages}
            optOutContacts={optOutContacts}
            optOutActionLoading={optOutActionLoading}
            onManualOptOut={manualOptOut}
            onManualOptIn={manualOptIn}
            auditEvents={auditEvents}
          />
        )}
        {!isSuperAdminUser && !chatPages && !featureGate && !['sendSingle', 'sendBulk', 'sendCanned', 'contactsList', 'dashboard', 'inventory', 'bot', 'salesWorkspace', 'users', 'connectWhatsApp', 'controlCenter'].includes(activePage) && (
  <EmptyState
    title="Page not available"
    text="Select a valid page from the sidebar."
  />
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
  onEnterClientCrm,
  onRemoveClientAccess,
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
        <span>Create client companies, create the first admin, verify WhatsApp/account status, and enter client CRM for testing. Build: enter-crm-v2</span>
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
                <button
                  className="platform-enter-btn"
                  type="button"
                  onClick={() => onEnterClientCrm(tenant.id)}
                  disabled={tenant.status !== 'active'}
                >
                  Enter CRM
                </button>
                <button
                  className="platform-remove-btn"
                  type="button"
                  onClick={() => onRemoveClientAccess(tenant)}
                  disabled={tenant.status === 'suspended'}
                >
                  Remove Access
                </button>
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

function getReplyWindowInfo(selected, currentTime) {
  if (!selected) {
    return {
      open: false,
      label: 'No conversation selected',
      helper: 'Select a customer to see reply-window status.',
      className: 'neutral',
    }
  }

  if (selected.opted_out) {
    return {
      open: false,
      label: 'Sending Locked',
      helper: 'Customer has opted out.',
      className: 'danger',
    }
  }

  if (!selected.last_inbound_at) {
    return {
      open: false,
      label: 'Template Required',
      helper: 'No inbound customer message found.',
      className: 'warn',
    }
  }

  const expiresAt = new Date(selected.last_inbound_at).getTime() + (24 * 60 * 60 * 1000)
  const remainingMs = Math.max(0, expiresAt - currentTime)

  if (selected.reply_window_open && remainingMs > 0) {
    const totalMinutes = Math.ceil(remainingMs / (60 * 1000))
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60

    return {
      open: true,
      label: 'Reply Window Open',
      helper: `${hours}h ${minutes}m left for free-form reply.`,
      className: 'ok',
    }
  }

  return {
    open: false,
    label: 'Reply Window Expired',
    helper: 'Use approved WhatsApp template.',
    className: 'warn',
  }
}

function ChatHeader({ selected, onProfile, currentTime }) {
  const windowInfo = getReplyWindowInfo(selected, currentTime)

  return (
    <header className="chat-header">
      <span className="avatar large">{initials(selected?.name || selected?.phone)}</span>

      <div className="chat-title-block">
        <h2>{selected?.name || 'No conversation selected'}</h2>
        <span>{selected?.phone || ''}</span>
      </div>

      <div className="reply-window-badge-wrap">
        <span className={`reply-window-badge ${windowInfo.className}`}>
          {windowInfo.label}
        </span>
        <small>{windowInfo.helper}</small>
      </div>

      <span className={`status-pill ${selected?.reply_window_open ? 'ok' : 'warn'}`}>
        {selected?.label || 'No label'}
      </span>

      <button className="profile-toggle" type="button" onClick={onProfile} disabled={!selected}>
        <UserRound size={18} />
      </button>
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

function DashboardPage({ dashboard, conversations, drafts, products, lowStockProducts, quotations, orders, onboarding, whatsappHealth, isAdmin, canManage, onOpenPage }) {
  
    const healthStatusLabel = whatsappHealth?.setupComplete
    ? 'Healthy'
    : whatsappHealth?.connected
      ? 'Needs Review'
      : 'Not Connected'

  const healthStatusClass = whatsappHealth?.setupComplete
    ? 'ok'
    : whatsappHealth?.connected
      ? 'warn'
      : 'danger'

  const tokenModeLabel = whatsappHealth?.tokenMode === 'tenant_embedded_signup'
    ? 'Tenant Embedded Signup'
    : whatsappHealth?.tokenMode === 'env_fallback'
      ? 'Environment Fallback'
      : 'Not Configured'

  const formatHealthTime = (value) => (
    value ? new Date(value).toLocaleString() : '-'
  )
  
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
      <section className="dashboard-launchpad">
        <div className="launchpad-copy">
          <span className="launchpad-kicker">Workspace setup</span>
          <h3>{onboarding?.connected ? 'Your WhatsApp operations workspace is connected.' : 'Complete your business workspace setup.'}</h3>
          <p>
            {onboarding?.connected
              ? 'Manage conversations, templates and operations controls from the secure dashboard.'
              : 'Connect Meta WhatsApp, configure templates and prepare your team before customer messaging.'}
          </p>
        </div>
        <div className="launchpad-actions">
          {isAdmin && (
            <button type="button" className={onboarding?.connected ? 'complete' : 'primary'} onClick={() => onOpenPage(onboarding?.connected ? 'settings' : 'connectWhatsApp')}>
              <MessageCircle size={17} />
              {onboarding?.connected ? 'Meta Connected' : 'Connect Meta WhatsApp'}
            </button>
          )}
          {canManage && <button type="button" onClick={() => onOpenPage('settings')}><Settings size={17} /> Settings & Templates</button>}
          <button type="button" onClick={() => onOpenPage('inbox')}><Inbox size={17} /> Inbox & Contacts</button>
          <button type="button" onClick={() => onOpenPage('orders')}><ShoppingCart size={17} /> Orders</button>
        </div>
      </section>

      {canManage && (
        <section className="whatsapp-health-card">
          <div className="health-head">
            <div>
              <span className="launchpad-kicker">WhatsApp Health</span>
              <h3>Connection & activity status</h3>
            </div>
            <span className={`health-pill ${healthStatusClass}`}>
              {healthStatusLabel}
            </span>
          </div>

          <div className="health-grid">
            <div>
              <small>Connection</small>
              <strong>{whatsappHealth?.connected ? 'Connected' : 'Not connected'}</strong>
            </div>
            <div>
              <small>Token Mode</small>
              <strong>{tokenModeLabel}</strong>
            </div>
            <div>
              <small>Phone</small>
              <strong>{whatsappHealth?.account?.displayPhoneNumber || '-'}</strong>
            </div>
            <div>
              <small>Phone Number ID</small>
              <strong>{whatsappHealth?.account?.phoneNumberId || '-'}</strong>
            </div>
            <div>
              <small>Last Inbound</small>
              <strong>{formatHealthTime(whatsappHealth?.activity?.lastInboundAt)}</strong>
            </div>
            <div>
              <small>Last Outbound</small>
              <strong>{formatHealthTime(whatsappHealth?.activity?.lastOutboundAt)}</strong>
            </div>
          </div>

          <div className="health-webhook">
            <small>Webhook URL</small>
            <code>{whatsappHealth?.webhookUrl || '-'}</code>
          </div>

          {whatsappHealth?.setupIssues?.length > 0 && (
            <div className="health-issues">
              {whatsappHealth.setupIssues.map((issue) => (
                <p key={issue}>{issue}</p>
              ))}
            </div>
          )}

          <div className="inline-actions">
            {isAdmin && !whatsappHealth?.connected && (
              <button type="button" onClick={() => onOpenPage('connectWhatsApp')}>
                Connect Meta WhatsApp
              </button>
            )}
            <button type="button" onClick={() => onOpenPage('settings')}>
              Open WhatsApp Settings
            </button>
          </div>
        </section>
      )}

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

function WorkspaceHeading({ title, description, action }) {
  return (
    <div className="workspace-head workspace-head-structured">
      <div>
        <span className="workspace-eyebrow">Workspace Module</span>
        <h2>{title}</h2>
        <span>{description}</span>
      </div>
      {action}
    </div>
  )
}

function WorkspaceTabs({ tabs, activeTab, onChangeTab }) {
  return (
    <nav className="workspace-tabs" aria-label="Module sections">
      {tabs.map((tab) => {
        const Icon = tab.icon
        return (
          <button key={tab.id} className={activeTab === tab.id ? 'active' : ''} type="button" onClick={() => onChangeTab(tab.id)}>
            <Icon size={17} />
            <span>{tab.label}</span>
            {tab.count > 0 && <b>{tab.count}</b>}
          </button>
        )
      })}
    </nav>
  )
}

function MessagePreview({ selected, body, emptyText = 'Select content to see preview' }) {
  return (
    <aside className="suite-preview-card">
      <h3>Message Preview</h3>
      <div className="suite-preview-phone">
        {body ? (
          <>
            <small>Today</small>
            <p>{body}</p>
            <time>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
          </>
        ) : (
          <div className="suite-preview-empty">
            <MessageCircle size={45} />
            <span>{emptyText}</span>
          </div>
        )}
      </div>
      {selected && <small className="suite-preview-contact">To: {selected.name || selected.phone} ({selected.phone})</small>}
    </aside>
  )
}

function SingleMessagePage({
  contacts,
  selected,
  selectedId,
  onSelectContact,
  templates,
  draft,
  setDraft,
  templateName,
  setTemplateName,
  onSend,
  sendError,
  sending,
}) {
  const [messageType, setMessageType] = useState('text')
  const [guideOpen, setGuideOpen] = useState(true)
  const selectedTemplate = templates.find((template) => template.name === templateName)
  const messageTypes = ['template', 'text', 'media', 'interactive', 'payment', 'catalog', 'location']
  const supportedType = ['template', 'text'].includes(messageType)
  const previewBody = messageType === 'template' ? selectedTemplate?.body : messageType === 'text' ? draft : ''

  function switchType(type) {
    setMessageType(type)
    if (type === 'text') setTemplateName('')
    if (type === 'template') setDraft('')
  }

  return (
    <section className="suite-page">
      <h2>Send Messages</h2>
      <button className="suite-guide-toggle" type="button" onClick={() => setGuideOpen((open) => !open)}>
        <ChevronDown size={17} />
        How to use? Click to expand
      </button>
      {guideOpen && (
        <div className="suite-guide">
          <div>
            <p>Send messages to tenant-authorised contacts in three ways:</p>
            <ul>
              <li><strong>Single Message</strong> - send a text reply inside the 24-hour window or an approved Meta template.</li>
              <li><strong>Bulk Message</strong> - prepare opted-in template campaigns after consent-backed sending is enabled.</li>
              <li><strong>Canned Message</strong> - quickly send an active approved template to one contact.</li>
            </ul>
            <p>Free-form text is blocked outside the WhatsApp customer service window.</p>
          </div>
          <div className="suite-guide-visual">
            <MessageCircle size={42} />
            <strong>WhatsApp Cloud API</strong>
            <span>Policy-aware delivery</span>
          </div>
        </div>
      )}
      <div className="suite-compose-layout">
        <form className="suite-send-form" onSubmit={onSend}>
          <label>
            Phone Number:
            <select value={selectedId} onChange={(event) => onSelectContact(event.target.value)} required>
              <option value="">Select tenant contact</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>{contact.phone} - {contact.name || 'Customer'}</option>
              ))}
            </select>
          </label>
          <span className="suite-field-title">Message Type:</span>
          <div className="suite-type-tabs">
            {messageTypes.map((type) => (
              <button className={messageType === type ? 'active' : ''} key={type} type="button" onClick={() => switchType(type)}>
                {type[0].toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
          {messageType === 'text' && (
            <label>
              Message:
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={selected?.reply_window_open ? 'Type your message' : 'Free-form text requires an open 24-hour window'}
                disabled={!selected || !selected.reply_window_open || selected.opted_out}
              />
            </label>
          )}
          {messageType === 'template' && (
            <label>
              Approved Template:
              <select value={templateName} onChange={(event) => setTemplateName(event.target.value)} disabled={!selected || selected.opted_out}>
                <option value="">Select approved template</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.name}>{template.name} ({template.language})</option>
                ))}
              </select>
            </label>
          )}
          {!supportedType && (
            <div className="suite-policy-note">
              {messageType} message sending is not connected in the current secure backend route. Use Text or Template.
            </div>
          )}
          {selected?.opted_out && <div className="suite-policy-note danger">This contact is opted out. Sending is locked.</div>}
          {!selected?.opted_out && selected && messageType === 'text' && !selected.reply_window_open && (
            <div className="suite-policy-note">24-hour window expired. Select Template to send an approved message.</div>
          )}
          {sendError && <div className="suite-policy-note danger">{sendError}</div>}
          <button
            className="suite-primary-button"
            type="submit"
            disabled={!selected || selected.opted_out || sending || !supportedType || (messageType === 'text' && !selected.reply_window_open) || (messageType === 'template' && !templateName)}
          >
            {sending ? 'Sending...' : 'Submit'}
          </button>
        </form>
        <MessagePreview selected={selected} body={previewBody} />
      </div>
    </section>
  )
}

function BulkMessagePage({ templates, contacts }) {
  const [activeTab, setActiveTab] = useState('csv')
  const [campaignName, setCampaignName] = useState('')
  const [templateName, setTemplateName] = useState('')
  const [rows, setRows] = useState([])
  const [schedule, setSchedule] = useState(false)
  const [drip, setDrip] = useState(false)
  const selectedTemplate = templates.find((template) => template.name === templateName)
  const contactPhoneMap = new Map(contacts.map((contact) => [String(contact.phone || '').replace(/\D/g, ''), contact]))
  const matchedRows = rows.map((row) => contactPhoneMap.get(String(row.phone || row.Phone || '').replace(/\D/g, ''))).filter(Boolean)
  const blockedRows = matchedRows.filter((contact) => contact.opted_out)

  async function uploadCsv(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setRows(parseCsv(await file.text()))
  }

  return (
    <section className="suite-page">
      <h2>Send Bulk Messages</h2>
      <div className="suite-subtabs">
        {[
          ['csv', Upload, 'CSV Upload'],
          ['manual', Boxes, 'Manual Grid'],
          ['filters', Search, 'Contact Filters'],
          ['retargeting', Megaphone, 'Re-Targeting'],
        ].map(([id, Icon, label]) => (
          <button className={activeTab === id ? 'active' : ''} key={id} type="button" onClick={() => setActiveTab(id)}>
            <Icon size={17} />{label}
          </button>
        ))}
      </div>
      <div className="suite-compose-layout bulk-layout">
        <div className="suite-send-form">
          <div className="suite-guide-toggle static"><ChevronDown size={17} /> How to use CSV Upload?</div>
          {activeTab !== 'csv' && (
            <div className="suite-policy-note">
              This selection screen is ready for the module layout; campaign processing is enabled only after consent-backed campaign APIs exist.
            </div>
          )}
          <label>
            <span className="required">*</span> Campaign Name
            <input value={campaignName} onChange={(event) => setCampaignName(event.target.value)} placeholder="Campaign Name" />
          </label>
          <label>
            <span className="required">*</span> Select Template
            <select value={templateName} onChange={(event) => setTemplateName(event.target.value)}>
              <option value="">Select an approved template</option>
              {templates.map((template) => (
                <option key={template.id} value={template.name}>{template.name} ({template.language})</option>
              ))}
            </select>
          </label>
          <div className="suite-inline-actions">
            <button type="button" onClick={() => downloadCsv('bulk-message-template.csv', ['phone', 'name'], ['919876543210', 'Customer'])}>Download Sample CSV</button>
            <label className="suite-file-button">
              Upload CSV
              <input type="file" accept=".csv,text/csv" onChange={uploadCsv} />
            </label>
          </div>
          {!!rows.length && (
            <div className="suite-validation">
              <strong>{rows.length} CSV row(s) loaded</strong>
              <span>{matchedRows.length} matched to tenant contacts; {blockedRows.length} blocked by opt-out.</span>
            </div>
          )}
          <label className="suite-toggle"><input type="checkbox" checked={schedule} onChange={(event) => setSchedule(event.target.checked)} /> Schedule</label>
          <label className="suite-toggle"><input type="checkbox" checked={drip} onChange={(event) => setDrip(event.target.checked)} /> Add Drip to this Campaign</label>
          <div className="suite-policy-note">
            Bulk sending is locked: marketing delivery requires recorded opt-in, approved templates, opt-out enforcement and a tenant-scoped campaign queue.
          </div>
          <button className="suite-primary-button" type="button" disabled>Submit</button>
        </div>
        <MessagePreview body={selectedTemplate?.body} emptyText="Select a template to preview campaign message" />
      </div>
    </section>
  )
}

function CannedMessagePage({
  contacts,
  selected,
  selectedId,
  onSelectContact,
  templates,
  templateName,
  setTemplateName,
  setDraft,
  onSend,
  sendError,
  sending,
}) {
  const [tab, setTab] = useState('single')
  const selectedTemplate = templates.find((template) => template.name === templateName)

  function chooseTemplate(event) {
    setDraft('')
    setTemplateName(event.target.value)
  }

  return (
    <section className="suite-page">
      <h2>Send Canned Messages</h2>
      <div className="suite-subtabs">
        {[
          ['single', PhoneCall, 'Single Number'],
          ['csv', Upload, 'CSV Upload'],
          ['manual', Boxes, 'Manual Grid'],
          ['filters', Search, 'Contact Filters'],
        ].map(([id, Icon, label]) => (
          <button className={tab === id ? 'active' : ''} key={id} type="button" onClick={() => setTab(id)}>
            <Icon size={17} />{label}
          </button>
        ))}
      </div>
      <div className="suite-compose-layout bulk-layout">
        <form className="suite-send-form" onSubmit={onSend}>
          <div className="suite-guide-toggle static"><ChevronDown size={17} /> How to send canned messages?</div>
          {tab !== 'single' && (
            <div className="suite-policy-note">
              Batch canned messages remain locked until marketing consent and campaign audit storage are implemented.
            </div>
          )}
          <label>
            <span className="required">*</span> Phone Number
            <select value={selectedId} onChange={(event) => onSelectContact(event.target.value)} required disabled={tab !== 'single'}>
              <option value="">Select tenant contact</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>{contact.phone} - {contact.name || 'Customer'}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="required">*</span> Select Canned Message
            <select value={templateName} onChange={chooseTemplate} disabled={tab !== 'single' || !selected || selected.opted_out}>
              <option value="">Choose an approved canned message</option>
              {templates.map((template) => (
                <option key={template.id} value={template.name}>{template.name} ({template.language})</option>
              ))}
            </select>
          </label>
          {selected?.opted_out && <div className="suite-policy-note danger">This contact is opted out. Sending is locked.</div>}
          {sendError && <div className="suite-policy-note danger">{sendError}</div>}
          <button className="suite-primary-button" type="submit" disabled={tab !== 'single' || !selected || !templateName || selected.opted_out || sending}>
            {sending ? 'Sending...' : 'Send Message'}
          </button>
        </form>
        <MessagePreview selected={selected} body={selectedTemplate?.body} emptyText="Select a canned message to see preview" />
      </div>
    </section>
  )
}

function ContactsListPage({ contacts, onOpenChat }) {
  return (
    <section className="suite-page">
      <h2>Contacts List</h2>
      <div className="suite-table-card">
        <div className="suite-table-head"><span>Contact</span><span>Phone</span><span>Label / Stage</span><span>Reply Window</span><span>Action</span></div>
        {contacts.map((contact) => (
          <div className="suite-table-row" key={contact.id}>
            <strong>{contact.name || 'Customer'}</strong>
            <span>{contact.phone}</span>
            <span>{contact.label || '-'} / {contact.stage || '-'}</span>
            <span>{contact.opted_out ? 'Blocked' : contact.reply_window_open ? 'Open' : 'Template only'}</span>
            <button type="button" onClick={() => onOpenChat(contact.id)}>Open Chat</button>
          </div>
        ))}
        {!contacts.length && <EmptyState title="No contacts" text="Contacts created by incoming WhatsApp conversations will appear here." />}
      </div>
    </section>
  )
}

function FeatureGatePage({ title, text }) {
  return (
    <section className="suite-page">
      <h2>{title}</h2>
      <div className="suite-gate-card">
        <Shield size={26} />
        <h3>Module not enabled yet</h3>
        <p>{text}</p>
        <small>No unsafe or cross-tenant action has been exposed from this screen.</small>
      </div>
    </section>
  )
}

function SalesWorkspacePage({ activeTab, onChangeTab, quotations, orders, activeOrders, onQuoteStatus, onConvertQuote, onDownloadQuote, onSendManagerApproval, onSendCustomer, onUpdateOrder }) {
  const tabs = [
    { id: 'quotes', label: 'Quotations', icon: ClipboardList, count: quotations.length },
    { id: 'orders', label: 'All Orders', icon: ShoppingCart, count: orders.length },
    { id: 'activeOrders', label: 'Active Orders', icon: Clock3, count: activeOrders.length },
  ]

  return (
    <section className="workspace-page workspace-hub-page">
      <WorkspaceHeading
        title="Sales Workspace"
        description="Quotations and orders are organized as subpages so each workflow stays focused and easy to review."
      />
      <WorkspaceTabs tabs={tabs} activeTab={activeTab} onChangeTab={onChangeTab} />
      {activeTab === 'quotes' && (
        <QuotesPage quotations={quotations} onStatus={onQuoteStatus} onConvert={onConvertQuote} onDownload={onDownloadQuote} onSendManagerApproval={onSendManagerApproval} onSendCustomer={onSendCustomer} />
      )}
      {activeTab === 'orders' && <OrdersPage orders={orders} onUpdate={onUpdateOrder} />}
      {activeTab === 'activeOrders' && <OrdersPage orders={activeOrders} onUpdate={onUpdateOrder} title="Active Orders" />}
    </section>
  )
}

function ControlCenterPage({
  activeTab,
  onChangeTab,
  onboarding,
  onOpenMetaSetup,
  userRole,
  webhookEvents,
  webhookActionLoading,
  onRetryWebhook,
  onRecoverStuck,
  outboundEvents,
  outboundActionLoading,
  onRetryOutbound,
  onRetryFailedOutbound,
  optOutContacts,
  optOutActionLoading,
  onManualOptOut,
  onManualOptIn,
  auditEvents,
  ...settingsProps
}) {
  const tabs = [
    { id: 'settings', label: 'Settings & Templates', icon: Settings },
    { id: 'webhooks', label: 'Webhooks', icon: Activity, count: webhookEvents.length },
    { id: 'outbound', label: 'Outbound', icon: Send, count: outboundEvents.length },
    { id: 'optOuts', label: 'Opt-outs', icon: Shield, count: optOutContacts.length },
    { id: 'audit', label: 'Audit Log', icon: ClipboardList },
  ]

  return (
    <section className="workspace-page workspace-hub-page">
      <WorkspaceHeading
        title="Control Center"
        description="Business setup, Meta monitoring and compliance checks are grouped into secure operational subpages."
      />
      <WorkspaceTabs tabs={tabs} activeTab={activeTab} onChangeTab={onChangeTab} />

      {activeTab === 'settings' && (
        <>
          {onboarding && !onboarding.connected && userRole === 'admin' && (
            <div className="setup-card">
              <h3>Meta WhatsApp Embedded Signup</h3>
              <p>This company is not connected through Meta Embedded Signup yet. Connect official WhatsApp Business API to unlock production messaging.</p>
              <div className="inline-actions">
                <button type="button" onClick={onOpenMetaSetup}>Connect Meta WhatsApp</button>
              </div>
            </div>
          )}

          {onboarding?.connected && onboarding?.whatsappAccount && (
            <div className="setup-card">
              <h3>Meta WhatsApp Connected</h3>
              <div className="setup-grid">
                <span className="ok">Connected</span>
                <span className={onboarding.whatsappAccount.active ? 'ok' : 'warn'}>
                  {onboarding.whatsappAccount.active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <p className="setup-copy">Phone: {onboarding.whatsappAccount.displayPhoneNumber || '-'}</p>
              <p className="setup-copy">Phone Number ID: {onboarding.whatsappAccount.phoneNumberId || '-'}</p>
              <p className="setup-copy">WABA ID: {onboarding.whatsappAccount.wabaId || '-'}</p>
              <p className="setup-copy">
                Connected At: {onboarding.whatsappAccount.connectedAt ? new Date(onboarding.whatsappAccount.connectedAt).toLocaleString() : '-'}
              </p>
              <small className="setup-copy">Tokens are stored securely on backend only. Access token is never exposed to frontend.</small>
            </div>
          )}

          <SettingsPage {...settingsProps} userRole={userRole} />
        </>
      )}

      {activeTab === 'webhooks' && (
        <WebhookEventsPage
          events={webhookEvents}
          loadingId={webhookActionLoading}
          isAdmin={userRole === 'admin'}
          onRetry={onRetryWebhook}
          onRecoverStuck={onRecoverStuck}
        />
      )}
      {activeTab === 'outbound' && (
        <OutboundQueuePage events={outboundEvents} loadingId={outboundActionLoading} onRetry={onRetryOutbound} onRetryFailed={onRetryFailedOutbound} />
      )}
      {activeTab === 'optOuts' && (
        <OptOutManagementPage contacts={optOutContacts} loadingId={optOutActionLoading} onManualOptOut={onManualOptOut} onManualOptIn={onManualOptIn} />
      )}
      {activeTab === 'audit' && <AuditPage events={auditEvents} />}
    </section>
  )
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

function WebhookEventsPage({ events, loadingId, isAdmin, onRetry, onRecoverStuck }) {
  const failedCount = events.length
  const totalAttempts = events.reduce((sum, event) => sum + Number(event.attempts || 0), 0)

  return (
    <section className="table-module webhook-monitor-module">
      <div className="module-title webhook-monitor-head">
        <div>
          <Activity size={18} />
          <h3>Webhook Events Monitor</h3>
        </div>
        <div className="webhook-monitor-actions">
          <span>{failedCount} failed</span>
          <span>{totalAttempts} retry attempts</span>
          {isAdmin && (
            <button
              type="button"
              onClick={onRecoverStuck}
              disabled={loadingId === 'recover-stuck'}
            >
              {loadingId === 'recover-stuck' ? 'Recovering...' : 'Recover stuck'}
            </button>
          )}
        </div>
      </div>

      <p className="module-helper">
        Failed Meta webhook events appear here. Retry only after fixing token, mapping, media, or processing errors.
      </p>

      {!events.length && (
        <EmptyState
          title="No failed webhook events"
          text="Meta webhooks are processing normally. Failed events will appear here for review."
        />
      )}

      {!!events.length && (
        <div className="webhook-event-table">
          <div className="webhook-event-head">
            <span>Event</span>
            <span>Status</span>
            <span>Attempts</span>
            <span>Received</span>
            <span>Action</span>
          </div>

          {events.map((event) => (
            <div className="webhook-event-row" key={event.id}>
              <div className="webhook-event-main">
                <strong>{event.event_type || 'webhook'}</strong>
                <small>Phone ID: {event.phone_number_id || '-'}</small>
                {event.last_error && <p>{event.last_error}</p>}
              </div>

              <span className={`webhook-status-pill ${event.status || 'failed'}`}>
                {event.status || 'failed'}
              </span>

              <span>{Number(event.attempts || 0)}</span>

              <span>
                {event.received_at ? new Date(event.received_at).toLocaleString() : '-'}
              </span>

              <button
                type="button"
                onClick={() => onRetry(event.id)}
                disabled={loadingId === event.id}
              >
                {loadingId === event.id ? 'Retrying...' : 'Retry'}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function OutboundQueuePage({ events, loadingId, onRetry, onRetryFailed }) {
  const failedCount = events.length
  const totalAttempts = events.reduce((sum, event) => sum + Number(event.attempts || 0), 0)
  const templateCount = events.filter((event) => event.message_type === 'template').length
  const textCount = events.filter((event) => event.message_type === 'text').length

  return (
    <section className="table-module outbound-monitor-module">
      <div className="module-title outbound-monitor-head">
        <div>
          <Send size={18} />
          <h3>Outbound Queue Monitor</h3>
        </div>
        <div className="outbound-monitor-actions">
          <span>{failedCount} failed</span>
          <span>{textCount} text</span>
          <span>{templateCount} template</span>
          <span>{totalAttempts} attempts</span>
          <button
            type="button"
            onClick={onRetryFailed}
            disabled={!events.length || loadingId === 'retry-all'}
          >
            {loadingId === 'retry-all' ? 'Retrying...' : 'Bulk retry 10'}
          </button>
        </div>
      </div>

      <p className="module-helper">
        Failed outbound WhatsApp messages appear here. Retry only after checking opt-out, 24-hour window, template approval, and Meta API errors.
      </p>

      {!events.length && (
        <EmptyState
          title="No failed outbound messages"
          text="Failed outbound WhatsApp messages will appear here for review and retry."
        />
      )}

      {!!events.length && (
        <div className="outbound-event-table">
          <div className="outbound-event-head">
            <span>Message</span>
            <span>Type</span>
            <span>Status</span>
            <span>Attempts</span>
            <span>Updated</span>
            <span>Action</span>
          </div>

          {events.map((event) => (
            <div className="outbound-event-row" key={event.id}>
              <div className="outbound-event-main">
                <strong>{event.template_name || event.to_phone || 'Outbound message'}</strong>
                <small>To: {event.to_phone || '-'}</small>
                {event.body && <em>{String(event.body).slice(0, 180)}</em>}
                {event.last_error && <p>{event.last_error}</p>}
              </div>

              <span className="outbound-type-pill">
                {event.message_type || 'text'}
              </span>

              <span className={`outbound-status-pill ${event.status || 'failed'}`}>
                {event.status || 'failed'}
              </span>

              <span>{Number(event.attempts || 0)}</span>

              <span>
                {event.updated_at ? new Date(event.updated_at).toLocaleString() : '-'}
              </span>

              <button
                type="button"
                onClick={() => onRetry(event.id)}
                disabled={loadingId === event.id}
              >
                {loadingId === event.id ? 'Retrying...' : 'Retry'}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function OptOutManagementPage({ contacts, loadingId, onManualOptOut, onManualOptIn }) {
  return (
    <section className="table-module optout-module">
      <div className="module-title">
        <Shield size={18} />
        <h3>Opt-out Compliance</h3>
      </div>

      <div className="optout-summary">
        <div>
          <strong>{contacts.length}</strong>
          <span>Opted-out contacts</span>
        </div>
        <p>
          These customers must not receive WhatsApp campaigns or manual messages unless they clearly opt in again.
        </p>
      </div>

      {!contacts.length && (
        <EmptyState
          title="No opted-out contacts"
          text="STOP, UNSUBSCRIBE, DND, DO NOT MESSAGE and manual opt-outs will appear here."
        />
      )}

      {!!contacts.length && (
        <div className="optout-table">
          <div className="optout-table-head">
            <span>Customer</span>
            <span>Phone</span>
            <span>Reason</span>
            <span>Opted-out at</span>
            <span>Action</span>
          </div>

          {contacts.map((contact) => (
            <div className="optout-row" key={contact.id}>
              <div>
                <strong>{contact.name || 'Unknown customer'}</strong>
                <small>{contact.company || contact.label || '-'}</small>
              </div>

              <span>{contact.phone || contact.wa_id || '-'}</span>

              <span>{contact.opted_out_reason || 'Customer opt-out / compliance update'}</span>

              <span>
                {contact.opted_out_at
                  ? new Date(contact.opted_out_at).toLocaleString()
                  : '-'}
              </span>

              <div className="optout-actions">
                <button
                  type="button"
                  className="optout-in-btn"
                  onClick={() => onManualOptIn(contact)}
                  disabled={loadingId === contact.id}
                >
                  {loadingId === contact.id ? 'Updating...' : 'Mark Opt-in'}
                </button>

                <button
                  type="button"
                  className="optout-out-btn"
                  onClick={() => onManualOptOut(contact)}
                  disabled={loadingId === contact.id}
                >
                  Keep Opt-out
                </button>
              </div>
            </div>
          ))}
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

function SettingsPage({
  status,
  whatsappConfig,
  testMessage,
  setTestMessage,
  testResult,
  onTest,
  onMapPhone,
  simulator,
  setSimulator,
  onSimulate,
  customForm,
  setCustomForm,
  onSaveCustomization,
  onSaveSettings,
  settingsSaved,
  templates,
  templateForm,
  setTemplateForm,
  editingTemplateId,
  onSaveTemplate,
  onEditTemplate,
  onToggleTemplate,
  onCancelTemplateEdit,
  onSyncTemplates,
  templateSyncing,
  userRole,
  isProduction,
  currentUser,
  users = [],
  newUser,
  setNewUser,
  editingUserId,
  onCreateUser,
  onEditUser,
  onCancelUserEdit,
  onToggleUser,
  onDeleteUser,
}) {
  const warnings = status?.warnings || []
  const [activeSettingsTab, setActiveSettingsTab] = useState('profile')
  const [activePeopleTab, setActivePeopleTab] = useState('agents')
  const [agentFormOpen, setAgentFormOpen] = useState(false)
  const [googleMessage, setGoogleMessage] = useState('')
  const [voiceHelpOpen, setVoiceHelpOpen] = useState(false)
  const activeCount = users.filter((item) => item.active).length
  const voiceWeeklyHours = normalizeVoiceWeeklyHours(customForm.voiceWeeklyHours)
  const unavailableHours = Array.isArray(customForm.voiceUnavailableHours) ? customForm.voiceUnavailableHours : []

  const settingsTabs = [
    { id: 'profile', label: 'Profile' },
    { id: 'agents', label: 'Agents and Permissions' },
    { id: 'waba', label: 'WABA Settings' },
    { id: 'billing', label: 'Billing & GST Details' },
    { id: 'voice', label: 'Voice Call Settings' },
    { id: 'inbox', label: 'Inbox Settings' },
  ]

  function patchForm(patch) {
    setCustomForm({ ...customForm, ...patch })
  }

  async function savePatch(patch, message) {
    const nextForm = { ...customForm, ...patch }
    setCustomForm(nextForm)
    await onSaveSettings(nextForm, message)
  }

  function openAgentForm() {
    if (userRole !== 'admin') return
    if (onCancelUserEdit) onCancelUserEdit()
    setAgentFormOpen(true)
  }

  async function submitAgent(event) {
    if (!onCreateUser) return
    const saved = await onCreateUser(event)
    if (saved) setAgentFormOpen(false)
  }

  function editAgent(userItem) {
    if (!onEditUser) return
    onEditUser(userItem)
    setAgentFormOpen(true)
  }

  function updateVoiceDay(day, patch) {
    patchForm({
      voiceWeeklyHours: {
        ...voiceWeeklyHours,
        [day]: { ...voiceWeeklyHours[day], ...patch },
      },
    })
  }

  function updateVoiceSlot(day, slotIndex, field, value) {
    const slots = voiceWeeklyHours[day].slots.map((slot, index) => (
      index === slotIndex ? { ...slot, [field]: value } : slot
    ))
    updateVoiceDay(day, { slots })
  }

  function addVoiceSlot(day) {
    const slots = [...voiceWeeklyHours[day].slots, { start: '09:00', end: '18:00' }]
    updateVoiceDay(day, { slots })
  }

  function removeVoiceSlot(day, slotIndex) {
    const slots = voiceWeeklyHours[day].slots.filter((slot, index) => index !== slotIndex)
    updateVoiceDay(day, { slots: slots.length ? slots : [{ start: '00:00', end: '23:59' }] })
  }

  function addUnavailableHours() {
    patchForm({
      voiceUnavailableHours: [
        ...unavailableHours,
        { date: new Date().toISOString().slice(0, 10), start: '00:00', end: '23:59', reason: '' },
      ],
    })
  }

  function updateUnavailableHours(index, field, value) {
    patchForm({
      voiceUnavailableHours: unavailableHours.map((entry, itemIndex) => (
        itemIndex === index ? { ...entry, [field]: value } : entry
      )),
    })
  }

  function removeUnavailableHours(index) {
    patchForm({
      voiceUnavailableHours: unavailableHours.filter((entry, itemIndex) => itemIndex !== index),
    })
  }

  async function saveVoiceSettings(event) {
    event.preventDefault()
    await onSaveSettings({ ...customForm, voiceWeeklyHours }, 'Voice call settings saved')
  }

  async function deleteBillingProfile() {
    if (!window.confirm('Delete billing profile details for this company?')) return
    await savePatch(DEFAULT_BILLING_FIELDS, 'Billing profile deleted')
  }

  return (
    <div className="settings-reference-shell">
      <nav className="settings-reference-tabs" aria-label="Settings pages">
        {settingsTabs.map((tab) => (
          <button key={tab.id} className={activeSettingsTab === tab.id ? 'active' : ''} type="button" onClick={() => setActiveSettingsTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </nav>

      {activeSettingsTab === 'profile' && (
        <div className="settings-profile-grid">
          <section className="settings-card">
            <div className="settings-card-title"><UserRound size={22} /><h3>User Information</h3></div>
            <div className="settings-info-row"><strong>Username:</strong><span>{currentUser?.name || currentUser?.email || '-'}</span></div>
            <div className="settings-info-row"><strong>FTP Access:</strong><SwitchControl checked={Boolean(customForm.ftpAccessEnabled)} label={customForm.ftpAccessEnabled ? 'ON' : 'OFF'} onChange={(checked) => savePatch({ ftpAccessEnabled: checked }, 'Profile setting saved')} /></div>
          </section>

          <section className="settings-card">
            <div className="settings-card-title"><b className="google-mark">G</b><h3>Google Integration</h3></div>
            <div className="settings-info-row">
              <strong>Status:</strong>
              <span className="connection-pill warn"><Link2 size={15} /> Not Connected</span>
            </div>
            <p className="settings-muted">Connect your Google account to enable Sheets integration and other Google services.</p>
            <button className="settings-outline-button" type="button" onClick={() => setGoogleMessage('Google OAuth backend route is not configured yet. No token was requested or exposed.')}>
              <b className="google-color">G</b> Connect with Google
            </button>
            {googleMessage && <small className="settings-safe-note">{googleMessage}</small>}
          </section>

          <section className="settings-card">
            <div className="settings-card-title"><Shield size={22} /><h3>Two-Factor Authentication</h3></div>
            <div className="settings-info-row">
              <div>
                <strong>Status:</strong>
                <p className="settings-muted">Add an extra layer of security to your account by enabling two-factor authentication.</p>
              </div>
              <SwitchControl checked={Boolean(customForm.twoFactorEnabled)} label={customForm.twoFactorEnabled ? 'Enabled' : 'Disabled'} onChange={(checked) => savePatch({ twoFactorEnabled: checked }, 'Profile setting saved')} />
            </div>
          </section>

          <form className="settings-card settings-customization-card" onSubmit={onSaveCustomization}>
            <div className="settings-card-title"><Settings size={22} /><h3>Business Customization</h3></div>
            <div className="settings-form-grid compact">
              <label>App Name<input value={customForm.appName} onChange={(e) => patchForm({ appName: e.target.value })} /></label>
              <label>Company Name<input value={customForm.companyName} onChange={(e) => patchForm({ companyName: e.target.value })} /></label>
              <label>Industry<input value={customForm.industry} onChange={(e) => patchForm({ industry: e.target.value })} /></label>
              <label>Theme Color<input type="color" value={customForm.primaryColor} onChange={(e) => patchForm({ primaryColor: e.target.value })} /></label>
              <label>Currency<input value={customForm.currency} onChange={(e) => patchForm({ currency: e.target.value })} /></label>
              <label>Quotation Prefix<input value={customForm.quotationPrefix} onChange={(e) => patchForm({ quotationPrefix: e.target.value })} /></label>
              <label>Order Prefix<input value={customForm.orderPrefix} onChange={(e) => patchForm({ orderPrefix: e.target.value })} /></label>
              <label className="wide">Labels<textarea value={customForm.labelsText} onChange={(e) => patchForm({ labelsText: e.target.value })} /></label>
              <label className="wide">Sales Stages<textarea value={customForm.stagesText} onChange={(e) => patchForm({ stagesText: e.target.value })} /></label>
              <label className="wide">Bot Greeting<textarea value={customForm.botGreeting} onChange={(e) => patchForm({ botGreeting: e.target.value })} /></label>
              <label className="wide">Handoff Keywords<textarea value={customForm.handoffKeywordsText} onChange={(e) => patchForm({ handoffKeywordsText: e.target.value })} /></label>
              <label className="wide">Inventory Fields<textarea value={customForm.inventoryFieldsText} onChange={(e) => patchForm({ inventoryFieldsText: e.target.value })} /></label>
            </div>
            <label className="settings-switch-row">
              <SwitchControl checked={Boolean(customForm.botEnabled)} onChange={(checked) => patchForm({ botEnabled: checked })} />
              Enable Auto Bot
            </label>
            <div className="approval-settings-box">
              <strong>Quotation Approval Workflow</strong>
              <small>Customer quotation will go to manager first. Customer will receive it only after manager approval.</small>
              <label className="settings-switch-row">
                <SwitchControl checked={Boolean(customForm.quoteApprovalEnabled)} onChange={(checked) => patchForm({ quoteApprovalEnabled: checked })} />
                Enable Manager Approval Before Customer Quote
              </label>
              <div className="settings-form-grid compact">
                <label>Manager Name<input value={customForm.quoteApprovalManagerName || ''} onChange={(e) => patchForm({ quoteApprovalManagerName: e.target.value })} placeholder="Example: Sales Manager" /></label>
                <label>Manager WhatsApp Number<input value={customForm.quoteApprovalManagerPhone || ''} onChange={(e) => patchForm({ quoteApprovalManagerPhone: e.target.value.replace(/\D/g, '') })} placeholder="Example: 919876543210" /></label>
                <label>Manager Approval Template Name<input value={customForm.quoteApprovalTemplateName || ''} onChange={(e) => patchForm({ quoteApprovalTemplateName: e.target.value })} placeholder="quote_manager_approval_request" /></label>
                <label>Manager Approval Template Language<input value={customForm.quoteApprovalTemplateLanguage || 'en'} onChange={(e) => patchForm({ quoteApprovalTemplateLanguage: e.target.value })} placeholder="en" /></label>
                <label>Customer Quote Template Name<input value={customForm.customerQuoteTemplateName || ''} onChange={(e) => patchForm({ customerQuoteTemplateName: e.target.value })} placeholder="quote_customer_approval_request" /></label>
                <label>Customer Quote Template Language<input value={customForm.customerQuoteTemplateLanguage || 'en'} onChange={(e) => patchForm({ customerQuoteTemplateLanguage: e.target.value })} placeholder="en" /></label>
                <label>Order Acknowledgement Template Name<input value={customForm.orderAcknowledgementTemplateName || ''} onChange={(e) => patchForm({ orderAcknowledgementTemplateName: e.target.value })} placeholder="order_acknowledgement" /></label>
                <label>Order Acknowledgement Template Language<input value={customForm.orderAcknowledgementTemplateLanguage || 'en'} onChange={(e) => patchForm({ orderAcknowledgementTemplateLanguage: e.target.value })} placeholder="en" /></label>
              </div>
            </div>
            <button className="settings-primary-button" type="submit"><Save size={16} /> Save Customization</button>
            {settingsSaved && <small className="success-text">{settingsSaved}</small>}
          </form>
        </div>
      )}

      {activeSettingsTab === 'agents' && (
        <section className="settings-card settings-agents-card">
          <nav className="settings-subtabs" aria-label="Agents sections">
            <button className={activePeopleTab === 'agents' ? 'active' : ''} type="button" onClick={() => setActivePeopleTab('agents')}>Agents Management</button>
            <button className={activePeopleTab === 'teams' ? 'active' : ''} type="button" onClick={() => setActivePeopleTab('teams')}>Teams Management</button>
            <button className={activePeopleTab === 'roles' ? 'active' : ''} type="button" onClick={() => setActivePeopleTab('roles')}>Role Permissions</button>
          </nav>

          {activePeopleTab === 'agents' && (
            <>
              <div className="settings-table-toolbar">
                <span>{users.length} agents, {activeCount} active</span>
                {userRole === 'admin' && <button className="settings-primary-button" type="button" onClick={openAgentForm}><Plus size={18} /> Create Agent</button>}
              </div>
              {agentFormOpen && (
                <form className="settings-agent-form" onSubmit={submitAgent}>
                  <label>Name<input placeholder="Full name" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} /></label>
                  <label>Email<input placeholder="name@company.com" value={newUser.email} disabled={Boolean(editingUserId)} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} /></label>
                  <label>Password<input placeholder={editingUserId ? 'Leave blank to keep old password' : 'Temporary password'} value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} /></label>
                  <label>Role<select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}><option value="sales">Sales</option><option value="manager">Manager</option><option value="admin">Admin</option></select></label>
                  <div className="settings-form-actions">
                    <button className="settings-primary-button" type="submit">{editingUserId ? 'Update Agent' : 'Save Agent'}</button>
                    <button className="settings-outline-button" type="button" onClick={() => { if (onCancelUserEdit) onCancelUserEdit(); setAgentFormOpen(false) }}>Cancel</button>
                  </div>
                </form>
              )}
              <div className="settings-agent-table">
                <div className="settings-agent-head"><span>Name</span><span>Username</span><span>Email</span><span>Role</span><span>Actions</span></div>
                {!users.length && <EmptyState title="No data" text="Create an agent to give this tenant access." />}
                {users.map((item) => (
                  <div className="settings-agent-row" key={item.id}>
                    <strong>{item.name}</strong>
                    <span>{item.email?.split('@')[0] || '-'}</span>
                    <span>{item.email}</span>
                    <b className={`role-badge role-${item.role}`}>{item.role}</b>
                    <div className="settings-row-actions">
                      {userRole === 'admin' ? (
                        <>
                          <button type="button" onClick={() => editAgent(item)}><Pencil size={14} /> Edit</button>
                          <button type="button" onClick={() => onToggleUser(item)}>{item.active ? 'Deactivate' : 'Activate'}</button>
                          <button className="danger" type="button" onClick={() => onDeleteUser(item)}><Trash2 size={14} /> Delete</button>
                        </>
                      ) : <span>Admin only</span>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {activePeopleTab === 'teams' && (
            <div className="settings-empty-panel">
              <Users size={34} />
              <strong>No teams configured</strong>
              <span>Create agents first. Team routing can be added safely after a tenant-scoped teams table exists.</span>
              {userRole === 'admin' && <button className="settings-outline-button" type="button" onClick={() => { setActivePeopleTab('agents'); openAgentForm() }}><Plus size={16} /> Create Agent</button>}
            </div>
          )}

          {activePeopleTab === 'roles' && (
            <div className="settings-role-grid">
              {[
                ['Admin', 'Full settings, users, WhatsApp setup and audit access'],
                ['Manager', 'Inbox monitoring, templates, settings review and reports'],
                ['Sales', 'Assigned inbox conversations and sales workflow actions'],
              ].map(([role, detail]) => (
                <div key={role}><strong>{role}</strong><span>{detail}</span></div>
              ))}
            </div>
          )}
        </section>
      )}

      {activeSettingsTab === 'waba' && (
        <div className="settings-stack">
          <SettingToggleCard title="Marketing Messages Lite (MM Lite Status)" checked={Boolean(customForm.wabaMmLiteEnabled)} onChange={(checked) => savePatch({ wabaMmLiteEnabled: checked }, 'WABA setting saved')} />
          <SettingToggleCard title="Healthy Ecosystem Message Retry" checked={Boolean(customForm.wabaHealthyRetryEnabled)} onChange={(checked) => savePatch({ wabaHealthyRetryEnabled: checked }, 'WABA setting saved')} />
          <SettingToggleCard title="Whatsapp conversion events push to Meta" checked={Boolean(customForm.wabaConversionEventsEnabled)} onChange={(checked) => savePatch({ wabaConversionEventsEnabled: checked }, 'WABA setting saved')} />

          <section className="settings-card">
            <div className="settings-card-title"><Settings size={22} /><h3>WhatsApp Setup</h3></div>
            <div className="setup-grid">
              <span className={whatsappConfig?.accessTokenSet ? 'ok' : 'warn'}>Access token</span>
              <span className={whatsappConfig?.phoneNumberIdSet ? 'ok' : 'warn'}>Phone number ID</span>
              <span className={whatsappConfig?.phoneNumberMapped ? 'ok' : 'warn'}>Phone mapped</span>
              <span className={whatsappConfig?.verifyTokenSet ? 'ok' : 'warn'}>Verify token</span>
              <span className={whatsappConfig?.appSecretSet || !whatsappConfig?.webhookSignatureRequired ? 'ok' : 'warn'}>App secret</span>
              <span className={whatsappConfig?.testNumbersSet || status?.whatsappTestNumbersSet ? 'ok' : 'warn'}>Test numbers</span>
            </div>
            {whatsappConfig?.phoneNumberMappedTenantSlug && <p className="setup-copy">Incoming messages map to tenant: {whatsappConfig.phoneNumberMappedTenantSlug}</p>}
            {userRole === 'admin' && whatsappConfig?.phoneNumberIdSet && !whatsappConfig?.phoneNumberMappedToCurrentTenant && (
              <div className="inline-actions">
                <span className="setup-copy">Phone number ID is not mapped to this company.</span>
                <button type="button" onClick={onMapPhone}>Map Phone To This Company</button>
              </div>
            )}
            {warnings.length > 0 && <div className="warning-list">{warnings.map((warning) => <span key={warning}>{warning}</span>)}</div>}
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
            ) : <p className="setup-copy">WhatsApp test message is admin-only.</p>}
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

          <KnowledgeBaseManager />

          <section className="settings-card">
            <div className="module-title template-sync-head">
              <div><MessageCircle size={18} /><h3>Approved WhatsApp Templates</h3></div>
              <button type="button" onClick={onSyncTemplates} disabled={templateSyncing}>{templateSyncing ? 'Syncing...' : 'Sync from Meta'}</button>
            </div>
            <small className="setup-copy">Add only templates that are already approved in Meta WhatsApp Manager. This does not create templates inside Meta.</small>
            <form className="custom-form" onSubmit={onSaveTemplate}>
              <label>Template Name<input placeholder="quotation_followup" value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} /></label>
              <label>Language<input placeholder="en_US" value={templateForm.language} onChange={(e) => setTemplateForm({ ...templateForm, language: e.target.value })} /></label>
              <label>Body Preview<textarea placeholder="Your quotation is ready. Please confirm." value={templateForm.body} onChange={(e) => setTemplateForm({ ...templateForm, body: e.target.value })} /></label>
              <label className="settings-switch-row"><SwitchControl checked={Boolean(templateForm.active)} onChange={(checked) => setTemplateForm({ ...templateForm, active: checked })} /> Active</label>
              <div className="user-form-actions">
                <button className="user-action-primary" type="submit">{editingTemplateId ? 'Update Template' : 'Save Template'}</button>
                {editingTemplateId && <button className="user-action-neutral" type="button" onClick={onCancelTemplateEdit}>Cancel</button>}
              </div>
            </form>
            {!templates.length && <EmptyState title="No templates" text="Add approved Meta templates for expired 24-hour conversations." />}
            {!!templates.length && (
              <div className="user-table">
                <div className="user-table-head template-table-head"><span>Name</span><span>Language</span><span>Meta Status</span><span>Category</span><span>Active</span><span>Body</span><span>Actions</span></div>
                {templates.map((template) => (
                  <div className="user-row" key={template.id}>
                    <div className="user-name-cell"><strong>{template.name}</strong><small>ID: {String(template.id).slice(0, 8)}</small></div>
                    <span>{template.language}</span>
                    <i className={`meta-status-pill ${template.meta_status || 'manual'}`}>{template.meta_status || 'manual'}</i>
                    <span>{template.category || '-'}</span>
                    <i className={template.active ? 'status-active' : 'status-inactive'}>{template.active ? 'Active' : 'Inactive'}</i>
                    <span>{template.body}</span>
                    <div className="user-actions">
                      <button className="user-action-edit" type="button" onClick={() => onEditTemplate(template)}>Edit</button>
                      <button className={template.active ? 'user-action-pause' : 'user-action-enable'} type="button" onClick={() => onToggleTemplate(template)}>{template.active ? 'Deactivate' : 'Activate'}</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {activeSettingsTab === 'billing' && (
        <form className="settings-card billing-form" onSubmit={(event) => { event.preventDefault(); onSaveSettings(customForm, 'Billing profile saved') }}>
          <div className="settings-card-title split"><div><CreditCard size={22} /><h3>Billing & GST Details / Business Information</h3></div><button className="settings-danger-outline" type="button" onClick={deleteBillingProfile}><Trash2 size={17} /> Delete Profile</button></div>
          <div className="settings-form-grid">
            <label><span className="required">*</span> Business Name<input required placeholder="Enter your business name" value={customForm.billingBusinessName || ''} onChange={(e) => patchForm({ billingBusinessName: e.target.value })} /></label>
            <label>GST Number<input placeholder="Enter GST number (optional)" value={customForm.billingGstNumber || ''} onChange={(e) => patchForm({ billingGstNumber: e.target.value.toUpperCase() })} /></label>
            <label>PAN Number<input placeholder="ENTER PAN NUMBER (OPTIONAL)" value={customForm.billingPanNumber || ''} onChange={(e) => patchForm({ billingPanNumber: e.target.value.toUpperCase() })} /></label>
            <label><span className="required">*</span> Country<select required value={customForm.billingCountry || 'India'} onChange={(e) => patchForm({ billingCountry: e.target.value })}><option value="India">India</option></select></label>
          </div>
          <div className="settings-section-divider"><Building2 size={21} /><strong>Billing Address</strong></div>
          <div className="settings-form-grid">
            <label><span className="required">*</span> State<input required placeholder="Select State" value={customForm.billingState || ''} onChange={(e) => patchForm({ billingState: e.target.value })} /></label>
            <label>City<input placeholder="Enter city name" value={customForm.billingCity || ''} onChange={(e) => patchForm({ billingCity: e.target.value })} /></label>
            <label className="wide"><span className="required">*</span> Billing Address<textarea required maxLength={200} placeholder="Enter complete billing address" value={customForm.billingAddress || ''} onChange={(e) => patchForm({ billingAddress: e.target.value })} /><small>{String(customForm.billingAddress || '').length} / 200</small></label>
            <label><span className="required">*</span> Pin Code<input required inputMode="numeric" maxLength={6} placeholder="Enter 6-digit pin code" value={customForm.billingPinCode || ''} onChange={(e) => patchForm({ billingPinCode: e.target.value.replace(/\D/g, '').slice(0, 6) })} /></label>
            <label><span className="required">*</span> Email<input required type="email" placeholder="Enter email address" value={customForm.billingEmail || ''} onChange={(e) => patchForm({ billingEmail: e.target.value })} /></label>
            <label><span className="required">*</span> Contact Number<input required inputMode="numeric" maxLength={10} placeholder="Enter 10-digit contact number" value={customForm.billingContactNumber || ''} onChange={(e) => patchForm({ billingContactNumber: e.target.value.replace(/\D/g, '').slice(0, 10) })} /></label>
          </div>
          <div className="settings-form-actions bottom">
            <button className="settings-outline-button" type="button" onClick={() => patchForm(DEFAULT_BILLING_FIELDS)}>Reset</button>
            <button className="settings-primary-button" type="submit"><Save size={17} /> Save Profile</button>
          </div>
          {settingsSaved && <small className="success-text">{settingsSaved}</small>}
        </form>
      )}

      {activeSettingsTab === 'voice' && (
        <form className="voice-settings-form" onSubmit={saveVoiceSettings}>
          <section className="settings-card">
            <div className="settings-card-title split">
              <div><PhoneCall size={22} /><h3>Voice Call Settings</h3></div>
              <div className="settings-form-actions">
                <button className="settings-outline-button" type="button" onClick={() => setVoiceHelpOpen((current) => !current)}><HelpCircle size={17} /> How it Works</button>
                <button className="settings-outline-button" type="button" onClick={() => setActiveSettingsTab('agents')}><Users size={17} /> Manage Agents</button>
              </div>
            </div>
            {voiceHelpOpen && <div className="settings-safe-note">These controls store tenant voice preferences only. WhatsApp calling availability depends on Meta account eligibility and approved product access.</div>}
            <VoiceToggleRow icon={PhoneCall} title="Allow voice calls" text="Make and receive calls with this phone number." checked={Boolean(customForm.voiceCallsEnabled)} onChange={(checked) => patchForm({ voiceCallsEnabled: checked })} />
            <VoiceToggleRow icon={Headphones} title="Allow people to request a callback for missed calls" text="If you're unable to answer a call, let people request a call back." checked={Boolean(customForm.voiceCallbackEnabled)} onChange={(checked) => patchForm({ voiceCallbackEnabled: checked })} />
            <VoiceToggleRow icon={Info} title="Display call buttons" text="People could still call this number from a message containing a call button." checked={customForm.voiceDisplayCallButtons !== false} onChange={(checked) => patchForm({ voiceDisplayCallButtons: checked })} />
          </section>

          <section className="settings-card">
            <div className="settings-card-title"><Clock3 size={22} /><h3>Available call hours</h3></div>
            <p className="settings-muted">Set regular calling hours for your business. If you don&apos;t set your call hours, people will always be able to call you.</p>
            <div className="settings-radio-row">
              <label><input type="radio" checked={(customForm.voiceCallHoursMode || 'specific') === 'all'} onChange={() => patchForm({ voiceCallHoursMode: 'all' })} /> All time</label>
              <label><input type="radio" checked={(customForm.voiceCallHoursMode || 'specific') === 'specific'} onChange={() => patchForm({ voiceCallHoursMode: 'specific' })} /> Specific time</label>
            </div>
            <label className="timezone-field">Time zone<select value={customForm.voiceTimeZone || 'Asia/Kolkata (GMT+05:30)'} onChange={(e) => patchForm({ voiceTimeZone: e.target.value })}><option>Asia/Kolkata (GMT+05:30)</option><option>UTC (GMT+00:00)</option></select></label>
            {(customForm.voiceCallHoursMode || 'specific') === 'specific' && (
              <div className="voice-hours-grid">
                {WEEK_DAYS.map((day) => (
                  <div className="voice-day-row" key={day}>
                    <SwitchControl checked={voiceWeeklyHours[day].enabled} onChange={(checked) => updateVoiceDay(day, { enabled: checked })} />
                    <strong>{day}</strong>
                    <div className="voice-slots">
                      {voiceWeeklyHours[day].slots.map((slot, slotIndex) => (
                        <div className="voice-slot-row" key={`${day}-${slotIndex}`}>
                          <span>Slot {slotIndex + 1}</span>
                          <input type="time" value={slot.start} onChange={(e) => updateVoiceSlot(day, slotIndex, 'start', e.target.value)} />
                          <span>to</span>
                          <input type="time" value={slot.end} onChange={(e) => updateVoiceSlot(day, slotIndex, 'end', e.target.value)} />
                          <button type="button" aria-label={`Add ${day} slot`} onClick={() => addVoiceSlot(day)}><Plus size={18} /></button>
                          {voiceWeeklyHours[day].slots.length > 1 && <button type="button" aria-label={`Remove ${day} slot`} onClick={() => removeVoiceSlot(day, slotIndex)}><X size={18} /></button>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="settings-section-divider"><CalendarClock size={21} /><strong>Holiday list / Unavailable call hours</strong></div>
            <p className="settings-muted">Set custom times, such as holidays or special events, when your business is unable to receive calls.</p>
            {!unavailableHours.length && <div className="settings-no-entries">No entries</div>}
            {unavailableHours.map((entry, index) => (
              <div className="unavailable-row" key={`${entry.date}-${index}`}>
                <input type="date" value={entry.date || ''} onChange={(e) => updateUnavailableHours(index, 'date', e.target.value)} />
                <input type="time" value={entry.start || '00:00'} onChange={(e) => updateUnavailableHours(index, 'start', e.target.value)} />
                <input type="time" value={entry.end || '23:59'} onChange={(e) => updateUnavailableHours(index, 'end', e.target.value)} />
                <input placeholder="Reason" value={entry.reason || ''} onChange={(e) => updateUnavailableHours(index, 'reason', e.target.value)} />
                <button type="button" onClick={() => removeUnavailableHours(index)}><Trash2 size={16} /></button>
              </div>
            ))}
            <button className="settings-outline-button add-unavailable" type="button" onClick={addUnavailableHours}><Plus size={17} /> Add unavailable hours</button>
          </section>
          <button className="settings-primary-button centered" type="submit">Save</button>
          {settingsSaved && <small className="success-text centered-text">{settingsSaved}</small>}
        </form>
      )}

      {activeSettingsTab === 'inbox' && (
        <section className="settings-card inbox-settings-card">
          <div className="settings-card-title"><Inbox size={22} /><h3>Default Chat Assignment</h3></div>
          <label className="settings-switch-row large">
            <SwitchControl checked={Boolean(customForm.inboxAutoAssign)} onChange={(checked) => patchForm({ inboxAutoAssign: checked })} />
            Auto-assign new chats
          </label>
          <button className="settings-primary-button centered" type="button" onClick={() => onSaveSettings(customForm, 'Inbox settings saved')}>Save</button>
          {settingsSaved && <small className="success-text centered-text">{settingsSaved}</small>}
        </section>
      )}
    </div>
  )
}

function normalizeVoiceWeeklyHours(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  return WEEK_DAYS.reduce((acc, day) => {
    const dayValue = source[day] && typeof source[day] === 'object' ? source[day] : DEFAULT_VOICE_WEEKLY_HOURS[day]
    const slots = Array.isArray(dayValue.slots) && dayValue.slots.length
      ? dayValue.slots.map((slot) => ({
        start: String(slot.start || '00:00').slice(0, 5),
        end: String(slot.end || '23:59').slice(0, 5),
      }))
      : [{ start: '00:00', end: '23:59' }]
    acc[day] = { enabled: dayValue.enabled !== false, slots }
    return acc
  }, {})
}

function SwitchControl({ checked, label, onChange }) {
  return (
    <button className={`settings-switch ${checked ? 'on' : ''}`} type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
      <span />
      {label && <b>{label}</b>}
    </button>
  )
}

function SettingToggleCard({ title, checked, onChange }) {
  return (
    <section className="settings-card setting-toggle-card">
      <div className="settings-card-title"><h3>{title}</h3><Info size={18} /></div>
      <SwitchControl checked={checked} label={checked ? 'ON' : 'OFF'} onChange={onChange} />
    </section>
  )
}

function VoiceToggleRow({ icon: Icon, title, text, checked, onChange }) {
  return (
    <div className="voice-toggle-row">
      <span><Icon size={22} /></span>
      <div><strong>{title}</strong><small>{text}</small></div>
      <SwitchControl checked={checked} onChange={onChange} />
    </div>
  )
}

export default App
