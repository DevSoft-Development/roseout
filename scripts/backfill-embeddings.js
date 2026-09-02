import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const assistantBaseUrl = String(process.env.AWS_PLATFORM_ASSISTANT_API_URL || '').replace(/\/$/, '')
const assistantSecret = String(process.env.AWS_PLATFORM_ASSISTANT_API_SECRET || process.env.AWS_PLATFORM_JOB_GATEWAY_SECRET || '')
async function assistantEmbedding(input) {
  if (!assistantBaseUrl.startsWith('https://') || assistantSecret.length < 32) throw new Error('AWS Assistant API is not configured')
  const path = '/v1/openai/embeddings'
  const body = JSON.stringify({ model: process.env.SEARCH_EMBEDDING_MODEL || 'text-embedding-3-small', input })
  const timestamp = String(Date.now())
  const signature = crypto.createHmac('sha256', assistantSecret).update([timestamp, 'POST', path, body].join('
'), 'utf8').digest('hex')
  const response = await fetch(`${assistantBaseUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-toh-timestamp': timestamp, 'x-toh-signature': signature }, body })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.data?.[0]?.embedding) throw new Error(payload?.error?.message || `Assistant embedding failed: ${response.status}`)
  return payload.data[0].embedding
}

function getPrimaryCategory(location) {
  return (
    location?.primary_category ||
    location?.cuisine ||
    location?.cuisine_type ||
    location?.activity_type ||
    location?.primary_tag ||
    'Experience'
  )
}

function getCuisine(location) {
  return location?.cuisine || location?.cuisine_type || null
}

function getLocationTags(location) {
  const tags = [
    ...(Array.isArray(location?.tags) ? location.tags : []),
    ...(Array.isArray(location?.google_types) ? location.google_types : []),
    location?.primary_tag,
    location?.primary_category,
    location?.cuisine,
    location?.cuisine_type,
    location?.activity_type,
  ]

  return Array.from(
    new Set(
      tags
        .filter(Boolean)
        .map((tag) => String(tag).trim().toLowerCase())
        .filter(Boolean)
    )
  )
}

function buildSearchText(item) {
  return [
    item.name,
    item.title,
    item.description,
    item.short_description,
    getPrimaryCategory(item),
    item.category,
    item.type,
    getCuisine(item),
    item.price_range,
    item.address,
    item.city,
    item.state,
    item.neighborhood,
    ...getLocationTags(item),
    item.vibe,
    item.best_for,
  ]
    .filter(Boolean)
    .join(' ')
}

async function embedTable(tableName) {
  console.log(`\nStarting ${tableName}...`)

  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .is('embedding', null)

  if (error) {
    console.error(`Error loading ${tableName}:`, error.message)
    return
  }

  if (!data || data.length === 0) {
    console.log(`No new records to embed in ${tableName}`)
    return
  }

  console.log(`Found ${data.length} records in ${tableName}`)

  for (const item of data) {
    const text = buildSearchText(item)

    if (!text.trim()) {
      console.log(`Skipped empty record in ${tableName}: ${item.id}`)
      continue
    }

    try {
      const embedding = { data: [{ embedding: await assistantEmbedding(text,) }] }

      const vector = embedding.data[0].embedding

      const { error: updateError } = await supabase
        .from(tableName)
        .update({ embedding: vector })
        .eq('id', item.id)

      if (updateError) {
        console.error(`Update failed for ${tableName} ${item.id}:`, updateError.message)
      } else {
        console.log(`Updated ${tableName}: ${item.name || item.title || item.id}`)
        await new Promise((resolve) => setTimeout(resolve, 300))
      }
    } catch (err) {
      console.error(`Embedding failed for ${tableName} ${item.id}:`, err.message)
    }
  }
}

async function run() {
  await embedTable('restaurants')
  await embedTable('activities')
  await embedTable('locations')

  console.log('\nAll embeddings completed!')
}

run()
