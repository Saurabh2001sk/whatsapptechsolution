import { useEffect, useMemo, useState } from 'react'
import './billing.css'

type BillingPageProps = {
  apiUrl: string
  showToast: (message: string, type?: 'success' | 'error') => void
}

type Plan = {
  id: string
  code: string
  name: string
  description: string | null
  priceMonthlyPaise: number
  currency: string
  monthlyCampaignRecipientLimit: number
  monthlyCampaignLimit: number
  maxContacts: number
  maxTeamUsers: number
  maxAutomationRules: number
  mediaStorageMb: number
  supportLevel: string
  requiresApproval: boolean
}

type Subscription = {
  id: string
  status: string
  billingResponsibility: string
  currentPeriodStart: string
  currentPeriodEnd: string
  trialEndsAt: string | null
  planId: string
  plan: Plan
  paymentProofStatus: string
  paymentReference: string | null
  paymentPayerName: string | null
  paymentAmountPaise: number | null
  paymentProofNote: string | null
  paymentSubmittedAt: string | null
  paymentAdminNote: string | null
} | null

type BillingUsage = {
  subscriptionStatus: string
  periodStart: string
  periodEnd: string
  billingResponsibility: string
  plan: {
    id: string
    code: string
    name: string
    monthlyCampaignRecipientLimit: number
    monthlyCampaignLimit: number
    maxContacts: number
    maxTeamUsers: number
    maxAutomationRules: number
    mediaStorageMb: number
  }
usage: {
 campaignsCreated: number
 campaignRecipientsPlanned: number
 campaignRecipientsSent: number
 activeContacts: number
 teamUsers: number
 mediaUsedBytes: number
}
remaining: {
 campaigns: number
 campaignRecipients: number
 contacts: number
 teamUsers: number
 mediaBytes: number
}
} | null

type PendingSubscription = {
  id: string
  status: string
  createdAt: string
  paymentProofStatus: string
  paymentReference: string | null
  paymentPayerName: string | null
  paymentAmountPaise: number | null
  paymentProofNote: string | null
  paymentSubmittedAt: string | null
  paymentAdminNote: string | null
  tenant: {
    id: string
    name: string
    slug: string
    status: string
  }
  plan: {
    id: string
    code: string
    name: string
    priceMonthlyPaise: number
    currency: string
    monthlyCampaignRecipientLimit: number
    monthlyCampaignLimit: number
    maxContacts: number
    maxTeamUsers: number
    requiresApproval: boolean
  }
}

type EmbeddedSignupConfig = {
  isConfigured: boolean
  appId: string | null
  configId: string | null
  redirectUri: string | null
  apiVersion: string
  featureType: string
  missing: {
    appId: boolean
    configId: boolean
    redirectUri: boolean
  }
} | null

type MetaConnection = {
  connected: boolean
  account: {
    id: string
    metaAppId: string | null
    wabaId: string
    phoneNumberId: string
    businessName: string | null
    qualityRating: string | null
    messagingLimitTier: string | null
    isActive: boolean
    tokenLastUpdatedAt: string | null
    createdAt: string
    updatedAt: string
  } | null
} | null

type FacebookLoginResponse = {
authResponse?: {
 code?: string
}
status?: string
}

type EmbeddedSignupSelection = {
wabaId: string
phoneNumberId: string
}

declare global {
interface Window {
 FB?: {
   init: (options: Record<string, unknown>) => void
   login: (
     callback: (response: FacebookLoginResponse) => void,
     options: Record<string, unknown>,
   ) => void
 }
 fbAsyncInit?: () => void
}
}

function loadFacebookSdk(appId: string, apiVersion: string) {
return new Promise<void>((resolve, reject) => {
 if (window.FB) {
   window.FB.init({
     appId,
     cookie: true,
     xfbml: false,
     version: apiVersion,
   })
   resolve()
   return
 }

 window.fbAsyncInit = () => {
   window.FB?.init({
     appId,
     cookie: true,
     xfbml: false,
     version: apiVersion,
   })
   resolve()
 }

 if (document.getElementById('facebook-jssdk')) {
   return
 }

 const script = document.createElement('script')
 script.id = 'facebook-jssdk'
 script.src = 'https://connect.facebook.net/en_US/sdk.js'
 script.async = true
 script.defer = true
 script.onerror = () => reject(new Error('Failed to load Facebook SDK'))

 document.body.appendChild(script)
})
}

function waitForEmbeddedSignupSelection(onDebug: (message: string) => void) {
return new Promise<EmbeddedSignupSelection>((resolve, reject) => {
 const timeout = window.setTimeout(() => {
   window.removeEventListener('message', handleMessage)
   reject(
     new Error(
       'Embedded Signup did not return WhatsApp account details. Please try again and complete the final Finish step.',
     ),
   )
 }, 2 * 60 * 1000)

 function finishWithError(message: string) {
   window.clearTimeout(timeout)
   window.removeEventListener('message', handleMessage)
   reject(new Error(message))
 }

 function finishWithSuccess(selection: EmbeddedSignupSelection) {
   window.clearTimeout(timeout)
   window.removeEventListener('message', handleMessage)
   resolve(selection)
 }

 function handleMessage(event: MessageEvent) {
   if (
     ![
       'https://www.facebook.com',
       'https://web.facebook.com',
     ].includes(event.origin)
   ) {
     return
   }

   let payload: {
     type?: string
     event?: string
     data?: {
       waba_id?: string
       wabaId?: string
       whatsapp_business_account_id?: string
       whatsappBusinessAccountId?: string
       phone_number_id?: string
       phoneNumberId?: string
       phone_number_ids?: string[]
       phoneNumberIds?: string[]
     }
   }

   try {
     payload =
       typeof event.data === 'string' ? JSON.parse(event.data) : event.data
   } catch {
     return
   }

if (payload?.type !== 'WA_EMBEDDED_SIGNUP') {
  return
}

const eventName = String(payload.event || '').toUpperCase()
onDebug(`Meta event received: ${eventName}`)

   if (eventName === 'CANCEL') {
     finishWithError('Embedded Signup was cancelled before completion')
     return
   }

   if (
     eventName !== 'FINISH' &&
     eventName !== 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'
   ) {
     return
   }

   const data = payload.data || {}

   const wabaId = String(
     data.waba_id ||
       data.wabaId ||
       data.whatsapp_business_account_id ||
       data.whatsappBusinessAccountId ||
       '',
   ).trim()

   const phoneNumberId = String(
     data.phone_number_id ||
       data.phoneNumberId ||
       data.phone_number_ids?.[0] ||
       data.phoneNumberIds?.[0] ||
       '',
   ).trim()

   if (!wabaId || !phoneNumberId) {
     finishWithError(
       'Meta finished signup but did not return WABA ID or Phone Number ID. In Meta Login Configuration, confirm Session Info Version is 3 and the selected feature is WhatsApp Business App Onboarding.',
     )
     return
   }

onDebug('Meta returned WABA ID and Phone Number ID.')

finishWithSuccess({
  wabaId,
  phoneNumberId,
})
 }

 window.addEventListener('message', handleMessage)
})
}

function loginWithFacebook(config: NonNullable<EmbeddedSignupConfig>) {
return new Promise<string>((resolve, reject) => {
 if (!window.FB || !config.appId || !config.configId) {
   reject(new Error('Facebook SDK is not ready'))
   return
 }

 window.FB.login(
   (response) => {
     const code = String(response.authResponse?.code || '').trim()

     if (!code) {
       reject(new Error('Facebook did not return authorization code'))
       return
     }

     resolve(code)
   },
   {
     config_id: config.configId,
     response_type: 'code',
     override_default_response_type: true,
     scope:
       'business_management,whatsapp_business_management,whatsapp_business_messaging',
     extras: JSON.stringify({
       featureType:
         config.featureType || 'whatsapp_business_app_onboarding',
     }),
   },
 )
})
}

function formatMoney(priceMonthlyPaise: number, currency: string) {
  if (priceMonthlyPaise === 0) {
    return 'Custom'
  }

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(priceMonthlyPaise / 100)
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-IN').format(value)
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return '-'
  }

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

export function BillingPage({ apiUrl, showToast }: BillingPageProps) {
  const [plans, setPlans] = useState<Plan[]>([])
  const [subscription, setSubscription] = useState<Subscription>(null)
  const [usage, setUsage] = useState<BillingUsage>(null)
  const [loading, setLoading] = useState(true)
  const [requestingPlanId, setRequestingPlanId] = useState('')
  const [pendingSubscriptions, setPendingSubscriptions] = useState<
    PendingSubscription[]
  >([])
  const [myPendingSubscriptions, setMyPendingSubscriptions] = useState<
    PendingSubscription[]
  >([])
const [adminActionId, setAdminActionId] = useState('')
const [paymentProofForm, setPaymentProofForm] = useState({
  paymentReference: '',
  paymentPayerName: '',
  paymentAmount: '',
  paymentProofNote: '',
})
const [adminNotes, setAdminNotes] = useState<Record<string, string>>({})
const [embeddedSignupConfig, setEmbeddedSignupConfig] =
  useState<EmbeddedSignupConfig>(null)
const [metaConnection, setMetaConnection] = useState<MetaConnection>(null)
const [syncingPhoneQuality, setSyncingPhoneQuality] = useState(false)
const [connectingWhatsApp, setConnectingWhatsApp] = useState(false)
const [connectionDebugMessage, setConnectionDebugMessage] = useState('')

  const currentPlanId = subscription?.planId || ''

  const activePlan = useMemo(
    () => plans.find((plan) => plan.id === currentPlanId) || subscription?.plan,
    [plans, currentPlanId, subscription],
  )

  const canConnectWhatsApp = ['TRIAL', 'ACTIVE'].includes(
    subscription?.status || '',
  )

  const isWhatsAppConnected = Boolean(metaConnection?.connected)

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

  async function loadBilling() {
    setLoading(true)

    try {
const [
  plansResponse,
  subscriptionResponse,
  usageResponse,
  embeddedSignupConfigResponse,
  myPendingSubscriptionsResponse,
  metaConnectionResponse,
] = await Promise.all([
  fetch(`${apiUrl}/billing/plans`, {
    credentials: 'include',
  }),
  fetch(`${apiUrl}/billing/subscription`, {
    credentials: 'include',
  }),
  fetch(`${apiUrl}/billing/usage`, {
    credentials: 'include',
  }),
  fetch(`${apiUrl}/meta-accounts/embedded-signup/config`, {
    credentials: 'include',
  }),
  fetch(`${apiUrl}/billing/pending-subscriptions`, {
    credentials: 'include',
  }),
  fetch(`${apiUrl}/meta-accounts/active`, {
    credentials: 'include',
  }),
])

      if (!plansResponse.ok) {
        throw new Error(await readApiError(plansResponse, 'Failed to load plans'))
      }

      if (!subscriptionResponse.ok) {
        throw new Error(
          await readApiError(subscriptionResponse, 'Failed to load subscription'),
        )
      }

            if (!usageResponse.ok) {
        throw new Error(await readApiError(usageResponse, 'Failed to load usage'))
      }

      if (!embeddedSignupConfigResponse.ok) {
  throw new Error(
    await readApiError(
      embeddedSignupConfigResponse,
      'Failed to load WhatsApp connection config',
    ),
  )
}

if (!myPendingSubscriptionsResponse.ok) {
  throw new Error(
    await readApiError(
      myPendingSubscriptionsResponse,
      'Failed to load pending plan requests',
    ),
  )
}

if (!metaConnectionResponse.ok) {
  throw new Error(
    await readApiError(
      metaConnectionResponse,
      'Failed to load WhatsApp connection status',
    ),
  )
}

setPlans(await plansResponse.json())
setSubscription(await subscriptionResponse.json())
setUsage(await usageResponse.json())
setEmbeddedSignupConfig(await embeddedSignupConfigResponse.json())
setMyPendingSubscriptions(await myPendingSubscriptionsResponse.json())
setMetaConnection(await metaConnectionResponse.json())

await loadPendingSubscriptions()
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Failed to load billing',
        'error',
      )
    } finally {
      setLoading(false)
    }
  }

  async function loadPendingSubscriptions() {
  try {
    const response = await fetch(`${apiUrl}/billing/admin/pending-subscriptions`, {
      credentials: 'include',
    })

    if (response.status === 403 || response.status === 401) {
      setPendingSubscriptions([])
      return
    }

    if (!response.ok) {
      throw new Error(
        await readApiError(response, 'Failed to load pending subscriptions'),
      )
    }

    setPendingSubscriptions(await response.json())
  } catch (error) {
    showToast(
      error instanceof Error
        ? error.message
        : 'Failed to load pending subscriptions',
      'error',
    )
  }
}

  async function requestPlan(plan: Plan) {
    const confirmed = window.confirm(
      plan.requiresApproval
        ? `Request ${plan.name} plan? Our team will review and approve it.`
        : `Request ${plan.name} plan? Payment/admin approval flow will activate it.`,
    )

    if (!confirmed) {
      return
    }

    setRequestingPlanId(plan.id)

    try {
      const response = await fetch(`${apiUrl}/billing/request-plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          planId: plan.id,
        }),
      })

      if (!response.ok) {
        throw new Error(await readApiError(response, 'Failed to request plan'))
      }

      const result = await response.json()
      setSubscription(result.subscription)
      await loadBilling()

      showToast(result.message || 'Plan request saved')
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Failed to request plan',
        'error',
      )
    } finally {
      setRequestingPlanId('')
    }
  }

  async function submitPaymentProof(subscriptionId: string) {
  const amountNumber = Number(paymentProofForm.paymentAmount)

  if (!paymentProofForm.paymentReference.trim()) {
    showToast('Enter payment reference or UTR', 'error')
    return
  }

  if (!paymentProofForm.paymentPayerName.trim()) {
    showToast('Enter payer name', 'error')
    return
  }

  if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
    showToast('Enter valid paid amount', 'error')
    return
  }

  try {
    const response = await fetch(
      `${apiUrl}/billing/subscriptions/${subscriptionId}/payment-proof`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          paymentReference: paymentProofForm.paymentReference.trim(),
          paymentPayerName: paymentProofForm.paymentPayerName.trim(),
          paymentAmountPaise: Math.round(amountNumber * 100),
          paymentProofNote: paymentProofForm.paymentProofNote.trim(),
        }),
      },
    )

    if (!response.ok) {
      throw new Error(
        await readApiError(response, 'Failed to submit payment proof'),
      )
    }

    setPaymentProofForm({
      paymentReference: '',
      paymentPayerName: '',
      paymentAmount: '',
      paymentProofNote: '',
    })

    await loadBilling()
    showToast('Payment proof submitted for admin verification')
  } catch (error) {
    showToast(
      error instanceof Error
        ? error.message
        : 'Failed to submit payment proof',
      'error',
    )
  }
}

  async function approveSubscription(subscriptionId: string) {
  const confirmed = window.confirm('Approve this subscription request?')

  if (!confirmed) {
    return
  }

  setAdminActionId(subscriptionId)

  try {
    const response = await fetch(
      `${apiUrl}/billing/admin/subscriptions/${subscriptionId}/approve`,
{
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include',
  body: JSON.stringify({
    adminNote: adminNotes[subscriptionId] || '',
  }),
},
    )

    if (!response.ok) {
      throw new Error(await readApiError(response, 'Failed to approve plan'))
    }

await loadBilling()
showToast('Subscription approved successfully')
  } catch (error) {
    showToast(
      error instanceof Error ? error.message : 'Failed to approve plan',
      'error',
    )
  } finally {
    setAdminActionId('')
  }
}

async function cancelSubscription(subscriptionId: string) {
  const confirmed = window.confirm('Cancel this subscription request?')

  if (!confirmed) {
    return
  }

  setAdminActionId(subscriptionId)

  try {
    const response = await fetch(
      `${apiUrl}/billing/admin/subscriptions/${subscriptionId}/cancel`,
      {
        method: 'POST',
        credentials: 'include',
      },
    )

    if (!response.ok) {
      throw new Error(await readApiError(response, 'Failed to cancel plan request'))
    }

await loadBilling()
showToast('Subscription request cancelled')
  } catch (error) {
    showToast(
      error instanceof Error
        ? error.message
        : 'Failed to cancel plan request',
      'error',
    )
  } finally {
    setAdminActionId('')
  }
}

async function syncPhoneQuality() {
  if (!metaConnection?.connected) {
    showToast('Connect WhatsApp before syncing phone quality', 'error')
    return
  }

  setSyncingPhoneQuality(true)

  try {
    const response = await fetch(`${apiUrl}/meta-accounts/sync-phone-quality`, {
      method: 'POST',
      credentials: 'include',
    })

    if (!response.ok) {
      throw new Error(
        await readApiError(response, 'Failed to sync phone quality/tier'),
      )
    }

    await loadBilling()
    showToast('Phone quality and tier synced')
  } catch (error) {
    showToast(
      error instanceof Error
        ? error.message
        : 'Failed to sync phone quality/tier',
      'error',
    )
  } finally {
    setSyncingPhoneQuality(false)
  }
}

async function startEmbeddedSignup() {
if (!embeddedSignupConfig?.isConfigured) {
showToast(
'Facebook Embedded Signup is not configured yet. Please ask platform admin to configure Meta App ID, Config ID, and Redirect URI.',
'error',
)
return
}

if (!embeddedSignupConfig.appId || !embeddedSignupConfig.configId) {
showToast('Meta App ID or Config ID is missing', 'error')
return
}

setConnectingWhatsApp(true)
setConnectionDebugMessage('Opening Facebook Embedded Signup...')

try {
await loadFacebookSdk(
embeddedSignupConfig.appId,
embeddedSignupConfig.apiVersion,
)

setConnectionDebugMessage('Waiting for Meta account selection...')

const selectionPromise = waitForEmbeddedSignupSelection(
setConnectionDebugMessage,
)

const [code, selection] = await Promise.all([
loginWithFacebook(embeddedSignupConfig),
selectionPromise,
])

setConnectionDebugMessage('Meta account selected. Saving connection...')
showToast('WhatsApp account selected. Saving connection...')

const response = await fetch(
`${apiUrl}/meta-accounts/embedded-signup/complete`,
{
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include',
  body: JSON.stringify({
    code,
    wabaId: selection.wabaId,
    phoneNumberId: selection.phoneNumberId,
  }),
},
)

if (!response.ok) {
throw new Error(
  await readApiError(response, 'Failed to connect WhatsApp account'),
)
}

await loadBilling()
setConnectionDebugMessage('WhatsApp connected and saved.')
showToast('WhatsApp connected successfully')
} catch (error) {
const message =
error instanceof Error
  ? error.message
  : 'Failed to connect WhatsApp account'

setConnectionDebugMessage(message)
showToast(message, 'error')
} finally {
setConnectingWhatsApp(false)
}
}

useEffect(() => {
  const timer = window.setTimeout(() => {
    const params = new URLSearchParams(window.location.search)
    const whatsappConnected = params.get('whatsappConnected')
    const reason = params.get('reason')

    if (whatsappConnected === '1') {
      showToast('WhatsApp connected successfully')
      window.history.replaceState({}, document.title, window.location.pathname)
    }

    if (whatsappConnected === '0') {
      showToast(reason || 'WhatsApp connection failed', 'error')
      window.history.replaceState({}, document.title, window.location.pathname)
    }

    void loadBilling()
  }, 0)

  return () => window.clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])

  return (
    <div className="billing-workspace">
      <section className="billing-hero">
        <div>
          <p className="billing-eyebrow">Platform billing</p>
          <h2>Choose your SaaS plan</h2>
          <p>
            Your plan pays for platform features, team access, campaign processing,
            automation, storage, and support. WhatsApp message charges may be billed
            separately by Meta to your connected Meta Business account.
          </p>
        </div>

        <div className="billing-meta-note">
          <strong>Simple onboarding flow</strong>
          <span>1. Choose platform plan</span>
          <span>2. Connect WhatsApp with Facebook Embedded Signup</span>
          <span>3. Use inbox, templates, contacts, and campaigns</span>
        </div>
      </section>

      {subscription ? (
        <section className="billing-current-card">
          <div>
            <span className={`billing-status ${subscription.status.toLowerCase()}`}>
              {subscription.status.replaceAll('_', ' ')}
            </span>
            <h3>{subscription.plan.name}</h3>
            <p>{subscription.plan.description}</p>
          </div>

          <div className="billing-current-meta">
            <span>Current period ends: {formatDate(subscription.currentPeriodEnd)}</span>
            <span>
              Meta billing:{' '}
              {subscription.billingResponsibility === 'CUSTOMER_META_BILLING'
                ? 'Paid directly to Meta'
                : 'Platform invoice'}
            </span>
          </div>
        </section>
      ) : null}

            {usage ? (
        <section className="billing-usage-card">
          <div className="billing-usage-header">
            <div>
              <p className="billing-eyebrow">Current usage</p>
              <h3>{usage.plan.name} usage this period</h3>
              <p>
                Period: {formatDate(usage.periodStart)} to{' '}
                {formatDate(usage.periodEnd)}
              </p>
            </div>
          </div>

          <div className="billing-usage-grid">
            <div className="billing-usage-item">
              <strong>
                {formatNumber(usage.usage.campaignRecipientsPlanned)} /{' '}
                {formatNumber(usage.plan.monthlyCampaignRecipientLimit)}
              </strong>
              <span>Campaign recipients planned</span>
              <div className="billing-progress-track">
                <div
                  className="billing-progress-fill"
                  style={{
                    width: `${Math.min(
                      100,
                      (usage.usage.campaignRecipientsPlanned /
                        Math.max(1, usage.plan.monthlyCampaignRecipientLimit)) *
                        100,
                    )}%`,
                  }}
                />
              </div>
              <small>
                Remaining: {formatNumber(Math.max(0, usage.remaining.campaignRecipients))}
              </small>
            </div>

            <div className="billing-usage-item">
              <strong>
                {formatNumber(usage.usage.campaignsCreated)} /{' '}
                {formatNumber(usage.plan.monthlyCampaignLimit)}
              </strong>
              <span>Campaigns created</span>
              <div className="billing-progress-track">
                <div
                  className="billing-progress-fill"
                  style={{
                    width: `${Math.min(
                      100,
                      (usage.usage.campaignsCreated /
                        Math.max(1, usage.plan.monthlyCampaignLimit)) *
                        100,
                    )}%`,
                  }}
                />
              </div>
              <small>
                Remaining: {formatNumber(Math.max(0, usage.remaining.campaigns))}
              </small>
            </div>

            <div className="billing-usage-item">
              <strong>{formatNumber(usage.usage.campaignRecipientsSent)}</strong>
              <span>Recipients sent successfully</span>
              <small>Tracked after worker sends messages</small>
            </div>

         <div className="billing-usage-item">
           <strong>
             {formatNumber(usage.usage.activeContacts)} /{' '}
             {formatNumber(usage.plan.maxContacts)}
           </strong>
           <span>Active contacts</span>
           <small>
             Remaining: {formatNumber(Math.max(0, usage.remaining.contacts))}
           </small>
         </div>

         <div className="billing-usage-item">
           <strong>
             {formatNumber(usage.usage.teamUsers)} /{' '}
             {formatNumber(usage.plan.maxTeamUsers)}
           </strong>
           <span>Active team users</span>
           <small>
             Remaining: {formatNumber(Math.max(0, usage.remaining.teamUsers))}
           </small>
         </div>

         <div className="billing-usage-item">
           <strong>
             {formatNumber(
               Math.ceil(usage.usage.mediaUsedBytes / 1024 / 1024),
             )}{' '}
             MB / {formatNumber(usage.plan.mediaStorageMb)} MB
           </strong>
           <span>Media storage</span>
           <small>
             Remaining:{' '}
             {formatNumber(Math.floor(usage.remaining.mediaBytes / 1024 / 1024))}{' '}
             MB
           </small>
         </div>
          </div>
        </section>
      ) : null}

            {pendingSubscriptions.length > 0 ? (
        <section className="billing-admin-panel">
          <div className="billing-admin-header">
            <div>
              <p className="billing-eyebrow">Platform admin</p>
              <h3>Pending plan approvals</h3>
              <p>
                Approve paid or enterprise plan requests only after payment/admin
                verification.
              </p>
            </div>

            <button type="button" onClick={loadPendingSubscriptions}>
              Refresh
            </button>
          </div>

          <div className="billing-admin-list">
            {pendingSubscriptions.map((item) => (
              <article className="billing-admin-request" key={item.id}>
                <div>
                  <strong>{item.tenant.name}</strong>
                  <span>
                    Tenant: {item.tenant.slug} · Status: {item.tenant.status}
                  </span>
                </div>

                <div>
                  <strong>{item.plan.name}</strong>
                  <span>
                    {formatMoney(item.plan.priceMonthlyPaise, item.plan.currency)} ·{' '}
                    {formatNumber(item.plan.monthlyCampaignRecipientLimit)} recipients/month
                  </span>
                </div>

                <div>
                  <strong>{formatDate(item.createdAt)}</strong>
                  <span>Requested date</span>
                </div>
                <div>
                  <strong>{item.paymentProofStatus.replaceAll('_', ' ')}</strong>
                  <span>
                    Ref: {item.paymentReference || '-'} · Payer:{' '}
                    {item.paymentPayerName || '-'} · Amount:{' '}
                    {item.paymentAmountPaise
                      ? formatMoney(item.paymentAmountPaise, item.plan.currency)
                      : '-'}
                  </span>

                  {item.paymentProofNote ? (
                    <span>Customer note: {item.paymentProofNote}</span>
                  ) : null}

                  <textarea
                    value={adminNotes[item.id] || ''}
                    onChange={(event) =>
                      setAdminNotes((current) => ({
                        ...current,
                        [item.id]: event.target.value,
                      }))
                    }
                    placeholder="Admin verification note"
                  />
                </div>
                <div className="billing-admin-actions">
                  <button
                    type="button"
                    disabled={adminActionId === item.id}
                    onClick={() => approveSubscription(item.id)}
                  >
                    {adminActionId === item.id ? 'Working...' : 'Approve'}
                  </button>

                  <button
                    type="button"
                    disabled={adminActionId === item.id}
                    onClick={() => cancelSubscription(item.id)}
                  >
                    Cancel
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {myPendingSubscriptions.length > 0 ? (
        <section className="billing-policy-box">
          <strong>Plan request pending</strong>
          <p>
            Your current plan stays active while the requested plan waits for
            payment/admin approval.
          </p>

          {myPendingSubscriptions.map((item) => (
            <div className="billing-payment-proof" key={item.id}>
              <strong>
                {item.plan.name} · {item.paymentProofStatus.replaceAll('_', ' ')}
              </strong>

              {item.plan.priceMonthlyPaise > 0 &&
              item.paymentProofStatus !== 'PENDING_VERIFICATION' ? (
                <>
                  <input
                    value={paymentProofForm.paymentReference}
                    onChange={(event) =>
                      setPaymentProofForm((current) => ({
                        ...current,
                        paymentReference: event.target.value,
                      }))
                    }
                    placeholder="Payment reference / UTR"
                  />

                  <input
                    value={paymentProofForm.paymentPayerName}
                    onChange={(event) =>
                      setPaymentProofForm((current) => ({
                        ...current,
                        paymentPayerName: event.target.value,
                      }))
                    }
                    placeholder="Payer name"
                  />

                  <input
                    value={paymentProofForm.paymentAmount}
                    onChange={(event) =>
                      setPaymentProofForm((current) => ({
                        ...current,
                        paymentAmount: event.target.value,
                      }))
                    }
                    placeholder="Paid amount in INR"
                    type="number"
                    min="1"
                  />

                  <textarea
                    value={paymentProofForm.paymentProofNote}
                    onChange={(event) =>
                      setPaymentProofForm((current) => ({
                        ...current,
                        paymentProofNote: event.target.value,
                      }))
                    }
                    placeholder="Optional note"
                  />

                  <button type="button" onClick={() => submitPaymentProof(item.id)}>
                    Submit payment proof
                  </button>
                </>
              ) : item.plan.priceMonthlyPaise > 0 ? (
                <span>
                  Proof submitted. Reference: {item.paymentReference || '-'} ·
                  Admin verification pending.
                </span>
              ) : (
                <span>
                  No manual payment proof required. Admin approval is pending.
                </span>
              )}
            </div>
          ))}
        </section>
      ) : null}

      <section className="billing-info-grid">
        <article>
          <strong>What we charge</strong>
          <p>
            Platform subscription for CRM, inbox, templates, campaigns, automations,
            storage, team users, and support.
          </p>
        </article>

        <article>
          <strong>What Meta may charge</strong>
          <p>
            WhatsApp messaging charges are handled by Meta according to the connected
            business account billing setup.
          </p>
        </article>

        <article>
          <strong>Your WhatsApp identity</strong>
          <p>
            Messages should go from your own connected WhatsApp Business number,
            not a shared number.
          </p>
        </article>
      </section>

      {loading ? (
        <div className="billing-loading">Loading billing plans...</div>
      ) : (
        <section className="billing-plans-grid">
          {plans.map((plan) => {
const isCurrent = plan.id === currentPlanId
const isPendingCurrent =
  isCurrent && subscription?.status === 'PENDING_APPROVAL'
const isPendingRequested = myPendingSubscriptions.some(
  (item) => item.plan.id === plan.id,
)

            return (
              <article
                className={`billing-plan-card ${isCurrent ? 'current' : ''}`}
                key={plan.id}
              >
                <div className="billing-plan-header">
                  <div>
                    <span>{plan.supportLevel}</span>
                    <h3>{plan.name}</h3>
                    <p>{plan.description}</p>
                  </div>

                  {isCurrent ? <strong className="billing-current-pill">Current</strong> : null}
                </div>

                <div className="billing-price">
                  <strong>{formatMoney(plan.priceMonthlyPaise, plan.currency)}</strong>
                  {plan.priceMonthlyPaise > 0 ? <span>/ month</span> : <span>pricing</span>}
                </div>

                <div className="billing-limits">
                  <span>{formatNumber(plan.monthlyCampaignRecipientLimit)} campaign recipients/month</span>
                  <span>{formatNumber(plan.monthlyCampaignLimit)} campaigns/month</span>
                  <span>{formatNumber(plan.maxContacts)} contacts</span>
                  <span>{formatNumber(plan.maxTeamUsers)} team users</span>
                  <span>{formatNumber(plan.maxAutomationRules)} automations</span>
                  <span>{formatNumber(plan.mediaStorageMb)} MB media storage</span>
                </div>

                {plan.requiresApproval ? (
                  <div className="billing-approval-note">
                    Enterprise plan requires approval and custom onboarding.
                  </div>
                ) : null}

<button
  type="button"
  disabled={isCurrent || isPendingRequested || Boolean(requestingPlanId)}
  onClick={() => requestPlan(plan)}
>
  {isPendingCurrent || isPendingRequested
    ? 'Approval Pending'
    : isCurrent
      ? 'Current Plan'
      : requestingPlanId === plan.id
        ? 'Requesting...'
        : plan.requiresApproval
          ? 'Request Enterprise'
          : 'Choose Plan'}
</button>
              </article>
            )
          })}
        </section>
      )}

<section className="billing-connect-card">
  <div>
    <h3>
      {isWhatsAppConnected
        ? 'WhatsApp connected'
        : 'Next: connect WhatsApp'}
    </h3>

    {isWhatsAppConnected ? (
      <p>
        Connected WABA: {metaConnection?.account?.wabaId} · Phone number ID:{' '}
        {metaConnection?.account?.phoneNumberId}
      </p>
    ) : (
      <p>
        After your platform plan is selected/approved, connect your WhatsApp API
        using Facebook Embedded Signup. We will store only required WhatsApp IDs
        and encrypted backend tokens.
      </p>
    )}

    {metaConnection?.account?.businessName ? (
      <div className="billing-connect-warning success">
        <strong>{metaConnection.account.businessName}</strong>
        <span>
          Quality: {metaConnection.account.qualityRating || 'Unknown'} · Tier:{' '}
          {metaConnection.account.messagingLimitTier || 'Unknown'}
        </span>
      </div>
    ) : null}

    {embeddedSignupConfig && !embeddedSignupConfig.isConfigured ? (
      <div className="billing-connect-warning">
        <strong>Meta setup missing</strong>
        <span>
          Missing:{' '}
          {[
            embeddedSignupConfig.missing.appId ? 'META_APP_ID' : '',
            embeddedSignupConfig.missing.configId
              ? 'META_EMBEDDED_SIGNUP_CONFIG_ID'
              : '',
            embeddedSignupConfig.missing.redirectUri
              ? 'META_EMBEDDED_SIGNUP_REDIRECT_URI'
              : '',
          ]
            .filter(Boolean)
            .join(', ')}
        </span>
      </div>
    ) : null}

    {!canConnectWhatsApp ? (
      <div className="billing-connect-warning">
        <strong>Plan activation required</strong>
        <span>
          Please activate Trial or wait for paid plan approval before connecting
          WhatsApp.
        </span>
      </div>
    ) : null}
  </div>

  <div className="billing-connect-actions">
    {isWhatsAppConnected ? (
      <button
        type="button"
        disabled={syncingPhoneQuality}
        onClick={syncPhoneQuality}
      >
        {syncingPhoneQuality ? 'Syncing...' : 'Sync quality/tier'}
      </button>
    ) : null}

<button
type="button"
disabled={
  connectingWhatsApp ||
  !embeddedSignupConfig?.isConfigured ||
  !canConnectWhatsApp
}
onClick={startEmbeddedSignup}
>
{connectingWhatsApp
  ? 'Connecting...'
  : isWhatsAppConnected
    ? 'Reconnect WhatsApp'
    : 'Connect WhatsApp'}
</button>

 {connectionDebugMessage ? (
   <div className="billing-connect-warning">
     <strong>Connection status</strong>
     <span>{connectionDebugMessage}</span>
   </div>
 ) : null}
</div>
</section>

      {activePlan ? (
        <section className="billing-policy-box">
          <strong>Important billing clarity</strong>
          <p>
            {activePlan.name} is a SaaS platform plan. It does not include Meta
            WhatsApp message charges unless a future enterprise agreement says so.
          </p>
        </section>
      ) : null}
    </div>
  )
}