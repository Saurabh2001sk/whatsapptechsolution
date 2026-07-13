import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'

type ShowToast = (text: string, type?: 'success' | 'error') => void

type TemplatesPageProps = {
  apiUrl: string
  showToast: ShowToast
}

type TemplateButton = {
type: string
text: string
url?: string
phoneNumber?: string
otpType?: string
flowId?: string
flowAction?: string
navigateScreen?: string
}

type TemplateBuilderButton = {
id: string
type: string
text: string
url: string
phoneNumber: string
otpType: string
flowId: string
flowAction: string
navigateScreen: string
}

type CarouselButtonType = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'

type CarouselBuilderButton = {
  id: string
  type: CarouselButtonType
  text: string
  url: string
  phoneNumber: string
}

type CarouselBuilderCard = {
  id: string
  headerFormat: 'IMAGE' | 'VIDEO'
  mediaFileName: string
  mediaPreview: string
  metaHeaderHandle: string
  bodyText: string
  buttons: CarouselBuilderButton[]
  uploading: boolean
}

type MediaFile = {
  id: string
  originalName: string
  mimeType: string
  mediaType: string
  sizeBytes?: number
  createdAt?: string
}

type WhatsappTemplate = {
  id: string
  name: string
  language: string
  category: string
  status: string
  headerType: string | null
  headerText: string | null
  headerMediaFileId?: string | null
  metaHeaderHandle?: string | null
  headerMediaFile?: MediaFile | null
  bodyText: string
  footerText: string | null
  buttons: TemplateButton[] | null
  variableCount: number
  qualityScore?: string | null
  rejectedReason?: string | null
  lastSyncedAt?: string | null
  components?: Array<Record<string, unknown>> | null
  createdAt?: string
  updatedAt?: string
}


type TemplatesTab = 'list' | 'create' | 'guide'

type MetaFlow = {
  id: string
  name: string
  status: string
  categories: string[]
  hasValidationErrors: boolean
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

type TemplateDraftPreview = {
  name: string
  language: string
  category: string
  headerType: string
  headerText: string
  bodyText: string
  footerText: string
}

const emptyTemplateDraftPreview: TemplateDraftPreview = {
  name: '',
  language: 'en_US',
  category: 'UTILITY',
  headerType: '',
  headerText: '',
  bodyText: '',
  footerText: '',
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

export function TemplatesPage({ apiUrl, showToast }: TemplatesPageProps) {
  const [templates, setTemplates] = useState<WhatsappTemplate[]>([])
  const [, setMediaFiles] = useState<MediaFile[]>([])
  const [templatesTab, setTemplatesTab] = useState<TemplatesTab>('list')
  const [templateSearch, setTemplateSearch] = useState('')
  const [templateStatusFilter, setTemplateStatusFilter] = useState('all')
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState('all')
  const [templateFormKey, setTemplateFormKey] = useState(0)
  const [templateDraftPreview, setTemplateDraftPreview] =
    useState<TemplateDraftPreview>(emptyTemplateDraftPreview)
  const [templateHeaderSampleFile, setTemplateHeaderSampleFile] =
    useState<File | null>(null)
  const [templateHeaderSamplePreview, setTemplateHeaderSamplePreview] =
    useState('')
  const [templateBuilderButtons, setTemplateBuilderButtons] = useState<
    TemplateBuilderButton[]
  >([])
  const [carouselBuilderEnabled, setCarouselBuilderEnabled] = useState(false)
  const [carouselBuilderCards, setCarouselBuilderCards] = useState<
    CarouselBuilderCard[]
  >(() => [createCarouselBuilderCard(), createCarouselBuilderCard()])
  const [submittingTemplate, setSubmittingTemplate] =
    useState<WhatsappTemplate | null>(null)
  const [metaConnection, setMetaConnection] = useState<MetaConnection | null>(null)
  const [metaFlows, setMetaFlows] = useState<MetaFlow[]>([])

  const filteredTemplates = useMemo(() => {
    const search = templateSearch.trim().toLowerCase()

    return templates.filter((template) => {
      const matchesSearch =
        !search ||
        template.name.toLowerCase().includes(search) ||
        template.language.toLowerCase().includes(search) ||
        template.bodyText.toLowerCase().includes(search)

      const matchesStatus =
        templateStatusFilter === 'all' || template.status === templateStatusFilter

      const matchesCategory =
        templateCategoryFilter === 'all' ||
        template.category === templateCategoryFilter

      return matchesSearch && matchesStatus && matchesCategory
    })
  }, [templates, templateSearch, templateStatusFilter, templateCategoryFilter])

  async function loadTemplates() {
    const response = await fetch(`${apiUrl}/templates`, {
      credentials: 'include',
    })

    if (!response.ok) {
      setTemplates([])
      return
    }

    const data = await response.json()
    setTemplates(data)
  }

  async function loadMediaFiles() {
    const response = await fetch(`${apiUrl}/media`, {
      credentials: 'include',
    })

    if (!response.ok) {
      setMediaFiles([])
      return
    }

    const data = await response.json()
    setMediaFiles(data)
  }

  async function loadMetaConnection() {
    const response = await fetch(`${apiUrl}/meta-accounts/active`, {
      credentials: 'include',
    })

    if (!response.ok) {
      setMetaConnection(null)
      return
    }

    const data = await response.json()
    setMetaConnection(data)
  }

  async function loadMetaFlows() {
    const response = await fetch(`${apiUrl}/templates/flows`, {
      credentials: 'include',
    })

    if (!response.ok) {
      setMetaFlows([])
      return
    }

    const data = await response.json()
    setMetaFlows(Array.isArray(data.flows) ? data.flows : [])
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadTemplates()
      void loadMediaFiles()
      void loadMetaConnection()
      void loadMetaFlows()
    }, 0)

    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function getTemplateVariableNumbers(text: string) {
  return Array.from(
    new Set(
      Array.from(text.matchAll(/{{\s*(\d+)\s*}}/g)).map((match) =>
        Number(match[1]),
      ),
    ),
  ).sort((a, b) => a - b)
}

function getSequentialVariableError(variables: number[], label: string) {
  for (let index = 0; index < variables.length; index += 1) {
    if (variables[index] !== index + 1) {
      return `${label} variables must start from {{1}} and continue like {{2}}, {{3}}`
    }
  }

  return ''
}

function getHeaderMediaAccept(headerType: string | null) {
  if (headerType === 'IMAGE') {
    return 'image/jpeg,image/png,image/webp'
  }

  if (headerType === 'VIDEO') {
    return 'video/mp4'
  }

  if (headerType === 'DOCUMENT') {
    return 'application/pdf'
  }

  return ''
}

function templateNeedsHeaderMedia(headerType: string | null) {
  return !!headerType && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType)
}

function updateTemplateDraftPreview(field: keyof TemplateDraftPreview, value: string) {
  setTemplateDraftPreview((currentDraft) => ({
    ...currentDraft,
    [field]: value,
  }))
}

function createTemplateBuilderButton(type = 'QUICK_REPLY'): TemplateBuilderButton {
return {
 id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
 type,
 text: type === 'OTP' ? 'Copy code' : type === 'FLOW' ? 'Open Flow' : '',
 url: '',
 phoneNumber: '',
 otpType: 'COPY_CODE',
 flowId: '',
 flowAction: 'NAVIGATE',
 navigateScreen: '',
}
}

function addTemplateBuilderButton() {
if (templateBuilderButtons.length >= 10) {
 showToast('Maximum 10 buttons are allowed', 'error')
 return
}

setTemplateBuilderButtons((currentButtons) => [
 ...currentButtons,
 createTemplateBuilderButton(),
])
}

function updateTemplateBuilderButton(
buttonId: string,
field: keyof TemplateBuilderButton,
value: string,
) {
setTemplateBuilderButtons((currentButtons) =>
 currentButtons.map((button) => {
   if (button.id !== buttonId) {
     return button
   }

   if (field === 'type') {
     return {
       ...button,
       type: value,
       text:
         value === 'OTP'
           ? 'Copy code'
           : value === 'FLOW'
             ? button.text || 'Open Flow'
             : button.text === 'Copy code'
               ? ''
               : button.text,
       url: value === 'URL' ? button.url : '',
       phoneNumber: value === 'PHONE_NUMBER' ? button.phoneNumber : '',
       otpType: value === 'OTP' ? button.otpType || 'COPY_CODE' : 'COPY_CODE',
       flowId: value === 'FLOW' ? button.flowId : '',
       flowAction: value === 'FLOW' ? button.flowAction || 'NAVIGATE' : 'NAVIGATE',
       navigateScreen: value === 'FLOW' ? button.navigateScreen : '',
     }
   }

   return {
     ...button,
     [field]: value,
   }
 }),
)
}

function removeTemplateBuilderButton(buttonId: string) {
setTemplateBuilderButtons((currentButtons) =>
 currentButtons.filter((button) => button.id !== buttonId),
)
}

function createCarouselButton(type: CarouselButtonType = 'QUICK_REPLY'): CarouselBuilderButton {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    text: '',
    url: '',
    phoneNumber: '',
  }
}

function createCarouselBuilderCard(): CarouselBuilderCard {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    headerFormat: 'IMAGE',
    mediaFileName: '',
    mediaPreview: '',
    metaHeaderHandle: '',
    bodyText: '',
    buttons: [createCarouselButton()],
    uploading: false,
  }
}

function addCarouselCard() {
  if (carouselBuilderCards.length >= 5) {
    showToast('Carousel can have maximum 5 cards', 'error')
    return
  }

  setCarouselBuilderCards((cards) => [...cards, createCarouselBuilderCard()])
}

function removeCarouselCard(cardId: string) {
  if (carouselBuilderCards.length <= 2) {
    showToast('Carousel needs at least 2 cards', 'error')
    return
  }

  setCarouselBuilderCards((cards) => cards.filter((card) => card.id !== cardId))
}

function updateCarouselCard(
  cardId: string,
  field: keyof CarouselBuilderCard,
  value: string,
) {
  setCarouselBuilderCards((cards) =>
    cards.map((card) =>
      card.id === cardId
        ? {
            ...card,
            [field]: value,
          }
        : card,
    ),
  )
}

function addCarouselCardButton(cardId: string) {
  setCarouselBuilderCards((cards) =>
    cards.map((card) => {
      if (card.id !== cardId) {
        return card
      }

      if (card.buttons.length >= 2) {
        showToast('Each carousel card can have maximum 2 buttons', 'error')
        return card
      }

      return {
        ...card,
        buttons: [...card.buttons, createCarouselButton()],
      }
    }),
  )
}

function removeCarouselCardButton(cardId: string, buttonId: string) {
  setCarouselBuilderCards((cards) =>
    cards.map((card) =>
      card.id === cardId
        ? {
            ...card,
            buttons: card.buttons.filter((button) => button.id !== buttonId),
          }
        : card,
    ),
  )
}

function updateCarouselCardButton(
  cardId: string,
  buttonId: string,
  field: keyof CarouselBuilderButton,
  value: string,
) {
  setCarouselBuilderCards((cards) =>
    cards.map((card) =>
      card.id === cardId
        ? {
            ...card,
            buttons: card.buttons.map((button) =>
              button.id === buttonId
                ? {
                    ...button,
                    [field]: value,
                  }
                : button,
            ),
          }
        : card,
    ),
  )
}

async function uploadCarouselCardMedia(cardId: string, file?: File) {
  if (!file) {
    return
  }

  if (!metaConnection?.account?.metaAppId) {
    showToast('Save Meta App ID in Settings before uploading carousel media', 'error')
    return
  }

  setCarouselBuilderCards((cards) =>
    cards.map((card) =>
      card.id === cardId ? { ...card, uploading: true } : card,
    ),
  )

  try {
    const mediaForm = new FormData()
    mediaForm.append('file', file)

    const uploadResponse = await fetch(`${apiUrl}/media/upload`, {
      method: 'POST',
      credentials: 'include',
      body: mediaForm,
    })

    if (!uploadResponse.ok) {
      throw new Error(await readApiError(uploadResponse, 'Failed to upload media'))
    }

    const uploadedMedia: MediaFile = await uploadResponse.json()

    if (!['IMAGE', 'VIDEO'].includes(uploadedMedia.mediaType)) {
      throw new Error('Carousel card media must be image or video')
    }

    const handleResponse = await fetch(`${apiUrl}/templates/media-handle`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mediaId: uploadedMedia.id,
      }),
    })

    if (!handleResponse.ok) {
      throw new Error(
        await readApiError(handleResponse, 'Failed to upload carousel media to Meta'),
      )
    }

    const result = await handleResponse.json()
    const mediaPreview = URL.createObjectURL(file)

    setCarouselBuilderCards((cards) =>
      cards.map((card) =>
        card.id === cardId
          ? {
              ...card,
              headerFormat: uploadedMedia.mediaType === 'VIDEO' ? 'VIDEO' : 'IMAGE',
              mediaFileName: uploadedMedia.originalName,
              mediaPreview,
              metaHeaderHandle: result.metaHeaderHandle,
              uploading: false,
            }
          : card,
      ),
    )

    showToast('Carousel card media uploaded to Meta')
  } catch (error) {
    setCarouselBuilderCards((cards) =>
      cards.map((card) =>
        card.id === cardId ? { ...card, uploading: false } : card,
      ),
    )

    showToast(
      error instanceof Error ? error.message : 'Failed to upload carousel media',
      'error',
    )
  }
}

function buildCarouselComponentsFromBuilder(bodyText: string) {
  if (!carouselBuilderEnabled) {
    return []
  }

  if (!bodyText.trim()) {
    throw new Error('Carousel main body text is required')
  }

    if (/{{\s*\d+\s*}}/.test(bodyText)) {
    throw new Error('Carousel main body cannot use variables yet')
  }

  if (carouselBuilderCards.length < 2 || carouselBuilderCards.length > 5) {
    throw new Error('Carousel must have 2 to 5 cards')
  }

  const cards = carouselBuilderCards.map((card, cardIndex) => {
    if (!card.metaHeaderHandle) {
      throw new Error(`Carousel card ${cardIndex + 1}: upload media first`)
    }

    if (!card.bodyText.trim()) {
      throw new Error(`Carousel card ${cardIndex + 1}: body text is required`)
    }

    if (/{{\s*\d+\s*}}/.test(card.bodyText)) {
      throw new Error(
        `Carousel card ${cardIndex + 1}: body text cannot use variables yet`,
      )
    }

    if (card.buttons.length < 1 || card.buttons.length > 2) {
      throw new Error(`Carousel card ${cardIndex + 1}: add 1 to 2 buttons`)
    }

    return {
      components: [
        {
          type: 'HEADER',
          format: card.headerFormat,
          example: {
            header_handle: [card.metaHeaderHandle],
          },
        },
        {
          type: 'BODY',
          text: card.bodyText.trim(),
        },
        {
          type: 'BUTTONS',
          buttons: card.buttons.map((button, buttonIndex) => {
            const text = button.text.trim()

            if (!text) {
              throw new Error(
                `Carousel card ${cardIndex + 1} button ${buttonIndex + 1}: text is required`,
              )
            }

            if (button.type === 'URL') {
              if (!/^https:\/\/[^\s]+\.[^\s]+/.test(button.url.trim())) {
                throw new Error(
                  `Carousel card ${cardIndex + 1} button ${buttonIndex + 1}: URL must start with https://`,
                )
              }

              return {
                type: 'URL',
                text,
                url: button.url.trim(),
              }
            }

            if (button.type === 'PHONE_NUMBER') {
              if (!/^\+?[1-9]\d{7,14}$/.test(button.phoneNumber.trim())) {
                throw new Error(
                  `Carousel card ${cardIndex + 1} button ${buttonIndex + 1}: phone number is invalid`,
                )
              }

              return {
                type: 'PHONE_NUMBER',
                text,
                phoneNumber: button.phoneNumber.trim(),
              }
            }

            return {
              type: 'QUICK_REPLY',
              text,
            }
          }),
        },
      ],
    }
  })

  return [
    {
      type: 'BODY',
      text: bodyText.trim(),
    },
    {
      type: 'CAROUSEL',
      cards,
    },
  ]
}

function buildTemplateButtonsFromBuilder(
category: string,
hasAdvancedComponents: boolean,
): TemplateButton[] {
const visibleButtons = templateBuilderButtons.filter((button) => button.type)

if (hasAdvancedComponents && visibleButtons.length > 0) {
 throw new Error('Carousel templates cannot be mixed with normal buttons')
}

if (hasAdvancedComponents) {
 return []
}

const urlCount = visibleButtons.filter((button) => button.type === 'URL').length
const phoneCount = visibleButtons.filter(
 (button) => button.type === 'PHONE_NUMBER',
).length
const otpCount = visibleButtons.filter((button) => button.type === 'OTP').length
const flowCount = visibleButtons.filter((button) => button.type === 'FLOW').length

if (urlCount > 2) {
 throw new Error('Maximum 2 website URL buttons are allowed')
}

if (phoneCount > 1) {
 throw new Error('Maximum 1 phone call button is allowed')
}

if (otpCount > 1) {
 throw new Error('Maximum 1 OTP button is allowed')
}

if (flowCount > 1) {
 throw new Error('Maximum 1 WhatsApp Flow button is allowed')
}

return visibleButtons.map((button, index) => {
 const text = button.type === 'OTP' ? 'Copy code' : button.text.trim()

 if (button.type !== 'OTP' && !text) {
   throw new Error(`Button ${index + 1}: button text is required`)
 }

 if (text.length > 25) {
   throw new Error(`Button ${index + 1}: button text cannot exceed 25 characters`)
 }

 if (button.type === 'OTP') {
   if (category !== 'AUTHENTICATION') {
     throw new Error('OTP button is only allowed for Authentication templates')
   }

   return {
     type: 'OTP',
     text: 'Copy code',
     otpType: button.otpType || 'COPY_CODE',
   }
 }

 if (button.type === 'URL') {
   if (!/^https:\/\/[^\s]+\.[^\s]+/.test(button.url.trim())) {
     throw new Error(`Button ${index + 1}: URL must start with https://`)
   }

   return {
     type: 'URL',
     text,
     url: button.url.trim(),
   }
 }

 if (button.type === 'PHONE_NUMBER') {
   const phoneNumber = button.phoneNumber.trim()

   if (!/^\+?[1-9]\d{7,14}$/.test(phoneNumber)) {
     throw new Error(
       `Button ${index + 1}: phone number must be in international format`,
     )
   }

   return {
     type: 'PHONE_NUMBER',
     text,
     phoneNumber,
   }
 }

 if (button.type === 'FLOW') {
   if (category === 'AUTHENTICATION') {
     throw new Error('Flow button is not allowed for Authentication templates')
   }

   if (!button.flowId.trim()) {
     throw new Error(`Button ${index + 1}: Meta Flow ID is required`)
   }

   return {
     type: 'FLOW',
     text,
     flowId: button.flowId.trim(),
     flowAction: button.flowAction || 'NAVIGATE',
     ...(button.navigateScreen.trim()
       ? { navigateScreen: button.navigateScreen.trim() }
       : {}),
   }
 }

 return {
   type: 'QUICK_REPLY',
   text,
 }
})
}

function handleCreateTemplateHeaderFileChange(event: ChangeEvent<HTMLInputElement>) {
  const file = event.currentTarget.files?.[0] || null

  if (templateHeaderSamplePreview) {
    URL.revokeObjectURL(templateHeaderSamplePreview)
  }

  setTemplateHeaderSampleFile(file)

  if (!file) {
    setTemplateHeaderSamplePreview('')
    return
  }

  if (
    templateDraftPreview.headerType === 'IMAGE' ||
    templateDraftPreview.headerType === 'VIDEO'
  ) {
    setTemplateHeaderSamplePreview(URL.createObjectURL(file))
    return
  }

  setTemplateHeaderSamplePreview('')
}

async function uploadTemplateHeaderMediaSample(
  template: WhatsappTemplate,
  file: File,
) {
  const mediaForm = new FormData()
  mediaForm.append('file', file)

  const uploadResponse = await fetch(`${apiUrl}/media/upload`, {
    method: 'POST',
    credentials: 'include',
    body: mediaForm,
  })

  if (!uploadResponse.ok) {
    throw new Error(await readApiError(uploadResponse, 'Failed to upload media'))
  }

  const uploadedMedia: MediaFile = await uploadResponse.json()

  const attachResponse = await fetch(
    `${apiUrl}/templates/${template.id}/header-media`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mediaId: uploadedMedia.id,
      }),
    },
  )

  if (!attachResponse.ok) {
    throw new Error(
      await readApiError(attachResponse, 'Failed to upload media sample to Meta'),
    )
  }

  const result = await attachResponse.json()
  const updatedTemplate = result.template || result

  return {
    uploadedMedia,
    updatedTemplate: {
      ...updatedTemplate,
      headerMediaFile: updatedTemplate.headerMediaFile || uploadedMedia,
    },
  }
}

async function handleTemplateHeaderMediaUpload(
  event: ChangeEvent<HTMLInputElement>,
  template: WhatsappTemplate,
) {
  const file = event.currentTarget.files?.[0]

  if (!file) {
    return
  }

  if (!templateNeedsHeaderMedia(template.headerType)) {
    showToast('This template does not need header media', 'error')
    event.currentTarget.value = ''
    return
  }

  try {
    const { uploadedMedia, updatedTemplate } =
      await uploadTemplateHeaderMediaSample(template, file)

    setMediaFiles((currentFiles) => [
      uploadedMedia,
      ...currentFiles.filter((mediaFile) => mediaFile.id !== uploadedMedia.id),
    ])

    setTemplates((currentTemplates) =>
      currentTemplates.map((currentTemplate) =>
        currentTemplate.id === updatedTemplate.id ? updatedTemplate : currentTemplate,
      ),
    )

    showToast('Header media sample uploaded to Meta successfully')
  } catch (error) {
    showToast(
      error instanceof Error
        ? error.message
        : 'Failed to upload header media sample',
      'error',
    )
  } finally {
    event.currentTarget.value = ''
  }
}

async function handleCreateTemplate(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()

  const formElement = event.currentTarget
  const form = new FormData(formElement)
  const name = String(form.get('name') || '').trim()
  const language = String(form.get('language') || '').trim()
  const category = String(form.get('category') || '').trim()
  const headerType = String(form.get('headerType') || '').trim()
  const headerText = String(form.get('headerText') || '').trim()
  const bodyText = String(form.get('bodyText') || '').trim()
  const footerText = String(form.get('footerText') || '').trim()

  if (!name) {
    showToast('Template name is required', 'error')
    return
  }

  if (!bodyText) {
    showToast('Template body is required', 'error')
    return
  }

  if (templateNeedsHeaderMedia(headerType) && !templateHeaderSampleFile) {
  showToast('Upload header media sample before creating this template', 'error')
  return
}

if (templateNeedsHeaderMedia(headerType) && !metaConnection?.account?.metaAppId) {
  showToast('Save Meta App ID in Settings before uploading header media', 'error')
  return
}

if (carouselBuilderEnabled && category === 'AUTHENTICATION') {
  showToast('Carousel templates cannot use Authentication category', 'error')
  return
}

let templatePayload: {
  buttons: TemplateButton[]
  advancedComponents: Array<Record<string, unknown>>
}

try {
  const advancedComponents = carouselBuilderEnabled
    ? buildCarouselComponentsFromBuilder(bodyText)
    : []

  templatePayload = {
    advancedComponents,
    buttons: buildTemplateButtonsFromBuilder(
      category,
      advancedComponents.length > 0,
    ),
  }
} catch (error) {
  showToast(
    error instanceof Error
      ? error.message
      : 'Invalid template button or carousel data',
    'error',
  )
  return
}

  try {
    const response = await fetch(`${apiUrl}/templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
body: JSON.stringify({
  name,
  language,
  category,
  headerType,
  headerText,
  bodyText,
  footerText,
  buttons: templatePayload.buttons,
  ...(templatePayload.advancedComponents.length > 0
    ? { advancedComponents: templatePayload.advancedComponents }
    : {}),
}),
    })

    if (!response.ok) {
      showToast(await readApiError(response, 'Failed to create template'), 'error')
      return
    }

const createdTemplate = await response.json()
let finalTemplate = createdTemplate

if (templateNeedsHeaderMedia(headerType) && templateHeaderSampleFile) {
try {
 const { uploadedMedia, updatedTemplate } =
   await uploadTemplateHeaderMediaSample(
     createdTemplate,
     templateHeaderSampleFile,
   )

 finalTemplate = updatedTemplate

 setMediaFiles((currentFiles) => [
   uploadedMedia,
   ...currentFiles.filter((mediaFile) => mediaFile.id !== uploadedMedia.id),
 ])
} catch (error) {
const uploadErrorMessage =
error instanceof Error
  ? error.message
  : 'Template draft created, but media upload failed'

setTemplates((currentTemplates) => [
createdTemplate,
...currentTemplates.filter(
  (template) => template.id !== createdTemplate.id,
),
])

await loadTemplates()

showToast(
`Template draft created, but media upload failed: ${uploadErrorMessage}`,
'error',
)

return
}
}

setTemplates((currentTemplates) => [
  finalTemplate,
  ...currentTemplates.filter(
    (template) => template.id !== finalTemplate.id,
  ),
])

formElement.reset()
setTemplateFormKey((currentKey) => currentKey + 1)
setTemplateDraftPreview(emptyTemplateDraftPreview)
setTemplateBuilderButtons([])
setCarouselBuilderEnabled(false)
setCarouselBuilderCards([createCarouselBuilderCard(), createCarouselBuilderCard()])
setTemplateHeaderSampleFile(null)

if (templateHeaderSamplePreview) {
  URL.revokeObjectURL(templateHeaderSamplePreview)
}

setTemplateHeaderSamplePreview('')
setTemplatesTab('list')
showToast(
  templateNeedsHeaderMedia(headerType)
    ? 'Template draft created and media sample uploaded'
    : 'Template draft created successfully',
)
} catch (error) {
 showToast(
   error instanceof Error ? error.message : 'Failed to create template',
   'error',
 )
}
}

async function syncTemplatesFromMeta() {
  const response = await fetch(`${apiUrl}/templates/sync`, {
    method: 'POST',
    credentials: 'include',
  })

  if (!response.ok) {
    showToast(await readApiError(response, 'Failed to sync templates'), 'error')
    return
  }

  const result = await response.json()

  await loadTemplates()

  showToast(`Synced ${result.synced || 0} templates from Meta`)
}

async function copyTemplateAsDraft(template: WhatsappTemplate) {
  const suggestedName = `${template.name}_copy`
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80)

  const newName = window.prompt(
    'Enter new draft template name using lowercase letters, numbers, and underscores.',
    suggestedName,
  )

  if (!newName) {
    return
  }

  const response = await fetch(`${apiUrl}/templates/${template.id}/copy`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: newName,
    }),
  })

  if (!response.ok) {
    showToast(await readApiError(response, 'Failed to copy template'), 'error')
    return
  }

  const copiedTemplate = await response.json()

  setTemplates((currentTemplates) => [
    copiedTemplate,
    ...currentTemplates.filter(
      (currentTemplate) => currentTemplate.id !== copiedTemplate.id,
    ),
  ])

  setTemplatesTab('list')
  showToast('Template copied as new draft')
}

async function refreshTemplateFromMeta(templateId: string) {
  const response = await fetch(`${apiUrl}/templates/${templateId}/refresh`, {
    method: 'POST',
    credentials: 'include',
  })

  if (!response.ok) {
    showToast(
      await readApiError(response, 'Failed to refresh template status'),
      'error',
    )
    return
  }

  const result = await response.json()

  if (result.template) {
    setTemplates((currentTemplates) =>
      currentTemplates.map((template) =>
        template.id === result.template.id ? result.template : template,
      ),
    )
  } else {
    await loadTemplates()
  }

  showToast('Template status refreshed from Meta')
}

function isCarouselTemplate(template: WhatsappTemplate) {
  return Array.isArray(template.components)
    ? template.components.some(
        (component) =>
          String(component.type || '').toUpperCase() === 'CAROUSEL',
      )
    : false
}

function formatTemplateSyncedAt(value?: string | null) {
  if (!value) {
    return 'Not synced yet'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Synced with Meta'
  }

  return `Synced ${date.toLocaleString()}`
}

async function handleSubmitTemplate(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()

  if (!submittingTemplate) {
    showToast('Select a draft template first', 'error')
    return
  }

const form = new FormData(event.currentTarget)
const isCarousel = isCarouselTemplate(submittingTemplate)

if (isCarousel) {
  const response = await fetch(
    `${apiUrl}/templates/${submittingTemplate.id}/submit`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        bodyExamples: [],
        headerExamples: [],
      }),
    },
  )

  if (!response.ok) {
    showToast(await readApiError(response, 'Failed to submit carousel template'), 'error')
    return
  }

  const result = await response.json()

  setTemplates((currentTemplates) =>
    currentTemplates.map((template) =>
      template.id === result.template.id ? result.template : template,
    ),
  )

  setSubmittingTemplate(null)
  showToast('Carousel template submitted to Meta for review')
  return
}

const bodyVariables = getTemplateVariableNumbers(submittingTemplate.bodyText)
  const headerVariables = getTemplateVariableNumbers(
    submittingTemplate.headerText || '',
  )

  const bodyVariableError = getSequentialVariableError(bodyVariables, 'Body')
const headerVariableError = getSequentialVariableError(headerVariables, 'Header')

if (headerVariableError) {
  showToast(headerVariableError, 'error')
  return
}

if (bodyVariableError) {
  showToast(bodyVariableError, 'error')
  return
}

  const bodyExamples = bodyVariables.map((variable) =>
    String(form.get(`bodyExample${variable}`) || '').trim(),
  )

  const headerExamples = headerVariables.map((variable) =>
    String(form.get(`headerExample${variable}`) || '').trim(),
  )

  if (bodyExamples.some((example) => !example)) {
    showToast('Fill all body variable examples', 'error')
    return
  }

  if (headerExamples.some((example) => !example)) {
    showToast('Fill all header variable examples', 'error')
    return
  }

  const response = await fetch(
    `${apiUrl}/templates/${submittingTemplate.id}/submit`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        bodyExamples,
        headerExamples,
      }),
    },
  )

  if (!response.ok) {
    showToast(await readApiError(response, 'Failed to submit template'), 'error')
    return
  }

  const result = await response.json()

  setTemplates((currentTemplates) =>
    currentTemplates.map((template) =>
      template.id === result.template.id ? result.template : template,
    ),
  )

  setSubmittingTemplate(null)
  showToast('Template submitted to Meta for review')
}

async function deleteTemplate(templateId: string) {
  const confirmed = window.confirm(
    'Delete this draft template? Only local draft templates can be deleted.',
  )

  if (!confirmed) {
    return
  }

  const response = await fetch(`${apiUrl}/templates/${templateId}`, {
    method: 'DELETE',
    credentials: 'include',
  })

  if (!response.ok) {
    showToast(await readApiError(response, 'Failed to delete template'), 'error')
    return
  }

  setTemplates((currentTemplates) =>
    currentTemplates.filter((template) => template.id !== templateId),
  )

  showToast('Template deleted')
}

async function deleteTemplateFromMeta(templateId: string) {
  const confirmed = window.confirm(
    'Delete this template from Meta? This cannot be undone.',
  )

  if (!confirmed) {
    return
  }

  const response = await fetch(`${apiUrl}/templates/${templateId}/meta`, {
    method: 'DELETE',
    credentials: 'include',
  })

  if (!response.ok) {
    showToast(
      await readApiError(response, 'Failed to delete template from Meta'),
      'error',
    )
    return
  }

  setTemplates((currentTemplates) =>
    currentTemplates.filter((template) => template.id !== templateId),
  )

  showToast('Template deleted from Meta successfully')
}

function renderTemplatesContent() {
  return (
    <div className="content-card templates-workspace">
      <div className="contacts-topbar">
<div>
  <h2>WhatsApp Templates</h2>
  <p>
    Create, preview, submit, sync, refresh, and manage official Meta WhatsApp templates.
  </p>
</div>

        <span className="status-pill">{filteredTemplates.length} templates shown</span>
      </div>

      <div className="contacts-tabs">
        <button
          className={templatesTab === 'list' ? 'active' : ''}
          type="button"
          onClick={() => setTemplatesTab('list')}
        >
          Template List
        </button>
        <button
          className={templatesTab === 'create' ? 'active' : ''}
          type="button"
          onClick={() => setTemplatesTab('create')}
        >
          Create Template
        </button>

        <button
  className={templatesTab === 'guide' ? 'active' : ''}
  type="button"
  onClick={() => setTemplatesTab('guide')}
>
  Template Guide
</button>
      </div>

      {templatesTab === 'list' ? (
        <>
          <section className="sub-card">
            <div className="section-heading">
<div>
  <h3>Template Library</h3>
  <p>
    Manage local drafts and synced Meta templates from one place.
  </p>
</div>
            </div>

            <div className="templates-filter-grid">
              <input
                value={templateSearch}
                onChange={(event) => setTemplateSearch(event.target.value)}
                placeholder="Search name, language, or body"
              />

              <select
                value={templateStatusFilter}
                onChange={(event) => setTemplateStatusFilter(event.target.value)}
              >
                <option value="all">All status</option>
                <option value="DRAFT">Draft</option>
                <option value="APPROVED">Approved</option>
                <option value="PENDING">Pending</option>
                <option value="REJECTED">Rejected</option>
              </select>

              <select
                value={templateCategoryFilter}
                onChange={(event) => setTemplateCategoryFilter(event.target.value)}
              >
                <option value="all">All categories</option>
                <option value="UTILITY">Utility</option>
                <option value="MARKETING">Marketing</option>
                <option value="AUTHENTICATION">Authentication</option>
              </select>

<button type="button" onClick={syncTemplatesFromMeta}>
  Sync from Meta
</button>
            </div>
          </section>

          <div className="templates-list">
            {filteredTemplates.length === 0 ? (
              <div className="empty-state">
                <strong>No templates found</strong>
                <span>Create a draft template to start.</span>
              </div>
            ) : (
              filteredTemplates.map((template) => (
                <article className="template-card" key={template.id}>
                  <div className="template-card-header">
                    <div>
                      <strong>{template.name}</strong>
                      <span>
                        {template.language} · {template.category}
                      </span>
                    </div>

                    <span className={`template-status ${template.status.toLowerCase()}`}>
                      {template.status}
                    </span>
                  </div>

{template.headerType ? (
  <div className="template-preview-line">
    Header: {template.headerType}
    {template.headerText ? ` · ${template.headerText}` : ''}
  </div>
) : null}

{template.headerType &&
['IMAGE', 'VIDEO', 'DOCUMENT'].includes(template.headerType) ? (
  <div className="template-media-box">
    <div>
      <strong>Header media sample</strong>
      <span>
        {template.headerMediaFile
          ? template.headerMediaFile.originalName
          : 'No media sample uploaded yet'}
      </span>
    </div>

    {template.status === 'DRAFT' ? (
      <label className="small-upload-button">
        Upload sample
        <input
          accept={getHeaderMediaAccept(template.headerType)}
          type="file"
          onChange={(event) => handleTemplateHeaderMediaUpload(event, template)}
        />
      </label>
    ) : null}
  </div>
) : null}

                  <p className="template-body-preview">{template.bodyText}</p>

                  {template.footerText ? (
                    <div className="template-preview-line">
                      Footer: {template.footerText}
                    </div>
                  ) : null}

<div className="template-meta-row">
  <span>{template.variableCount} variables</span>
  <span>{template.buttons?.length || 0} buttons</span>

  {templateNeedsHeaderMedia(template.headerType) ? (
    template.metaHeaderHandle ? (
      <span className="meta-good">Meta media ready</span>
    ) : (
      <span className="meta-warning">Media sample missing</span>
    )
  ) : null}

  {template.qualityScore ? (
    <span>Quality: {template.qualityScore}</span>
  ) : null}

  {template.status !== 'DRAFT' ? (
    <span>{formatTemplateSyncedAt(template.lastSyncedAt)}</span>
  ) : (
    <span>Local draft</span>
  )}
</div>

{template.rejectedReason ? (
  <div className="template-rejection-box">
    <strong>Meta rejection reason</strong>
    <span>{template.rejectedReason}</span>
  </div>
) : null}

<div className="contact-actions template-actions">
  <button
    className="small-secondary-button"
    type="button"
    onClick={() => copyTemplateAsDraft(template)}
  >
    Copy as draft
  </button>

  {template.status === 'DRAFT' ? (
    <>
      <button
        className="small-success-button"
        type="button"
        onClick={() => {
          if (
            templateNeedsHeaderMedia(template.headerType) &&
            !template.metaHeaderHandle
          ) {
            showToast('Upload header media sample before submitting to Meta', 'error')
            return
          }

          setSubmittingTemplate(template)
        }}
      >
        Submit to Meta
      </button>

      <button
        className="small-danger-button"
        type="button"
        onClick={() => deleteTemplate(template.id)}
      >
        Delete draft
      </button>
    </>
  ) : (
    <>
      <button
        className="small-secondary-button"
        type="button"
        onClick={() => refreshTemplateFromMeta(template.id)}
      >
        Refresh status
      </button>

      <button
        className="small-danger-button"
        type="button"
        onClick={() => deleteTemplateFromMeta(template.id)}
      >
        Delete from Meta
      </button>
    </>
  )}
</div>
                </article>
              ))
            )}
          </div>
        </>
      ) : null}

      {submittingTemplate ? (
  <div className="modal-backdrop">
    <div className="modal-card">
      <div className="modal-header">
        <div>
          <h3>Submit template to Meta</h3>
          <p>
            Add sample values for variables. Meta needs these examples for
            review.
          </p>
        </div>

        <button type="button" onClick={() => setSubmittingTemplate(null)}>
          ×
        </button>
      </div>

      <form className="template-submit-form" onSubmit={handleSubmitTemplate}>
<div className="template-submit-preview">
  <strong>{submittingTemplate.name}</strong>
  <span>
    {submittingTemplate.language} · {submittingTemplate.category}
  </span>
  <p>{submittingTemplate.bodyText}</p>
</div>

<div className="template-review-checklist">
  <strong>Ready to submit checklist</strong>
  <span>✓ Template name uses Meta-safe lowercase format</span>
  <span>✓ Category is selected</span>
  <span>✓ Body text is ready</span>
  {templateNeedsHeaderMedia(submittingTemplate.headerType) ? (
    submittingTemplate.metaHeaderHandle ? (
      <span>✓ Header media sample uploaded to Meta</span>
    ) : (
      <span className="danger">✕ Header media sample missing</span>
    )
  ) : null}
{isCarouselTemplate(submittingTemplate) ? (
  <span>✓ Carousel cards and media handles are ready</span>
) : submittingTemplate.variableCount > 0 ? (
  <span>✓ Fill examples for all variables below</span>
) : (
  <span>✓ No variable examples required</span>
)}
</div>
         {!isCarouselTemplate(submittingTemplate) ? (
  <>
        {getTemplateVariableNumbers(submittingTemplate.headerText || '').map(
          (variable) => (
            <input
              key={`header-${variable}`}
              name={`headerExample${variable}`}
              placeholder={`Header example for {{${variable}}}`}
            />
          ),
        )}

        {getTemplateVariableNumbers(submittingTemplate.bodyText).map(
          (variable) => (
            <input
              key={`body-${variable}`}
              name={`bodyExample${variable}`}
              placeholder={`Body example for {{${variable}}}`}
            />
          ),
        )}
          </>
) : null}

        <div className="modal-actions">
          <button type="button" onClick={() => setSubmittingTemplate(null)}>
            Cancel
          </button>
          <button type="submit">Submit to Meta</button>
        </div>
      </form>
    </div>
  </div>
) : null}

      {templatesTab === 'guide' ? (
        <section className="sub-card template-guide-page">
          <div className="section-heading">
            <div>
              <h3>How WhatsApp Templates Work</h3>
              <p>
                Learn what each template type is used for before creating and submitting it to Meta.
              </p>
            </div>
          </div>

          <div className="template-guide-grid">
            <article className="template-guide-card">
              <strong>1. What is a WhatsApp Template?</strong>
              <p>
                A template is a pre-approved WhatsApp message. It is required when you message a customer outside the 24-hour customer service window.
              </p>
              <span>Use for: order updates, payment reminders, offers, OTP, appointment reminders.</span>
            </article>

            <article className="template-guide-card">
              <strong>2. Utility Templates</strong>
              <p>
                Utility templates are used for important customer updates like orders, invoices, delivery, payment, or account alerts.
              </p>
              <span>Example: Hello {'{{1}'}, your order {'{{2}'} is ready for dispatch.</span>
            </article>

            <article className="template-guide-card">
              <strong>3. Marketing Templates</strong>
              <p>
                Marketing templates are used for promotions, offers, product announcements, and follow-up campaigns.
              </p>
              <span>Important: Send only to opted-in contacts.</span>
            </article>

            <article className="template-guide-card">
              <strong>4. Authentication / OTP Templates</strong>
              <p>
                Authentication templates are used only for login codes, verification codes, and secure account access.
              </p>
              <span>OTP buttons are allowed only in Authentication category.</span>
            </article>

            <article className="template-guide-card">
              <strong>5. Variables</strong>
              <p>
                Variables are dynamic values like customer name, order number, amount, or date.
              </p>
              <span>Use like: {'{{1}'}, {'{{2}'}, {'{{3}'} in correct order.</span>
            </article>

            <article className="template-guide-card">
              <strong>6. Text Header</strong>
              <p>
                A text header is a bold title shown above the message body.
              </p>
              <span>Example: Order Update, Payment Reminder, Appointment Confirmed.</span>
            </article>

            <article className="template-guide-card">
              <strong>7. Image / Video / Document Header</strong>
              <p>
                Media headers show an image, video, or PDF above the message body. Meta requires a sample file before approval.
              </p>
              <span>Use for: product image, invoice PDF, offer poster, explainer video.</span>
            </article>

            <article className="template-guide-card">
              <strong>8. Buttons</strong>
              <p>
                Buttons help customers take action directly from WhatsApp.
              </p>
              <span>Types: Quick Reply, Website URL, Phone Call, OTP, Flow.</span>
            </article>

            <article className="template-guide-card">
              <strong>9. Quick Reply Button</strong>
              <p>
                Quick reply buttons let customers tap simple replies like Yes, No, Interested, or Call me.
              </p>
              <span>Best for: lead confirmation, support replies, simple choices.</span>
            </article>

            <article className="template-guide-card">
              <strong>10. Website URL Button</strong>
              <p>
                Website buttons open a secure link when the customer taps them.
              </p>
              <span>Use https links only, like payment links or tracking pages.</span>
            </article>

            <article className="template-guide-card">
              <strong>11. Phone Call Button</strong>
              <p>
                Phone buttons let the customer call your business directly.
              </p>
              <span>Use international format like +919999999999.</span>
            </article>

            <article className="template-guide-card">
              <strong>12. WhatsApp Flow Template</strong>
              <p>
                Flow templates open a form-like experience inside WhatsApp. Customers can fill details without leaving WhatsApp.
              </p>
              <span>Use for: lead forms, bookings, surveys, quote requests, support forms.</span>
            </article>

            <article className="template-guide-card">
              <strong>13. Carousel Template</strong>
              <p>
                Carousel templates show 2 to 5 cards in one message. Each card can have media, text, and buttons.
              </p>
              <span>Use for: product options, service packages, plans, catalogs, offers.</span>
            </article>

            <article className="template-guide-card">
              <strong>14. Template Approval</strong>
              <p>
                After creating a draft, submit it to Meta. Meta reviews the content and returns Approved, Pending, or Rejected.
              </p>
              <span>If rejected, check the rejection reason and copy as draft to fix it.</span>
            </article>

            <article className="template-guide-card">
              <strong>15. End Use</strong>
              <p>
                Approved templates will be used later in Campaigns, Auto Replies, Inbox follow-ups, Orders, and payment reminders.
              </p>
              <span>Only approved templates should be sent in bulk campaigns.</span>
            </article>

            <article className="template-guide-card warning">
              <strong>Important Rules</strong>
              <p>
                Do not create misleading, spammy, or policy-breaking templates. Marketing messages must go only to opted-in contacts.
              </p>
              <span>Outside 24 hours, use approved templates only.</span>
            </article>
          </div>
        </section>
      ) : null}

      {templatesTab === 'create' ? (
        <section className="sub-card">
          <div className="section-heading">
<div>
  <h3>Create Meta Template Draft</h3>
  <p>
    Use variables like {'{{1}'}, {'{{2}'} in order. Media headers need a sample before Meta submission.
  </p>
</div>
          </div>

<div className="template-composer-layout">
  <form
    key={templateFormKey}
    className="template-form template-composer-form"
    onSubmit={handleCreateTemplate}
  >
    <input
      name="name"
      value={templateDraftPreview.name}
      placeholder="Template name e.g. order_update"
      onChange={(event) =>
        updateTemplateDraftPreview('name', event.target.value)
      }
    />

    <input
      name="language"
      value={templateDraftPreview.language}
      placeholder="Language e.g. en_US"
      onChange={(event) =>
        updateTemplateDraftPreview('language', event.target.value)
      }
    />

    <select
      name="category"
      value={templateDraftPreview.category}
      onChange={(event) =>
        updateTemplateDraftPreview('category', event.target.value)
      }
    >
      <option value="UTILITY">Utility</option>
      <option value="MARKETING">Marketing</option>
      <option value="AUTHENTICATION">Authentication</option>
    </select>

    <select
      name="headerType"
      value={templateDraftPreview.headerType}
      onChange={(event) => {
        const nextHeaderType = event.target.value

        updateTemplateDraftPreview('headerType', nextHeaderType)

        if (nextHeaderType !== 'TEXT') {
          updateTemplateDraftPreview('headerText', '')
        }

        if (!templateNeedsHeaderMedia(nextHeaderType)) {
          setTemplateHeaderSampleFile(null)

          if (templateHeaderSamplePreview) {
            URL.revokeObjectURL(templateHeaderSamplePreview)
          }

          setTemplateHeaderSamplePreview('')
        }
      }}
    >
      <option value="">No header</option>
      <option value="TEXT">Text header</option>
      <option value="IMAGE">Image header</option>
      <option value="VIDEO">Video header</option>
      <option value="DOCUMENT">Document header</option>
    </select>

    {templateDraftPreview.headerType === 'TEXT' ? (
      <input
        name="headerText"
        value={templateDraftPreview.headerText}
        placeholder="Header text"
        onChange={(event) =>
          updateTemplateDraftPreview('headerText', event.target.value)
        }
      />
    ) : (
      <input name="headerText" type="hidden" value="" />
    )}

{templateBuilderButtons.some((button) => button.type === 'OTP') &&
templateDraftPreview.category !== 'AUTHENTICATION' ? (
  <div className="template-warning-box">
    OTP buttons require category AUTHENTICATION.
  </div>
) : null}

{carouselBuilderEnabled ? (
  <div className="template-warning-box">
    Carousel mode is on. Normal buttons are disabled for carousel templates.
  </div>
) : null}

{templateBuilderButtons.some((button) => button.type === 'FLOW') ? (
  <div className="template-warning-box">
    {metaFlows.length > 0
      ? 'Select a Meta Flow from dropdown. Use only published Flow for production.'
      : 'No Meta Flows found. Create/publish Flow in Meta, then refresh this page, or paste Flow ID manually.'}
  </div>
) : null}

    {templateNeedsHeaderMedia(templateDraftPreview.headerType) ? (
      <label className="template-create-media-picker">
        <strong>
          {templateHeaderSampleFile
            ? templateHeaderSampleFile.name
            : `Upload ${templateDraftPreview.headerType.toLowerCase()} sample`}
        </strong>
        <span>
          This sample will be uploaded to Meta with the draft template.
        </span>
        <input
          accept={getHeaderMediaAccept(templateDraftPreview.headerType)}
          type="file"
          onChange={handleCreateTemplateHeaderFileChange}
        />
      </label>
    ) : null}

    <textarea
      name="bodyText"
      value={templateDraftPreview.bodyText}
      placeholder="Body e.g. Hello {{1}}, your order {{2}} is ready."
      rows={5}
      onChange={(event) =>
        updateTemplateDraftPreview('bodyText', event.target.value)
      }
    />

    <input
      name="footerText"
      value={templateDraftPreview.footerText}
      placeholder="Footer optional"
      onChange={(event) =>
        updateTemplateDraftPreview('footerText', event.target.value)
      }
    />

<div className="template-builder-panel">
<div className="template-builder-header">
 <div>
   <strong>Buttons</strong>
   <span>Add quick reply, website, phone, OTP, or Flow buttons without JSON.</span>
 </div>

<button
  type="button"
  disabled={carouselBuilderEnabled}
  onClick={addTemplateBuilderButton}
>
  Add Button
</button>
</div>

{templateBuilderButtons.length === 0 ? (
 <div className="empty-state">
   <strong>No buttons added</strong>
   <span>This template will be created without buttons.</span>
 </div>
) : (
 <div className="template-builder-list">
   {templateBuilderButtons.map((button, index) => (
     <div className="template-builder-item" key={button.id}>
       <div className="template-builder-item-header">
         <strong>Button {index + 1}</strong>
         <button
           className="small-danger-button"
           type="button"
           onClick={() => removeTemplateBuilderButton(button.id)}
         >
           Remove
         </button>
       </div>

       <select
         value={button.type}
         onChange={(event) =>
           updateTemplateBuilderButton(button.id, 'type', event.target.value)
         }
       >
         <option value="QUICK_REPLY">Quick reply</option>
         <option value="URL">Website URL</option>
         <option value="PHONE_NUMBER">Phone call</option>
         <option value="OTP">Authentication OTP</option>
         <option value="FLOW">WhatsApp Flow</option>
       </select>

       {button.type !== 'OTP' ? (
         <input
           value={button.text}
           placeholder="Button text e.g. Track Order"
           onChange={(event) =>
             updateTemplateBuilderButton(button.id, 'text', event.target.value)
           }
         />
       ) : null}

       {button.type === 'URL' ? (
         <input
           value={button.url}
           placeholder="https://example.com"
           onChange={(event) =>
             updateTemplateBuilderButton(button.id, 'url', event.target.value)
           }
         />
       ) : null}

       {button.type === 'PHONE_NUMBER' ? (
         <input
           value={button.phoneNumber}
           placeholder="+919999999999"
           onChange={(event) =>
             updateTemplateBuilderButton(
               button.id,
               'phoneNumber',
               event.target.value,
             )
           }
         />
       ) : null}

       {button.type === 'OTP' ? (
         <select
           value={button.otpType}
           onChange={(event) =>
             updateTemplateBuilderButton(button.id, 'otpType', event.target.value)
           }
         >
           <option value="COPY_CODE">Copy code</option>
           <option value="ONE_TAP">One tap autofill</option>
           <option value="ZERO_TAP">Zero tap autofill</option>
         </select>
       ) : null}

       {button.type === 'FLOW' ? (
         <>
<select
  value={button.flowId}
  onChange={(event) =>
    updateTemplateBuilderButton(button.id, 'flowId', event.target.value)
  }
>
  <option value="">Select Meta Flow</option>
  {metaFlows
    .filter((flow) => flow.status === 'PUBLISHED' || flow.status === 'DRAFT')
    .map((flow) => (
      <option key={flow.id} value={flow.id}>
        {flow.name || flow.id} · {flow.status}
      </option>
    ))}
</select>

<input
  value={button.flowId}
  placeholder="Or paste Meta Flow ID manually"
  onChange={(event) =>
    updateTemplateBuilderButton(button.id, 'flowId', event.target.value)
  }
/>

           <select
             value={button.flowAction}
             onChange={(event) =>
               updateTemplateBuilderButton(
                 button.id,
                 'flowAction',
                 event.target.value,
               )
             }
           >
             <option value="NAVIGATE">Navigate</option>
             <option value="DATA_EXCHANGE">Data exchange</option>
           </select>

           <input
             value={button.navigateScreen}
             placeholder="Navigate screen optional"
             onChange={(event) =>
               updateTemplateBuilderButton(
                 button.id,
                 'navigateScreen',
                 event.target.value,
               )
             }
           />
         </>
       ) : null}
     </div>
   ))}
 </div>
)}
</div>

<div className="template-builder-panel">
  <div className="template-builder-header">
    <div>
      <strong>Carousel</strong>
      <span>Create 2 to 5 carousel cards without JSON.</span>
    </div>

    <button
      type="button"
      onClick={() => {
  if (!carouselBuilderEnabled && templateBuilderButtons.length > 0) {
    showToast('Remove normal buttons before enabling carousel', 'error')
    return
  }

  setCarouselBuilderEnabled(!carouselBuilderEnabled)
}}
    >
      {carouselBuilderEnabled ? 'Disable Carousel' : 'Enable Carousel'}
    </button>
  </div>

  {carouselBuilderEnabled ? (
    <div className="template-builder-list">
      <button type="button" onClick={addCarouselCard}>
        Add Carousel Card
      </button>

      {carouselBuilderCards.map((card, cardIndex) => (
        <div className="template-builder-item" key={card.id}>
          <div className="template-builder-item-header">
            <strong>Card {cardIndex + 1}</strong>
            <button
              className="small-danger-button"
              type="button"
              onClick={() => removeCarouselCard(card.id)}
            >
              Remove Card
            </button>
          </div>

          <label className="template-create-media-picker">
            <strong>
              {card.uploading
                ? 'Uploading to Meta...'
                : card.mediaFileName || 'Upload card image/video'}
            </strong>
            <span>Required for Meta carousel review.</span>
            <input
              accept="image/jpeg,image/png,image/webp,video/mp4"
              type="file"
              onChange={(event) =>
                uploadCarouselCardMedia(card.id, event.target.files?.[0])
              }
            />
          </label>

          <textarea
            value={card.bodyText}
            placeholder="Card body text e.g. Product option 1"
            rows={3}
            onChange={(event) =>
              updateCarouselCard(card.id, 'bodyText', event.target.value)
            }
          />

          <button
            type="button"
            onClick={() => addCarouselCardButton(card.id)}
          >
            Add Card Button
          </button>

          {card.buttons.map((button, buttonIndex) => (
            <div className="carousel-button-row" key={button.id}>
              <strong>Card Button {buttonIndex + 1}</strong>

              <select
                value={button.type}
                onChange={(event) =>
                  updateCarouselCardButton(
                    card.id,
                    button.id,
                    'type',
                    event.target.value as CarouselButtonType,
                  )
                }
              >
                <option value="QUICK_REPLY">Quick reply</option>
                <option value="URL">Website URL</option>
                <option value="PHONE_NUMBER">Phone call</option>
              </select>

              <input
                value={button.text}
                placeholder="Button text"
                onChange={(event) =>
                  updateCarouselCardButton(
                    card.id,
                    button.id,
                    'text',
                    event.target.value,
                  )
                }
              />

              {button.type === 'URL' ? (
                <input
                  value={button.url}
                  placeholder="https://example.com"
                  onChange={(event) =>
                    updateCarouselCardButton(
                      card.id,
                      button.id,
                      'url',
                      event.target.value,
                    )
                  }
                />
              ) : null}

              {button.type === 'PHONE_NUMBER' ? (
                <input
                  value={button.phoneNumber}
                  placeholder="+919999999999"
                  onChange={(event) =>
                    updateCarouselCardButton(
                      card.id,
                      button.id,
                      'phoneNumber',
                      event.target.value,
                    )
                  }
                />
              ) : null}

              <button
                className="small-danger-button"
                type="button"
                onClick={() => removeCarouselCardButton(card.id, button.id)}
              >
                Remove Button
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  ) : null}
</div>

    <button>Create Meta Draft</button>
  </form>

  <aside className="whatsapp-template-preview">
    <div className="phone-preview-shell">
      <div className="phone-preview-header">WhatsApp preview</div>

      <div className="phone-message-bubble">
        {templateDraftPreview.headerType === 'TEXT' &&
        templateDraftPreview.headerText ? (
          <strong className="phone-message-title">
            {templateDraftPreview.headerText}
          </strong>
        ) : null}

        {templateDraftPreview.headerType === 'IMAGE' ? (
          templateHeaderSamplePreview ? (
            <img
              alt="Template image preview"
              className="phone-media-preview"
              src={templateHeaderSamplePreview}
            />
          ) : (
            <div className="phone-media-placeholder">Image header</div>
          )
        ) : null}

        {templateDraftPreview.headerType === 'VIDEO' ? (
          templateHeaderSamplePreview ? (
            <video
              className="phone-media-preview"
              controls
              src={templateHeaderSamplePreview}
            />
          ) : (
            <div className="phone-media-placeholder">Video header</div>
          )
        ) : null}

        {templateDraftPreview.headerType === 'DOCUMENT' ? (
          <div className="phone-document-preview">
            📄 {templateHeaderSampleFile?.name || 'Document header'}
          </div>
        ) : null}

        <p>
          {templateDraftPreview.bodyText ||
            'Your template body preview will appear here.'}
        </p>

        {templateDraftPreview.footerText ? (
          <span className="phone-message-footer">
            {templateDraftPreview.footerText}
          </span>
        ) : null}

{carouselBuilderEnabled ? (
<div className="phone-carousel-preview">
 <strong>Carousel template</strong>
 <span>2 to 5 cards from carousel builder</span>
</div>
) : templateBuilderButtons.length > 0 ? (
<div className="phone-message-buttons-list">
 {templateBuilderButtons.map((button) => (
   <button
     type="button"
     className="phone-message-button"
     key={button.id}
   >
     {button.type === 'OTP' ? 'Copy code' : button.text || 'Button text'}
   </button>
 ))}
</div>
) : null}

        <small>10:24</small>
      </div>
    </div>
  </aside>
</div>
        </section>
      ) : null}
    </div>
  )
}


  return renderTemplatesContent()
}
