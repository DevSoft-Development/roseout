param environment string
param location string
param secondaryLocation string
param tags object
param aiModelDeploymentEnabled bool
param aiModelDeploymentName string
param aiModelName string
param aiModelVersion string
param aiModelSkuName string
param aiModelCapacity int
param consumerContainerAppsEnvironmentEnabled bool
param consumerRegionalFailoverEnabled bool = false

var envShort = environment == 'production' ? 'prod' : 'stg'
var suffix = substring(uniqueString(resourceGroup().id), 0, 8)
var aiFoundryName = 'toh-${envShort}-${suffix}-ai'
var secondaryAiFoundryName = 'toh-${envShort}-${suffix}-ai-dr'

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
    name: environment == 'production' ? 'Premium' : 'Basic'
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
    zoneRedundancy: 'Disabled'
  }
}

resource registrySecondaryReplica 'Microsoft.ContainerRegistry/registries/replications@2023-11-01-preview' = if (environment == 'production' && consumerRegionalFailoverEnabled) {
  parent: registry
  name: replace(secondaryLocation, ' ', '')
  location: secondaryLocation
  tags: tags
  properties: {
    zoneRedundancy: 'Disabled'
    regionEndpointEnabled: true
  }
}

resource consumerContainerAppsEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = if (consumerContainerAppsEnvironmentEnabled) {
  name: 'cae-toh-consumer-${envShort}-primary'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
    zoneRedundant: false
  }
}

resource consumerSecondaryContainerAppsEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = if (consumerContainerAppsEnvironmentEnabled && consumerRegionalFailoverEnabled) {
  name: 'cae-toh-consumer-${envShort}-secondary'
  location: secondaryLocation
  tags: union(tags, { regionRole: 'secondary' })
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
    zoneRedundant: false
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

resource secondaryAiFoundry 'Microsoft.CognitiveServices/accounts@2025-06-01' = if (consumerRegionalFailoverEnabled) {
  name: secondaryAiFoundryName
  location: secondaryLocation
  kind: 'AIServices'
  tags: union(tags, { regionRole: 'secondary' })
  identity: {
    type: 'SystemAssigned'
  }
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: secondaryAiFoundryName
    publicNetworkAccess: 'Enabled'
    allowProjectManagement: true
  }
}

resource aiModelDeployment 'Microsoft.CognitiveServices/accounts/deployments@2025-06-01' = if (aiModelDeploymentEnabled) {
  parent: aiFoundry
  name: aiModelDeploymentName
  sku: {
    name: aiModelSkuName
    capacity: aiModelCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: aiModelName
      version: aiModelVersion
    }
    versionUpgradeOption: 'OnceCurrentVersionExpired'
  }
}

resource secondaryAiModelDeployment 'Microsoft.CognitiveServices/accounts/deployments@2025-06-01' = if (aiModelDeploymentEnabled && consumerRegionalFailoverEnabled) {
  parent: secondaryAiFoundry
  name: aiModelDeploymentName
  sku: {
    name: aiModelSkuName
    capacity: aiModelCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: aiModelName
      version: aiModelVersion
    }
    versionUpgradeOption: 'OnceCurrentVersionExpired'
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
output secondaryAiFoundryName string = consumerRegionalFailoverEnabled ? secondaryAiFoundry.name : ''
output secondaryAiFoundryEndpoint string = consumerRegionalFailoverEnabled ? secondaryAiFoundry.properties.endpoint : ''
output aiModelDeploymentName string = aiModelDeploymentEnabled ? aiModelDeployment.name : ''
output secondaryAiModelDeploymentName string = aiModelDeploymentEnabled && consumerRegionalFailoverEnabled ? secondaryAiModelDeployment.name : ''
output aiModelName string = aiModelDeploymentEnabled ? aiModelName : ''
output secondaryLocation string = secondaryLocation
output consumerContainerAppsEnvironmentName string = consumerContainerAppsEnvironmentEnabled ? consumerContainerAppsEnvironment.name : ''
output consumerSecondaryContainerAppsEnvironmentName string = consumerContainerAppsEnvironmentEnabled && consumerRegionalFailoverEnabled ? consumerSecondaryContainerAppsEnvironment.name : ''
output registrySecondaryReplicationEnabled bool = environment == 'production' && consumerRegionalFailoverEnabled
