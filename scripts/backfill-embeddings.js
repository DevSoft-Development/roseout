require('dotenv').config({ path: '.env.local' })

const { createClient } = require('@supabase/supabase-js')
const OpenAI = require('openai')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})


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
  return (
    location?.cuisine ||
    location?.cuisine_type ||
    null
  )
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
      const embedding = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      })

      const vector = embedding.data[0].embedding

      const { error: updateError } = await supabase
        .from(tableName)
        .update({ embedding: vector })
        .eq('id', item.id)

      if (updateError) {
        console.error(`Update failed for ${tableName} ${item.id}:`, updateError.message)
      } else {
        console.log(`Updated ${tableName}: ${item.name || item.title || item.id}`)
await new Promise(resolve => setTimeout(resolve, 300))
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