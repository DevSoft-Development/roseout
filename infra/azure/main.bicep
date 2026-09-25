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
