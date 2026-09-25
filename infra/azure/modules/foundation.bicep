param environment string
param location string
param secondaryLocation string
param tags object

var envShort = environment == 'production' ? 'prod' : 'stg'
var suffix = substring(uniqueString(resourceGroup().id), 0, 8)
var aiFoundryName = 'toh-${envShort}-${suffix}-ai'

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-toh-consumer-${envShort}'
  location: location
  tags: tags
}

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-toh-consumer-${envShort}'
  location: location
  tags: tags
  properties: {
    retentionInDays: 30
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-toh-consumer-${envShort}'
  location: location
  kind: 'web'
  tags: tags
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logs.id
  }
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: 'toh${envShort}${suffix}'
  location: location
  tags: tags
  sku: {
    name: environment == 'production' ? 'Standard' : 'Basic'
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
    zoneRedundancy: 'Disabled'
  }
}

resource aiFoundry 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: aiFoundryName
  location: location
  kind: 'AIServices'
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: aiFoundryName
    publicNetworkAccess: 'Enabled'
    allowProjectManagement: true
  }
}

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'toh-${envShort}-${suffix}-kv'
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    ...(environment == 'production' ? {
      enablePurgeProtection: true
    } : {})
    publicNetworkAccess: 'Enabled'
    sku: {
      family: 'A'
      name: 'standard'
    }
  }
}

output containerRegistryName string = registry.name
output keyVaultName string = vault.name
output managedIdentityName string = identity.name
output applicationInsightsName string = insights.name
output logAnalyticsWorkspaceName string = logs.name
output aiFoundryName string = aiFoundry.name
output aiFoundryEndpoint string = aiFoundry.properties.endpoint
output secondaryLocation string = secondaryLocation
