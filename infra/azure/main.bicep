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
param consumerContainerAppsEnvironmentEnabled bool = false
param consumerRuntimeEnabled bool = false
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
param consumerAzureAiModel string = ''
param consumerHuggingFaceAiEndpoint string = 'https://router.huggingface.co/v1'
@secure()
param consumerHuggingFaceAiToken string = ''
param consumerHuggingFaceAiModel string = ''

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
    consumerContainerAppsEnvironmentEnabled: consumerContainerAppsEnvironmentEnabled
  }
}

module consumerRuntime './modules/consumer-runtime.bicep' = if (consumerRuntimeEnabled) {
  name: 'consumer-runtime-${environment}'
  scope: consumerRg
  params: {
    environment: environment
    location: location
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
    huggingFaceAiEndpoint: consumerHuggingFaceAiEndpoint
    huggingFaceAiToken: consumerHuggingFaceAiToken
    huggingFaceAiModel: consumerHuggingFaceAiModel
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
output aiModelDeploymentName string = foundation.outputs.aiModelDeploymentName
output aiModelName string = foundation.outputs.aiModelName
output consumerContainerAppsEnvironmentName string = foundation.outputs.consumerContainerAppsEnvironmentName
output consumerRuntimeName string = consumerRuntimeEnabled ? consumerRuntime!.outputs.name : ''
output consumerRuntimeFqdn string = consumerRuntimeEnabled ? consumerRuntime!.outputs.fqdn : ''
output consumerRuntimeImage string = consumerRuntimeEnabled ? consumerRuntime!.outputs.image : ''
