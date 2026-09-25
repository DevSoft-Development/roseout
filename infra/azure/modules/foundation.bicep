param environment string
param location string
param secondaryLocation string
param tags object

var envShort = environment == 'production' ? 'prod' : 'stg'
var suffix = substring(uniqueString(resourceGroup().id), 0, 8)

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
    retentionInDays: environment == 'production' ? 30 : 14
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

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'toh-${envShort}-${suffix}-kv'
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: environment == 'production'
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
output secondaryLocation string = secondaryLocation
