import { useEffect, useMemo, useRef, useState } from 'react'
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
  Moon,
  RefreshCw,
  Sun,
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
import { api, formatApiIssue, isProduction } from './apiClient'
import { ProtectedImage, ProtectedMedia, ProtectedMediaLink } from './ProtectedMedia'
import {
  buildAppSettingsPayload,
  defaultAppSettings,
  initials,
  toCsv,
} from './appUtils'
import {
  BotStudioPage,
  BulkMessagePage,
  CannedMessagePage,
  ChatHeader,
  ContactsListPage,
  ControlCenterPage,
  ConversationList,
  DashboardPage,
  DraftsPanel,
  EmptyState,
  FeatureGatePage,
  InventoryPage,
  PlatformPage,
  ProfilePanel,
  SalesWorkspacePage,
  SingleMessagePage,
  TallyIntegrationPage,
  UsersPage,
  WorkspaceHeading,
} from './WorkspacePages'
import './public-site.css'
import './workspace-legacy.css'
import './authenticated-workspace.css'
import './suite-workspace.css'
import './suite-polish.css'

function clearStoredSession() {
  localStorage.removeItem('token')
  delete api.defaults.headers.common.Authorization
}

const LEGAL_EFFECTIVE_DATE = '29 May 2026'
const LEGAL_SUPPORT_EMAIL = 'saurabh@blueoceansteels.com'
const LEGAL_WEBSITE_URL = 'https://bos-whatsapp-frontend.onrender.com/'
const LEGAL_COMPANY_NAME = 'BLUE OCEAN STEELS LLP'

const legalPages = {
  '/privacy-policy': {
    title: 'Privacy Policy',
    intro: `${LEGAL_COMPANY_NAME} operates this WhatsApp CRM and automation platform to help businesses connect their official Meta Business and WhatsApp Business accounts using Meta’s official login and Embedded Signup flow.`,
    sections: [
      {
        title: 'Information We Collect',
        body: 'When a business user connects their Meta or WhatsApp Business account, we may collect and store the following information after the user grants permission:',
        bullets: [
          'Meta Business Portfolio ID',
          'WhatsApp Business Account ID',
          'WhatsApp phone number ID',
          'Connected business name and account details',
          'Message template information',
          'WhatsApp messaging metadata required to provide the service',
          'Access tokens or authorization data required to operate the connected account',
          'User account details required for login, support, billing, and security',
        ],
      },
      {
        title: 'Password Safety',
        body: 'We do not ask users to share their Facebook password, Meta password, or WhatsApp password with us.',
      },
      {
        title: 'How We Use Information',
        body: 'We use this information only to:',
        bullets: [
          'Connect the user’s own or authorized Meta Business and WhatsApp Business assets',
          'Send and receive WhatsApp messages according to WhatsApp Business Platform rules',
          'Manage WhatsApp templates, phone numbers, and account settings where permission is granted',
          'Display CRM, inbox, reporting, and automation features inside the platform',
          'Maintain security, audit logs, and tenant isolation',
          'Provide support and troubleshoot connection issues',
        ],
      },
      {
        title: 'WhatsApp Messaging Compliance',
        body: 'Users are responsible for sending messages only to customers who have provided proper opt-in where required. Marketing, utility, and authentication messages must follow WhatsApp Business Platform rules. Approved templates must be used where required. The platform must not be used for spam, misleading messages, prohibited content, or unauthorized messaging.',
      },
      {
        title: 'Data Storage and Security',
        body: 'Access tokens and sensitive authorization data are stored only on our backend systems. We do not store App Secrets, client secrets, or system tokens in frontend code. We use reasonable technical and organizational security measures including HTTPS, backend-only token handling, role-based access controls, and tenant isolation to protect connected business data.',
      },
      {
        title: 'Tenant Isolation',
        body: 'Each customer’s Meta Business account, WhatsApp Business Account, phone number, contacts, messages, templates, and tokens are stored and processed separately. One customer’s WhatsApp data is not used for another customer.',
      },
      {
        title: 'Data Sharing',
        body: 'We do not sell user data. We only share data when required to provide the service, comply with law, protect security, or integrate with Meta/WhatsApp services authorized by the user.',
      },
      {
        title: 'Data Retention',
        body: 'We retain data only as long as necessary to provide the service, comply with legal obligations, resolve disputes, maintain security, or support customer requests. Users may request deletion of their data as described in our Data Deletion page.',
      },
      {
        title: 'Disconnecting Meta or WhatsApp Access',
        body: 'Users may disconnect their Meta or WhatsApp Business connection from our platform where available. Users may also revoke app access from Meta Business settings or Facebook settings.',
      },
      {
        title: 'Data Deletion Requests',
        body: `Users can request deletion of their account data by contacting us at ${LEGAL_SUPPORT_EMAIL}. Please include your business name, registered email address, and connected WhatsApp Business Account details so we can verify and process the request.`,
      },
    ],
  },
  '/terms': {
    title: 'Terms of Service',
    intro: `These Terms of Service govern the use of the ${LEGAL_COMPANY_NAME} WhatsApp CRM and automation platform. By using this platform, you agree to these terms.`,
    sections: [
      {
        title: 'Service Description',
        body: 'Our platform helps authorized business users connect their official Meta Business and WhatsApp Business accounts using Meta’s official login and Embedded Signup flow. The platform may provide CRM, inbox, message sending, automation, reporting, template management, and WhatsApp Business account connection features.',
      },
      {
        title: 'User Responsibilities',
        body: 'You agree that:',
        bullets: [
          'You will only connect Meta Business, WhatsApp Business Account, and phone numbers that you own or are authorized to use.',
          'You will provide truthful business information.',
          'You will not use fake business details, fake websites, or unauthorized assets.',
          'You will comply with Meta Platform Terms, WhatsApp Business Platform rules, and applicable laws.',
          'You will not use the platform for spam, fraud, harassment, misleading messages, prohibited goods or services, or unauthorized messaging.',
          'You will obtain proper customer opt-in where required before sending WhatsApp messages.',
          'You will use approved templates where required by WhatsApp rules.',
        ],
      },
      {
        title: 'Meta and WhatsApp Connection',
        body: 'When you connect your Meta or WhatsApp Business account, you knowingly grant permissions through Meta’s official authorization flow. We access only the assets and permissions authorized by you. You may disconnect or revoke access where supported by the platform or through Meta/Facebook settings.',
      },
      {
        title: 'Messaging Rules',
        body: 'You are responsible for the content and timing of messages sent through your connected WhatsApp Business account. Marketing, utility, and authentication messages must comply with WhatsApp rules. Free-form customer service messages may be limited by WhatsApp’s customer service window.',
      },
      {
        title: 'Account Security',
        body: 'You are responsible for maintaining the security of your platform account and ensuring that only authorized team members access your business data.',
      },
      {
        title: 'Data and Privacy',
        body: 'Our collection, use, storage, and deletion of data are described in our Privacy Policy and Data Deletion page.',
      },
      {
        title: 'Service Limitations',
        body: 'Meta, Facebook, and WhatsApp may review, restrict, suspend, or limit access to business assets, phone numbers, templates, messaging limits, or API permissions. We do not control Meta’s approval, App Review, business verification, quality rating, messaging limits, or enforcement decisions.',
      },
      {
        title: 'Prohibited Use',
        body: 'You must not use the platform to:',
        bullets: [
          'Send spam or unsolicited messages',
          'Mislead customers',
          'Violate WhatsApp Business Platform rules',
          'Use another client’s WABA, phone number, data, or tokens',
          'Bypass Meta App Review, business verification, access verification, or permission approval',
          'Use unofficial or private Meta APIs',
          'Scrape Meta, Facebook, or WhatsApp pages',
          'Share or expose app secrets, tokens, or credentials',
        ],
      },
      {
        title: 'Termination',
        body: 'We may suspend or terminate access if a user violates these terms, creates security risk, violates Meta or WhatsApp policies, or uses the service unlawfully.',
      },
    ],
  },
  '/data-deletion': {
    title: 'Data Deletion Instructions',
    intro: `If you have connected your Meta Business or WhatsApp Business account to the ${LEGAL_COMPANY_NAME} WhatsApp CRM platform, you may request deletion of your data.`,
    sections: [
      {
        title: 'How to Request Data Deletion',
        body: `To request deletion, email us at ${LEGAL_SUPPORT_EMAIL}.`,
        bullets: [
          'Your full name',
          'Your business name',
          'Your registered email address',
          'Your Meta Business Portfolio ID, if known',
          'Your WhatsApp Business Account ID, if known',
          'Your WhatsApp phone number ID, if known',
          'A clear request such as: “Please delete my connected Meta/WhatsApp data.”',
        ],
      },
      {
        title: 'What We Delete',
        body: 'After verifying your request, we will delete or anonymize data associated with your account where legally and technically possible, including:',
        bullets: [
          'Connected Meta Business account details',
          'WhatsApp Business Account ID',
          'WhatsApp phone number ID',
          'Stored access tokens or authorization data',
          'CRM connection records',
          'Stored message logs, templates, or contact data where applicable and not legally required to retain',
        ],
      },
      {
        title: 'Disconnecting Access',
        body: 'You may also disconnect or revoke access from Meta/Facebook settings. Revoking access may stop future data access but may not automatically delete previously stored data from our systems. To delete stored data, please submit a deletion request using the email above.',
      },
      {
        title: 'Processing Time',
        body: 'We will process verified deletion requests within a reasonable time, unless retention is required for legal, security, fraud prevention, billing, dispute resolution, or compliance purposes.',
      },
    ],
  },
}

function PublicLegalPage({ path, appSettings }) {
  const page = legalPages[path] || legalPages['/privacy-policy']
  const platformName = appSettings.appName || 'BOS WhatsApp CRM'

  return (
    <main className="public-site legal-site">
      <header className="public-header">
        <a className="public-brand" href="/" aria-label={`${platformName} home`}>
          <span><MessageCircle size={26} /></span>
          <div>
            <strong>{platformName}</strong>
            <small>Business Automation Platform</small>
          </div>
        </a>
        <nav className="public-nav">
          <a href="/privacy-policy">Privacy Policy</a>
          <a href="/terms">Terms</a>
          <a href="/data-deletion">Data Deletion</a>
        </nav>
        <div className="public-actions">
          <a className="public-ghost" href="/">Back to Home</a>
        </div>
      </header>

      <section className="legal-hero">
        <span className="hero-kicker"><Shield size={15} /> Legal & Compliance</span>
        <h1>{page.title}</h1>
        <p><strong>Effective Date:</strong> {LEGAL_EFFECTIVE_DATE}</p>
        <p>{page.intro}</p>
      </section>

      <section className="legal-content">
        {page.sections.map((section) => (
          <article className="legal-card" key={section.title}>
            <h2>{section.title}</h2>
            {section.body && <p>{section.body}</p>}
            {section.bullets && (
              <ul>
                {section.bullets.map((item) => <li key={item}>{item}</li>)}
              </ul>
            )}
          </article>
        ))}

        <article className="legal-card legal-contact-card">
          <h2>Contact</h2>
          <p>
            {LEGAL_COMPANY_NAME}<br />
            Email: <a href={`mailto:${LEGAL_SUPPORT_EMAIL}`}>{LEGAL_SUPPORT_EMAIL}</a><br />
            Website: <a href={LEGAL_WEBSITE_URL}>{LEGAL_WEBSITE_URL}</a>
          </p>
        </article>
      </section>

      <footer className="public-footer">
        <div className="public-brand">
          <span><MessageCircle size={23} /></span>
          <strong>{platformName}</strong>
        </div>
        <p>WhatsApp Business operations with tenant-aware security and policy controls.</p>
      </footer>
    </main>
  )
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
     setError(
  err.response?.data?.error ||
  err.response?.data?.message ||
  err.message ||
  'Login failed'
)
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
  <a href="/privacy-policy">Privacy</a>
  <a href="/terms">Terms</a>
  <a href="/data-deletion">Data Deletion</a>
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
  const completionStartedRef = useRef(false)

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

  async function completeIfReady(nextInfo = {}, allowBackendRecovery = false) {
    const code = authCodeRef.current || ''
    const phoneNumberId = nextInfo.phoneNumberId || signupInfoRef.current.phoneNumberId || ''
    const wabaId = nextInfo.wabaId || signupInfoRef.current.wabaId || ''
    const businessId = nextInfo.businessId || signupInfoRef.current.businessId || ''

    if (!code || completionStartedRef.current) return false
    if ((!phoneNumberId || !wabaId) && !allowBackendRecovery) return false

    clearSignupTimeout()
    completionStartedRef.current = true

    await onComplete({
      code,
      phoneNumberId,
      wabaId,
      businessId,
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
    completionStartedRef.current = false
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

        if (!completionStartedRef.current && (!phoneNumberId || !wabaId)) {
          console.error('WA Embedded Signup completed without required phone or WABA identifiers')

          completeIfReady({}, true).catch((error) => {
            console.error('Embedded signup backend recovery failed:', error)
          })
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
  const defaultTallySettings = {
    enabled: false,
    productType: 'tallyprime',
    gatewayUrl: '',
    companyName: '',
    salesVoucherType: 'Sales',
    salesLedgerName: 'Sales',
    salesLedgerParent: 'Sales Accounts',
    customerLedgerParent: 'Sundry Debtors',
    lastTestedAt: null,
    lastTestStatus: '',
    lastError: '',
  }
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
    const emptyAutoReplyRuleForm = {
    name: '',
    triggerType: 'contains',
    triggerValue: '',
    replyText: '',
    priority: 100,
    active: true,
    sendOncePerContact: false,
  }
  const [autoReplyRules, setAutoReplyRules] = useState([])
  const [autoReplyRuleForm, setAutoReplyRuleForm] = useState(emptyAutoReplyRuleForm)
  const [editingAutoReplyRuleId, setEditingAutoReplyRuleId] = useState('')
  const [autoReplyRulesLoading, setAutoReplyRulesLoading] = useState(false)
  const [autoReplyRuleSaving, setAutoReplyRuleSaving] = useState(false)
  const [autoReplyRuleActionLoading, setAutoReplyRuleActionLoading] = useState('')
  const [tallySettings, setTallySettings] = useState(defaultTallySettings)
  const [tallyLogs, setTallyLogs] = useState([])
  const [tallySaving, setTallySaving] = useState(false)
  const [tallyTesting, setTallyTesting] = useState(false)
  const [tallySyncingOrderId, setTallySyncingOrderId] = useState('')
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
  const [composerMode, setComposerMode] = useState('text')
  const [composerMediaType, setComposerMediaType] = useState('image')
  const [composerMediaFileName, setComposerMediaFileName] = useState('')
  const [composerMediaPreviewUrl, setComposerMediaPreviewUrl] = useState('')
  const [composerUploadProgress, setComposerUploadProgress] = useState(0)
  const composerFileInputRef = useRef(null)
  const composerMediaPreviewRef = useRef('')
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('bosSidebarCollapsed') === 'true')
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('bosTheme') === 'dark')
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

    useEffect(() => {
    localStorage.setItem('bosSidebarCollapsed', sidebarCollapsed ? 'true' : 'false')
  }, [sidebarCollapsed])

  useEffect(() => {
    const theme = darkMode ? 'dark' : 'light'
    document.documentElement.dataset.theme = theme
    localStorage.setItem('bosTheme', theme)
  }, [darkMode])

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

  const suiteNavigation = useMemo(() => {
    const items = [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'inbox', label: 'Inbox', icon: Inbox },
      {
        id: 'sendMessage',
        label: 'Messaging',
        icon: MessageCircle,
        children: [
          { id: 'sendSingle', label: 'Single Message', icon: Send },
          { id: 'sendBulk', label: 'Bulk Campaigns', icon: Megaphone },
        ],
      },
      {
        id: 'salesSuite',
        label: 'Sales',
        icon: ShoppingCart,
        children: [
          { id: 'new', label: 'Enquiries', icon: Bell },
          { id: 'sales', label: 'Pipeline', icon: Activity },
          { id: 'quotes', label: 'Quotations', icon: FileText },
          { id: 'orders', label: 'Orders', icon: ClipboardList },
          { id: 'inventory', label: 'Products', icon: Boxes },
        ],
      },
      {
        id: 'contactsSuite',
        label: 'Contacts',
        icon: Users,
        children: [
          { id: 'contactsList', label: 'All Contacts', icon: Users },
          { id: 'optOuts', label: 'Opt-outs', icon: Shield },
        ],
      },
      { id: 'bot', label: 'Automation', icon: Bot },
      { id: 'integrations', label: 'Integrations', icon: Sparkles },
      { id: 'controlCenter', label: 'Control Center', icon: Settings },
    ]

    if (user?.role === 'admin') {
      items.splice(2, 0, { id: 'connectWhatsApp', label: 'WhatsApp Setup', icon: Link2 })
      items.push({ id: 'users', label: 'Team & Roles', icon: Users })
    }

    return items
  }, [user?.role])

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
    let lastMessage = ''
    let lastShownAt = 0

    function showIssueToast(text) {
      const message = String(text || 'Frontend/API issue detected')
      const now = Date.now()

      if (message === lastMessage && now - lastShownAt < 5000) {
        return
      }

      lastMessage = message
      lastShownAt = now

      setNotice({ text: message, type: 'error' })
      window.setTimeout(() => {
        setNotice((current) => (current?.text === message ? null : current))
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

function apiErrorMessage(err, fallback = 'Request failed') {
  const backendMessage =
    err.response?.data?.error ||
    err.response?.data?.message

  if (backendMessage) return backendMessage

  if (err.message === 'Network Error') {
    return 'Network error: backend unreachable or CORS blocked this frontend origin.'
  }

  return err.message || fallback
}

async function loadTallyIntegration() {
  if (!canMonitor) return

  const [settingsRes, logsRes] = await Promise.all([
    api.get('/api/tally/settings', { silentError: true }).catch(() => ({ data: defaultTallySettings })),
    api.get('/api/tally/logs', { silentError: true }).catch(() => ({ data: [] })),
  ])

  setTallySettings({ ...defaultTallySettings, ...settingsRes.data })
  setTallyLogs(logsRes.data)
}

async function saveTallySettings(form) {
  if (user?.role !== 'admin') {
    notify('Admin access required', 'error')
    return
  }

  setTallySaving(true)
  try {
    const res = await api.put('/api/tally/settings', form)
    setTallySettings({ ...defaultTallySettings, ...res.data })
    notify('Tally settings saved')
    await loadTallyIntegration()
  } catch (err) {
    notify(apiErrorMessage(err, 'Tally settings save failed'), 'error')
  } finally {
    setTallySaving(false)
  }
}

async function testTallyConnection(form) {
  if (user?.role !== 'admin') {
    notify('Admin access required', 'error')
    return
  }

  setTallyTesting(true)
  try {
    const res = await api.post('/api/tally/test', form)
    notify(res.data?.message || 'Tally gateway connected')
    await loadTallyIntegration()
  } catch (err) {
    notify(apiErrorMessage(err, 'Tally connection test failed'), 'error')
    await loadTallyIntegration()
  } finally {
    setTallyTesting(false)
  }
}

async function syncTallyOrder(orderId, force = false) {
  if (!orderId) return

  setTallySyncingOrderId(orderId)
  try {
    await api.post(`/api/tally/orders/${orderId}/sync`, { force })
    notify('Order synced to Tally')
    await loadTallyIntegration()
  } catch (err) {
    if (err.response?.status === 409 && !force) {
      const confirmed = window.confirm(`${err.response.data?.error || 'Order already synced.'}\n\nForce sync can create duplicate vouchers in Tally. Continue?`)
      if (confirmed) {
        await syncTallyOrder(orderId, true)
        return
      }
    } else {
      notify(apiErrorMessage(err, 'Tally sync failed'), 'error')
      await loadTallyIntegration()
    }
  } finally {
    setTallySyncingOrderId('')
  }
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
        calls.push(api.get('/api/auto-reply-rules', { silentError: true }).catch(() => ({ data: [] })))
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
        autoReplyRulesRes,
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
      if (autoReplyRulesRes) setAutoReplyRules(autoReplyRulesRes.data)
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

async function loadMessages(contactId, markRead = false, options = {}) {
    if (!contactId) return

    if (markRead) {
      await api.post(`/api/conversations/${contactId}/read`, {}, { silentError: Boolean(options.silentError) })
    }

    const res = await api.get(`/api/conversations/${contactId}/messages`, {
      silentError: Boolean(options.silentError),
    })

    setMessages((currentMessages) => {
      const stillSelected = selectedId === contactId || options.force === true
      return stillSelected ? res.data : currentMessages
    })
  }

  useEffect(() => {
    // Data fetch is intentionally triggered by auth/filter changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, filter, windowFilter])

  useEffect(() => {
    if (!user?.id || activePage !== 'integrations') return
    loadTallyIntegration()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, activePage])

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

    setSendError('')

    loadMessages(selected.id, true)
      .then(() => {
        setConversations((current) => current.map((item) => (
          item.id === selected.id
            ? { ...item, unread_count: 0 }
            : item
        )))
      })
      .catch((err) => {
        notify(apiErrorMessage(err, 'Unable to load messages'), 'error')
      })

    if (canMonitor) {
      api.get(`/api/contacts/${selected.id}/assignment-history`)
        .then((res) => setAssignmentHistory(res.data))
        .catch(() => setAssignmentHistory([]))
    }

    api.get(`/api/contacts/${selected.id}/timeline`)
      .then((res) => setTimeline(res.data))
      .catch(() => setTimeline([]))

    setLeadForm({
      name: selected.name || '',
      company: selected.company || '',
      stage: selected.stage || 'new',
      notes: selected.notes || '',
      label: selected.label || 'New Enquiry',
      assigned_to: selected.assigned_to || '',
      assignment_reason: '',
    })
    setComposerMode('text')
    clearComposerMedia()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id])

useEffect(() => () => {
  if (composerMediaPreviewRef.current) {
    URL.revokeObjectURL(composerMediaPreviewRef.current)
  }
}, [])

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
  setTallySettings(defaultTallySettings)
  setTallyLogs([])
  setTallySyncingOrderId('')
}

useEffect(() => {
  window.addEventListener('bos-auth-expired', logout)
  return () => window.removeEventListener('bos-auth-expired', logout)
}, [])

useEffect(() => {
  if (!user?.id) return undefined
  if (isSuperAdminUser) return undefined
  if (!selectedId) return undefined

const interval = window.setInterval(() => {
    loadMessages(selectedId, false, { silentError: true }).catch(() => {})
  }, 30000)

  return () => window.clearInterval(interval)
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [user?.id, selectedId])

const publicLegalPath = window.location.pathname.replace(/\/$/, '') || '/'

if (legalPages[publicLegalPath]) {
  return <PublicLegalPage path={publicLegalPath} appSettings={appSettings} />
}

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
  const proof = window.prompt(
    `Proof for opting-in ${contact.name || contact.phone} again?\n\nExample: Customer replied START on WhatsApp / Customer requested opt-in on call / Written consent received.`,
    'Customer requested opt-in'
  )

  if (proof === null) return

  const cleanProof = proof.trim()

  if (cleanProof.length < 8) {
    notify('Opt-in proof is required for compliance', 'error')
    return
  }

  updateContactOptOut(contact.id, false, cleanProof)
}

async function completeEmbeddedSignup({ code, phoneNumberId, wabaId, businessId }) {
  setConnectingWhatsApp(true)

  try {
    await api.post('/api/whatsapp/embedded-signup/complete', {
      code,
      phoneNumberId,
      wabaId,
      businessId,
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
      'integrations',
    ]
const monitorOnlyPages = ['controlCenter', 'settings', 'webhooks', 'outbound', 'optOuts', 'audit', 'sendBulk', 'integrations', 'billing', 'voice', 'automation']
const adminOnlyPages = ['users', 'connectWhatsApp', 'settings', 'billing']
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
      } else if (page === 'bot') {
    loadAutoReplyRules()
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

function clearComposerMedia(options = {}) {
  const { clearInput = true } = options

  if (composerMediaPreviewRef.current) {
    URL.revokeObjectURL(composerMediaPreviewRef.current)
    composerMediaPreviewRef.current = ''
  }

  setComposerMediaFileName('')
  setComposerMediaPreviewUrl('')
  setComposerUploadProgress(0)

  if (clearInput && composerFileInputRef.current) {
    composerFileInputRef.current.value = ''
  }
}

function handleComposerModeChange(event) {
  const nextMode = event.target.value
  setComposerMode(nextMode)
  setSendError('')

  if (nextMode !== 'template') {
    setTemplateName('')
  }

  if (nextMode !== 'text') {
    setDraft('')
  }

  if (nextMode !== 'media') {
    clearComposerMedia()
  }
}

function handleComposerMediaFileChange(event) {
  const file = event.target.files?.[0]
  clearComposerMedia({ clearInput: false })

  if (!file) return

  setComposerMediaFileName(file.name)

  if (file.type?.startsWith('image/') || file.type?.startsWith('video/') || file.type?.startsWith('audio/')) {
    const previewUrl = URL.createObjectURL(file)
    composerMediaPreviewRef.current = previewUrl
    setComposerMediaPreviewUrl(previewUrl)
  }
}

function getComposerMediaAccept(type) {
  if (type === 'image') return 'image/jpeg,image/png,image/webp'
  if (type === 'video') return 'video/mp4,video/3gpp'
  if (type === 'audio') return 'audio/aac,audio/mp4,audio/mpeg,audio/amr,audio/ogg'
  return '.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation'
}

async function sendMessage(event) {
  event.preventDefault()

  if (!selected || sendingMessage) return

  if (selected.opted_out) {
    setSendError('Customer has opted out. Do not send WhatsApp messages to this contact.')
    return
  }

  const formData = event?.currentTarget ? new FormData(event.currentTarget) : null
  const formMessageType = String(formData?.get('messageType') || composerMode || 'text').trim()
  const mediaType = String(formData?.get('mediaType') || '').trim()
  const mediaUrl = String(formData?.get('mediaUrl') || '').trim()
  const caption = String(formData?.get('caption') || '').trim()
  const fileName = String(formData?.get('fileName') || '').trim()
  const mediaFile = formData?.get('mediaFile')

  const hasMediaFile = mediaFile instanceof File && mediaFile.size > 0

  const maxMediaUploadBytes = 16 * 1024 * 1024

  const allowedMediaMimeTypes = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/3gpp',
    'audio/aac',
    'audio/mp4',
    'audio/mpeg',
    'audio/amr',
    'audio/ogg',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ])

  const cleanText = draft.trim()
  const selectedTemplate = formMessageType === 'template'
    ? templates.find((template) => (
      template.id === templateName || template.name === templateName
    ))
    : null

  setSendError('')
  setComposerUploadProgress(0)

  if (!selected.reply_window_open && formMessageType !== 'template') {
    setSendError('24-hour reply window expired. Use an approved WhatsApp template.')
    return
  }

  setSendingMessage(true)

  try {
    if (formMessageType === 'media') {
      if (!selected.reply_window_open) {
        setSendError('24-hour reply window expired. Media messages require an open customer service window. Use an approved template.')
        return
      }

      if (!mediaType) {
        setSendError('Media type is required.')
        return
      }

      if (hasMediaFile) {
        if (mediaFile.size > maxMediaUploadBytes) {
          setSendError('Media file is too large. Maximum 16 MB is allowed for this composer.')
          return
        }

        if (mediaFile.type && !allowedMediaMimeTypes.has(mediaFile.type)) {
          setSendError(`Unsupported file type: ${mediaFile.type}. Choose image, video, audio, PDF, document, sheet, presentation, or text file.`)
          return
        }

        const uploadPayload = new FormData()
        uploadPayload.append('mediaType', mediaType)
        uploadPayload.append('mediaFile', mediaFile)
        uploadPayload.append('caption', caption)
        uploadPayload.append('fileName', fileName || mediaFile.name || '')

        setComposerUploadProgress(1)

        await api.post(
          `/api/conversations/${selected.id}/messages/media-upload`,
          uploadPayload,
          {
            timeout: 90_000,
            onUploadProgress: (progressEvent) => {
              if (!progressEvent.total) return
              const percent = Math.min(99, Math.round((progressEvent.loaded * 100) / progressEvent.total))
              setComposerUploadProgress(percent)
            },
          },
        )

        setComposerUploadProgress(100)
        notify('Uploaded media message queued/sent')
      } else {
        if (!mediaUrl) {
          setSendError('Upload a file or add a public HTTPS media URL.')
          return
        }

        await api.post(`/api/conversations/${selected.id}/messages`, {
          mediaType,
          mediaUrl,
          caption,
          fileName,
        })
        notify('Media URL message queued/sent')
      }
    } else {
      const payload = selectedTemplate
        ? { templateName: selectedTemplate.name, language: selectedTemplate.language || 'en' }
        : { text: cleanText }

      if (!payload.templateName && !payload.text) {
        setSendError('Message text required hai, ya template select karo.')
        return
      }

      await api.post(`/api/conversations/${selected.id}/messages`, payload)
      notify('Message queued/sent')
    }

    setDraft('')
    setTemplateName('')
    setComposerMode('text')
    clearComposerMedia()
    await Promise.all([loadMessages(selected.id), loadAll()])
  } catch (err) {
    setSendError(apiErrorMessage(err, 'Message send failed'))
    setComposerUploadProgress(0)
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
    const res = await api.post('/api/local/inbound-message', simulator)
    const contactId = res.data?.contact?.id || ''

    notify('Inbound message captured')
    setSimulator((current) => ({
      ...current,
      message: '',
    }))
    setActivePage('inbox')
    setFilter('all')
    setWindowFilter('all')
    setSearch('')

    if (contactId) {
      setSelectedId(contactId)
      await loadMessages(contactId)
    }

    await loadAll({ filter: 'all', windowFilter: 'all', search: '' })
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
  const confirmed = window.confirm(
    `Delete product ${product.sku || product.name}?\n\nThis removes/deactivates it for the current company inventory. Continue?`
  )

  if (!confirmed) return

  try {
    await api.delete(`/api/products/${product.id}`)
    notify('Product deleted')
    if (editingProductId === product.id) {
      setEditingProductId('')
      setProductForm(emptyProduct)
    }
    await loadAll()
  } catch (err) {
    notify(apiErrorMessage(err, 'Product delete failed'), 'error')
  }
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

  const confirmed = window.confirm(
    `Delete user ${userItem.name || userItem.email}?\n\nThis removes this user from the current company. Continue?`
  )

  if (!confirmed) return

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

async function loadAutoReplyRules() {
  if (!canMonitor) return

  setAutoReplyRulesLoading(true)

  try {
    const res = await api.get('/api/auto-reply-rules')
    setAutoReplyRules(res.data)
  } catch (err) {
    notify(apiErrorMessage(err, 'Unable to load auto reply rules'), 'error')
  } finally {
    setAutoReplyRulesLoading(false)
  }
}

async function saveAutoReplyRule(event) {
  event.preventDefault()

  if (!canMonitor) {
    notify('Manager/Admin access required', 'error')
    return
  }

  const payload = {
    name: autoReplyRuleForm.name.trim(),
    triggerType: autoReplyRuleForm.triggerType,
    triggerValue: autoReplyRuleForm.triggerValue.trim(),
    replyText: autoReplyRuleForm.replyText.trim(),
    priority: Number(autoReplyRuleForm.priority || 100),
    active: Boolean(autoReplyRuleForm.active),
    sendOncePerContact: Boolean(autoReplyRuleForm.sendOncePerContact),
  }

  if (!payload.name || payload.name.length < 2) {
    notify('Rule name is required', 'error')
    return
  }

  if (!payload.triggerValue || payload.triggerValue.length < 2) {
    notify('Trigger text must be at least 2 characters', 'error')
    return
  }

  if (!payload.replyText || payload.replyText.length < 2) {
    notify('Reply text is required', 'error')
    return
  }

  setAutoReplyRuleSaving(true)

  try {
    if (editingAutoReplyRuleId) {
      await api.patch(`/api/auto-reply-rules/${editingAutoReplyRuleId}`, payload)
      notify('Auto reply rule updated')
    } else {
      await api.post('/api/auto-reply-rules', payload)
      notify('Auto reply rule created')
    }

    setAutoReplyRuleForm(emptyAutoReplyRuleForm)
    setEditingAutoReplyRuleId('')
    await loadAutoReplyRules()
  } catch (err) {
    notify(apiErrorMessage(err, 'Auto reply rule save failed'), 'error')
  } finally {
    setAutoReplyRuleSaving(false)
  }
}

function editAutoReplyRule(rule) {
  setEditingAutoReplyRuleId(rule.id)
  setAutoReplyRuleForm({
    name: rule.name || '',
    triggerType: rule.trigger_type || 'contains',
    triggerValue: rule.trigger_value || '',
    replyText: rule.reply_text || '',
    priority: rule.priority || 100,
    active: rule.active !== false,
    sendOncePerContact: Boolean(rule.send_once_per_contact),
  })
  setActivePage('bot')
}

function cancelAutoReplyRuleEdit() {
  setEditingAutoReplyRuleId('')
  setAutoReplyRuleForm(emptyAutoReplyRuleForm)
}

async function toggleAutoReplyRule(rule) {
  if (!rule?.id) return

  setAutoReplyRuleActionLoading(rule.id)

  try {
    await api.patch(`/api/auto-reply-rules/${rule.id}`, {
      name: rule.name,
      triggerType: rule.trigger_type,
      triggerValue: rule.trigger_value,
      replyText: rule.reply_text,
      priority: rule.priority,
      active: !rule.active,
      sendOncePerContact: Boolean(rule.send_once_per_contact),
    })

    notify(rule.active ? 'Auto reply rule disabled' : 'Auto reply rule enabled')
    await loadAutoReplyRules()
  } catch (err) {
    notify(apiErrorMessage(err, 'Auto reply rule update failed'), 'error')
  } finally {
    setAutoReplyRuleActionLoading('')
  }
}

async function deleteAutoReplyRule(rule) {
  if (!rule?.id) return

  const confirmed = window.confirm(`Delete auto reply rule "${rule.name}"?`)
  if (!confirmed) return

  setAutoReplyRuleActionLoading(rule.id)

  try {
    await api.delete(`/api/auto-reply-rules/${rule.id}`)
    notify('Auto reply rule deleted')

    if (editingAutoReplyRuleId === rule.id) {
      cancelAutoReplyRuleEdit()
    }

    await loadAutoReplyRules()
  } catch (err) {
    notify(apiErrorMessage(err, 'Auto reply rule delete failed'), 'error')
  } finally {
    setAutoReplyRuleActionLoading('')
  }
}

async function sendTestMessage(event) {
    event.preventDefault()

    const cleanTo = String(testMessage.to || '').replace(/\D/g, '')
    const cleanText = String(testMessage.text || '').trim()

    if (cleanTo.length < 11 || cleanTo.length > 15) {
      setTestResult('Number country code ke saath hona chahiye. India ke liye format: 91XXXXXXXXXX')
      return
    }

    if (!cleanText) {
      setTestResult('Test message text required hai.')
      return
    }

    setTestResult('')

    try {
      const res = await api.post('/api/whatsapp/test-message', {
        to: cleanTo,
        text: cleanText,
      })

      setTestResult(`Accepted by Meta. To: ${res.data.to}. Message ID: ${res.data.messageId || 'not returned'}`)
      notify('Test message accepted')
      setActivePage('inbox')
      setFilter('all')
      setWindowFilter('all')
      setSearch('')

      if (res.data.contactId) {
        setSelectedId(res.data.contactId)
      }

      await loadAll()
    } catch (err) {
      setTestResult(apiErrorMessage(err, 'Test message failed'))
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

      if (selectedId) {
        await loadMessages(selectedId)
      }

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
      actionLabel: user?.role === 'admin' ? 'Open Meta Setup' : 'Open Settings',
      actionPage: user?.role === 'admin' ? 'connectWhatsApp' : 'settings',
    },
    campaignReports: {
      title: 'Campaign Reports',
      text: 'Campaign reports will be available after compliant opt-in campaign sending is enabled.',
      actionLabel: 'Open Dashboard',
      actionPage: 'dashboard',
    },
    callingReports: {
      title: 'Calling Reports',
      text: 'Calling activity is not recorded by the current WhatsApp Cloud API module.',
      actionLabel: 'Open Voice Settings',
      actionPage: 'settings',
    },
    chatbotReports: {
      title: 'Chatbot Executions',
      text: 'Execution reporting will activate after chatbot run logging is stored tenant-wise.',
      actionLabel: 'Open Advanced Chatbot',
      actionPage: 'bot',
    },
    paymentTransactions: {
      title: 'Payment Transactions',
      text: 'Orders currently store payment status only. No payment gateway transaction feed is connected.',
      actionLabel: 'Open Orders',
      actionPage: 'orders',
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
      actionLabel: 'Open Messages Report',
      actionPage: 'dashboard',
    },
    creditCenter: {
      title: 'Credit Center',
      text: 'Credit ledger and recharge settlement are not configured for this tenant.',
    },
    subscriptionPlan: {
      title: 'Subscription Plan',
      text: 'Subscription billing is not connected to this workspace yet.',
      actionLabel: 'Open Billing Details',
      actionPage: 'settings',
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
      actionLabel: 'Open Advanced Chatbot',
      actionPage: 'bot',
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
      actionLabel: 'Open Contacts List',
      actionPage: 'contactsList',
    },
    catalogSettings: {
      title: 'Catalog Settings',
      text: 'Catalog sync requires a Meta Commerce catalog connection.',
      actionLabel: 'Open Products / Items',
      actionPage: 'inventory',
    },
    catalogManager: {
      title: 'Catalog Manager (Beta)',
      text: 'Use Products / Items for the current live inventory catalog.',
      actionLabel: 'Open Products / Items',
      actionPage: 'inventory',
    },
    flows: {
      title: 'Flows',
      text: 'WhatsApp Flows publishing is not configured for this tenant.',
    },
    paymentConfigurations: {
      title: 'Payment Configurations',
      text: 'Payment providers are not configured; order payment status remains available in Catalog Orders.',
      actionLabel: 'Open Orders',
      actionPage: 'orders',
    },
    whatsappGroups: {
      title: 'WhatsApp Groups',
      text: 'WhatsApp Business Cloud API customer messaging does not use unauthorised group broadcasting.',
    },
    openaiIntegration: {
      title: 'ChatGPT / OpenAI',
      text: 'AI automation remains off until data handling and tenant configuration are defined.',
    },
    googleSheets: {
      title: 'Google Sheets',
      text: 'Google Sheets sync is not connected to the backend.',
      actionLabel: 'Open Profile Integrations',
      actionPage: 'settings',
    },
    developer: {
      title: 'Developer',
      text: 'Webhook monitoring is available through Settings for authorised users.',
      actionLabel: 'Open Webhooks',
      actionPage: 'webhooks',
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
      actionLabel: 'Open Products / Items',
      actionPage: 'inventory',
    },
    chatLink: {
      title: 'WhatsApp Chat Link',
      text: 'Link generation needs the connected business phone configuration.',
      actionLabel: 'Open WhatsApp Settings',
      actionPage: 'settings',
    },
    widget: {
      title: 'WhatsApp Widget',
      text: 'Website widget publishing is not configured in this module.',
    },
    templateMatchLogs: {
      title: 'Template Match Logs',
      text: 'Approved templates are visible in Templates; per-match logging is not stored yet.',
      actionLabel: 'Open Templates',
      actionPage: 'settings',
    },
  }[activePage]
  return (
        <main className={`app-shell suite-shell ${chatPages ? '' : 'workspace-mode'} ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${darkMode ? 'theme-dark' : 'theme-light'}`}>
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
                  <button
            className="suite-icon-button"
            type="button"
            aria-label={sidebarCollapsed ? 'Open sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Open sidebar' : 'Collapse sidebar'}
            onClick={() => setSidebarCollapsed((current) => !current)}
          >
            <Menu size={19} />
          </button>
          <span><Headphones size={17} /> Support</span>
        </div>
        <div className="suite-topbar-right">
          {!isSuperAdminUser && canMonitor && (
            <button
              className={`workspace-status ${whatsappHealth?.setupComplete ? 'ready' : 'attention'}`}
              type="button"
              onClick={() => showPage(whatsappHealth?.setupComplete ? 'settings' : 'connectWhatsApp')}
              title={whatsappHealth?.setupComplete ? 'WhatsApp is ready' : 'Complete Meta WhatsApp setup'}
            >
              {whatsappHealth?.setupComplete ? 'WhatsApp Ready' : 'Setup Attention'}
            </button>
          )}
          <button
            className="suite-theme-toggle"
            type="button"
            onClick={() => setDarkMode((current) => !current)}
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            <span>{darkMode ? 'Light' : 'Dark'}</span>
          </button>
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
              <div className="suite-account-dropdown suite-profile-card">
                <div className="suite-profile-head">
                  <span className="suite-avatar profile-avatar">{initials(user.name)}</span>
                  <div>
                    <strong>{user.name}</strong>
                    <small>{user.email}</small>
                    <em>{String(user.role || '').toUpperCase()}</em>
                  </div>
                </div>

                {!isSuperAdminUser && canMonitor && (
                  <button
                    type="button"
                    onClick={() => {
                      setAccountMenuOpen(false)
                      showPage('settings')
                    }}
                  >
                    <UserRound size={17} /> Profile settings
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setDarkMode((current) => !current)}
                >
                  {darkMode ? <Sun size={17} /> : <Moon size={17} />}
                  {darkMode ? 'Light mode' : 'Dark mode'}
                </button>

                <button type="button" onClick={logout}><LogOut size={17} /> Logout</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <section className="module-panel">
        {loadError && <div className="load-error">{loadError}</div>}
        {platformError && <div className="load-error">{platformError}</div>}
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
        {!isSuperAdminUser && activePage === 'integrations' && canMonitor && (
          <TallyIntegrationPage
            settings={tallySettings}
            logs={tallyLogs}
            orders={orders}
            onSave={saveTallySettings}
            onTest={testTallyConnection}
            onSyncOrder={syncTallyOrder}
            saving={tallySaving}
            testing={tallyTesting}
            syncingOrderId={tallySyncingOrderId}
            userRole={user.role}
          />
        )}
        {!isSuperAdminUser && featureGate && <FeatureGatePage title={featureGate.title} text={featureGate.text} actionLabel={featureGate.actionLabel} actionPage={featureGate.actionPage} onOpenPage={showPage} />}
        {!isSuperAdminUser && activePage === 'dashboard' && <DashboardPage dashboard={dashboard} conversations={conversations} drafts={drafts} products={products} lowStockProducts={lowStockProducts} quotations={quotations} orders={orders} onboarding={whatsappOnboarding} whatsappHealth={whatsappHealth} isAdmin={user.role === 'admin'} canManage={canMonitor} onOpenPage={showPage} />}
        {!isSuperAdminUser && activePage === 'inventory' && (
          <section className="workspace-page">
            <WorkspaceHeading title="Inventory & Product Catalog" description="Manage product stock, pricing and searchable fields used in sales workflows." />
            <InventoryPage products={products} productForm={productForm} setProductForm={setProductForm} editingProductId={editingProductId} onSave={saveProduct} onEdit={editProduct} onDelete={deleteProduct} onCancel={() => { setEditingProductId(''); setProductForm(emptyProduct) }} productSearch={productSearch} setProductSearch={setProductSearch} onSearch={loadAll} canManage={canMonitor} currency={appSettings.currency} inventoryColumnsText={inventoryColumnsText} setInventoryColumnsText={setInventoryColumnsText} onImport={importProducts} importResult={importResult} />
          </section>
        )}
        {!isSuperAdminUser && activePage === 'bot' && <BotStudioPage
  appSettings={appSettings}
  products={products}
  drafts={drafts}
  lowStockProducts={lowStockProducts}
  onOpenSettings={() => showPage('settings')}
  autoReplyRules={autoReplyRules}
  autoReplyRuleForm={autoReplyRuleForm}
  setAutoReplyRuleForm={setAutoReplyRuleForm}
  editingAutoReplyRuleId={editingAutoReplyRuleId}
  autoReplyRulesLoading={autoReplyRulesLoading}
  autoReplyRuleSaving={autoReplyRuleSaving}
  autoReplyRuleActionLoading={autoReplyRuleActionLoading}
  onSaveAutoReplyRule={saveAutoReplyRule}
  onEditAutoReplyRule={editAutoReplyRule}
  onCancelAutoReplyRuleEdit={cancelAutoReplyRuleEdit}
  onToggleAutoReplyRule={toggleAutoReplyRule}
  onDeleteAutoReplyRule={deleteAutoReplyRule}
/>}
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
            onSyncTallyOrder={syncTallyOrder}
            tallySyncingOrderId={tallySyncingOrderId}
            tallyEnabled={tallySettings.enabled}
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
        {!isSuperAdminUser && !chatPages && !featureGate && !['sendSingle', 'sendBulk', 'sendCanned', 'contactsList', 'dashboard', 'inventory', 'bot', 'salesWorkspace', 'users', 'connectWhatsApp', 'controlCenter', 'integrations'].includes(activePage) && (
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
      <div className="media-message whatsapp-media-card">
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
      <div className="whatsapp-media-card doc-media-card">
        <FileText size={22} />
        <div>
          <strong>{message.file_name || 'Document'}</strong>
          <span>{message.caption || message.body || 'WhatsApp document'}</span>
        </div>
        <ProtectedMediaLink className="doc-message" url={message.media_url}>
          Open
        </ProtectedMediaLink>
      </div>
    ) : message.type === 'document' ? (
      <div className="media-placeholder">
        <FileText size={18} />
        <span>{message.file_name || message.body || 'Document received'}</span>
        <small>Download unavailable. Check Meta token/media download.</small>
      </div>
    ) : message.type === 'video' && message.media_url ? (
      <div className="whatsapp-media-card video-media-card">
        <ProtectedMedia url={message.media_url} type="video" className="whatsapp-video" title={message.caption || message.body || 'WhatsApp video'} />
        {(message.caption || message.body) && <span>{message.caption || message.body}</span>}
      </div>
    ) : message.type === 'audio' && message.media_url ? (
      <div className="whatsapp-media-card audio-media-card">
        <ProtectedMedia url={message.media_url} type="audio" className="whatsapp-audio" title={message.body || 'WhatsApp audio'} />
      </div>
    ) : ['video', 'audio', 'sticker'].includes(message.type) ? (
      <div className="media-placeholder">
        <PackageCheck size={18} />
        <span>{message.file_name || message.body || `${message.type} received`}</span>
        <small>Preview unavailable. Check Meta token/media download.</small>
      </div>
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
              {!messages.length && <div className="empty-chat"><strong>Select a conversation</strong><span>Customer messages, reply-window status, and profile details will appear here.</span></div>}
            </div>
<form className="composer upgraded-composer" onSubmit={sendMessage}>
  {selected?.opted_out && (
    <p>Customer has opted out. WhatsApp sending is locked for this contact.</p>
  )}

  {!selected?.opted_out && selected && !selected.reply_window_open && composerMode !== 'template' && (
    <p>24-hour window expired. Switch to approved template before sending.</p>
  )}

  {sendError && <p>{sendError}</p>}

  <select name="messageType" className="composer-mode-select" value={composerMode} onChange={handleComposerModeChange} disabled={!selected || selected.opted_out || sendingMessage}>
    <option value="text">Text</option>
    <option value="template">Template</option>
    <option value="media">Media</option>
  </select>

  {composerMode === 'text' && (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      placeholder={selected?.reply_window_open ? 'Type WhatsApp reply' : 'Template required after 24h'}
      disabled={!selected || selected.opted_out || sendingMessage || !selected.reply_window_open}
    />
  )}

  {composerMode === 'template' && (
    <select
      value={templateName}
      onChange={(e) => {
        setTemplateName(e.target.value)
        setDraft('')
        setSendError('')
      }}
      disabled={!selected || selected.opted_out || sendingMessage}
    >
      <option value="">Select approved template</option>
      {templates.map((template) => (
        <option key={template.id} value={template.id}>
          {template.name}{template.language ? ` (${template.language})` : ''}
        </option>
      ))}
    </select>
  )}

  {composerMode === 'media' && (
    <div className="composer-media-panel">
      <select name="mediaType" value={composerMediaType} onChange={(event) => {
        setComposerMediaType(event.target.value)
        clearComposerMedia()
      }} disabled={!selected || selected.opted_out || sendingMessage || !selected.reply_window_open}>
        <option value="image">Image</option>
        <option value="video">Video</option>
        <option value="audio">Audio</option>
        <option value="document">Document</option>
      </select>
      <input
        ref={composerFileInputRef}
        type="file"
        name="mediaFile"
        accept={getComposerMediaAccept(composerMediaType)}
        onChange={handleComposerMediaFileChange}
        disabled={!selected || selected.opted_out || sendingMessage || !selected.reply_window_open}
      />
      <input
        name="caption"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={composerMediaType === 'document' ? 'Optional document caption' : 'Optional caption'}
        disabled={!selected || selected.opted_out || sendingMessage || !selected.reply_window_open}
      />
      <input type="hidden" name="fileName" value={composerMediaFileName} />
      {composerMediaFileName && (
        <div className="composer-media-preview">
          {composerMediaPreviewUrl && composerMediaType === 'image' && <img src={composerMediaPreviewUrl} alt={composerMediaFileName} />}
          {composerMediaPreviewUrl && composerMediaType === 'video' && <video src={composerMediaPreviewUrl} controls />}
          {composerMediaPreviewUrl && composerMediaType === 'audio' && <audio src={composerMediaPreviewUrl} controls />}
          {!composerMediaPreviewUrl && <FileText size={18} />}
          <span>{composerMediaFileName}</span>
          <button type="button" onClick={() => clearComposerMedia()} disabled={sendingMessage} aria-label="Clear selected file"><X size={15} /></button>
        </div>
      )}
      {composerUploadProgress > 0 && (
        <div className="composer-upload-progress" aria-label={`Upload progress ${composerUploadProgress}%`}>
          <span style={{ width: `${composerUploadProgress}%` }} />
        </div>
      )}
      <small>Max 16 MB. Allowed: JPG, PNG, WebP, MP4, 3GP, audio, PDF and Office documents.</small>
    </div>
  )}

  <button
    type="submit"
    disabled={
      !selected
      || selected.opted_out
      || sendingMessage
      || (composerMode === 'text' && (!selected.reply_window_open || !draft.trim()))
      || (composerMode === 'template' && !templateName)
      || (composerMode === 'media' && (!selected.reply_window_open || !composerMediaFileName))
    }
  >
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

export default App
