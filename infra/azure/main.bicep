targetScope = 'subscription'

@allowed([
  'staging'
  'production'
])
param environment string

param location string
param secondaryLocation string
param resourceGroupName string

param aiModelDeploymentEnabled bool = false
param aiModelDeploymentName string = 'toh-primary'
param aiModelName string = 'gpt-5.4-mini'
param aiModelVersion string = '2026-03-17'
param aiModelSkuName string = 'DataZoneStandard'
param aiModelCapacity int = 10
param aiEmbeddingDeploymentEnabled bool = false
param aiEmbeddingDeploymentName string = 'toh-embedding'
param aiEmbeddingModelName string = 'text-embedding-3-small'
param aiEmbeddingModelVersion string = '1'
param aiEmbeddingSkuName string = 'DataZoneStandard'
param aiEmbeddingCapacity int = 10
param consumerContainerAppsEnvironmentEnabled bool = false
param consumerRuntimeEnabled bool = false
param consumerRegionalFailoverEnabled bool = false
param consumerEdgeEnabled bool = false
param consumerCustomDomainHostName string = ''
param consumerWwwCustomDomainHostName string = ''
param otaEnabled bool = false
param otaCustomDomainHostName string = ''
param otaApiOriginHostName string = ''
param consumerImage string = ''
param consumerGitSha string = ''
param consumerNextPublicSiteUrl string = ''
param consumerNextPublicSupabaseUrl string = ''
@secure()
param consumerNextPublicSupabaseAnonKey string = ''
@secure()
param consumerSupabaseServiceRoleKey string = ''
param consumerAzureAiEndpoint string = ''
@secure()
param consumerAzureAiApiKey string = ''
param consumerSecondaryAzureAiEndpoint string = ''
@secure()
param consumerSecondaryAzureAiApiKey string = ''
param consumerAzureAiModel string = ''
param consumerAzureAiEmbeddingModel string = 'toh-embedding'
param consumerSearchEmbeddingModel string = 'text-embedding-3-small'
param consumerSearchEmbeddingVersion string = 'search-embedding:v1'
param consumerSearchFoodMenuEmbeddingVersion string = 'azure-text-embedding-3-small:v1'
param consumerHuggingFaceAiEndpoint string = 'https://router.huggingface.co/v1'
@secure()
param consumerHuggingFaceAiToken string = ''
param consumerHuggingFaceAiModel string = ''
@secure()
param consumerMapboxAccessToken string = ''
param consumerShortLinkBaseUrl string = ''
param consumerShortLinkHost string = ''
param consumerIosTeamId string = ''
param consumerAndroidAppLinkSha256Fingerprints string = ''
param consumerPrimaryStableRevisionName string = ''
param consumerSecondaryStableRevisionName string = ''
@minValue(0)
@maxValue(100)
param consumerInitialCanaryWeight int = 100

param tags object = {
  application: 'theouthaven'
  managedBy: 'bicep'
  environment: environment
  architecture: 'split-cloud'
}

resource consumerRg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

module foundation './modules/foundation.bicep' = {
  name: 'foundation-${environment}'
  scope: consumerRg
  params: {
    environment: environment
    location: location
    secondaryLocation: secondaryLocation
    tags: tags
    aiModelDeploymentEnabled: aiModelDeploymentEnabled
    aiModelDeploymentName: aiModelDeploymentName
    aiModelName: aiModelName
    aiModelVersion: aiModelVersion
    aiModelSkuName: aiModelSkuName
    aiModelCapacity: aiModelCapacity
    aiEmbeddingDeploymentEnabled: aiEmbeddingDeploymentEnabled
    aiEmbeddingDeploymentName: aiEmbeddingDeploymentName
    aiEmbeddingModelName: aiEmbeddingModelName
    aiEmbeddingModelVersion: aiEmbeddingModelVersion
    aiEmbeddingSkuName: aiEmbeddingSkuName
    aiEmbeddingCapacity: aiEmbeddingCapacity
    consumerContainerAppsEnvironmentEnabled: consumerContainerAppsEnvironmentEnabled
    consumerRegionalFailoverEnabled: consumerRegionalFailoverEnabled
  }
}

module consumerRuntime './modules/consumer-runtime.bicep' = if (consumerRuntimeEnabled) {
  name: 'consumer-runtime-${environment}-primary'
  scope: consumerRg
  params: {
    environment: environment
    location: location
    regionRole: 'primary'
    tags: tags
    containerAppsEnvironmentName: foundation.outputs.consumerContainerAppsEnvironmentName
    registryName: foundation.outputs.containerRegistryName
    identityName: foundation.outputs.managedIdentityName
    keyVaultName: foundation.outputs.keyVaultName
    image: consumerImage
    gitSha: consumerGitSha
    nextPublicSiteUrl: consumerNextPublicSiteUrl
    nextPublicSupabaseUrl: consumerNextPublicSupabaseUrl
    nextPublicSupabaseAnonKey: consumerNextPublicSupabaseAnonKey
    supabaseServiceRoleKey: consumerSupabaseServiceRoleKey
    azureAiEndpoint: consumerAzureAiEndpoint
    azureAiApiKey: consumerAzureAiApiKey
    azureAiModel: consumerAzureAiModel
    azureAiEmbeddingModel: consumerAzureAiEmbeddingModel
    searchEmbeddingModel: consumerSearchEmbeddingModel
    searchEmbeddingVersion: consumerSearchEmbeddingVersion
    searchFoodMenuEmbeddingVersion: consumerSearchFoodMenuEmbeddingVersion
    huggingFaceAiEndpoint: consumerHuggingFaceAiEndpoint
    huggingFaceAiToken: consumerHuggingFaceAiToken
    huggingFaceAiModel: consumerHuggingFaceAiModel
    mapboxAccessToken: consumerMapboxAccessToken
    shortLinkBaseUrl: consumerShortLinkBaseUrl
    shortLinkHost: consumerShortLinkHost
    iosTeamId: consumerIosTeamId
    androidAppLinkSha256Fingerprints: consumerAndroidAppLinkSha256Fingerprints
    stableRevisionName: consumerPrimaryStableRevisionName
    latestRevisionWeight: consumerInitialCanaryWeight
  }
}

module consumerSecondaryRuntime './modules/consumer-runtime.bicep' = if (consumerRuntimeEnabled && consumerRegionalFailoverEnabled) {
  name: 'consumer-runtime-${environment}-secondary'
  scope: consumerRg
  params: {
    environment: environment
    location: secondaryLocation
    regionRole: 'secondary'
    tags: tags
    containerAppsEnvironmentName: foundation.outputs.consumerSecondaryContainerAppsEnvironmentName
    registryName: foundation.outputs.containerRegistryName
    identityName: foundation.outputs.managedIdentityName
    keyVaultName: foundation.outputs.keyVaultName
    image: consumerImage
    gitSha: consumerGitSha
    nextPublicSiteUrl: consumerNextPublicSiteUrl
    nextPublicSupabaseUrl: consumerNextPublicSupabaseUrl
    nextPublicSupabaseAnonKey: consumerNextPublicSupabaseAnonKey
    supabaseServiceRoleKey: consumerSupabaseServiceRoleKey
    azureAiEndpoint: consumerSecondaryAzureAiEndpoint
    azureAiApiKey: consumerSecondaryAzureAiApiKey
    azureAiModel: consumerAzureAiModel
    azureAiEmbeddingModel: consumerAzureAiEmbeddingModel
    searchEmbeddingModel: consumerSearchEmbeddingModel
    searchEmbeddingVersion: consumerSearchEmbeddingVersion
    searchFoodMenuEmbeddingVersion: consumerSearchFoodMenuEmbeddingVersion
    huggingFaceAiEndpoint: consumerHuggingFaceAiEndpoint
    huggingFaceAiToken: consumerHuggingFaceAiToken
    huggingFaceAiModel: consumerHuggingFaceAiModel
    mapboxAccessToken: consumerMapboxAccessToken
    shortLinkBaseUrl: consumerShortLinkBaseUrl
    shortLinkHost: consumerShortLinkHost
    iosTeamId: consumerIosTeamId
    androidAppLinkSha256Fingerprints: consumerAndroidAppLinkSha256Fingerprints
    stableRevisionName: consumerSecondaryStableRevisionName
    latestRevisionWeight: consumerInitialCanaryWeight
  }
}

module consumerEdge './modules/consumer-edge.bicep' = if (consumerRuntimeEnabled && consumerRegionalFailoverEnabled && consumerEdgeEnabled) {
  name: 'consumer-edge-${environment}'
  scope: consumerRg
  params: {
    environment: environment
    tags: tags
    primaryOriginHostName: consumerRuntime.outputs.fqdn
    secondaryOriginHostName: consumerSecondaryRuntime.outputs.fqdn
    customDomainHostName: consumerCustomDomainHostName
    wwwCustomDomainHostName: consumerWwwCustomDomainHostName
  }
}


module otaFoundation './modules/ota-foundation.bicep' = if (otaEnabled) {
  name: 'ota-foundation-${environment}'
  scope: consumerRg
  params: {
    environment: environment
    location: location
    secondaryLocation: secondaryLocation
    tags: tags
    apiEnabled: !empty(otaApiOriginHostName) || (consumerRuntimeEnabled && consumerRegionalFailoverEnabled)
    primaryApiHostName: !empty(otaApiOriginHostName) ? otaApiOriginHostName : (consumerRuntimeEnabled ? consumerRuntime.outputs.fqdn : '')
    secondaryApiHostName: !empty(otaApiOriginHostName) ? '' : (consumerRuntimeEnabled && consumerRegionalFailoverEnabled ? consumerSecondaryRuntime.outputs.fqdn : '')
    customDomainHostName: otaCustomDomainHostName
  }
}

output resourceGroupName string = consumerRg.name
output primaryLocation string = location
output secondaryLocation string = secondaryLocation
output containerRegistryName string = foundation.outputs.containerRegistryName
output keyVaultName string = foundation.outputs.keyVaultName
output managedIdentityName string = foundation.outputs.managedIdentityName
output applicationInsightsName string = foundation.outputs.applicationInsightsName
output aiFoundryName string = foundation.outputs.aiFoundryName
output aiFoundryEndpoint string = foundation.outputs.aiFoundryEndpoint
output secondaryAiFoundryName string = foundation.outputs.secondaryAiFoundryName
output secondaryAiFoundryEndpoint string = foundation.outputs.secondaryAiFoundryEndpoint
output aiModelDeploymentName string = foundation.outputs.aiModelDeploymentName
output secondaryAiModelDeploymentName string = foundation.outputs.secondaryAiModelDeploymentName
output aiModelName string = foundation.outputs.aiModelName
output aiEmbeddingDeploymentName string = foundation.outputs.aiEmbeddingDeploymentName
output secondaryAiEmbeddingDeploymentName string = foundation.outputs.secondaryAiEmbeddingDeploymentName
output aiEmbeddingModelName string = foundation.outputs.aiEmbeddingModelName
output consumerContainerAppsEnvironmentName string = foundation.outputs.consumerContainerAppsEnvironmentName
output consumerSecondaryContainerAppsEnvironmentName string = foundation.outputs.consumerSecondaryContainerAppsEnvironmentName
output consumerRuntimeName string = consumerRuntimeEnabled ? consumerRuntime!.outputs.name : ''
output consumerRuntimeFqdn string = consumerRuntimeEnabled ? consumerRuntime!.outputs.fqdn : ''
output consumerSecondaryRuntimeName string = consumerRuntimeEnabled && consumerRegionalFailoverEnabled ? consumerSecondaryRuntime!.outputs.name : ''
output consumerSecondaryRuntimeFqdn string = consumerRuntimeEnabled && consumerRegionalFailoverEnabled ? consumerSecondaryRuntime!.outputs.fqdn : ''
output consumerRuntimeImage string = consumerRuntimeEnabled ? consumerRuntime!.outputs.image : ''
output consumerFrontDoorProfileName string = consumerRuntimeEnabled && consumerRegionalFailoverEnabled && consumerEdgeEnabled ? consumerEdge!.outputs.profileName : ''
output consumerFrontDoorEndpointHostName string = consumerRuntimeEnabled && consumerRegionalFailoverEnabled && consumerEdgeEnabled ? consumerEdge!.outputs.endpointHostName : ''
output consumerFrontDoorEndpointResourceId string = consumerRuntimeEnabled && consumerRegionalFailoverEnabled && consumerEdgeEnabled ? consumerEdge!.outputs.endpointResourceId : ''
output consumerFrontDoorRouteResourceId string = consumerRuntimeEnabled && consumerRegionalFailoverEnabled && consumerEdgeEnabled ? consumerEdge!.outputs.routeResourceId : ''
output consumerFrontDoorPrimaryOriginResourceId string = consumerRuntimeEnabled && consumerRegionalFailoverEnabled && consumerEdgeEnabled ? consumerEdge!.outputs.primaryOriginResourceId : ''
output consumerCustomDomainResourceId string = consumerRuntimeEnabled && consumerRegionalFailoverEnabled && consumerEdgeEnabled ? consumerEdge!.outputs.apexCustomDomainResourceId : ''
output consumerWwwCustomDomainResourceId string = consumerRuntimeEnabled && consumerRegionalFailoverEnabled && consumerEdgeEnabled ? consumerEdge!.outputs.wwwCustomDomainResourceId : ''

output otaStorageAccountName string = otaEnabled ? otaFoundation!.outputs.storageAccountName : ''
output otaPrimaryWebEndpoint string = otaEnabled ? otaFoundation!.outputs.primaryWebEndpoint : ''
output otaSecondaryWebEndpoint string = otaEnabled ? otaFoundation!.outputs.secondaryWebEndpoint : ''
output otaFrontDoorProfileName string = otaEnabled ? otaFoundation!.outputs.frontDoorProfileName : ''
output otaFrontDoorEndpointHostName string = otaEnabled ? otaFoundation!.outputs.frontDoorEndpointHostName : ''
output otaCustomDomainResourceId string = otaEnabled ? otaFoundation!.outputs.customDomainResourceId : ''
output otaCustomDomainHostName string = otaEnabled ? otaFoundation!.outputs.customDomainHostName : ''
