import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import "../css/App.css";
import { CampaignsPage } from './CampaignsPage'
import { BillingPage } from './BillingPage'
import { SecurityPage } from './SecurityPage'
import { AuditLogsPage } from './AuditLogsPage'
import { TeamUsersPage } from './TeamUsersPage'
import { SettingsPage } from './SettingsPage'
import { TemplatesPage } from './TemplatesPage'
import { ContactsPage } from './ContactsPage'
import { DripsPage } from './DripsPage'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 8000,
) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    window.clearTimeout(timeout)
  }
}
type AuthResponse = {
  tenant: {
    id: string
    name: string
    slug: string
    status: string
  }
user: {
  id: string
  name: string
  email: string
  role: string
  emailVerifiedAt: string | null
  twoFactorEnabled: boolean
  twoFactorConfirmedAt: string | null
}

impersonation?: {
  active: boolean
  impersonatorUserId?: string
  impersonatorRole?: string
  impersonatorTenantId?: string
  targetTenantId?: string
  expiresAt?: string
}

}

type MetaConnection = {
  connected: boolean
  account: {
    id: string
    metaAppId: string | null
    wabaId: string
    phoneNumberId: string
    businessName: string | null
    isActive: boolean
  } | null
}

const baseModules = [
  'Inbox',
  'Contacts',
  'Templates',
  'Campaigns',
  'Drip Automation',
  'Billing',
  'Security',
  'Team Users',
  'Audit Logs',
  'Orders',
  'Settings',
]

function getVisibleModules(role: string) {
  if (role === 'agent') {
    return baseModules.filter(
      (module) =>
        ![
          'Billing',
          'Security',
          'Team Users',
          'Audit Logs',
          'Settings',
        ].includes(module),
    )
  }

  if (role === 'manager') {
    return baseModules.filter(
      (module) =>
        !['Billing', 'Team Users', 'Audit Logs'].includes(module),
    )
  }

  return baseModules
}

function App() {
  const [auth, setAuth] = useState<AuthResponse | null>(null)
  const [message, setMessage] = useState('Checking login...')
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
const [actionAlert, setActionAlert] = useState<{
  id: number
  title: string
  message: string
  type: 'success' | 'error'
} | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeModule, setActiveModule] = useState('Inbox')
const [authMode, setAuthMode] = useState<
  'login' | 'forgot' | 'reset' | 'twoFactor'
>('login')
const [resetToken, setResetToken] = useState('')
const [twoFactorToken, setTwoFactorToken] = useState('')
const [twoFactorCode, setTwoFactorCode] = useState('')

const [metaConnection, setMetaConnection] = useState<MetaConnection | null>(null)

const visibleModules = auth
  ? getVisibleModules(auth.user.role)
  : []

function showToast(text: string, type: 'success' | 'error' = 'success') {
  setMessage(text)
  setToast(text)
  setToastType(type)

  setActionAlert(null)

  window.setTimeout(() => {
    setActionAlert({
      id: Date.now(),
      title: type === 'success' ? 'Action completed' : 'Action failed',
      message: text,
      type,
    })
  }, 0)

  window.setTimeout(() => {
    setToast('')
  }, 3500)
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

    if (typeof data.message?.metaError?.error?.message === 'string') {
      return data.message.metaError.error.message
    }

    if (typeof data.metaError?.error?.message === 'string') {
      return data.metaError.error.message
    }

    if (typeof data.error === 'string') {
      return data.error
    }

    return fallback
  } catch {
    return fallback
  }
}

  async function loadMe() {
    try {
const response = await fetchWithTimeout(`${API_URL}/auth/me`, {
  credentials: 'include',
})

      if (!response.ok) {
        setAuth(null)
        setMessage('Not logged in')
        return
      }

      const data = await response.json()
      setAuth(data)
      setMessage('Logged in')
    } catch {
      setAuth(null)
      setMessage('API not connected')
    }
  }

  async function verifyEmailFromLink(token: string) {
try {
 const response = await fetch(`${API_URL}/auth/verify-email`, {
   method: 'POST',
   headers: {
     'Content-Type': 'application/json',
   },
   credentials: 'include',
   body: JSON.stringify({
     token,
   }),
 })

 const data = await response.json()

 if (!response.ok) {
   throw new Error(data.message || 'Email verification failed')
 }

 window.history.replaceState({}, document.title, window.location.pathname)
 showToast('Email verified successfully')
 await loadMe()
} catch (error) {
 showToast(
   error instanceof Error ? error.message : 'Email verification failed',
   'error',
 )
}
}

useEffect(() => {
  const timer = window.setTimeout(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const tokenFromUrl = searchParams.get('resetToken')
    const verifyEmailToken = searchParams.get('verifyEmailToken')

    if (tokenFromUrl) {
      setResetToken(tokenFromUrl)
      setAuthMode('reset')
      setMessage('Enter your new password')

      searchParams.delete('resetToken')

      const cleanQuery = searchParams.toString()

      window.history.replaceState(
        {},
        document.title,
        `${window.location.pathname}${
          cleanQuery ? `?${cleanQuery}` : ''
        }`,
      )
    }

    if (verifyEmailToken) {
      void verifyEmailFromLink(verifyEmailToken)
    }

    void loadMe()
  }, 0)

  return () => window.clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])

async function loadMetaConnection() {
  const response = await fetch(`${API_URL}/meta-accounts/active`, {
    credentials: 'include',
  })

  if (!response.ok) {
    setMetaConnection(null)
    return
  }

  const data = await response.json()
  setMetaConnection(data)
}

useEffect(() => {
  const timer = window.setTimeout(() => {
    if (auth && activeModule === 'Settings') {
      void loadMetaConnection()
    }
  }, 0)

  return () => window.clearTimeout(timer)
}, [auth, activeModule])

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage('Creating account...')

    const form = new FormData(event.currentTarget)

    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          businessName: form.get('businessName'),
          slug: form.get('slug'),
          name: form.get('name'),
          email: form.get('email'),
          password: form.get('password'),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setAuth(null)
        throw new Error(data.message || 'Registration failed')
      }

setAuth(null)
setAuthMode('login')
setMessage('Account created. Please verify your email before login.')
showToast('Account created. Please verify your email before login.')
    } catch (error) {
      setAuth(null)
      showToast(error instanceof Error ? error.message : 'Registration failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage('Logging in...')

    const form = new FormData(event.currentTarget)

    try {
    const response = await fetchWithTimeout(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email: form.get('email'),
          password: form.get('password'),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Login failed')
      }

if (data.requiresTwoFactor) {
  setTwoFactorToken(data.twoFactorToken)
  setTwoFactorCode('')
  setAuthMode('twoFactor')
  setMessage('Enter your authenticator app code or backup code')
  showToast('Enter your 2FA code or backup code')
  return
}

      setAuth(data)
      showToast('Logged in successfully')
    } catch (error) {
      setAuth(null)
      showToast(
  error instanceof Error && error.name === 'AbortError'
    ? 'API is not responding. Please make sure backend is running on port 3000.'
    : error instanceof Error
      ? error.message
      : 'Login failed',
  'error',
)
    } finally {
      setLoading(false)
    }
  }

  async function handleTwoFactorLogin(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  setLoading(true)
  setMessage('Verifying 2FA code...')

  const form = new FormData(event.currentTarget)

  try {
    const response = await fetch(`${API_URL}/auth/login/2fa`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
body: JSON.stringify({
  twoFactorToken,
  code: twoFactorCode.trim(),
  trustDevice: form.get('trustDevice') === 'on',
}),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.message || '2FA login failed')
    }

    setTwoFactorToken('')
    setAuthMode('login')
    setAuth(data)
    showToast('Logged in successfully')
  } catch (error) {
    showToast(
      error instanceof Error ? error.message : '2FA login failed',
      'error',
    )
  } finally {
    setLoading(false)
  }
}

async function handleForgotPassword(event: FormEvent<HTMLFormElement>) {
 event.preventDefault()
 setLoading(true)
 setMessage('Sending reset email...')

 const form = new FormData(event.currentTarget)

 try {
   const response = await fetch(`${API_URL}/auth/request-password-reset`, {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
     },
     credentials: 'include',
     body: JSON.stringify({
       email: form.get('email'),
     }),
   })

   const data = await response.json()

   if (!response.ok) {
     throw new Error(data.message || 'Failed to send reset email')
   }

   showToast('If this email exists, reset link has been sent')
   setAuthMode('login')
 } catch (error) {
   showToast(
     error instanceof Error ? error.message : 'Failed to send reset email',
     'error',
   )
 } finally {
   setLoading(false)
 }
}

async function handleResetPassword(event: FormEvent<HTMLFormElement>) {
 event.preventDefault()
 setLoading(true)
 setMessage('Resetting password...')

 const form = new FormData(event.currentTarget)

 try {
   const response = await fetch(`${API_URL}/auth/reset-password`, {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
     },
     credentials: 'include',
     body: JSON.stringify({
       token: resetToken,
       password: form.get('password'),
     }),
   })

   const data = await response.json()

   if (!response.ok) {
     throw new Error(data.message || 'Password reset failed')
   }

   window.history.replaceState({}, document.title, window.location.pathname)
   setResetToken('')
   setAuthMode('login')
   showToast('Password reset successfully. Please login now.')
 } catch (error) {
   showToast(
     error instanceof Error ? error.message : 'Password reset failed',
     'error',
   )
 } finally {
   setLoading(false)
 }
}

async function resendVerificationEmail() {
if (!auth?.user.email) {
 return
}

setLoading(true)

try {
 const response = await fetch(`${API_URL}/auth/request-email-verification`, {
   method: 'POST',
   headers: {
     'Content-Type': 'application/json',
   },
   credentials: 'include',
   body: JSON.stringify({
     email: auth.user.email,
   }),
 })

 const data = await response.json()

 if (!response.ok) {
   throw new Error(data.message || 'Failed to send verification email')
 }

 showToast('Verification email sent')
} catch (error) {
 showToast(
   error instanceof Error
     ? error.message
     : 'Failed to send verification email',
   'error',
 )
} finally {
 setLoading(false)
}
}

  async function handleLogout() {
    setLoading(true)
    setMessage('Logging out...')

    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      })

      setAuth(null)
      setTwoFactorToken('')
      setAuthMode('login')
      showToast('Logged out successfully')
    } catch {
      showToast('Logout failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function stopImpersonation() {
  setLoading(true)

  try {
    const response = await fetch(`${API_URL}/platform-admin/impersonation/stop`, {
      method: 'POST',
      credentials: 'include',
    })

    if (!response.ok) {
      throw new Error(await readApiError(response, 'Failed to exit impersonation'))
    }

    const data = await response.json()
    setAuth(data)
    setActiveModule('Inbox')
    showToast('Exited impersonation mode')
  } catch (error) {
    showToast(
      error instanceof Error ? error.message : 'Failed to exit impersonation',
      'error',
    )
  } finally {
    setLoading(false)
  }
}


if (auth) {
  return (
    <main className="dashboard-shell">
      {toast ? <div className={`toast-popup ${toastType}`}>{toast}</div> : null}

      {actionAlert ? (
        <div className="action-alert-backdrop" key={actionAlert.id}>
          <div className={`action-alert-card ${actionAlert.type}`}>
            <strong>{actionAlert.title}</strong>
            <p>{actionAlert.message}</p>
            <button type="button" onClick={() => setActionAlert(null)}>
              OK
            </button>
          </div>
        </div>
      ) : null}

        <aside className="sidebar">
          <div>
            <p className="sidebar-label">Workspace</p>
            <h2>{auth.tenant.name}</h2>
          </div>

          <nav className="sidebar-nav">
            {visibleModules.map((module) => (
              <button
                key={module}
                className={activeModule === module ? 'active' : ''}
                onClick={() => setActiveModule(module)}
              >
                {module}
              </button>
            ))}
          </nav>

          <button className="logout-button" onClick={handleLogout} disabled={loading}>
            Logout
          </button>
        </aside>

        <section className="dashboard-main">
          <header className="dashboard-header">
            <div>
              <p className="eyebrow">WhatsApp SaaS Platform</p>
              <h1>{activeModule}</h1>
            </div>

            <div className="user-pill">
              {auth.user.name}
              <span>{auth.user.role}</span>
            </div>
          </header>
          {auth.impersonation?.active ? (
  <div className="status-card error">
    <strong>Impersonation mode active</strong>
    <span>
      You are viewing tenant workspace as a platform admin. This session is
      audited and expires at{' '}
      {auth.impersonation.expiresAt
        ? new Date(auth.impersonation.expiresAt).toLocaleString()
        : 'the configured expiry time'}
      .
    </span>
    <button type="button" disabled={loading} onClick={stopImpersonation}>
      Exit impersonation
    </button>
  </div>
) : null}

                 {!auth.user.emailVerifiedAt ? (
         <div className="status-card warning">
           <strong>Email not verified</strong>
           <span>Please verify your email before production use.</span>
           <button
             type="button"
             disabled={loading}
             onClick={resendVerificationEmail}
           >
             Resend Verification Email
           </button>
         </div>
       ) : null}

{activeModule === 'Contacts' ? (
  <ContactsPage apiUrl={API_URL} showToast={showToast} />
) : activeModule === 'Templates' ? (
  <TemplatesPage apiUrl={API_URL} showToast={showToast} />
) : activeModule === 'Campaigns' ? (
  <CampaignsPage apiUrl={API_URL} showToast={showToast} />
) : activeModule === 'Drip Automation' ? (
  <DripsPage
    apiUrl={API_URL}
    currentUser={auth.user}
    showToast={showToast}
  />
) : activeModule === 'Billing' ? (
  <BillingPage apiUrl={API_URL} showToast={showToast} />
) : activeModule === 'Security' ? (
<SecurityPage
  apiUrl={API_URL}
  currentUser={auth.user}
  showToast={showToast}
  onSecurityChanged={loadMe}
/>
) : activeModule === 'Team Users' ? (
<TeamUsersPage
 apiUrl={API_URL}
 currentUser={auth.user}
 showToast={showToast}
/>
) : activeModule === 'Audit Logs' ? (
<AuditLogsPage apiUrl={API_URL} showToast={showToast} />
) : activeModule === 'Settings' ? (
  <SettingsPage
    apiUrl={API_URL}
    metaConnection={metaConnection}
    showToast={showToast}
    onGoToBilling={() => setActiveModule('Billing')}
  />
) : (
  <div className="content-card">
    <h2>{activeModule}</h2>
    <p>
      This is the starting screen for {activeModule}. Next we will connect
      this module to real backend data.
    </p>
  </div>
)}
        </section>
      </main>
    )
  }

return (
  <main className="app-page">
    {toast ? <div className={`toast-popup ${toastType}`}>{toast}</div> : null}

    {actionAlert ? (
      <div className="action-alert-backdrop" key={actionAlert.id}>
        <div className={`action-alert-card ${actionAlert.type}`}>
          <strong>{actionAlert.title}</strong>
          <p>{actionAlert.message}</p>
          <button type="button" onClick={() => setActionAlert(null)}>
            OK
          </button>
        </div>
      </div>
    ) : null}

      <section className="hero-card">
        <p className="eyebrow">Official Meta WhatsApp Cloud API SaaS</p>
        <h1>WhatsApp SaaS Platform</h1>
        <p className="hero-text">
          Frontend is connected to NestJS auth using HttpOnly cookie login.
        </p>

        <div className="status-card error">
          <strong>Auth Status</strong>
          <span>{message}</span>
        </div>

        <div className="form-grid">
          <form className="auth-form" onSubmit={handleRegister}>
            <h2>Register Business</h2>
            <input name="businessName" placeholder="Business name" />
            <input name="slug" placeholder="Business slug" />
            <input name="name" placeholder="Your name" />
            <input name="email" placeholder="Email" />
            <input name="password" placeholder="Password" type="password" />
            <button disabled={loading}>Create Account</button>
          </form>

       {authMode === 'reset' ? (
         <form className="auth-form" onSubmit={handleResetPassword}>
           <h2>Reset Password</h2>
           <input
             name="password"
             placeholder="New password"
             type="password"
           />
           <button disabled={loading || !resetToken}>Reset Password</button>
           <button
             type="button"
             disabled={loading}
             onClick={() => {
               setAuthMode('login')
               setResetToken('')
               window.history.replaceState(
                 {},
                 document.title,
                 window.location.pathname,
               )
             }}
           >
             Back to Login
           </button>
         </form>
       ) : authMode === 'twoFactor' ? (

<form className="auth-form" onSubmit={handleTwoFactorLogin}>
  <h2>Two-Factor Login</h2>

  <label className="two-factor-code-field">
    <span>Authenticator or backup code</span>
    <input
      name="twoFactorCode"
      type="text"
      inputMode="text"
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="characters"
      spellCheck={false}
      placeholder="Example: 123456"
      value={twoFactorCode}
      onChange={(event) => setTwoFactorCode(event.target.value)}
      required
    />
    <small>
      Open Google Authenticator/Authy/Microsoft Authenticator and enter the latest 6-digit code.
    </small>
  </label>

  <label className="trusted-device-option">
    <input name="trustDevice" type="checkbox" defaultChecked />
    <span>Trust this device for 30 days</span>
  </label>

  <button disabled={loading || !twoFactorToken || !twoFactorCode.trim()}>
    Verify and Login
  </button>

  <button
    type="button"
    disabled={loading}
    onClick={() => {
      setTwoFactorToken('')
      setTwoFactorCode('')
      setAuthMode('login')
    }}
  >
    Back to Login
  </button>
</form>
       ) : authMode === 'forgot' ? (
         <form className="auth-form" onSubmit={handleForgotPassword}>
           <h2>Forgot Password</h2>
           <input name="email" placeholder="Email" />
           <button disabled={loading}>Send Reset Link</button>
           <button
             type="button"
             disabled={loading}
             onClick={() => setAuthMode('login')}
           >
             Back to Login
           </button>
         </form>
       ) : (
         <form className="auth-form" onSubmit={handleLogin}>
           <h2>Login</h2>
           <input name="email" placeholder="Email" />
           <input name="password" placeholder="Password" type="password" />
           <button disabled={loading}>Login</button>
           <button
             type="button"
             disabled={loading}
             onClick={() => setAuthMode('forgot')}
           >
             Forgot Password?
           </button>
         </form>
       )}
        </div>
      </section>
    </main>
  )
}

export default App
