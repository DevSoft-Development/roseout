targetScope = 'subscription'

@allowed([
  'staging'
  'production'
])
param environment string

param location string
param secondaryLocation string
param resourceGroupName string

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
  }
}

output resourceGroupName string = consumerRg.name
output primaryLocation string = location
output secondaryLocation string = secondaryLocation
output containerRegistryName string = foundation.outputs.containerRegistryName
output keyVaultName string = foundation.outputs.keyVaultName
output managedIdentityName string = foundation.outputs.managedIdentityName
output applicationInsightsName string = foundation.outputs.applicationInsightsName
